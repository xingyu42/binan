/**
 * order() 函数测试脚本
 * 用途：手动触发下单逻辑，测试交易策略
 *
 * 使用方法：
 * node test/testOrder.js
 */

// 加载环境变量（必须在最前面）
import 'dotenv/config';

import { order, initData } from '../controllers/timingController.js';
import { logger, errorLogger } from '../utils/Logger.js';
import dataRepository from '../utils/OrderRepository.js';

async function testOrder() {
  try {
    logger.info('========== 开始执行 order() 测试 ==========');

    // 1. 初始化数据库和配置
    logger.info('步骤 1: 初始化数据');
    await initData();

    // 等待数据初始化完成
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 2. 检查必要数据是否已加载
    logger.info('步骤 2: 检查数据完整性');
    const hasData = dataRepository.exists('data');
    const hasATR = dataRepository.exists('ATR');

    if (!hasData) {
      logger.warn('⚠️  交易对数据未加载，可能需要等待更长时间');
    }
    if (!hasATR) {
      logger.warn('⚠️  ATR 数据未加载，可能需要等待更长时间');
    }

    // 3. 执行下单逻辑
    logger.info('步骤 3: 执行下单');
    await order();

    logger.info('========== order() 测试执行完成 ==========');
    process.exit(0);

  } catch (error) {
    errorLogger('❌ 测试执行失败:', error);
    console.error(error);
    process.exit(1);
  }
}

// 执行测试
testOrder();
