import type mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { getPool } from '../../../../database/mysql.js';
import { ConflictError } from '../../../../shared/errors/app-error.js';

type RowData = mysql.RowDataPacket[];

function resolvePool(conn?: mysql.PoolConnection): mysql.Pool | mysql.PoolConnection {
  return conn ?? getPool();
}

export const paymentRepository = {
  async create(data: {
    userId: number; bookingId?: number; orderId?: number; referenceId?: number; referenceType?: string; paymentMethod: string;
    gatewayProvider: string; gatewayReference: string; amount: number;
    status?: string; currency?: string; gatewayResponse?: unknown; traceId?: string;
    idempotencyKey?: string;
  }, conn?: mysql.PoolConnection) {
    const db = resolvePool(conn);
    const isBooking = data.referenceType === 'booking';
    const isOrder = data.referenceType === 'order';
    const traceId = data.traceId || randomUUID();
    const [result] = await db.execute<mysql.ResultSetHeader>(
      `INSERT INTO payment_transactions
        (user_id, booking_id, order_id, reference_id, idempotency_key, reference_type, payment_method, gateway_provider,
         gateway_reference, amount, currency, payment_status, gateway_response, trace_id, aggregate_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [data.userId,
       isBooking ? (data.bookingId ?? null) : null,
       isOrder ? (data.orderId ?? null) : null,
       data.referenceId ?? null,
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

  async getPlanPrice(planId: number): Promise<{ planName: string | null; priceMonthly: number; priceYearly: number; isUnlimited: boolean } | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT plan_name, price_monthly, price_yearly, is_unlimited FROM subscription_plans WHERE id = ? AND is_active = TRUE',
      [planId],
    );
    const row = rows[0] as any;
    if (!row) return null;
    return {
      planName: (row.plan_name as string) || null,
      priceMonthly: Number(row.price_monthly || 0),
      priceYearly: Number(row.price_yearly || 0),
      isUnlimited: !!row.is_unlimited,
    };
  },

  async getUserDefaultCurrency(userId: number): Promise<string> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT c.default_currency FROM users u JOIN countries c ON c.id = u.country_id WHERE u.id = ?',
      [userId],
    );
    return (rows[0] as any)?.default_currency || 'EGP';
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
       WHERE reference_type = ? AND (booking_id = ? OR order_id = ? OR reference_id = ?)
       ORDER BY id DESC LIMIT 1`,
      [referenceType, referenceId, referenceId, referenceId]
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
   * Find a paid (or already partially refunded) payment for an order.
   * Multi-seller checkouts charge once against the PRIMARY order of the
   * checkout group; sibling orders must be able to locate that same payment
   * to receive their proportional refund.
   */
  async findByOrderIdIncludingRefunded(orderId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM payment_transactions
       WHERE order_id = ? AND payment_status IN ('paid', 'refunded')
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
    expectedVersion?: number,
    conn?: mysql.PoolConnection,
  ): Promise<void> {
    const db = conn || getPool();
    const fields: string[] = ['payment_status = ?'];
    const params: any[] = [status];
    if (gatewayReference) { fields.push('gateway_reference = ?'); params.push(gatewayReference); }
    if (status === 'paid') { fields.push('paid_at = NOW()'); }
    if (status === 'cancelled' || status === 'expired') { fields.push('cancelled_at = NOW()'); }
    if (expectedVersion !== undefined) {
      fields.push('aggregate_version = aggregate_version + 1');
      params.push(id, expectedVersion);
      const [result] = await db.execute<mysql.ResultSetHeader>(
        `UPDATE payment_transactions SET ${fields.join(', ')} WHERE id = ? AND aggregate_version = ?`,
        params,
      );
      if (result.affectedRows === 0) {
        throw new ConflictError(`Payment ${id} version conflict: expected ${expectedVersion}`);
      }
    } else {
      params.push(id);
      await db.execute(
        `UPDATE payment_transactions SET ${fields.join(', ')} WHERE id = ?`,
        params,
      );
    }
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

  async findByUser(
    userId: number,
    page: number,
    limit: number,
    filters?: { status?: string; paymentMethod?: string; referenceType?: string },
  ) {
    const pool = getPool();
    const conditions: string[] = ['user_id = ?'];
    const params: any[] = [userId];
    if (filters?.status) {
      conditions.push('payment_status = ?');
      params.push(filters.status);
    }
    if (filters?.paymentMethod) {
      conditions.push('payment_method = ?');
      params.push(filters.paymentMethod);
    }
    if (filters?.referenceType) {
      conditions.push('reference_type = ?');
      params.push(filters.referenceType);
    }
    const where = conditions.join(' AND ');
    const offset = (page - 1) * limit;

    // Safe read-only projection — the raw `gateway_response` JSON (which may
    // contain provider secrets/PCI fragments) is NEVER exposed to the player.
    const [rows] = await pool.query<RowData>(
      `SELECT id, user_id, booking_id, order_id, reference_id, reference_type,
              payment_method, gateway_provider, gateway_reference,
              amount, currency, payment_status,
              paid_at, cancelled_at, expired_at, created_at, updated_at
       FROM payment_transactions
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [countRows] = await pool.query<RowData>(
      `SELECT COUNT(*) as cnt FROM payment_transactions WHERE ${where}`,
      params
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
  }, conn?: mysql.PoolConnection) {
    const db = resolvePool(conn);
    await db.execute(
      `INSERT INTO financial_journal_entries (entry_type, reference_type, reference_id, debit_account, credit_account, amount, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.entryType, data.referenceType, data.referenceId,
       data.debitAccount, data.creditAccount, data.amount, data.description || null]
    );
  },
};
