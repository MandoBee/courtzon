import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import { generateUUID } from '../../../../shared/utils/token.js';

type RowData = mysql.RowDataPacket[];

export const walletRepository = {
  async findByUserId(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM user_wallets WHERE user_id = ?',
      [userId]
    );
    return rows[0] || null;
  },

  async lockAndGetBalance(walletId: number): Promise<{ balance: number; version: number } | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      "SELECT balance, version FROM user_wallets WHERE id = ? AND is_locked = FALSE FOR UPDATE",
      [walletId]
    );
    if (!rows.length) return null;
    return { balance: Number(rows[0].balance), version: rows[0].version };
  },

  async updateBalance(walletId: number, newBalance: number, version: number): Promise<boolean> {
    const pool = getPool();
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      'UPDATE user_wallets SET balance = ?, version = version + 1 WHERE id = ? AND version = ?',
      [newBalance, walletId, version]
    );
    return result.affectedRows > 0;
  },

  async createTransaction(data: {
    walletId: number; type: string; amount: number; direction: 'credit' | 'debit';
    referenceType?: string; referenceId?: number; description?: string;
  }) {
    const pool = getPool();
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
