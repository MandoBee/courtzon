import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export const paymentRepository = {
  async create(data: {
    userId: number; bookingId?: number; orderId?: number; referenceType?: string; paymentMethod: string;
    gatewayProvider: string; gatewayReference: string; amount: number;
    status: string;
  }) {
    const pool = getPool();
    const isBooking = data.referenceType === 'booking' || data.referenceType === 'booking_intent';
    const isOrder = data.referenceType === 'order';
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO payment_transactions (user_id, booking_id, order_id, reference_type, payment_method, gateway_provider, gateway_reference, amount, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.userId,
       isBooking ? (data.bookingId ?? null) : null,
       isOrder ? (data.orderId ?? null) : null,
       data.referenceType || null,
       data.paymentMethod, data.gatewayProvider, data.gatewayReference, data.amount, data.status]
    );
    return result.insertId;
  },

  async findById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM payment_transactions WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  },

  async findByGatewayRef(gatewayReference: string) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM payment_transactions WHERE gateway_reference = ?',
      [gatewayReference]
    );
    return rows[0] || null;
  },

  /**
   * Lock payment row by gateway reference for update. Used inside webhook transactions
   * to prevent concurrent processing of the same gateway callback.
   */
  async lockByGatewayRef(gatewayReference: string, conn: mysql.PoolConnection) {
    const [rows] = await conn.execute<RowData>(
      'SELECT * FROM payment_transactions WHERE gateway_reference = ? FOR UPDATE',
      [gatewayReference]
    );
    return rows[0] || null;
  },

  async findByOrderId(orderId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM payment_transactions
       WHERE order_id = ? AND payment_status = 'paid'
       ORDER BY created_at DESC LIMIT 1`,
      [orderId],
    );
    return rows[0] || null;
  },

  async updateStatus(id: number, status: string, gatewayReference?: string) {
    const pool = getPool();
    const fields: string[] = ['payment_status = ?'];
    const params: any[] = [status];
    if (gatewayReference) { fields.push('gateway_reference = ?'); params.push(gatewayReference); }
    if (status === 'paid') { fields.push('paid_at = NOW()'); }
    params.push(id);
    await pool.execute(
      `UPDATE payment_transactions SET ${fields.join(', ')} WHERE id = ?`,
      params
    );
  },

  async findByUser(userId: number, page: number, limit: number) {
    const pool = getPool();
    const offset = (page - 1) * limit;
    const [rows] = await pool.query<RowData>(
      'SELECT * FROM payment_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [userId, limit, offset]
    );
    const [countRows] = await pool.query<RowData>(
      'SELECT COUNT(*) as cnt FROM payment_transactions WHERE user_id = ?',
      [userId]
    );
    return { data: rows, total: countRows[0].cnt, page, limit };
  },

  async createJournalEntry(data: {
    entryType: string; referenceType: string; referenceId: number;
    debitAccount: string; creditAccount: string; amount: number; description?: string;
  }) {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO financial_journal_entries (entry_type, reference_type, reference_id, debit_account, credit_account, amount, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.entryType, data.referenceType, data.referenceId,
       data.debitAccount, data.creditAccount, data.amount, data.description || null]
    );
  },
};
