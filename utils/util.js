/**
 * 工具函数单例模块
 * 替代全局变量: global.utils
 *
 * 使用方法:
 *   const utils = require('./utils/util');
 *   utils.calculateATR(...);
 */

const mathUtils = require('./mathUtils');
const precisionUtils = require('./precisionUtils');
const timeUtils = require('./timeUtils');
const formatUtils = require('./formatUtils');
const validationUtils = require('./validationUtils');

module.exports = {
  ...mathUtils,
  ...timeUtils,
  ...formatUtils,
  ...precisionUtils,
  ...validationUtils
};