import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import { generateUUID } from '../../../../shared/utils/token.js';
import { ConflictError } from '../../../../shared/errors/app-error.js';
import client from 'prom-client';
import { registry } from '../../../../infrastructure/metrics/metrics.js';

const aggregateVersionConflictsTotal = new client.Counter({
  name: 'courtzon_aggregate_version_conflicts_total',
  help: 'Total number of aggregate version conflicts',
  labelNames: ['aggregate_type'] as const,
  registers: [registry],
});

type RowData = mysql.RowDataPacket[];
type ResultSetHeader = mysql.ResultSetHeader;
type Executor = mysql.Pool | mysql.PoolConnection;

function resolvePool(conn?: mysql.PoolConnection): Executor {
  return conn ?? getPool();
}

export class AggregateVersionConflict extends ConflictError {
  constructor(walletId: number, expectedVersion: number, actualVersion: number) {
    super(`Wallet ${walletId} version conflict: expected ${expectedVersion}, actual ${actualVersion}`);
  }
}

export const walletRepository = {
  async findById(id: number, conn?: mysql.PoolConnection) {
    const pool = resolvePool(conn);
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM user_wallets WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  },

  async persistBalanceUpdate(walletId: number, newBalance: number, expectedVersion: number, conn?: mysql.PoolConnection): Promise<void> {
    const pool = resolvePool(conn);
    const [result] = await pool.execute<ResultSetHeader>(
      'UPDATE user_wallets SET balance = ?, aggregate_version = aggregate_version + 1, updated_at = NOW() WHERE id = ? AND aggregate_version = ?',
      [newBalance, walletId, expectedVersion]
    );
    if (result.affectedRows === 0) {
      const [rows] = await pool.execute('SELECT aggregate_version FROM user_wallets WHERE id = ?', [walletId]);
      const actual = (rows as any[])[0]?.aggregate_version;
      aggregateVersionConflictsTotal.inc({ aggregate_type: 'wallet' });
      throw new AggregateVersionConflict(walletId, expectedVersion, actual ?? 0);
    }
  },
  async findByUserId(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM user_wallets WHERE user_id = ?',
      [userId]
    );
    return rows[0] || null;
  },

  /**
   * Lock wallet balance row for update. Accepts an optional transaction connection;
   * when provided the FOR UPDATE lock is held until the transaction commits/rolls back.
   */
  async lockAndGetBalance(walletId: number, conn?: mysql.PoolConnection): Promise<{ balance: number; version: number } | null> {
    const pool = resolvePool(conn);
    const [rows] = await pool.execute<RowData>(
      "SELECT balance, version FROM user_wallets WHERE id = ? AND is_locked = FALSE FOR UPDATE",
      [walletId]
    );
    if (!rows.length) return null;
    return { balance: Number(rows[0].balance), version: rows[0].version };
  },

  /**
   * Optimistic-lock balance update. Accepts an optional transaction connection
   * so the version increment commits atomically with surrounding operations.
   */
  async updateBalance(walletId: number, newBalance: number, version: number, conn?: mysql.PoolConnection): Promise<boolean> {
    const pool = resolvePool(conn);
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      'UPDATE user_wallets SET balance = ?, version = version + 1 WHERE id = ? AND version = ?',
      [newBalance, walletId, version]
    );
    return result.affectedRows > 0;
  },

  async createTransaction(data: {
    walletId: number; type: string; amount: number; direction: 'credit' | 'debit';
    referenceType?: string; referenceId?: number; description?: string;
  }, conn?: mysql.PoolConnection) {
    const pool = resolvePool(conn);
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO wallet_transactions (public_id, wallet_id, transaction_type, amount, direction, reference_type, reference_id, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [generateUUID(), data.walletId, data.type, data.amount, data.direction,
       data.referenceType || null, data.referenceId || null, data.description || null]
    );
    return result.insertId;
  },

  async findTransactions(walletId: number, filters: {
    type?: string; from?: string; to?: string; page: number; limit: number;
  }) {
    const pool = getPool();
    let sql = 'SELECT * FROM wallet_transactions WHERE wallet_id = ?';
    const params: any[] = [walletId];
    if (filters.type) { sql += ' AND transaction_type = ?'; params.push(filters.type); }
    if (filters.from) { sql += ' AND created_at >= ?'; params.push(filters.from); }
    if (filters.to) { sql += ' AND created_at <= ?'; params.push(filters.to); }
    sql += ' ORDER BY created_at DESC';

    const countSql = sql.replace(/SELECT \* FROM/, 'SELECT COUNT(*) as cnt FROM');
    const [countRows] = await pool.query<RowData>(countSql, params);
    const total = countRows[0].cnt;

    const offset = (filters.page - 1) * filters.limit;
    const [rows] = await pool.query<RowData>(`${sql} LIMIT ? OFFSET ?`, [...params, filters.limit, offset]);
    return { data: rows, total, page: filters.page, limit: filters.limit };
  },

  async getBalance(userId: number): Promise<number> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT balance FROM user_wallets WHERE user_id = ?',
      [userId]
    );
    return rows.length ? Number(rows[0].balance) : 0;
  },
};
