// 价格跟踪控制器 //TODO: 不符合当前策略废弃
import {
  getAccountData,
  getKlines,
  setStopPrice,
  getListenKey,
  getOneOpenOrders
} from '../services/binanceContractService.js';
import { klinesInit } from './calculatePositionsController.js';
import { safeFormatPrice } from '../utils/precisionUtils.js';
import { getATRCompute } from '../utils/mathUtils.js';
import { API_CONFIG, MONITOR_CONFIG } from '../core/constants.js';
import dataRepository from '../utils/OrderRepository.js';
import { logger, errorLogger } from '../utils/Logger.js';
import WebSocket from 'ws';
import { SocksProxyAgent } from 'socks-proxy-agent';
import schedule from 'node-schedule';

const agent = new SocksProxyAgent(API_CONFIG.SOCKS_PROXY);



// 获取账户头寸
async function getAccountPosition() {
  let res = await getAccountData()
  if (!res) return
  let allPositions = res.positions
  return allPositions.filter((item) => {
    return Math.abs(item.positionAmt) > 0
  }) // 保证金总余额
}

// 获取ATR数据
function getATRData() {
  try {
    return dataRepository.get('ATR') || {};
  } catch (error) {
    errorLogger('读取ATR数据失败:', error);
    return {};
  }
}

// 获取品种最近价格和K线数据
const SYMBOL_HIGH_LOW_KEY_PREFIX = 'priceTracker:';

function getSymbolHighLow(symbol) {
  try {
    const data = dataRepository.get(`${SYMBOL_HIGH_LOW_KEY_PREFIX}${symbol}`);
    if (!data) return null;
    const high = Number(data.high);
    const low = Number(data.low);
    if (Number.isNaN(high) || Number.isNaN(low)) return null;
    return { high, low };
  } catch (error) {
    errorLogger(`Failed to get high/low for ${symbol}:`, error);
    return null;
  }
}

function updateSymbolHighLow(symbol, high, low) {
  try {
    dataRepository.set(`${SYMBOL_HIGH_LOW_KEY_PREFIX}${symbol}`, { high, low });
  } catch (error) {
    errorLogger(`Failed to update high/low for ${symbol}:`, error);
  }
}

// 获取品种市场价K线数据
async function getSymbolKlineData(symbol, limit = 50) {
  try {
    const res = await getKlines(symbol, limit)
    const klines = klinesInit(symbol, res.data).klines
    return klines
  } catch (error) {
    errorLogger(`获取${symbol}K线数据失败:`, error)
    return null
  }
}

// 计算品种当前ATR
async function getCurrentATR(klines) {
  if (!klines || klines.length < 14) return null
  return getATRCompute(klines.slice(-14), 14)
}

// 监控持仓极值并调整止损
async function monitorPosition(position, direction) {
  const symbol = position.symbol
  const currentPrice = Number(position.markPrice)

  const klines = await getSymbolKlineData(symbol)
  if (!klines) return

  const atrData = getATRData()
  const currentATR = atrData[symbol] || await getCurrentATR(klines)
  if (!currentATR) return

  let symbolHighLow = getSymbolHighLow(symbol)
  if (!symbolHighLow) {
    symbolHighLow = { high: currentPrice, low: currentPrice }
    updateSymbolHighLow(symbol, symbolHighLow.high, symbolHighLow.low)
  }

  const extremeValue = direction > 0 ? symbolHighLow.high : symbolHighLow.low
  const isNewExtreme = direction > 0 ? currentPrice > extremeValue : currentPrice < extremeValue

  if (!isNewExtreme) return

  const updatedHigh = direction > 0 ? currentPrice : symbolHighLow.high
  const updatedLow = direction > 0 ? symbolHighLow.low : currentPrice
  updateSymbolHighLow(symbol, updatedHigh, updatedLow)
  logger.info(`${symbol} ${direction > 0 ? '创新高' : '创新低'}: ${currentPrice}`)

  const rawStopPrice = currentPrice - (direction * MONITOR_CONFIG.POSITION_MONITOR.ATR_MULTIPLIER * currentATR)
  const newStopPrice = await safeFormatPrice(rawStopPrice, symbol)
  const currentStopPrice = await getStopPrice(symbol)
  const shouldUpdate = direction > 0 ? newStopPrice > currentStopPrice : newStopPrice < currentStopPrice

  if (shouldUpdate) {
    await setNewStopPrice(symbol, newStopPrice, direction)
    logger.info(`${symbol} ${direction > 0 ? '做多止损调整' : '做空止损调整'}: ${currentStopPrice} -> ${newStopPrice}`)
  }
}
function positionMonitor() {
  logger.info('开始增强仓位监控系统')
  logger.info(`监控配置: 检查间隔=${MONITOR_CONFIG.POSITION_MONITOR.CHECK_INTERVAL}, ATR倍数=${MONITOR_CONFIG.POSITION_MONITOR.ATR_MULTIPLIER}`)

  // 根据配置的时间间隔检查所有持仓
  schedule.scheduleJob(MONITOR_CONFIG.POSITION_MONITOR.CHECK_INTERVAL, async function () {
    try {
      const positions = await getAccountPosition()
      if (!positions || positions.length === 0) return

      logger.info(`监控 ${positions.length} 个持仓品种`)

      for (const position of positions) {
        const direction = Number(position.positionAmt) > 0 ? 1 : -1

        // 新高新低跟踪止损逻辑
        if (MONITOR_CONFIG.POSITION_MONITOR.ENABLE_HIGH_LOW_TRACKING) {
          await monitorPosition(position, direction)
        }

        // 保持原有的止盈逻辑
        if (MONITOR_CONFIG.POSITION_MONITOR.ENABLE_ORIGINAL_STOP_LOGIC) {
          let unrealizedProfit = Number(position.unrealizedProfit)
          let isolatedWallet = Number(position.isolatedWallet)
          if (unrealizedProfit > isolatedWallet) {
            await stopPrice(position)
          }
        }
      }
    } catch (error) {
      errorLogger('仓位监控错误:', error)
    }
  })
}

// 获取合约价格
async function getPrice(symbol) {
  let res = await getKlines(symbol, 3)
  let klines = klinesInit(symbol, res.data).klines
  return klines[klines.length - 1].close
}


//  获取合约的止损价格
async function getStopPrice(symbol) {
  let data = await getOneOpenOrders(symbol)
  let lData = data.sort((a, b) => {
    return b.time - a.time
  })
  return Number(lData[0]?.stopPrice)
}


/**
 * 根据盈利倍数动态调整止损价：
 * - profitMultiplier 表示盈利是独立仓位保证金的倍数
 * - acceptableLossMultiplier 控制允许回吐的保证金倍数（盈利越高可承受的亏损越大）
 * - priceDecline = price * (acceptableLossMultiplier / profitMultiplier) 计算可接受的价格回撤
 */
function getNewStopPrice(isolatedWallet, unrealizedProfit, price, direction) {
  const profitMultiplier = Math.floor(unrealizedProfit / isolatedWallet)
  const acceptableLossMultiplier = (profitMultiplier - 2) * 0.1 + 1.8
  const priceDecline = price * (acceptableLossMultiplier / profitMultiplier)
  return direction > 0 ? price - priceDecline : price + priceDecline
}
async function stopPrice(position) {
  // 新的止盈规则
  let unrealizedProfit = Number(position.unrealizedProfit) // 未实现盈亏
  let isolatedWallet = Number(position.isolatedWallet) // 保证金
  let direction = Number(position.direction)  // 方向

  if (unrealizedProfit / 2 > isolatedWallet) {
    let stopPriceIng = await getStopPrice(position.symbol)
    let price = await getPrice(position.symbol)
    let newStopPrice = getNewStopPrice(isolatedWallet, unrealizedProfit, price, direction)
    let isStart = direction > 0 ? newStopPrice > stopPriceIng : newStopPrice < stopPriceIng
    // 如果做空，止损价格大于历史止损价格，如果做多，止损价格小于历史止损价格，
    if (isStart) {
      await setNewStopPrice(position.symbol, newStopPrice, direction)
    }
  }
}

async function setNewStopPrice(symbol, stopPrice, direction) {
  let positionSide = direction > 0 ? 'LONG' : 'SHORT'
  await setStopPrice(symbol, positionSide, stopPrice)
  logger.info(`${symbol}跟踪设置止盈成功`)
}

export default async function priceTrackingController() {
  positionMonitor()
}

export { positionMonitor };
