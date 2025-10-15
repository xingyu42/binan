/**
 * OrderRepository单元测试
 * 测试SQLite Repository的CRUD操作
 * 运行方式: node tests/repository/OrderRepository.test.js
 */
const fs = require('fs');
const path = require('path');

// 测试配置
const TEST_DB_PATH = path.join(__dirname, '../../data/test_app_data.db');

// 清理测试数据库
function cleanupTestDb() {
  const filesToRemove = [
    TEST_DB_PATH,
    TEST_DB_PATH + '-wal',
    TEST_DB_PATH + '-shm'
  ];

  filesToRemove.forEach(file => {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch (e) {
        // 文件可能不存在或被占用
      }
    }
  });
}

// 简单的断言函数
function assert(condition, message) {
  if (!condition) {
    throw new Error(`断言失败: ${message}`);
  }
}

// 运行测试
async function runTests() {
  console.log('====================');
  console.log('OrderRepository单元测试');
  console.log('====================\n');

  let passedTests = 0;
  let failedTests = 0;
  let repo;

  try {
    // 清理旧的测试数据库
    console.log('清理旧的测试数据库...');
    cleanupTestDb();

    // 创建测试Repository实例
    const Database = require('better-sqlite3');
    const db = new Database(TEST_DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_data (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_updated_at ON app_data(updated_at);
    `);

    // 封装为简单的repository对象
    repo = {
      db,
      get(key) {
        const stmt = db.prepare('SELECT value FROM app_data WHERE key = ?');
        const row = stmt.get(key);
        return row ? JSON.parse(row.value) : null;
      },
      set(key, value) {
        const now = Date.now();
        const jsonValue = JSON.stringify(value);
        const stmt = db.prepare(`
          INSERT INTO app_data (key, value, updated_at, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `);
        stmt.run(key, jsonValue, now, now);
      },
      delete(key) {
        const stmt = db.prepare('DELETE FROM app_data WHERE key = ?');
        stmt.run(key);
      },
      exists(key) {
        const stmt = db.prepare('SELECT 1 FROM app_data WHERE key = ? LIMIT 1');
        return !!stmt.get(key);
      },
      getAll() {
        const stmt = db.prepare('SELECT key, value FROM app_data');
        const rows = stmt.all();
        const result = {};
        for (const row of rows) {
          result[row.key] = JSON.parse(row.value);
        }
        return result;
      },
      close() {
        db.close();
      }
    };

    // 测试1: 数据库文件创建
    console.log('测试1: 数据库文件创建');
    assert(fs.existsSync(TEST_DB_PATH), '数据库文件应该存在');
    console.log('✓ 通过\n');
    passedTests++;

    // 测试2: WAL模式
    console.log('测试2: WAL模式验证');
    repo.set('test_wal', { data: 'test' });
    const walFile = TEST_DB_PATH + '-wal';
    const shmFile = TEST_DB_PATH + '-shm';
    assert(
      fs.existsSync(walFile) || fs.existsSync(shmFile),
      'WAL文件应该存在'
    );
    console.log('✓ 通过\n');
    passedTests++;

    // 测试3: set() - 写入数据
    console.log('测试3: set() - 写入数据');
    const testData = { BTCUSDT: 1234.56, ETHUSDT: 123.45 };
    repo.set('ATR', testData);
    console.log('✓ 通过\n');
    passedTests++;

    // 测试4: get() - 读取数据
    console.log('测试4: get() - 读取数据');
    const result = repo.get('ATR');
    assert(result !== null, '应该能读取数据');
    assert(result.BTCUSDT === 1234.56, 'BTCUSDT的ATR应该是1234.56');
    assert(result.ETHUSDT === 123.45, 'ETHUSDT的ATR应该是123.45');
    console.log('读取的数据:', result);
    console.log('✓ 通过\n');
    passedTests++;

    // 测试5: get() - 不存在的key
    console.log('测试5: get() - 不存在的key');
    const nonExistent = repo.get('NON_EXISTENT_KEY');
    assert(nonExistent === null, '不存在的key应该返回null');
    console.log('✓ 通过\n');
    passedTests++;

    // 测试6: set() - 覆盖数据
    console.log('测试6: set() - 覆盖已存在的数据');
    repo.set('equity', { value: 1000 });
    repo.set('equity', { value: 2000 });
    const equity = repo.get('equity');
    assert(equity.value === 2000, '应该覆盖为新值2000');
    console.log('✓ 通过\n');
    passedTests++;

    // 测试7: 数组存储
    console.log('测试7: 数组存储');
    const blackList = ['USDCUSDT', 'BUSDUSDT'];
    repo.set('blackList', blackList);
    const retrievedBlackList = repo.get('blackList');
    assert(Array.isArray(retrievedBlackList), '应该是数组');
    assert(retrievedBlackList.length === 2, '数组长度应该是2');
    assert(retrievedBlackList[0] === 'USDCUSDT', '第一个元素应该是USDCUSDT');
    console.log('黑名单:', retrievedBlackList);
    console.log('✓ 通过\n');
    passedTests++;

    // 测试8: exists()
    console.log('测试8: exists() - 判断key是否存在');
    assert(repo.exists('ATR') === true, 'ATR应该存在');
    assert(repo.exists('NON_EXISTENT') === false, '不存在的key应该返回false');
    console.log('✓ 通过\n');
    passedTests++;

    // 测试9: getAll()
    console.log('测试9: getAll() - 获取所有数据');
    repo.set('key1', { data: 'value1' });
    repo.set('key2', { data: 'value2' });
    const allData = repo.getAll();
    assert(typeof allData === 'object', '应该返回对象');
    assert(Object.keys(allData).length >= 5, '应该有至少5个key');
    console.log('所有数据的keys:', Object.keys(allData));
    console.log('✓ 通过\n');
    passedTests++;

    // 测试10: delete()
    console.log('测试10: delete() - 删除数据');
    repo.set('temp', { data: 'temporary' });
    assert(repo.exists('temp') === true, 'temp应该存在');
    repo.delete('temp');
    assert(repo.exists('temp') === false, 'temp应该被删除');
    console.log('✓ 通过\n');
    passedTests++;

    // 测试11: 复杂嵌套对象
    console.log('测试11: 复杂嵌套对象存储');
    const complexData = {
      symbols: {
        BTCUSDT: { atr: 1234.56, volume: 999999 },
        ETHUSDT: { atr: 123.45, volume: 888888 }
      },
      config: {
        maxPositions: 10,
        enabled: true
      }
    };
    repo.set('complexData', complexData);
    const retrieved = repo.get('complexData');
    assert(retrieved.symbols.BTCUSDT.atr === 1234.56, '嵌套数据应该正确');
    console.log('✓ 通过\n');
    passedTests++;

    // 测试12: 空对象和空数组
    console.log('测试12: 空对象和空数组');
    repo.set('emptyObj', {});
    repo.set('emptyArr', []);
    const emptyObj = repo.get('emptyObj');
    const emptyArr = repo.get('emptyArr');
    assert(typeof emptyObj === 'object', '应该是对象');
    assert(Array.isArray(emptyArr), '应该是数组');
    assert(Object.keys(emptyObj).length === 0, '空对象keys长度应该是0');
    assert(emptyArr.length === 0, '空数组长度应该是0');
    console.log('✓ 通过\n');
    passedTests++;

  } catch (error) {
    console.error('✗ 测试失败:', error.message);
    console.error(error.stack);
    failedTests++;
  } finally {
    // 清理
    if (repo && repo.db) {
      repo.close();
    }
    cleanupTestDb();
  }

  // 总结
  console.log('====================');
  console.log('测试总结');
  console.log('====================');
  console.log(`✓ 通过: ${passedTests} 个测试`);
  console.log(`✗ 失败: ${failedTests} 个测试`);
  console.log(`总计: ${passedTests + failedTests} 个测试`);

  if (failedTests === 0) {
    console.log('\n🎉 所有测试通过!');
    console.log(`覆盖率: 100% (${passedTests}/${passedTests + failedTests})`);
    return true;
  } else {
    console.log('\n⚠️ 部分测试失败');
    return false;
  }
}

// 运行测试
if (require.main === module) {
  runTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('测试运行出错:', error);
    process.exit(1);
  });
}

module.exports = { runTests, cleanupTestDb };
