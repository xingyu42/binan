// 定时控制器
const schedule = require('node-schedule');
const { getExchangeInfo, contractOrder, getAccountData, getKlines, setStopPrice, getOpenOrders, deleteOrder } = require('../services/binanceContractService');
// const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getPreparingOrders, getAllExchangeInfo, getHighAndLow, klinesInit, getATR, getOneIndex } = require('./calculatePositionsController');
const dataRepository = require('../utils/OrderRepository');
const { logger, errorLogger } = require('../utils/Logger');
const { getTickSize, formatPriceByTickSize } = require('../utils/precisionUtils');
const utils = require('../utils/util');

// 黑白名单辅助函数
function setWhitelist(list) {
  const filePath = path.join(__dirname, '../data/whiteList.json');
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf-8');
}

function setBlacklist(list) {
  const filePath = path.join(__dirname, '../data/blackList.json');
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf-8');
}

/**
 * 轮询等待直到条件满足
 * @param {Function} checkFn - 返回布尔值的检查函数
 * @param {Object} options - 配置项
 * @returns {Promise<boolean>} - 成功返回 true,超时返回 false
 */
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

// 更新所有交易对的ATR和波动率
async function updateAllATR(callback) {
  let indexObject = {}
  let res = await getAllExchangeInfo()
  let symbols = res.map((item)=>item.symbol)
  let count = 0

  // 获取单个品种的指标
  async function getOne (symbol) {
    indexObject[symbol] = await getOneIndex(symbol)
    count++
    if (count === res.length){
      let ATRObj = {} // ATR
      let TOJ = {}  // 金死叉次数
      let volObj = {} // 波动率 //todo:未使用
      let AAObj = {} // 振幅 //TODO：未使用
      Object.keys(indexObject).forEach(itemKey => {
        ATRObj[itemKey] = indexObject[itemKey].ATR
        TOJ[itemKey] = indexObject[itemKey].trendOscillation
        volObj[itemKey] = indexObject[itemKey].vol
        AAObj[itemKey] = indexObject[itemKey].averageAmplitude
      })

      // 写入SQLite数据库
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
        process.exit(1);
      }
    };
  }
  for (let i in symbols) {
    let symbol = symbols[i]
    getOne(symbol)
  }
}

// 记录账号历史最大权益
async function setUpdateEquity(){
  let res = await getAccountData()
  let equity = Number(res.totalMarginBalance)
  let data = dataRepository.get('equity') || { equity: 0 }
  if (equity > Number(data.equity)){
    data.equity = equity
  }
  dataRepository.set('equity', data)
  logger.info('账号历史最大权益更新成功')
  return true
}

// 更新合约交易对
async function updateAllExchangeInfo(){
  let res = await getExchangeInfo()
  if (!res) { return logger.info('更新交易对失败') }
  let symbols = res.data.symbols
  let data = symbols.filter(item => item.symbol.includes("USDT")).filter(item => item.status === 'TRADING')
  dataRepository.set('data', data)
  logger.info('更新交易对成功')
  setUpdateEquity()
  updateAllATR()
  return true
}

// 获取账户头寸
async function getAccountPosition() {
  let res = await getAccountData()
  if (!res) return
  let allPositions = res.positions
  return allPositions.filter((item)=>{
    return Math.abs(item.positionAmt) > 0
  })
}

// 赢冲输缩最多下单头寸
async function getEquityAmount () {
  let res = await getAccountData()
  let availableBalance = Number(res.availableBalance) // 账户余额
  let totalMarginBalance = Number(res.totalMarginBalance)/2 // 对半账户权益
  let equity = totalMarginBalance > availableBalance ? availableBalance : totalMarginBalance
  let equityMaxHistory = dataRepository.get('equity') || { equity: 0 }
  let withdrawalAmplitude = 0 // 回撤幅度
  if (equityMaxHistory.equity > res.totalMarginBalance){
    withdrawalAmplitude = (equityMaxHistory.equity - res.totalMarginBalance)/equityMaxHistory.equity
  }
  logger.info('回撤幅度', withdrawalAmplitude.toFixed(3))
  return {
    num:(equity/3) * Math.pow((1 - withdrawalAmplitude.toFixed(3)), 2),
    withdrawalAmplitude:withdrawalAmplitude.toFixed(3)
  }
  // 最大风险度在赢冲输缩规则，账户权益没有回撤的情况下：
  // 3每次标的物下单为账户权益的1.67%，风险度为 0.34%
  // 2每次标的物下单为账户权益的2.5%，风险度为 0.5%
}

// 下单！
async function order (){
  let position = await getAccountPosition()
  let equityAmount = await getEquityAmount()
  let allExchange = await getAllExchangeInfo()
  let tradingExchangeNum = allExchange.filter(symbol => symbol.status === 'TRADING').length // 可交易的合约的数量
  let orderNumber = parseInt(tradingExchangeNum/16 * (1 - equityAmount.withdrawalAmplitude )) // 最多下单数量
  let orderList = await getPreparingOrders(equityAmount.num, position, allExchange, orderNumber)
  if (orderList.length === 0){
    logger.info('没有符合条件的标的')
    return
  }
  const addOrderNumber = orderList.reduce((count, item) => {
    return !item.isOne ? count + 1 : count;
  }, 0);
  // let maxAddOrderNumber = parseInt(addOrderNumber * (1 - equityAmount.withdrawalAmplitude )) // 最大开仓数量
  let maxAddOrderNumber = addOrderNumber // 最大开仓加仓数量不再有限制
  logger.info('开始下单',orderList.map(item => item.symbol).join(', '));
  // 生成一个从1.2到0.8递减的数组
  function generateArray(length) {
    if (length === 1){
      return [1]
    }
    let startValue = 1.2;
    let endValue = 0.8;
    let step = (startValue - endValue) / (length - 1); // 计算递减步长
    let resultArray = [];
    for (let i = 0; i < length; i++) {
      let value = (startValue - i * step).toFixed(4);
      resultArray.push(parseFloat(value)); // 将字符串转换为浮点数
    }
    return resultArray;
  }
  function getNum(num,yNum){
    let z = utils.getPrecision(yNum)
    return utils.truncateDecimal(num,z)
  }

  /**
   * 计算最小下单数量(消除if-else分支)
   * @param {number} minQty - 币安规定的最小数量
   * @param {number} stepSize - 数量步进值
   * @param {number} closePrice - 当前价格
   * @param {number} notional - 最小名义价值
   * @returns {number} 最小数量
   */
  function calculateMinQuantity(minQty, stepSize, closePrice, notional) {
    // 基于名义价值的最小数量
    const notionalBasedMin = Math.ceil(notional / (stepSize * closePrice)) * stepSize;
    // 返回两者中的较大值 (替代if-else,这就是Good Taste)
    return Math.max(minQty, notionalBasedMin);
  }

  /**
   * 将数值限制在范围内(消除两个独立的if分支)
   * @param {number} value - 原始值
   * @param {number} min - 最小值
   * @param {number} max - 最大值
   * @returns {number} 限制后的值
   */
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * 获取下单数量
   * @param {Object} item - 仓位信息
   * @param {number} num - 下单金额系数
   * @returns {number} 最终下单数量,如果不满足最小名义价值则返回0
   */
  function getQuantity (item, num) {
    // 1. 计算原始数量
    const rawQuantity = getNum(parseFloat(item.quantity) * num, parseFloat(item.quantity));

    // 2. 提取参数(提前解析,避免重复计算)
    const minQty = parseFloat(item.minQty);
    const maxQty = parseFloat(item.maxQty);
    const stepSize = parseFloat(item.stepSize);
    const notional = parseFloat(item.notional);
    const closePrice = item.closePrice;

    // 3. 提前检查:原始数量是否满足最小名义价值
    const rawNotionalValue = rawQuantity * closePrice;
    if (rawNotionalValue < notional) {
      logger.warn(
        `${item.symbol} 仓位 ${rawNotionalValue.toFixed(2)}U < 交易所最小值 ${notional}U, `
      );
      return 0;
    }

    // 4. 计算最小数量
    const minQuantity = calculateMinQuantity(minQty, stepSize, closePrice, notional);

    // 5. 限制到有效范围
    const clampedQuantity = clamp(rawQuantity, minQuantity, maxQty);

    // 6. 格式化到步进精度并记录
    const finalQuantity = getNum(clampedQuantity, parseFloat(item.quantity));
    logger.info(item.symbol, '下单处理的数量', finalQuantity);

    return finalQuantity;
  }
  let generatedArray = generateArray(orderList.length);

  async function executeOrders() {
    let addCount = 0;
    const tasks = orderList.map((order, index) => {
      if (!order.isOne) {
        addCount++;
        if (addCount > maxAddOrderNumber) {
          logger.info(order.symbol,'不再加仓');
          return Promise.resolve();
        }
      }
      return placeOrder(order, generatedArray[index]);
    });
    await Promise.all(tasks);
    logger.info('下单完毕');
  }

  async function placeOrder(order, coefficient) {
    const quantity = getQuantity(order, coefficient);
    if (quantity === 0) {
      logger.info(order.symbol,'数量为0不再下单');
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
    } catch (error) {
      errorLogger(`${order.symbol} 下单失败`, error);
    }
  }

  await executeOrders()
}

// 对所有开仓并符合条件的标的物设置止盈
async function setTakeProfit () {
  let positionList = await getAccountPosition() // 所有头寸
  let orders = await getOpenOrders()
  let allExchange = await getAllExchangeInfo()
  orders = orders.map(function(item){
    item.orderId = item.orderId.toString()
    return item
  })
  function getOneOrder(symbol){
    for (let i in orders){
      if (orders[i].symbol == symbol){
        return orders[i]
      }
    }
  }
  let takeProfitList = []
  function signal (item){
    // 做多如果10天最低点高于止损位置，止损位置上移
    // 做空如果10天最高点低于止损位置，止损位置下移
    if (item.positionSide == 'SHORT'){
      return item.highestPoint < Number(getOneOrder(item.symbol).stopPrice)
    }
    if (item.positionSide == 'LONG'){
      return item.lowestPoint > Number(getOneOrder(item.symbol).stopPrice)
    }
    return false
  }
  for (let i in positionList){
    let res = await getKlines(positionList[i].symbol, 11)
    let klines = klinesInit(positionList[i].symbol, res.data).klines
    let ATR = getATR(klines.slice(0, klines.length - 1), positionList[i].symbol)
    let data = {
      ...getHighAndLow(klines.slice(0, klines.length - 1), positionList[i].symbol),
      ...positionList[i],
      ATR
    }
    if (signal(data)){
      takeProfitList.push(data)
      let stopPrice = data.positionSide == 'SHORT' ? data.highestPoint : data.lowestPoint
      const tickSize = await getTickSize(data.symbol);
      let formattedStopPrice = formatPriceByTickSize(stopPrice, tickSize);
      await setStopPrice(data.symbol, data.positionSide, formattedStopPrice)
      if (data.positionSide == 'SHORT'){
        logger.info(data.highestPoint < Number(data.entryPrice) ? `${data.symbol}设置止盈成功` : `${data.symbol}设置止损移动成功`)
      }
      if (data.positionSide == 'LONG'){
        logger.info(data.lowestPoint > Number(data.entryPrice) ? `${data.symbol}设置止盈成功` : `${data.symbol}设置止损移动成功`)
      }
    }
  }
  if (takeProfitList.length === 0){
    logger.info('没有需要设置止盈的标的物')
  }
  return takeProfitList
}

// 删除已经无用的委托
async function deleteAllInvalidOrders(isDeL){
  let orders = await getOpenOrders()
  orders = orders.map(function(item){
    item.orderId = item.orderId.toString()
    return item
  })
  let position = await getAccountPosition()
  let symbols = position.map(item => item.symbol+item.positionSide)
  // 分类
  let obj = {}
  let invalidOrders = []
  // 最开始的删除策略
  for (let i in symbols) {
    let lData = orders.filter(item => (item.symbol+item.positionSide) === symbols[i]).sort((a,b) =>{
      return b.time - a.time
    })
    obj[symbols[i]] = lData
    for(let i2 in lData){
      if (i2 != 0){
        invalidOrders.push(lData[i2])
      }
    }
  }
  // 减仓的删除挂单，不会全部删除
  if (isDeL){ // 是否会删除减仓后的无用挂单。
    for (let i in orders){
      let ss = orders[i].symbol + orders[i].positionSide
      if (symbols.indexOf(ss) === -1) {
        invalidOrders.push(orders[i])
      }
    }
  }
  if (invalidOrders.length > 0){
    logger.info('开始删除无效订单')
    for (let i in invalidOrders){
      await deleteOrder(invalidOrders[i].symbol, invalidOrders[i].orderId)
      logger.info('撤销挂单完成',invalidOrders[i].symbol,invalidOrders[i].orderId,invalidOrders[i].stopPrice)
    }
  } else {
    logger.info('没有需要删除的订单')
  }
}


// 初始化数据(使用SQLite,无需检查JSON文件)
async function initData () {
  const dataRepository = require('../utils/OrderRepository');

  // 初始化SQLite数据库
  if (!dataRepository.db) {
    dataRepository.initialize();
  }

  // 初始化默认数据
  // 黑白名单使用JSON文件,检查文件是否存在
  const path = require('path');
  const blackListPath = path.join(process.cwd(), 'data', 'blackList.json');
  const whiteListPath = path.join(process.cwd(), 'data', 'whiteList.json');

  if (!fs.existsSync(blackListPath)) {
    setBlacklist(['USDCUSDT']);
    logger.info('初始化黑名单');
  }
  if (!fs.existsSync(whiteListPath)) {
    setWhitelist(['BTCUSDT']);
    logger.info('初始化白名单');
  }
  if (!dataRepository.exists('equity')) {
    let res = await getAccountData();
    let equity = Number(res.totalMarginBalance);
    dataRepository.set('equity', { equity });
  }

  updateAllExchangeInfo();
}

module.exports = async function () {
  logger.info('定时交易策略开始')
  // test()
  initData()
  schedule.scheduleJob('4 0 7 * * *',async function () {
    // 更新合约交易
    logger.info('更新合约对开始');
    // await updateTime()
    updateAllExchangeInfo()
  })
  schedule.scheduleJob('10 0 8 * * *', async function () {
    logger.info('获取下单交易数据下单')
    // 使用主动验证替代固定延迟
    await order()
      .then(async () => {
        logger.info('开始仓位止盈设置');
        const takeProfitList = await setTakeProfit();

        // 如果没有需要设置止盈的标的,直接返回成功
        if (takeProfitList.length === 0) {
          return true;
        }

        // 轮询验证止盈单是否已生效
        return waitForCondition(
    async () => {
      const orders = await getOpenOrders();

            // 检查每个需要止盈的持仓是否都有对应的挂单
            return takeProfitList.every(tp => {
              const matchingOrder = orders.find(
                order => order.symbol === tp.symbol && order.positionSide === tp.positionSide
              );
              return matchingOrder !== undefined;
            });
          },
          { maxAttempts: 15, interval: 1000 } // 最多等15秒,每秒检查一次
        );
      })
      .then(success => {
        if (success) {
          logger.info('删除无效委托');
          return deleteAllInvalidOrders(true);
        } else {
          logger.error('止盈设置验证超时,跳过清理步骤');
          // 可选: 触发告警
          return Promise.resolve();
        }
      })
      .catch(error => {
        logger.error(`交易流程失败: ${error.message}`);
        errorLogger(error);
        // 不中断程序,继续下一次定时任务
      });
  })
};
