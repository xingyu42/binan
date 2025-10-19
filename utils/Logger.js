import log4js from 'log4js';
import { APP_CONFIG } from '../core/constants.js';

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
export const logger = log4js.getLogger();
const errorLoggerInstance = log4js.getLogger('error');

/**
 * 错误日志函数 (兼容原有global.errorLogger)
 * @param {...any} msg - 错误消息参数
 */
export const errorLogger = (...msg) => {
  errorLoggerInstance.error(...msg);
};

export const info = (...msg) => logger.info(...msg);
export const warn = (...msg) => logger.warn(...msg);
export const error = (...msg) => logger.error(...msg);
export const debug = (...msg) => logger.debug(...msg);
