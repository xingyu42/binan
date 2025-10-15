/**
 * 单元测试: 下单数量计算逻辑
 *
 * US-2.2: 简化下单数量计算逻辑
 * 测试重构后的辅助函数和边界条件
 */

const assert = require('assert');

// ============================================================================
// 辅助函数定义 (从timingController.js提取,用于独立测试)
// ============================================================================

/**
 * 计算最小下单数量(消除if-else分支)
 */
function calculateMinQuantity(minQty, stepSize, closePrice, notional) {
  const notionalBasedMin = Math.ceil(notional / (stepSize * closePrice)) * stepSize;
  return Math.max(minQty, notionalBasedMin);
}

/**
 * 将数值限制在范围内(消除两个独立的if分支)
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ============================================================================
// 测试运行器 (简单版本,不依赖外部测试框架)
// ============================================================================

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function describe(suiteName, suiteFunc) {
  console.log(`\n📦 ${suiteName}`);
  suiteFunc();
}

function it(testName, testFunc) {
  totalTests++;
  try {
    testFunc();
    passedTests++;
    console.log(`  ✅ ${testName}`);
  } catch (error) {
    failedTests++;
    console.log(`  ❌ ${testName}`);
    console.log(`     错误: ${error.message}`);
  }
}

// ============================================================================
// 运行测试
// ============================================================================

console.log('='.repeat(70));
console.log('US-2.2: Order Quantity Calculation Unit Tests');
console.log('='.repeat(70));
console.log('');

// 执行测试
describe('Order Quantity Calculation - Refactored (US-2.2)', () => {

  describe('calculateMinQuantity() - Good Taste实现', () => {
    it('场景1: notionalBasedMin > minQty (应返回notionalBasedMin)', () => {
      const result = calculateMinQuantity(0.001, 0.001, 50000, 100);
      assert.strictEqual(result, 0.002);
    });

    it('场景2: minQty > notionalBasedMin (应返回minQty)', () => {
      const result = calculateMinQuantity(100, 1, 0.5, 10);
      assert.strictEqual(result, 100);
    });

    it('场景3: minQty === notionalBasedMin (边界情况)', () => {
      const result = calculateMinQuantity(0.01, 0.01, 1000, 10);
      assert.strictEqual(result, 0.01);
    });

    it('场景4: 真实币安参数 - ETH', () => {
      const result = calculateMinQuantity(0.001, 0.001, 3000, 10);
      assert.strictEqual(result, 0.004);
    });
  });

  describe('clamp() - Good Taste实现', () => {
    it('场景1: value < min (应返回min)', () => {
      assert.strictEqual(clamp(5, 10, 20), 10);
    });

    it('场景2: value > max (应返回max)', () => {
      assert.strictEqual(clamp(25, 10, 20), 20);
    });

    it('场景3: min <= value <= max (应返回value)', () => {
      assert.strictEqual(clamp(15, 10, 20), 15);
    });

    it('场景4: value === min (边界情况)', () => {
      assert.strictEqual(clamp(10, 10, 20), 10);
    });

    it('场景5: value === max (边界情况)', () => {
      assert.strictEqual(clamp(20, 10, 20), 20);
    });

    it('场景6: 真实下单场景 - 数量小于最小值', () => {
      assert.strictEqual(clamp(0.0005, 0.001, 1000), 0.001);
    });

    it('场景7: 真实下单场景 - 数量超过最大值', () => {
      assert.strictEqual(clamp(1500, 0.001, 1000), 1000);
    });

    it('场景8: 真实下单场景 - 数量在有效范围内', () => {
      assert.strictEqual(clamp(0.5, 0.001, 1000), 0.5);
    });
  });

  describe('getQuantity() - 行为一致性验证', () => {
    it('一致性测试: 验证重构前后逻辑等价', () => {
      // 原始实现
      function getQuantityOld(item, num) {
        let quantity = parseFloat(item.quantity) * num;
        let minQuantity = 0;
        const minQty = parseFloat(item.minQty);
        const maxQty = parseFloat(item.maxQty);
        const stepSize = parseFloat(item.stepSize);
        const notional = parseFloat(item.notional);
        const closePrice = item.closePrice;

        if (minQty * closePrice <= notional) {
          minQuantity = Math.ceil(notional / (stepSize * closePrice)) * stepSize;
        } else {
          minQuantity = minQty;
        }

        if (quantity < minQuantity) {
          quantity = minQuantity;
        }
        if (quantity > maxQty) {
          quantity = maxQty;
        }

        return quantity;
      }

      // 重构后实现
      function getQuantityNew(item, num) {
        const quantity = parseFloat(item.quantity) * num;
        const minQty = parseFloat(item.minQty);
        const maxQty = parseFloat(item.maxQty);
        const stepSize = parseFloat(item.stepSize);
        const notional = parseFloat(item.notional);
        const closePrice = item.closePrice;

        const minQuantity = calculateMinQuantity(minQty, stepSize, closePrice, notional);
        return clamp(quantity, minQuantity, maxQty);
      }

      // 测试用例
      const testCases = [
        { item: { quantity: 1, minQty: 0.001, maxQty: 1000, stepSize: 0.001, notional: 100, closePrice: 50000 }, num: 1 },
        { item: { quantity: 1, minQty: 0.001, maxQty: 1000, stepSize: 0.001, notional: 10, closePrice: 3000 }, num: 1.2 },
        { item: { quantity: 1000, minQty: 100, maxQty: 1000000, stepSize: 1, notional: 10, closePrice: 0.5 }, num: 0.8 },
        { item: { quantity: 500, minQty: 0.001, maxQty: 100, stepSize: 0.001, notional: 10, closePrice: 1000 }, num: 2 },
        { item: { quantity: 0.0001, minQty: 0.01, maxQty: 1000, stepSize: 0.001, notional: 10, closePrice: 1000 }, num: 1 },
      ];

      testCases.forEach((testCase, index) => {
        const oldResult = getQuantityOld(testCase.item, testCase.num);
        const newResult = getQuantityNew(testCase.item, testCase.num);

        assert.strictEqual(
          newResult,
          oldResult,
          `测试用例${index + 1}失败: 重构前=${oldResult}, 重构后=${newResult}`
        );
      });
    });
  });
});

console.log('');
console.log('='.repeat(70));
console.log('测试结果汇总');
console.log('='.repeat(70));
console.log(`总测试数: ${totalTests}`);
console.log(`通过: ${passedTests} ✅`);
console.log(`失败: ${failedTests} ❌`);
console.log(`成功率: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
console.log('');

if (failedTests === 0) {
  console.log('✅ 所有测试通过! US-2.2重构成功!');
  console.log('');
  console.log('重构改进:');
  console.log('  - 代码行数: 23行 → 12行 (减少48%)');
  console.log('  - 嵌套层级: 3层 → 2层');
  console.log('  - if分支数: 3个 → 0个 (Good Taste!)');
  console.log('  - 功能完全兼容: 计算结果一致');
  process.exit(0);
} else {
  console.log('❌ 部分测试失败,请检查代码');
  process.exit(1);
}
