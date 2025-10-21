import axios from 'axios'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { createHmac } from 'node:crypto'
import JSONbig from 'json-bigint'

import {
  apiSocks,
  apiKey,
  apiDomainContract,
  apiDomain1,
  apiSecret
} from '../config/config.js'
import { SYSTEM_LIMITS, API_CONFIG } from '../core/constants.js'
import { logger, errorLogger } from '../utils/Logger.js'

let httpsAgent = null
if (process.env.API_SOCKS_OPEN === '1' && apiSocks) {
  console.log('代理初始化开始')
  try {
    httpsAgent = new SocksProxyAgent(apiSocks)
    console.log('代理已启用:', apiSocks)
  } catch (error) {
    console.error('代理初始化失败:', error.message)
  }
}

const RETRY_CONFIG = API_CONFIG.RETRY,
  RATE_LIMIT_INTERVAL = SYSTEM_LIMITS.API_LIMITS.KLINE_REQUEST_INTERVAL

/**
 * @typedef {Object} ErrorType
 * @property {string} name - 错误类型的中文描述，用于日志输出。
 * @property {string[]} [codes] - Node.js 错误码列表，定位网络和代理异常。
 * @property {string[]} [keywords] - 错误消息关键词，用于捕捉非标准返回。
 * @property {number[]} [statuses] - 需要特殊处理的 HTTP 状态码集合。
 * @property {[number, number]} [statusRange] - 连续的 HTTP 状态码范围（如 5xx）。
 * @property {boolean} shouldRetry - 是否应触发重试逻辑。
 * @property {number|Function} baseDelay - 初始退避延迟或动态计算函数。
 * @property {number} [maxAttempts] - 指定错误允许的最大重试次数。
 * @property {string} [message] - 补充的友好提示信息。
 */
/** 币安错误类型映射：name 用于日志，codes/keywords/statuses/statusRange 识别错误，shouldRetry 决定回退，baseDelay 与 maxAttempts 约束节奏，message 额外提醒。 @type {Record<string, ErrorType>} */
const ERROR_CONFIG = {
  NETWORK: { name: '网络错误', codes: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN'], shouldRetry: true, baseDelay: RETRY_CONFIG.INITIAL_DELAY },
  PROXY: { name: '代理错误', codes: ['ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH'], keywords: ['socket hang up', 'socks', 'getaddrinfo enotfound'], shouldRetry: true, maxAttempts: RETRY_CONFIG.PROXY_RETRY_ATTEMPTS, baseDelay: RETRY_CONFIG.PROXY_RETRY_DELAY },
  RATE_LIMIT: { name: '限频错误', statuses: [418, 429], shouldRetry: true, baseDelay: 5000 },
  ACCESS_DENIED: { name: '访问受限', statuses: [451], shouldRetry: false, message: '当前地区暂不支持访问币安接口' },
  TIMEOUT: { name: '超时错误', codes: ['ECONNABORTED'], shouldRetry: true, baseDelay: RETRY_CONFIG.INITIAL_DELAY },
  SERVER: { name: '服务器错误', statusRange: [500, 599], shouldRetry: true, baseDelay: RETRY_CONFIG.INITIAL_DELAY },
  UNKNOWN: { name: '未知错误', shouldRetry: false, baseDelay: RETRY_CONFIG.INITIAL_DELAY }
}
/** @type {Array<(data: string) => any>} 币安响应转换器，避免 JSONbig 将大整数截断。 */
const transformResponse = [(data) => {
  try {
    return JSONbig.parse(data)
  } catch (error) {
    console.warn('JSON 解析失败，返回原始数据:', error.message)
    return data
  }
}]
/** @param {Record<string, any>} [payload={}] - 序列化为 application/x-www-form-urlencoded；@returns {string} 币安兼容的查询字符串。 */
const serializeParams = (payload = {}) => {
  const params = new URLSearchParams()
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    const normalized = typeof value === 'object' ? JSON.stringify(value) : value
    params.append(key, normalized)
  })
  return params.toString()
}

/** @param {string} baseURL - 币安 API 基础地址；@returns {import('axios').CreateAxiosDefaults} 含签名序列化与默认超时的配置。 */
const createBaseConfig = (baseURL) => ({
  baseURL,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-MBX-APIKEY': apiKey, 'User-Agent': 'Mozilla/5.0 (compatible; BinanceAPI/1.0)' },
  paramsSerializer: { serialize: serializeParams },
  transformRequest: [(data, headers) => {
    if (!data || typeof data === 'string') return data
    return (headers?.['Content-Type'] || headers?.['content-type'] || '').includes('application/x-www-form-urlencoded')
      ? serializeParams(data)
      : data
  }],
  transformResponse,
  timeout: 30000,
  ...(httpsAgent && { httpsAgent })
})
/** @param {number} ms - 退避或限流等待的毫秒数；@returns {Promise<void>} 等待完成后解析的 Promise。 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
/** @param {number} interval - 控制请求的最小时间间隔；@returns {() => Promise<void>} 串行 Promise 限流器；@example const limiter = createRateLimiter(100); await limiter(); */
const createRateLimiter = (interval) => {
  let lastCall = 0
  let chain = Promise.resolve()
  return () => (chain = chain.then(async () => {
    const wait = Math.max(0, interval - (Date.now() - lastCall))
    if (wait) await delay(wait)
    lastCall = Date.now()
  }))
}
/** @param {Record<string, any>|URLSearchParams|string|null|undefined} payload - 各类负载；@returns {Record<string, any>} 去除 signature/timestamp 的浅拷贝。 */
const toPlainObject = (payload) => {
  const plain = !payload
    ? {}
    : typeof payload === 'string'
      ? Object.fromEntries(new URLSearchParams(payload))
      : payload instanceof URLSearchParams
        ? Object.fromEntries(payload.entries())
        : { ...payload }
  delete plain.signature
  delete plain.timestamp
  return plain
}
/** @param {string} serializedPayload - 币安签名所需的查询串；@returns {string} HMAC-SHA256 十六进制签名。 */
const createSignature = (serializedPayload) =>
  createHmac('sha256', apiSecret).update(serializedPayload).digest('hex')
/** @param {import('axios').InternalAxiosRequestConfig} config - 待增强的请求配置；@returns {import('axios').InternalAxiosRequestConfig} 已附加时间戳与签名。 */
const addSignature = (config) => {
  const method = (config.method || 'get').toLowerCase()
  const targetKey = method === 'get' || method === 'delete' ? 'params' : 'data'
  const payload = { ...toPlainObject(config[targetKey]), timestamp: Date.now() }
  const serialized = serializeParams(payload)
  config[targetKey] = { ...payload, signature: createSignature(serialized) }
  return config
}
/** @param {import('axios').AxiosError} error - axios 错误对象；@returns {ErrorType} 匹配到的错误分类。 */
const detectErrorType = (error) => {
  const status = error?.response?.status
  const code = error?.code
  const message = error?.message?.toLowerCase() || ''
  return Object.values(ERROR_CONFIG).find((type) =>
    type.statuses?.includes(status)
    || (type.statusRange && status >= type.statusRange[0] && status <= type.statusRange[1])
    || type.codes?.includes(code)
    || type.keywords?.some((keyword) => message.includes(keyword))
  ) || ERROR_CONFIG.UNKNOWN
}
/** @param {ErrorType} errorType - 错误分类；@param {import('axios').InternalAxiosRequestConfig & {_retryCount?: number}} config - 请求配置与重试计数；@returns {boolean} 是否继续尝试。 */
const shouldRetry = (errorType, config) =>
  errorType.shouldRetry && (config._retryCount ?? 0) < (errorType.maxAttempts ?? RETRY_CONFIG.MAX_ATTEMPTS)
/** @param {ErrorType} errorType - 当前错误；@param {number} attempt - 已尝试次数；@returns {number} 下一次重试前的等待毫秒。 */
const getRetryDelay = (errorType, attempt) => {
  const baseDelay = typeof errorType.baseDelay === 'number'
    ? errorType.baseDelay
    : (typeof errorType.baseDelay === 'function' ? errorType.baseDelay(RETRY_CONFIG) : RETRY_CONFIG.INITIAL_DELAY)
  const exponential = baseDelay * Math.pow(RETRY_CONFIG.BACKOFF_FACTOR, Math.max(attempt - 1, 0))
  const jitter = Math.random() * 0.3 * exponential
  return Math.min(exponential + jitter, RETRY_CONFIG.MAX_DELAY)
}
/** @param {ErrorType} errorType - 错误分类；@param {import('axios').AxiosError} error - 原始错误；@param {number} attempt - 重试序号；@param {number} wait - 计划等待毫秒。 */
const logRetryAttempt = (errorType, error, attempt, wait) =>
  logger.warn(`${errorType.name} - 第${attempt}次重试, 延迟${Math.round(wait)}ms`, {
    url: error.config?.url,
    method: error.config?.method,
    status: error.response?.status,
    code: error.code
  })
/** @param {import('axios').InternalAxiosRequestConfig & {_retryCount?: number}} config - 成功请求的配置，用于记录重试效果。 */
const logRetrySuccess = (config) =>
  logger.info(`✅ 重试成功, 共尝试 ${config._retryCount} 次`, {
    url: config.url,
    method: config.method,
    retryCount: config._retryCount
  })
/** @param {import('axios').AxiosError} error - axios 错误；@param {ErrorType} [errorType=ERROR_CONFIG.UNKNOWN] - 推断分类；@returns {Promise<never>} 统一记录后拒绝错误。 */
const handleError = (error, errorType = ERROR_CONFIG.UNKNOWN) => {
  const info = {
    method: error.config?.method,
    url: error.config?.url,
    params: error.config?.params ?? error.config?.data,
    status: error.response?.status,
    statusText: error.response?.statusText,
    message: error.message,
    responseData: error.response?.data
  }
  const logPrefix = `[${errorType.name}]`
  console.error(`${logPrefix} API 调用失败`, JSON.stringify(info, null, 2))
  if (errorType.message) console.error(`${logPrefix} ${errorType.message}`)
  errorLogger(`${logPrefix} ${JSON.stringify(info)}`)
  return Promise.reject(error)
}
/** @param {import('axios').AxiosInstance} axiosInstance - 待增强实例；@returns {number} 响应拦截器 ID，便于注销。 */
const createSmartRetryInterceptor = (axiosInstance) => axiosInstance.interceptors.response.use(
  (response) => {
    if (response.config._retryCount) logRetrySuccess(response.config)
    return response
  },
  async (error) => {
    const config = error.config
    const errorType = detectErrorType(error)
    if (!config) return handleError(error, errorType)
    config._retryCount = config._retryCount ?? 0
    if (!shouldRetry(errorType, config)) return handleError(error, errorType)
    config._retryCount += 1
    const wait = getRetryDelay(errorType, config._retryCount)
    logRetryAttempt(errorType, error, config._retryCount, wait)
    await delay(wait)
    return axiosInstance(config)
  }
)
/** @param {string} baseURL - API 域名；@returns {import('axios').AxiosInstance} 内置签名、限流与重试的客户端。 */
const createSignedClient = (baseURL) => {
  const instance = axios.create(createBaseConfig(baseURL))
  const rateLimiter = createRateLimiter(RATE_LIMIT_INTERVAL)
  instance.interceptors.request.use(async (config) => {
    await rateLimiter()
    return addSignature(config)
  })
  createSmartRetryInterceptor(instance)
  return instance
}
/** 币安 API 客户端集合：spotsAxios 负责现货签名限流重试，contractAxios 负责合约域名隔离；@type {[import('axios').AxiosInstance, import('axios').AxiosInstance]} */
const [spotsAxios, contractAxios] = [apiDomain1, apiDomainContract].map(createSignedClient)

/** @returns {Promise<boolean>} 检查币安现货 API 是否可用；@throws {import('axios').AxiosError} 网络或服务异常时抛出原始错误。 */
const healthCheck = async () => spotsAxios
  .get('/api/v3/ping')
  .then(() => (console.log('币安 API 可用'), true))
  .catch((error) => (console.error('币安 API 健康检查失败:', error.message), false))

export { contractAxios, spotsAxios, healthCheck }
