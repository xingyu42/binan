#!/usr/bin/env node

/**
 * 手动触发交易策略脚本
 *
 * 用法:
 *   node scripts/manual-trigger.js order          # 执行下单流程
 *   node scripts/manual-trigger.js takeprofit     # 设置止盈
 *   node scripts/manual-trigger.js refresh        # 更新交易对和指标
 *   node scripts/manual-trigger.js cleanup        # 清理无效订单
 *   node scripts/manual-trigger.js full           # 执行完整流程(下单→止盈→清理)
 *   node scripts/manual-trigger.js help           # 显示帮助
 */

// 加载环境变量
require('dotenv').config();

const { getExchangeInfo, getAccountData, getKlines, setStopPrice, getOpenOrders, deleteOrder, contractOrder } = require('../services/binanceContractService');
const { getPreparingOrders, getHighAndLow, klinesInit, getATR, getOneIndex } = require('../controllers/calculatePositionsController');
const { getAllExchangeInfo } = require('../services/binanceDataService');
const dataRepository = require('../utils/OrderRepository');
const { logger, errorLogger } = require('../utils/Logger');
const { getTickSize, formatPriceByTickSize } = require('../utils/precisionUtils');
const utils = require('../utils/util');

// ==================== 轮询等待工具函数 ====================
async function waitForCondition(checkFn, options = {}) {
  const { maxAttempts = 10, interval = 1000 } = options;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      if (await checkFn()) {
        logger.info(`条件满足,尝试次数: ${i + 1}`);
        return true;
      }
    } catch (error) {
      logger.warn(`检查过程出错: ${error.message}`);
    }

    if (i < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  logger.error(`轮询超时(${maxAttempts}次尝试),条件未满足`);
  return false;
}

// ==================== 更新交易对和指标 ====================
async function updateAllATR(callback) {
  let indexObject = {};
  let res = await getAllExchangeInfo();
  let symbols = res.map((item) => item.symbol);
  let count = 0;

  async function getOne(symbol) {
    indexObject[symbol] = await getOneIndex(symbol);
    count++;
    if (count === res.length) {
      let ATRObj = {};
      let TOJ = {};
      let volObj = {};
      Object.keys(indexObject).forEach(itemKey => {
        ATRObj[itemKey] = indexObject[itemKey].ATR;
        TOJ[itemKey] = indexObject[itemKey].trendOscillation;
        volObj[itemKey] = indexObject[itemKey].vol;
      });

      try {
        dataRepository.set('ATR', ATRObj);
        logger.info('更新ATR成功');
        dataRepository.set('trendOscillation', TOJ);
        logger.info('更新金叉死叉数成功');
        dataRepository.set('volatility', volObj);
        logger.info('更新波动率成功');
        callback && callback(true);
      } catch (err) {
        errorLogger(err);
      }
    }
  }

  for (let i in symbols) {
    let symbol = symbols[i];
    getOne(symbol);
  }
}

async function setUpdateEquity() {
  let res = await getAccountData();
  let equity = Number(res.totalMarginBalance);
  let data = dataRepository.get('equity') || { equity: 0 };
  if (equity > Number(data.equity)) {
    data.equity = equity;
  }
  dataRepository.set('equity', data);
  logger.info('账号历史最大权益更新成功');
  return true;
}

async function updateAllExchangeInfo() {
  logger.info('🔄 开始更新交易对和指标...');
  let res = await getExchangeInfo();
  if (!res) {
    logger.info('更新交易对失败');
    return false;
  }
  let symbols = res.data.symbols;
  let data = symbols.filter(item => item.symbol.includes("USDT")).filter(item => item.status === 'TRADING');
  dataRepository.set('data', data);
  logger.info('更新交易对成功');
  await setUpdateEquity();

  return new Promise((resolve) => {
    updateAllATR(() => {
      logger.info('✅ 交易对和指标更新完成');
      resolve(true);
    });
  });
}

// ==================== 账户和头寸管理 ====================
async function getAccountPosition() {
  let res = await getAccountData();
  if (!res) return [];
  let allPositions = res.positions;
  return allPositions.filter((item) => {
    return Math.abs(item.positionAmt) > 0;
  });
}

async function getEquityAmount() {
  let res = await getAccountData();
  let availableBalance = Number(res.availableBalance);
  let totalMarginBalance = Number(res.totalMarginBalance) / 2;
  let equity = totalMarginBalance > availableBalance ? availableBalance : totalMarginBalance;
  let equityMaxHistory = dataRepository.get('equity') || { equity: 0 };
  let withdrawalAmplitude = 0;
  if (equityMaxHistory.equity > res.totalMarginBalance) {
    withdrawalAmplitude = (equityMaxHistory.equity - res.totalMarginBalance) / equityMaxHistory.equity;
  }
  logger.info('回撤幅度', withdrawalAmplitude.toFixed(3));
  return {
    num: (equity / 3) * Math.pow((1 - withdrawalAmplitude.toFixed(3)), 2),
    withdrawalAmplitude: withdrawalAmplitude.toFixed(3)
  };
}

// ==================== 下单流程 ====================
function calculateMinQuantity(minQty, stepSize, closePrice, notional) {
  // 添加2%安全边际，防止以下问题：
  // 1. 浮点精度误差（计算5.00实际可能是4.999888）
  // 2. 价格时间差（使用历史closePrice，实际下单时价格可能下跌）
  // 3. Binance使用markPrice校验，与closePrice存在差异
  const safeNotional = notional;
  const notionalBasedMin = Math.ceil(safeNotional / (stepSize * closePrice)) * stepSize;
  return Math.max(minQty, notionalBasedMin);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getNum(num, yNum) {
  let z = utils.getPrecision(yNum);
  return utils.truncateDecimal(num, z);
}

function getQuantity(item, num) {
  const rawQuantity = getNum(parseFloat(item.quantity) * num, parseFloat(item.quantity));
  const minQty = parseFloat(item.minQty);
  const maxQty = parseFloat(item.maxQty);
  const stepSize = parseFloat(item.stepSize);
  const notional = parseFloat(item.notional);
  const closePrice = item.closePrice;

  // 提前检查:原始数量是否满足最小名义价值(在调整前检查,避免无效计算)
  const rawNotionalValue = rawQuantity * closePrice;
  if (rawNotionalValue < notional) {
    logger.warn(
      `${item.symbol} 风控计算仓位 ${rawNotionalValue.toFixed(2)}U < 交易所最小值 ${notional}U, ` +
      `跳过此标的 (ATR波动过大导致仓位被压缩)`
    );
    return 0;
  }

  const minQuantity = calculateMinQuantity(minQty, stepSize, closePrice, notional);
  const clampedQuantity = clamp(rawQuantity, minQuantity, maxQty);
  const finalQuantity = getNum(clampedQuantity, parseFloat(item.quantity));

  logger.info(item.symbol, '下单处理的数量', finalQuantity);
  return finalQuantity;
}

function generateArray(length) {
  if (length === 1) return [1];
  let startValue = 1.2;
  let endValue = 0.8;
  let step = (startValue - endValue) / (length - 1);
  let resultArray = [];
  for (let i = 0; i < length; i++) {
    let value = (startValue - i * step).toFixed(4);
    resultArray.push(parseFloat(value));
  }
  return resultArray;
}

async function order() {
  logger.info('📊 开始执行下单流程...');

  let position = await getAccountPosition();
  let equityAmount = await getEquityAmount();
  let allExchange = await getAllExchangeInfo();
  let tradingExchangeNum = allExchange.filter(symbol => symbol.status === 'TRADING').length;
  let orderNumber = parseInt(tradingExchangeNum / 16 * (1 - equityAmount.withdrawalAmplitude));
  let orderList = await getPreparingOrders(equityAmount.num, position, allExchange, orderNumber);

  if (orderList.length === 0) {
    logger.info('没有符合条件的标的');
    return { success: true, ordersPlaced: 0 };
  }

  const addOrderNumber = orderList.reduce((count, item) => {
    return !item.isOne ? count + 1 : count;
  }, 0);
  let maxAddOrderNumber = addOrderNumber;

  logger.info('开始下单', orderList.map(item => item.symbol).join(', '));

  let generatedArray = generateArray(orderList.length);
  let addCount = 0;
  let successCount = 0;

  async function placeOrder(order, coefficient) {
    const quantity = getQuantity(order, coefficient);
    if (quantity === 0) {
      logger.info(order.symbol, '数量为0不再下单');
      return;
    }
    try {
      await contractOrder({
        symbol: order.symbol,
        positionSide: order.direction > 0 ? 'LONG' : 'SHORT',
        quantity,
        stopPrice: order.stopPrice,
        leverage: order.leverage
      });
      successCount++;
    } catch (error) {
      errorLogger(`${order.symbol} 下单失败`, error);
    }
  }

  const tasks = orderList.map((order, index) => {
    if (!order.isOne) {
      addCount++;
      if (addCount > maxAddOrderNumber) {
        logger.info(order.symbol, '不再加仓');
        return Promise.resolve();
      }
    }
    return placeOrder(order, generatedArray[index]);
  });

  await Promise.all(tasks);
  logger.info('✅ 下单完毕,成功下单数:', successCount);

  return { success: true, ordersPlaced: successCount };
}

// ==================== 止盈设置 ====================
async function setTakeProfit() {
  logger.info('🎯 开始设置止盈...');

  let positionList = await getAccountPosition();
  if (positionList.length === 0) {
    logger.info('当前无持仓');
    return { success: true, takeProfitSet: 0 };
  }

  let orders = await getOpenOrders();
  orders = orders.map(function (item) {
    item.orderId = item.orderId.toString();
    return item;
  });

  function getOneOrder(symbol) {
    for (let i in orders) {
      if (orders[i].symbol == symbol) {
        return orders[i];
      }
    }
  }

  let takeProfitList = [];

  function signal(item) {
    const order = getOneOrder(item.symbol);
    if (!order) return false;

    if (item.positionSide == 'SHORT') {
      return item.highestPoint < Number(order.stopPrice);
    }
    if (item.positionSide == 'LONG') {
      return item.lowestPoint > Number(order.stopPrice);
    }
    return false;
  }

  for (let i in positionList) {
    let res = await getKlines(positionList[i].symbol, 11);
    let klines = klinesInit(positionList[i].symbol, res.data).klines;
    let ATR = getATR(klines.slice(0, klines.length - 1), positionList[i].symbol);
    let data = {
      ...getHighAndLow(klines.slice(0, klines.length - 1), positionList[i].symbol),
      ...positionList[i],
      ATR
    };

    if (signal(data)) {
      takeProfitList.push(data);
      let stopPrice = data.positionSide == 'SHORT' ? data.highestPoint : data.lowestPoint;
      const tickSize = await getTickSize(data.symbol);
      let formattedStopPrice = formatPriceByTickSize(stopPrice, tickSize);
      await setStopPrice(data.symbol, data.positionSide, formattedStopPrice);

      if (data.positionSide == 'SHORT') {
        logger.info(data.highestPoint < Number(data.entryPrice) ? `${data.symbol}设置止盈成功` : `${data.symbol}设置止损移动成功`);
      }
      if (data.positionSide == 'LONG') {
        logger.info(data.lowestPoint > Number(data.entryPrice) ? `${data.symbol}设置止盈成功` : `${data.symbol}设置止损移动成功`);
      }
    }
  }

  if (takeProfitList.length === 0) {
    logger.info('没有需要设置止盈的标的物');
  } else {
    logger.info('✅ 止盈设置完成,处理数量:', takeProfitList.length);
  }

  return { success: true, takeProfitSet: takeProfitList.length, list: takeProfitList };
}

// ==================== 清理无效订单 ====================
async function deleteAllInvalidOrders(isDeL = true) {
  logger.info('🧹 开始清理无效订单...');

  let orders = await getOpenOrders();
  orders = orders.map(function (item) {
    item.orderId = item.orderId.toString();
    return item;
  });

  let position = await getAccountPosition();
  let symbols = position.map(item => item.symbol + item.positionSide);
  let invalidOrders = [];

  for (let i in symbols) {
    let lData = orders.filter(item => (item.symbol + item.positionSide) === symbols[i]).sort((a, b) => {
      return b.time - a.time;
    });
    for (let i2 in lData) {
      if (i2 != 0) {
        invalidOrders.push(lData[i2]);
      }
    }
  }

  if (isDeL) {
    for (let i in orders) {
      let ss = orders[i].symbol + orders[i].positionSide;
      if (symbols.indexOf(ss) === -1) {
        invalidOrders.push(orders[i]);
      }
    }
  }

  if (invalidOrders.length > 0) {
    logger.info('开始删除无效订单');
    for (let i in invalidOrders) {
      await deleteOrder(invalidOrders[i].symbol, invalidOrders[i].orderId);
      logger.info('撤销挂单完成', invalidOrders[i].symbol, invalidOrders[i].orderId, invalidOrders[i].stopPrice);
    }
    logger.info('✅ 清理完成,删除订单数:', invalidOrders.length);
  } else {
    logger.info('没有需要删除的订单');
  }

  return { success: true, ordersDeleted: invalidOrders.length };
}

// ==================== 完整流程 ====================
async function fullFlow() {
  logger.info('🚀 开始执行完整交易流程...');

  try {
    // 1. 下单
    const orderResult = await order();

    // 2. 止盈
    const takeProfitResult = await setTakeProfit();

    if (takeProfitResult.takeProfitSet === 0) {
      logger.info('✅ 完整流程执行完成(无需设置止盈)');
      return { success: true, orderResult, takeProfitResult };
    }

    // 3. 验证止盈单是否生效
    const verified = await waitForCondition(
      async () => {
        const orders = await getOpenOrders();
        return takeProfitResult.list.every(tp => {
          const matchingOrder = orders.find(
            order => order.symbol === tp.symbol && order.positionSide === tp.positionSide
          );
          return matchingOrder !== undefined;
        });
      },
      { maxAttempts: 15, interval: 1000 }
    );

    // 4. 清理无效订单
    if (verified) {
      const cleanupResult = await deleteAllInvalidOrders(true);
      logger.info('✅ 完整流程执行完成');
      return { success: true, orderResult, takeProfitResult, cleanupResult };
    } else {
      logger.error('止盈设置验证超时,跳过清理步骤');
      return { success: false, error: '止盈验证超时', orderResult, takeProfitResult };
    }
  } catch (error) {
    logger.error(`完整流程执行失败: ${error.message}`);
    errorLogger(error);
    return { success: false, error: error.message };
  }
}

// ==================== 帮助信息 ====================
function showHelp() {
  console.log(`
┌─────────────────────────────────────────────────────────────┐
│           Binance 交易策略手动触发工具                        │
└─────────────────────────────────────────────────────────────┘

用法:
  node scripts/manual-trigger.js <命令>

可用命令:
  order        执行下单流程
  takeprofit   设置止盈
  refresh      更新交易对和指标数据
  cleanup      清理无效订单
  full         执行完整流程 (下单→止盈→清理)
  help         显示此帮助信息

示例:
  node scripts/manual-trigger.js full
  node scripts/manual-trigger.js order
  node scripts/manual-trigger.js takeprofit

注意:
  - 请确保已配置 .env 文件中的 API 密钥
  - 建议先在测试网环境测试
  - full 命令会执行完整的交易流程,请谨慎使用
`);
}

// ==================== 主函数 ====================
async function main() {
  const command = process.argv[2];

  if (!command || command === 'help') {
    showHelp();
    process.exit(0);
  }

  // 初始化 SQLite 数据库
  const dataRepository = require('../utils/OrderRepository');
  try {
    if (!dataRepository.db) {
      dataRepository.initialize();
      logger.info('SQLite 数据库初始化成功');
    }
  } catch (error) {
    console.error('❌ SQLite 数据库初始化失败:', error.message);
    errorLogger('Failed to initialize SQLite database:', error);
    process.exit(1);
  }

  const startTime = Date.now();

  try {
    let result;

    switch (command) {
      case 'order':
        result = await order();
        break;
      case 'takeprofit':
        result = await setTakeProfit();
        break;
      case 'refresh':
        result = await updateAllExchangeInfo();
        break;
      case 'cleanup':
        result = await deleteAllInvalidOrders(true);
        break;
      case 'full':
        result = await fullFlow();
        break;
      default:
        console.error(`❌ 未知命令: ${command}`);
        console.log('运行 "node scripts/manual-trigger.js help" 查看可用命令');
        process.exit(1);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`\n✅ 命令执行完成,耗时: ${elapsed}s`);

    // 确保所有异步操作完成后退出
    setTimeout(() => {
      process.exit(result && result.success !== false ? 0 : 1);
    }, 1000);

  } catch (error) {
    logger.error(`\n❌ 执行失败: ${error.message}`);
    errorLogger(error);
    setTimeout(() => process.exit(1), 1000);
  }
}

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = {
  order,
  setTakeProfit,
  updateAllExchangeInfo,
  deleteAllInvalidOrders,
  fullFlow
};
