/**
 * 数据服务兼容层
 * 保持与原有JSON文件API 100%兼容
 *
 * 存储策略:
 * - SQLite: 高频自动更新的数据 (ATR, volatility, trendOscillation, equity, data)
 * - JSON文件: 低频人工配置 (blackList, whiteList)
 *
 * SQLite 映射:
 * data/ATR.json -> key: 'ATR'
 * data/equity.json -> key: 'equity'
 * data/volatility.json -> key: 'volatility'
 * data/trendOscillation.json -> key: 'trendOscillation'
 * data/data.json -> key: 'data'
 *
 * JSON 文件直接存储:
 * data/blackList.json -> 文件
 * data/whiteList.json -> 文件
 */
const dataRepository = require('./OrderRepository');
const fs = require('fs');
const path = require('path');

/**
 * 从文件名提取key
 * @param {string} filename - 文件路径 (如: 'data/ATR.json' 或 './data/ATR.json')
 * @returns {string} - 数据库key (如: 'ATR')
 */
function filenameToKey(filename) {
  // 移除路径前缀和.json后缀
  return filename
    .replace(/^\.?\//, '')        // 移除开头的 ./ 或 /
    .replace(/^data\//, '')       // 移除 data/ 前缀
    .replace(/\.json$/, '');      // 移除 .json 后缀
}

/**
 * 判断是否为JSON文件存储
 * @param {string} key - 数据键
 * @returns {boolean}
 */
function isJsonFile(key) {
  return key === 'blackList' || key === 'whiteList';
}

/**
 * 获取完整文件路径
 * @param {string} filename - 文件名
 * @returns {string}
 */
function getFilePath(filename) {
  // 支持 './data/xxx.json' 和 'data/xxx.json' 格式
  const normalized = filename.replace(/^\.\//, '');
  return path.join(process.cwd(), normalized);
}

/**
 * 读取数据 (兼容原 fs.readFileSync + JSON.parse)
 * @param {string} filename - 文件路径
 * @returns {Object|Array|string} - 数据对象,不存在返回空对象或空字符串
 */
function getData(filename) {
  const key = filenameToKey(filename);

  // 黑白名单走JSON文件
  if (isJsonFile(key)) {
    const filePath = getFilePath(filename);
    try {
      if (!fs.existsSync(filePath)) {
        return key === 'blackList' ? [] : [];
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      console.error(`Failed to read JSON file ${filePath}:`, err);
      return key === 'blackList' ? [] : [];
    }
  }

  // 其他数据走SQLite
  const data = dataRepository.get(key);
  if (data === null) {
    return {};
  }
  return data;
}

/**
 * 读取数据(返回字符串) (兼容原 fs.readFileSync)
 * @param {string} filename - 文件路径
 * @returns {string} - JSON字符串
 */
function getDataString(filename) {
  const key = filenameToKey(filename);

  // 黑白名单走JSON文件
  if (isJsonFile(key)) {
    const filePath = getFilePath(filename);
    try {
      if (!fs.existsSync(filePath)) {
        return '[]';
      }
      return fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      console.error(`Failed to read JSON file ${filePath}:`, err);
      return '[]';
    }
  }

  // 其他数据走SQLite
  const data = dataRepository.get(key);
  if (data === null) {
    return '{}';
  }
  return JSON.stringify(data);
}

/**
 * 写入数据 (兼容原 fs.writeFileSync + JSON.stringify)
 * @param {string} filename - 文件路径
 * @param {Object|string} data - 数据对象或JSON字符串
 */
function setData(filename, data) {
  const key = filenameToKey(filename);

  // 如果传入的是字符串,先解析为对象
  let dataObj = data;
  if (typeof data === 'string') {
    try {
      dataObj = JSON.parse(data);
    } catch (e) {
      console.error(`Failed to parse JSON for key ${key}:`, e);
      throw e;
    }
  }

  // 黑白名单走JSON文件
  if (isJsonFile(key)) {
    const filePath = getFilePath(filename);
    const dir = path.dirname(filePath);

    // 确保目录存在
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(dataObj, null, 2), 'utf-8');
    return;
  }

  // 其他数据走SQLite
  dataRepository.set(key, dataObj);
}

/**
 * 写入数据(异步版本,兼容Promise接口)
 * @param {string} filename - 文件路径
 * @param {Object|string} data - 数据对象或JSON字符串
 * @returns {Promise<boolean>}
 */
function setDataAsync(filename, data) {
  return new Promise((resolve, reject) => {
    try {
      setData(filename, data);
      resolve(true);
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  getData,
  getDataString,
  setData,
  setDataAsync
};
