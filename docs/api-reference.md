# API 接口文档

## 概述

本文档包含两部分:
1. **系统 REST API**: 本地服务提供的 HTTP 接口
2. **币安 API 集成**: 封装的币安期货 API 方法

---

## 系统 REST API

### 基础信息

- **Base URL**: `http://localhost:80` (容器内) / `http://localhost:8088` (容器外)
- **协议**: HTTP/1.1
- **数据格式**: JSON
- **字符编码**: UTF-8

---

### 端点列表

#### 1. 获取价格信息

```http
GET /api/price
```

**描述**: 获取当前价格信息

**请求参数**: 无

**响应示例**:
```json
{
  "success": true,
  "data": {
    "symbol": "BTCUSDT",
    "price": "45000.00",
    "timestamp": 1634567890000
  }
}
```

**错误响应**:
```json
{
  "success": false,
  "error": "Failed to fetch price",
  "code": "PRICE_ERROR"
}
```

---

#### 2. 获取应用日志

```http
GET /api/appLog
```

**描述**: 获取应用日志内容

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| lines | number | 否 | 返回最后 N 行 (默认 100) |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "logs": [
      "[2025-10-16 08:00:10] [INFO] 开始执行定时交易任务",
      "[2025-10-16 08:00:12] [INFO] 更新交易对信息完成",
      "[2025-10-16 08:00:15] [INFO] 计算下单列表完成"
    ],
    "totalLines": 1523
  }
}
```

---

#### 3. 获取错误日志

```http
GET /api/errorLog
```

**描述**: 获取错误日志内容

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| lines | number | 否 | 返回最后 N 行 (默认 100) |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "logs": [
      "[2025-10-16 07:55:32] [ERROR] 币安 API 请求失败: Connection timeout",
      "[2025-10-16 07:55:35] [ERROR] 重试第 1 次..."
    ],
    "totalLines": 47
  }
}
```

---

#### 4. 获取用户信息

```http
GET /api/users
```

**描述**: 获取账户用户信息

**请求参数**: 无

**响应示例**:
```json
{
  "success": true,
  "data": {
    "userId": "123456789",
    "email": "user@example.com",
    "balance": {
      "USDT": "10000.00"
    },
    "apiKeyStatus": "active"
  }
}
```

---

#### 5. 获取持仓信息

```http
GET /api/positions
```

**描述**: 获取当前所有持仓

**请求参数**: 无

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "symbol": "BTCUSDT",
      "positionSide": "LONG",
      "positionAmt": "0.05",
      "entryPrice": "45000.00",
      "markPrice": "45500.00",
      "unRealizedProfit": "25.00",
      "leverage": "10",
      "marginType": "isolated"
    },
    {
      "symbol": "ETHUSDT",
      "positionSide": "SHORT",
      "positionAmt": "-1.5",
      "entryPrice": "3000.00",
      "markPrice": "2950.00",
      "unRealizedProfit": "75.00",
      "leverage": "5",
      "marginType": "isolated"
    }
  ]
}
```

---

#### 6. 通用响应

```http
GET /api/*
```

**描述**: 所有未定义的路由返回默认消息

**响应示例**:
```json
{
  "success": true,
  "message": "Hello, Binan Trading System!"
}
```

---

### 错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|-----------|------|
| `SUCCESS` | 200 | 请求成功 |
| `PRICE_ERROR` | 500 | 获取价格失败 |
| `LOG_ERROR` | 500 | 读取日志失败 |
| `API_ERROR` | 500 | API 调用失败 |
| `NETWORK_ERROR` | 503 | 网络连接失败 |
| `RATE_LIMIT` | 429 | 请求频率超限 |
| `INVALID_PARAM` | 400 | 参数错误 |
| `UNAUTHORIZED` | 401 | 未授权 |

---

## 币安 API 集成

### 合约 API (binanceContractService)

#### 1. 获取交易对信息

```javascript
getExchangeInfo()
```

**描述**: 获取所有合约交易对的信息

**参数**: 无

**返回值**:
```javascript
{
  symbols: [
    {
      symbol: 'BTCUSDT',
      status: 'TRADING',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      pricePrecision: 2,
      quantityPrecision: 3,
      filters: [
        {
          filterType: 'PRICE_FILTER',
          minPrice: '0.01',
          maxPrice: '1000000',
          tickSize: '0.01'
        },
        {
          filterType: 'LOT_SIZE',
          minQty: '0.001',
          maxQty: '1000',
          stepSize: '0.001'
        },
        {
          filterType: 'MIN_NOTIONAL',
          notional: '10'
        }
      ]
    }
  ]
}
```

**调用示例**:
```javascript
const exchangeInfo = await binanceContractService.getExchangeInfo();
console.log(exchangeInfo.symbols.length); // 交易对数量
```

---

#### 2. 获取 K 线数据

```javascript
getKlines(symbol, interval = '1d', limit = 500)
```

**描述**: 获取指定交易对的 K 线数据

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| symbol | string | 是 | 交易对 (如 'BTCUSDT') |
| interval | string | 否 | K 线间隔 (默认 '1d')<br>可选: '1m', '5m', '15m', '1h', '4h', '1d', '1w' |
| limit | number | 否 | 返回数量 (默认 500, 最大 1500) |

**返回值**:
```javascript
[
  {
    openTime: 1634567890000,        // 开盘时间
    open: '45000.00',               // 开盘价
    high: '45500.00',               // 最高价
    low: '44800.00',                // 最低价
    close: '45200.00',              // 收盘价
    volume: '1523.45',              // 成交量
    closeTime: 1634654289999,       // 收盘时间
    quoteVolume: '68790000.00',     // 成交额
    trades: 25634,                  // 成交笔数
    takerBuyBaseVolume: '800.12',   // 主动买入成交量
    takerBuyQuoteVolume: '36100000' // 主动买入成交额
  }
]
```

**调用示例**:
```javascript
const klines = await binanceContractService.getKlines('BTCUSDT', '1d', 100);
console.log(klines[0].close); // 最新收盘价
```

---

#### 3. 下单

```javascript
contractOrder(params)
```

**描述**: 下市价单或止损单

**参数**:
```javascript
{
  symbol: 'BTCUSDT',          // 交易对
  side: 'BUY',                // 方向: BUY, SELL
  type: 'MARKET',             // 订单类型: MARKET, LIMIT, STOP_MARKET
  quantity: '0.05',           // 数量
  positionSide: 'LONG',       // 持仓方向: LONG, SHORT (双向持仓模式)
  stopPrice: '44000.00',      // 止损价 (仅 STOP_MARKET)
  closePosition: true         // 是否平仓 (可选)
}
```

**返回值**:
```javascript
{
  orderId: 123456789,
  symbol: 'BTCUSDT',
  status: 'FILLED',           // 订单状态: NEW, FILLED, CANCELED
  side: 'BUY',
  type: 'MARKET',
  origQty: '0.05',
  executedQty: '0.05',
  avgPrice: '45000.00',
  cumQuote: '2250.00'         // 成交金额
}
```

**调用示例**:
```javascript
// 市价做多
const order = await binanceContractService.contractOrder({
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'MARKET',
  quantity: '0.05',
  positionSide: 'LONG'
});

// 止损平仓
const stopOrder = await binanceContractService.contractOrder({
  symbol: 'BTCUSDT',
  side: 'SELL',
  type: 'STOP_MARKET',
  quantity: '0.05',
  positionSide: 'LONG',
  stopPrice: '44000.00',
  closePosition: true
});
```

---

#### 4. 设置止损止盈

```javascript
setStopPrice(params)
```

**描述**: 设置止损或止盈单

**参数**:
```javascript
{
  symbol: 'BTCUSDT',
  side: 'SELL',               // LONG 持仓用 SELL, SHORT 持仓用 BUY
  type: 'STOP_MARKET',
  quantity: '0.05',
  stopPrice: '44000.00',      // 触发价
  positionSide: 'LONG',
  closePosition: true
}
```

**返回值**:
```javascript
{
  orderId: 987654321,
  symbol: 'BTCUSDT',
  status: 'NEW',
  stopPrice: '44000.00'
}
```

**调用示例**:
```javascript
// LONG 止损
await binanceContractService.setStopPrice({
  symbol: 'BTCUSDT',
  side: 'SELL',
  type: 'STOP_MARKET',
  quantity: '0.05',
  stopPrice: '44000.00',
  positionSide: 'LONG',
  closePosition: true
});

// SHORT 止损
await binanceContractService.setStopPrice({
  symbol: 'ETHUSDT',
  side: 'BUY',
  type: 'STOP_MARKET',
  quantity: '1.5',
  stopPrice: '3100.00',
  positionSide: 'SHORT',
  closePosition: true
});
```

---

#### 5. 获取账户信息

```javascript
getAccountData()
```

**描述**: 获取合约账户信息

**参数**: 无

**返回值**:
```javascript
{
  totalWalletBalance: '10000.00',     // 账户总余额
  totalUnrealizedProfit: '100.00',    // 未实现盈亏
  totalMarginBalance: '10100.00',     // 保证金余额
  availableBalance: '9500.00',        // 可用余额
  positions: [
    {
      symbol: 'BTCUSDT',
      positionAmt: '0.05',
      entryPrice: '45000.00',
      markPrice: '45500.00',
      unRealizedProfit: '25.00',
      liquidationPrice: '40000.00',
      leverage: '10',
      marginType: 'isolated',
      positionSide: 'LONG'
    }
  ]
}
```

**调用示例**:
```javascript
const account = await binanceContractService.getAccountData();
console.log('可用余额:', account.availableBalance);
console.log('持仓数量:', account.positions.length);
```

---

#### 6. 获取挂单列表

```javascript
getOpenOrders(symbol = null)
```

**描述**: 获取当前挂单

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| symbol | string | 否 | 交易对 (为空则返回所有挂单) |

**返回值**:
```javascript
[
  {
    orderId: 123456789,
    symbol: 'BTCUSDT',
    status: 'NEW',
    type: 'STOP_MARKET',
    side: 'SELL',
    stopPrice: '44000.00',
    origQty: '0.05',
    positionSide: 'LONG',
    closePosition: true,
    time: 1634567890000
  }
]
```

**调用示例**:
```javascript
// 获取所有挂单
const allOrders = await binanceContractService.getOpenOrders();

// 获取指定交易对挂单
const btcOrders = await binanceContractService.getOpenOrders('BTCUSDT');
```

---

#### 7. 撤销订单

```javascript
deleteOrder(symbol, orderId)
```

**描述**: 撤销指定订单

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| symbol | string | 是 | 交易对 |
| orderId | number | 是 | 订单 ID |

**返回值**:
```javascript
{
  orderId: 123456789,
  symbol: 'BTCUSDT',
  status: 'CANCELED'
}
```

**调用示例**:
```javascript
await binanceContractService.deleteOrder('BTCUSDT', 123456789);
```

---

#### 8. 设置杠杆

```javascript
setLeverage(symbol, leverage)
```

**描述**: 设置交易对杠杆倍数

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| symbol | string | 是 | 交易对 |
| leverage | number | 是 | 杠杆倍数 (1-125) |

**返回值**:
```javascript
{
  symbol: 'BTCUSDT',
  leverage: 10,
  maxNotionalValue: '1000000'
}
```

**调用示例**:
```javascript
await binanceContractService.setLeverage('BTCUSDT', 10);
```

---

#### 9. 设置保证金模式

```javascript
setMarginType(symbol, marginType)
```

**描述**: 设置逐仓/全仓模式

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| symbol | string | 是 | 交易对 |
| marginType | string | 是 | 保证金模式: 'ISOLATED' (逐仓), 'CROSSED' (全仓) |

**返回值**:
```javascript
{
  symbol: 'BTCUSDT',
  marginType: 'ISOLATED'
}
```

**调用示例**:
```javascript
// 设置逐仓模式
await binanceContractService.setMarginType('BTCUSDT', 'ISOLATED');

// 设置全仓模式
await binanceContractService.setMarginType('ETHUSDT', 'CROSSED');
```

---

### 现货 API (binanceService)

#### 1. 获取 K 线数据

```javascript
getKlines(symbol, interval = '1d', limit = 500)
```

**描述**: 获取现货 K 线数据

**参数**: 同合约 API

**返回值**: 同合约 API

---

#### 2. 获取价格

```javascript
getPrice(symbol)
```

**描述**: 获取现货实时价格

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| symbol | string | 是 | 交易对 |

**返回值**:
```javascript
{
  symbol: 'BTCUSDT',
  price: '45000.00'
}
```

**调用示例**:
```javascript
const priceData = await binanceService.getPrice('BTCUSDT');
console.log('当前价格:', priceData.price);
```

---

#### 3. 获取用户数据

```javascript
getUserData()
```

**描述**: 获取用户收入记录

**参数**: 无

**返回值**:
```javascript
[
  {
    symbol: 'BTCUSDT',
    incomeType: 'REALIZED_PNL',
    income: '125.50',
    asset: 'USDT',
    time: 1634567890000
  }
]
```

---

## 认证方式

### 币安 API 签名认证

所有私有接口请求都需要签名认证:

#### 1. 签名生成流程

```javascript
// 1. 构建查询字符串
const queryString = 'symbol=BTCUSDT&side=BUY&type=MARKET&quantity=0.05&timestamp=1634567890000';

// 2. 计算签名
const signature = crypto
  .createHmac('sha256', API_SECRET)
  .update(queryString)
  .digest('hex');

// 3. 添加到请求参数
const finalQueryString = `${queryString}&signature=${signature}`;

// 4. 添加 API Key 到请求头
headers: {
  'X-MBX-APIKEY': API_KEY
}
```

#### 2. 时间戳要求

- 所有请求必须包含 `timestamp` 参数
- 时间戳必须在服务器时间 ± 5 秒内
- 建议使用 `Date.now()` 获取当前时间戳

#### 3. 环境变量配置

在 `.env` 文件中配置:

```bash
API_KEY=your_binance_api_key
API_SECRET=your_binance_api_secret
```

---

## 限流规则

### 币安 API 限流

| 限制类型 | 限额 | 说明 |
|---------|------|------|
| **请求频率** | 1200 请求/分钟 | 单个 IP 限制 |
| **请求速率** | 20 请求/秒 | 瞬时速率限制 |
| **权重系统** | 每个接口消耗不同权重 | 权重总和不超过限额 |

### 权重消耗

| 接口 | 权重 |
|------|------|
| `getExchangeInfo()` | 1 |
| `getKlines()` | 1 |
| `contractOrder()` | 1 |
| `getAccountData()` | 5 |
| `getOpenOrders()` | 1 (单交易对) / 40 (所有) |

### 系统防护

本系统通过以下机制避免触发限流:

1. **请求队列**: 所有请求进入队列,按 50ms 间隔发送
2. **智能重试**: 收到 429 错误后延迟 5 秒重试
3. **权重跟踪**: 跟踪当前权重消耗,接近限额时自动降速

---

## 错误处理

### 常见错误码

| 错误码 | 说明 | 处理方式 |
|--------|------|---------|
| `-1000` | 未知错误 | 检查请求参数 |
| `-1001` | 连接断开 | 自动重试 |
| `-1002` | 未授权 | 检查 API Key |
| `-1003` | 请求过多 | 降低请求频率 |
| `-1021` | 时间戳不同步 | 同步系统时间 |
| `-2010` | 订单不存在 | 检查订单 ID |
| `-2019` | 余额不足 | 检查账户余额 |
| `-4000` | 参数错误 | 检查参数格式 |

### 错误响应格式

```javascript
{
  code: -1003,
  msg: 'Too many requests; current limit is 1200 requests per minute.'
}
```

### 系统错误处理

```javascript
try {
  const result = await binanceContractService.contractOrder(params);
} catch (error) {
  if (error.code === -1003) {
    // 限流: 等待后重试
    await sleep(5000);
    return retry();
  } else if (error.code === -2019) {
    // 余额不足: 记录日志并跳过
    logger.error('余额不足,无法下单');
    return;
  } else {
    // 其他错误: 记录并抛出
    logger.error('下单失败:', error);
    throw error;
  }
}
```

---

## 调用示例

### 完整交易流程

```javascript
// 1. 设置逐仓模式
await binanceContractService.setMarginType('BTCUSDT', 'ISOLATED');

// 2. 设置杠杆
await binanceContractService.setLeverage('BTCUSDT', 10);

// 3. 市价开仓
const order = await binanceContractService.contractOrder({
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'MARKET',
  quantity: '0.05',
  positionSide: 'LONG'
});

console.log('开仓成功:', order.orderId);

// 4. 设置止损
await binanceContractService.setStopPrice({
  symbol: 'BTCUSDT',
  side: 'SELL',
  type: 'STOP_MARKET',
  quantity: '0.05',
  stopPrice: '44000.00',
  positionSide: 'LONG',
  closePosition: true
});

console.log('止损设置成功');

// 5. 查询持仓
const account = await binanceContractService.getAccountData();
const position = account.positions.find(p => p.symbol === 'BTCUSDT');

console.log('当前持仓:', position.positionAmt);
console.log('未实现盈亏:', position.unRealizedProfit);
```

---

*最后更新: 2025-10-16*
