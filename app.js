import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import apiRoutes from './routes/apiRoutes.js';
import { APP_CONFIG } from './core/constants.js';
import timing from './controllers/timingController.js';
import tracking from './controllers/priceTrackingController.js';
import testRunner from './test/test.js';
import dataRepository from './utils/OrderRepository.js';
import { logger, errorLogger } from './utils/Logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.NODE_ENV === 'development' ? APP_CONFIG.PORT.DEVELOPMENT : APP_CONFIG.PORT.PRODUCTION;

// 初始化SQLite数据库
try {
  dataRepository.initialize();
  logger.info('SQLite database initialized successfully');
} catch (error) {
  errorLogger('Failed to initialize SQLite database:', error);
  process.exit(1);
}
// 配置中间件
// ...

// 设置路由
app.use('/api', apiRoutes)

// 将所有其他请求转发到 Vue
app.use(express.static('dist'))
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'dist', 'index.html'))
})

// 启动应用程序
app.listen(port, () => {
  console.log(`Server started on port ${port}`)
  logger.info('开启系统成功')
});

// 定时应用程序
timing()

// 测试用例
// testRunner()

// 实时跟踪
// tracking()
