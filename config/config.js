// 为了向后兼容，保持原有导出，但现在从常量模块获取配置
import { API_CONFIG, TRADING_CONFIG, TIMEZONE_CONFIG } from '../core/constants.js';

// 向后兼容的导出
export const apiDomain = API_CONFIG.SPOT_DOMAINS.PRIMARY;
export const apiDomain1 = API_CONFIG.SPOT_DOMAINS.BACKUP_1;
export const apiDomain2 = API_CONFIG.SPOT_DOMAINS.BACKUP_2;
export const apiDomain3 = API_CONFIG.SPOT_DOMAINS.BACKUP_3;
export const apiDomain4 = API_CONFIG.SPOT_DOMAINS.BACKUP_4;
export const apiDomainContract = API_CONFIG.CONTRACT_DOMAIN;
export const apiSocks = API_CONFIG.SOCKS_PROXY;
export const apiKey = API_CONFIG.API_KEY;
export const apiSecret = API_CONFIG.API_SECRET;
export const cycle = TRADING_CONFIG.KLINE_INTERVAL;
export const timezoneOffset = TIMEZONE_CONFIG.DEFAULT_OFFSET;

// 向后兼容的函数
export function getTimezoneOffset() {
  return TIMEZONE_CONFIG.getTimezoneOffset();
}
