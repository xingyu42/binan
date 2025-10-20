# 技术栈文档

## 概述

本项目是一个基于 **海龟交易策略** 的币安期货自动交易系统,使用 Node.js + Express + SQLite 构建,支持定时任务调度、智能仓位管理、动态止盈止损。

---

## 编程语言与运行时

| 技术 | 版本 | 用途 |
|------|------|------|
| **Node.js** | 20+ | 服务端运行时 |
| **JavaScript** | ES2020+ (ES Modules) | 主要编程语言(async/await、箭头函数、模板字符串、import/export) |
| **进程模型** | 单线程事件循环 | 异步I/O + 定时任务调度 |

---

## 核心框架与库

### Web 框架
- **Express.js** `4.19.2`
  - 轻量级 HTTP 服务器
  - REST API 路由
  - 静态文件服务(前端 dist/)

### HTTP 客户端
- **Axios** `1.7.7`
  - HTTP 请求库
  - 拦截器支持(签名、重试、队列)
  - Promise-based API

### 币安官方集成
- **@binance/connector** `3.0.0-rc.2`
  - 币安官方 API 连接器
  - WebSocket 支持(实时行情)
  - 签名认证自动化

---

## 数据持久化

### 数据库
- **better-sqlite3** `12.4.1`
  - 嵌入式 SQLite 3
  - 同步 API(更快、更简洁)
  - WAL 模式(Write-Ahead Logging)支持并发读写
  - 使用场景:
    - ATR 指标(4小时更新)
    - 波动率数据(30分钟更新)
    - 权益信息(5分钟更新)
    - 交易对信息(6小时更新)

### 配置文件存储
- **JSON 文件**
  - `blackList.json` - 交易对黑名单
  - `whiteList.json` - 交易对白名单
  - 手动配置,低频读取

---

## 日志系统

- **log4js** `6.9.1`
  - 企业级日志记录
  - 多输出目标(Console + File)
  - 日志分级(debug/info/warn/error)
  - 日志按日滚动(dateFile)
  - 自动压缩旧日志
  - 保留周期: 7 天
  - 配置:
    ```javascript
    appenders:
      - console: 控制台输出
      - appFile: logs/app.log.yyyy-MM-dd (应用日志,按日滚动)
      - errorFile: logs/error.log.yyyy-MM-dd (错误日志,按日滚动)
    categories:
      - default: debug → console + appFile
      - error: error → errorFile + console
    ```

---

## 任务调度

- **node-schedule** `2.1.1`
  - 类 CRON 定时任务
  - 时区支持(Asia/Shanghai)
  - 定时规则:
    ```javascript
    更新交易对: '4 0 7 * * *'     // 每天 07:00:04
    下单计划:   '10 0 8 * * *'    // 每天 08:00:10
    ATR 更新:   '0 0 */4 * * *'   // 每 4 小时
    波动率更新: '0 */30 * * * *'  // 每 30 分钟
    权益更新:   '0 */5 * * * *'   // 每 5 分钟
    交易对更新: '0 0 */6 * * *'   // 每 6 小时
    ```

---

## 网络与安全

### 代理支持
- **socks-proxy-agent** `8.0.1`
  - SOCKS5 代理
  - 支持币安 API 请求代理

### 密码学
- **crypto** `1.0.1`
  - HMAC-SHA256 签名
  - 币安 API 认证
  - 签名流程:
    ```javascript
    signature = HMAC-SHA256(queryString, apiSecret)
    ```

### 数据处理
- **json-bigint** `1.0.0`
  - 处理 JavaScript 超大整数(BigInt)
  - 解决 JSON.parse() 精度丢失问题

- **iconv-lite** `0.6.3`
  - 字符编码转换
  - 支持非 UTF-8 响应

---

## 配置管理

- **dotenv** `16.3.0`
  - 环境变量加载
  - `.env` 文件支持
  - 敏感配置隔离:
    ```bash
    API_KEY=your_binance_api_key
    API_SECRET=your_binance_api_secret
    PROXY_URL=socks5://127.0.0.1:1080
    ```

---

## 容器化与部署

### Docker
- **基础镜像**: `node:20-alpine`
  - Alpine Linux(轻量化,~50MB)
  - Node.js 20 LTS
  - 时区配置: `Asia/Shanghai`

### Docker Compose
- **版本**: `3.8`
- **配置**:
  - 端口映射: `8088:80` (外部:内部)
  - 卷挂载:
    - `./logs:/app/logs` (日志持久化)
    - `./data:/app/data` (数据持久化)
  - 重启策略: `unless-stopped`
  - 网络模式: `bridge`

### 构建优化
- **BuildKit 缓存**: `--mount=type=cache,target=/root/.npm`
  - npm 依赖缓存加速
  - 减少构建时间 60%+

---

## 开发工具

### 依赖管理
- **npm** (推荐 v8+)
  - `npm ci --omit=dev` 生产环境安装
  - `package-lock.json` 锁定版本

### 测试框架
- **测试目录**: `tests/`
  - `benchmark/` - 性能基准测试
  - `controllers/` - 控制器测试
  - `repository/` - 数据库测试
- ⚠️ **现状**: 单元测试缺失(需补充)

---

## 币安 API 集成

### 现货 API (Spot)
- **域名**: `https://api.binance.com`
- **备用域名**: 4 个备用(自动切换)
- **超时**: 10 秒(默认)、30 秒(长连接)、5 秒(快速)

### 合约 API (Futures)
- **域名**: `https://fapi.binance.com`
- **限流**:
  - 1200 请求/分钟
  - 20 请求/秒
- **权重系统**:
  - 不同接口消耗不同权重
  - 自动队列管理,避免超限

---

## 重试与容错

### 智能重试机制
```javascript
网络错误/超时:
  - 指数退避: 1s → 1.5s → 2.25s → ...
  - 最大延迟: 10s
  - 最大重试: 5 次

限流错误(429):
  - 延迟: 5s
  - 特殊重试: 3 次

代理错误:
  - 延迟: 2s
  - 代理重试: 3 次
```

### 请求队列
- **实现**: 模块级单例队列
- **目的**:
  - 避免触发币安 API 限流
  - 保证请求顺序
  - 自动间隔控制

---

## 技术栈总结

| 分类 | 技术选型 | 理由 |
|------|---------|------|
| **运行时** | Node.js 14+ | 异步 I/O、生态丰富 |
| **Web 框架** | Express.js | 轻量、灵活、成熟 |
| **数据库** | SQLite(better-sqlite3) | 嵌入式、零配置、高性能 |
| **HTTP 客户端** | Axios | 拦截器、Promise、易用 |
| **日志** | log4js | 企业级、灵活配置 |
| **定时任务** | node-schedule | CRON 语法、稳定 |
| **币安集成** | @binance/connector | 官方库、更新及时 |
| **容器化** | Docker + Alpine | 轻量、标准化部署 |

---

## 版本兼容性

- **Node.js**: 20.x LTS (严格要求 >=20.0.0)
- **npm**: 8.x+
- **SQLite**: 3.x
- **Docker**: 20.10+
- **币安 API**: Futures V1 + V2
- **模块系统**: ES Modules (type: "module" in package.json)

---

## 依赖列表(完整)

```json
{
  "dependencies": {
    "@binance/connector": "^3.0.0-rc.2",
    "axios": "^1.7.7",
    "better-sqlite3": "^12.4.1",
    "crypto": "^1.0.1",
    "dotenv": "^16.3.0",
    "express": "^4.19.2",
    "iconv-lite": "^0.6.3",
    "json-bigint": "^1.0.0",
    "log4js": "^6.9.1",
    "node-schedule": "^2.1.1",
    "socks-proxy-agent": "^8.0.1"
  }
}
```

---

## 后续技术升级建议

### 短期优化
- ✅ 补充单元测试(Jest/Mocha)
- ✅ 错误处理标准化(统一 ErrorHandler)
- ✅ API 速率限制持久化跟踪

### 中期优化
- 🔄 TypeScript 迁移(类型安全)
- 🔄 Redis 缓存层(减少 API 请求)
- 🔄 Prometheus 监控(性能指标)

### 长期优化
- 🚀 微服务拆分(交易引擎独立)
- 🚀 Kubernetes 编排(水平扩展)
- 🚀 消息队列(RabbitMQ/Kafka)

---

---

## 重要架构变更

### ES 模块标准迁移 (2025-10-19)

项目已全面迁移为 ES 模块标准 (ESM):

**变更内容**:
- ✅ `package.json` 添加 `"type": "module"`
- ✅ 所有文件使用 `import/export` 替代 `require/module.exports`
- ✅ 文件扩展名必须显式指定 (如 `import './foo.js'`)
- ✅ `__dirname` 和 `__filename` 需通过 `import.meta.url` 获取

**示例代码**:
```javascript
// ESM 风格导入
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 获取 __dirname (ESM 中需手动计算)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ESM 风格导出
export const logger = log4js.getLogger();
export function processData() { /* ... */ }
```

**优势**:
- 🚀 更好的 Tree-shaking 支持
- 🚀 标准化的模块系统
- 🚀 更好的 IDE 支持
- 🚀 与现代 JavaScript 生态兼容

---

*最后更新: 2025-10-20*
