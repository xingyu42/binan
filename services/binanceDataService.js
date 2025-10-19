import dataRepository from '../utils/OrderRepository.js';
import { errorLogger } from '../utils/Logger.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');
const WHITELIST_FILE = path.join(DATA_DIR, 'whiteList.json');
const BLACKLIST_FILE = path.join(DATA_DIR, 'blackList.json');

/**
 * 获取缓存的交易对基础信息
 * @returns {Promise<Array>} 交易对信息数组
 */
async function getAllExchangeInfo() {
  try {
    const data = dataRepository.get('data');
    return Array.isArray(data) ? data : [];
  } catch (error) {
    errorLogger('读取交易对信息失败', error);
    return [];
  }
}

/**
 * 获取缓存的趋势震荡指标
 * @returns {Object} 趋势震荡数据
 */
function getTrendOscillationMap() {
  try {
    return dataRepository.get('trendOscillation') || {};
  } catch (error) {
    errorLogger('读取趋势震荡数据失败', error);
    return {};
  }
}

/**
 * 获取缓存的历史 ATR 指标
 * @returns {Object} ATR 映射
 */
function getHistoryATRMap() {
  try {
    return dataRepository.get('ATR') || {};
  } catch (error) {
    errorLogger('读取历史ATR数据失败', error);
    return {};
  }
}

function safeReadJsonArray(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    errorLogger(`读取名单文件失败: ${filePath}`, error);
    return [];
  }
}

function getWhitelistSymbols() {
  return safeReadJsonArray(WHITELIST_FILE);
}

function getBlacklistSymbols() {
  return safeReadJsonArray(BLACKLIST_FILE);
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function writeJsonArray(filePath, list) {
  ensureDataDir();
  try {
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf-8');
  } catch (error) {
    errorLogger(`写入名单文件失败: ${filePath}`, error);
    throw error;
  }
}

function setWhitelistSymbols(list) {
  writeJsonArray(WHITELIST_FILE, Array.isArray(list) ? list : []);
}

function setBlacklistSymbols(list) {
  writeJsonArray(BLACKLIST_FILE, Array.isArray(list) ? list : []);
}

export {
  getAllExchangeInfo,
  getTrendOscillationMap,
  getHistoryATRMap,
  getWhitelistSymbols,
  getBlacklistSymbols,
  setWhitelistSymbols,
  setBlacklistSymbols
};
