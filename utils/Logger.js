const log4js = require('log4js');
const { APP_CONFIG } = require('../core/constants');

/**
 * Logger单例模块
 * 替代全局变量: global.logger, global.errorLogger
 *
 * 使用方法:
 *   const { logger, errorLogger } = require('./utils/Logger');
 *   logger.info('message');
 *   errorLogger('error message');
 */

// 配置log4js (与app.js中的配置保持一致)
log4js.configure(APP_CONFIG.LOG_CONFIG);

// 创建logger实例
const logger = log4js.getLogger();
const errorLoggerInstance = log4js.getLogger('error');

/**
 * 错误日志函数 (兼容原有global.errorLogger)
 * @param {...any} msg - 错误消息参数
 */
const errorLogger = (...msg) => {
  errorLoggerInstance.error(...msg);
};

// 导出单例
module.exports = {
  logger,
  errorLogger,

  // 便捷方法
  info: (...msg) => logger.info(...msg),
  warn: (...msg) => logger.warn(...msg),
  error: (...msg) => logger.error(...msg),
  debug: (...msg) => logger.debug(...msg)
};
