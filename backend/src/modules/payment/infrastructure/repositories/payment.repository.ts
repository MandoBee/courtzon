import type mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export const paymentRepository = {
  async create(data: {
    userId: number; bookingId?: number; orderId?: number; referenceType?: string; paymentMethod: string;
    gatewayProvider: string; gatewayReference: string; amount: number;
    status?: string; currency?: string; gatewayResponse?: unknown; traceId?: string;
    idempotencyKey?: string;
  }) {
    const pool = getPool();
    const isBooking = data.referenceType === 'booking' || data.referenceType === 'booking_intent';
    const isOrder = data.referenceType === 'order';
    const traceId = data.traceId || randomUUID();
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO payment_transactions
        (user_id, booking_id, order_id, idempotency_key, reference_type, payment_method, gateway_provider,
         gateway_reference, amount, currency, payment_status, gateway_response, trace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.userId,
       isBooking ? (data.bookingId ?? null) : null,
       isOrder ? (data.orderId ?? null) : null,
       data.idempotencyKey || null,
       data.referenceType || null,
       data.paymentMethod, data.gatewayProvider, data.gatewayReference, data.amount,
       data.currency || 'EGP',
       data.status || 'created',
       data.gatewayResponse ? JSON.stringify(data.gatewayResponse) : null,
       traceId,
      ]
    );
    return { id: result.insertId, traceId };
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

  async lockByGatewayRef(gatewayReference: string, conn: mysql.PoolConnection) {
    const [rows] = await conn.execute<RowData>(
      'SELECT * FROM payment_transactions WHERE gateway_reference = ? FOR UPDATE',
      [gatewayReference]
    );
    return rows[0] || null;
  },

  async lockById(id: number, conn: mysql.PoolConnection) {
    const [rows] = await conn.execute<RowData>(
      'SELECT * FROM payment_transactions WHERE id = ? FOR UPDATE',
      [id]
    );
    return rows[0] || null;
  },

  async findByIdempotencyKey(key: string) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM payment_transactions WHERE idempotency_key = ?',
      [key]
    );
    return rows[0] || null;
  },

  async findByBookingId(bookingId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM payment_transactions WHERE booking_id = ? ORDER BY id DESC LIMIT 1',
      [bookingId]
    );
    return rows[0] || null;
  },

  async findByReference(referenceType: string, referenceId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM payment_transactions
       WHERE reference_type = ? AND (booking_id = ? OR order_id = ?)
       ORDER BY id DESC LIMIT 1`,
      [referenceType, referenceId, referenceId]
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

  /**
   * Internal: single authority for persisting payment status transitions.
   * All status-changing methods must delegate to this.
   * @internal @deprecated External callers should use PaymentSaga instead.
   */
  async persistTransition(
    id: number,
    status: string,
    gatewayReference?: string,
    extraWhere?: string,
    conn?: mysql.PoolConnection,
  ): Promise<void> {
    const db = conn || getPool();
    const fields: string[] = ['payment_status = ?'];
    const params: any[] = [status];
    if (gatewayReference) { fields.push('gateway_reference = ?'); params.push(gatewayReference); }
    if (status === 'paid') { fields.push('paid_at = NOW()'); }
    if (status === 'cancelled' || status === 'expired') { fields.push('cancelled_at = NOW()'); }
    const whereClause = extraWhere ? ` AND ${extraWhere}` : '';
    params.push(id);
    await db.execute(
      `UPDATE payment_transactions SET ${fields.join(', ')} WHERE id = ?${whereClause}`,
      params
    );
  },

  /**
   * @internal @deprecated Use PaymentSaga instead.
   */
  async updateStatus(id: number, status: string, gatewayReference?: string, conn?: mysql.PoolConnection) {
    await this.persistTransition(id, status, gatewayReference, undefined, conn);
  },

  /** Mark a payment as expired and release associated resources. */
  async expirePayment(id: number, conn?: mysql.PoolConnection) {
    const executor = conn || getPool();
    const [result] = await executor.execute<mysql.ResultSetHeader>(
      `UPDATE payment_transactions
       SET payment_status = 'expired', cancelled_at = NOW(), updated_at = NOW()
       WHERE id = ? AND payment_status IN ('created', 'pending', 'processing')`,
      [id]
    );
    return result.affectedRows > 0;
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

  /** Find payments stuck in pending/processing for sync/expiry. */
  async findPendingPayments(olderThanMinutes: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM payment_transactions
       WHERE payment_status IN ('created', 'pending', 'processing')
         AND gateway_provider = 'paymob'
         AND gateway_reference IS NOT NULL AND gateway_reference != ''
         AND created_at < NOW() - INTERVAL ? MINUTE
       ORDER BY created_at ASC
       LIMIT 100`,
      [olderThanMinutes]
    );
    return rows;
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
