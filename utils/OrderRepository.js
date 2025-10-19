import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * 数据Repository (单例)
 * 使用SQLite + WAL模式替换JSON文件存储
 * 提供原子性、事务保证和更好的并发性能
 */
class OrderRepository {
  constructor() {
    this.db = null;
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    this.dbPath = path.join(__dirname, '../data/app_data.db');
  }

  /**
   * 初始化数据库
   * - 创建data目录(如果不存在)
   * - 打开/创建SQLite数据库
   * - 启用WAL模式(Write-Ahead Logging)
   * - 创建表结构和索引
   */
  initialize() {
    try {
      // 确保data目录存在
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // 打开数据库(不存在则创建)
      this.db = new Database(this.dbPath);

      // 启用WAL模式: 提升并发读写性能
      this.db.pragma('journal_mode = WAL');

      // 创建表结构
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS app_data (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_updated_at ON app_data(updated_at);
      `);

      console.log(`SQLite database initialized at ${this.dbPath}`);

    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * 获取数据
   * @param {string} key - 数据键
   * @returns {Object|null} - 解析后的JSON对象,不存在返回null
   */
  get(key) {
    if (!this.db) this.initialize();

    try {
      const stmt = this.db.prepare('SELECT value FROM app_data WHERE key = ?');
      const row = stmt.get(key);

      if (!row) return null;
      return JSON.parse(row.value);

    } catch (error) {
      console.error(`Failed to get data for key: ${key}`, error);
      throw error;
    }
  }

  /**
   * 设置数据(使用事务保证原子性)
   * @param {string} key - 数据键
   * @param {Object} value - 要保存的对象
   */
  set(key, value) {
    if (!this.db) this.initialize();

    const transaction = this.db.transaction(() => {
      const now = Date.now();
      const jsonValue = JSON.stringify(value);

      const stmt = this.db.prepare(`
        INSERT INTO app_data (key, value, updated_at, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `);

      stmt.run(key, jsonValue, now, now);
    });

    try {
      transaction();
    } catch (error) {
      console.error(`Failed to set data for key: ${key}`, error);
      throw error;
    }
  }

  /**
   * 删除数据
   * @param {string} key - 数据键
   */
  delete(key) {
    if (!this.db) this.initialize();

    try {
      const stmt = this.db.prepare('DELETE FROM app_data WHERE key = ?');
      stmt.run(key);
    } catch (error) {
      console.error(`Failed to delete data for key: ${key}`, error);
      throw error;
    }
  }

  /**
   * 检查键是否存在
   * @param {string} key - 数据键
   * @returns {boolean}
   */
  exists(key) {
    if (!this.db) this.initialize();

    try {
      const stmt = this.db.prepare('SELECT 1 FROM app_data WHERE key = ? LIMIT 1');
      return !!stmt.get(key);
    } catch (error) {
      console.error(`Failed to check existence for key: ${key}`, error);
      throw error;
    }
  }

  /**
   * 获取所有数据
   * @returns {Object} - 键值对对象
   */
  getAll() {
    if (!this.db) this.initialize();

    try {
      const stmt = this.db.prepare('SELECT key, value FROM app_data');
      const rows = stmt.all();

      const result = {};
      for (const row of rows) {
        result[row.key] = JSON.parse(row.value);
      }
      return result;

    } catch (error) {
      console.error('Failed to get all data', error);
      throw error;
    }
  }

  /**
   * 关闭数据库连接
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// 导出单例
const orderRepository = new OrderRepository();
export { OrderRepository, orderRepository };
export default orderRepository;
