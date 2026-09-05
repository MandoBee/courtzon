import type mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { getPool } from '../../../../database/mysql.js';
import { ConflictError } from '../../../../shared/errors/app-error.js';

type RowData = mysql.RowDataPacket[];

function resolvePool(conn?: mysql.PoolConnection): mysql.Pool | mysql.PoolConnection {
  return conn ?? getPool();
}

/**
 * Durable refund operation intent, stored inside the existing
 * `payment_transactions.gateway_response` JSON (no schema change). Written and
 * COMMITTED BEFORE the first gateway refund call so a crash between gateway
 * success and the local 'refunded' commit leaves durable evidence that a refund
 * may have been executed — a retry then asks the gateway for the truth instead
 * of blindly refunding a second time.
 */
export interface RefundIntent {
  opId: string;
  amount: number;
  currency: string;
  type: 'full' | 'partial';
  priorRefundedCents: number;
  status: 'initiated' | 'confirmed' | 'completed';
  attempts: number;
  executedAt: string | null;
  createdAt: string;
  updatedAt: string;
  gatewayRefundId: string | null;
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
    // `reference_id` is `bigint unsigned` — only store genuine numeric references.
    // Some flows (e.g. booking_prepare) legitimately pass a UUID string that is
    // later relinked via `booking_id`; writing the UUID into a bigint column
    // raises ER_TRUNCATED_WRONG_VALUE_FOR_FIELD under STRICT mode (the
    // "Payment preparation failed: Internal Server Error" 500). Non-numeric
    // values are stored as NULL, matching wallet/marketplace-intent rows.
    const numericReferenceId = typeof data.referenceId === 'number' && Number.isFinite(data.referenceId)
      ? data.referenceId
      : null;
    const [result] = await db.execute<mysql.ResultSetHeader>(
      `INSERT INTO payment_transactions
        (user_id, booking_id, order_id, reference_id, idempotency_key, reference_type, payment_method, gateway_provider,
         gateway_reference, amount, currency, payment_status, gateway_response, trace_id, aggregate_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [data.userId,
       isBooking ? (data.bookingId ?? null) : null,
       isOrder ? (data.orderId ?? null) : null,
       numericReferenceId,
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

  /**
   * Correlate a webhook payload to the local payment row for the booking
   * PREPARE/intention flow. The local row stores gateway_reference = the Paymob
   * INTENTION order id, but the Accept/iframe transaction webhook carries a
   * DIFFERENT transaction order id, so a plain gateway_reference match misses.
   *
   * Resolution order (first hit wins):
   *  1. exact gateway_reference match on any candidate ref (existing behaviour);
   *  2. the stored intention id / intention_order_id inside the intention JSON
   *     (we persist the full intention response in gateway_response at creation);
   *  3. the stored special_reference == the webhook's merchant_order_id (Paymob
   *     echoes our special_reference back as the Accept order merchant_order_id).
   */
  async findByWebhookCorrelation(possibleRefs: string[], merchantOrderId?: string | null): Promise<any | null> {
    const pool = getPool();
    const refs = [...new Set(possibleRefs.filter(Boolean))];

    // 1. Exact gateway_reference match (covers the case where the webhook DOES
    //    carry the intention order id, plus previously-correlated real order ids).
    for (const ref of refs) {
      const exact = await this.findByGatewayRef(ref);
      if (exact) return exact;
    }

    // 1b. Exact idempotency_key match — the booking_prepare prepareId UUID is
    //     stored there, and Paymob's special_reference/merchant_order_id embeds
    //     it (`booking_prepare_<prepareId>_<ts>`). This is the deterministic
    //     booking_prepare correlation path (never relies on `undefined` refId).
    for (const ref of refs) {
      const [byKey] = await pool.execute<RowData>(
        'SELECT * FROM payment_transactions WHERE idempotency_key = ? LIMIT 1',
        [ref],
      );
      if ((byKey as any[]).length) return (byKey as any[])[0];
    }
    if (merchantOrderId && typeof merchantOrderId === 'string') {
      const token = merchantOrderId.split('_').slice(-2, -1)[0];
      if (token && token.length >= 8) {
        const [byKey] = await pool.execute<RowData>(
          'SELECT * FROM payment_transactions WHERE idempotency_key = ? LIMIT 1',
          [token],
        );
        if ((byKey as any[]).length) return (byKey as any[])[0];
      }
    }

    // 2 & 3. JSON correlation against the persisted intention response. The
    //    gateway_response for a booking_prepare row contains fields like
    //    {"id":"pi_...","intention_order_id":602564039,"special_reference":"..."}.
    //    Build targeted LIKE patterns (bounded: only rows that store intention JSON).
    const patterns: string[] = [];
    for (const ref of refs) {
      if (/^\d+$/.test(ref)) patterns.push(`"intention_order_id":${ref}`);
      patterns.push(`"id":"${ref}"`);
    }
    if (merchantOrderId && typeof merchantOrderId === 'string') {
      patterns.push(`"special_reference":"${merchantOrderId.replace(/"/g, '')}"`);
    }
    if (patterns.length === 0) return null;

    const likes = patterns.map(() => `gateway_response LIKE ?`).join(' OR ');
    const params = patterns.map((p) => `%${p}%`);
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM payment_transactions
       WHERE gateway_response IS NOT NULL AND (${likes})
       ORDER BY id DESC LIMIT 1`,
      params,
    );
    return rows[0] || null;
  },

  /** Persist the REAL Accept transaction order id onto the local row so the
   *  webhook, sync job and expiry job all resolve it by the same id going
   *  forward. Best-effort: only when the new ref differs and is non-empty. */
  async persistGatewayReference(id: number, gatewayReference: string, conn?: mysql.PoolConnection): Promise<boolean> {
    if (!gatewayReference) return false;
    const db = resolvePool(conn);
    const [result] = await db.execute<mysql.ResultSetHeader>(
      `UPDATE payment_transactions SET gateway_reference = ? WHERE id = ? AND gateway_reference <> ?`,
      [gatewayReference, id, gatewayReference],
    );
    return result.affectedRows > 0;
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

  /** Tolerant parse of the stored `gateway_response` JSON. Legacy rows may be
   *  empty, NULL, malformed, or hold a non-object string — never throw here. */
  parseGatewayResponse(raw: unknown): Record<string, any> | null {
    if (raw == null) return null;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    if (typeof raw === 'object') return raw as Record<string, any>;
    return null;
  },

  /** Extract the refund intent from a stored gateway response, if present. */
  readRefundIntent(raw: unknown): RefundIntent | null {
    const parsed = this.parseGatewayResponse(raw);
    const intent = parsed?.refundIntent;
    if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return null;
    if (typeof intent.opId !== 'string' || typeof intent.amount !== 'number') return null;
    return intent as RefundIntent;
  },

  /** Fresh refund intent for a payment (v1: single operation per payment). */
  newRefundIntent(input: { amount: number; currency: string; paymentAmount: number }): RefundIntent {
    const now = new Date().toISOString();
    const amountCents = Math.round(input.amount * 100);
    const paymentCents = Math.round(input.paymentAmount * 100);
    return {
      opId: randomUUID(),
      amount: input.amount,
      currency: input.currency,
      type: amountCents >= paymentCents ? 'full' : 'partial',
      priorRefundedCents: 0,
      status: 'initiated',
      attempts: 0,
      executedAt: null,
      createdAt: now,
      updatedAt: now,
      gatewayRefundId: null,
    };
  },

  /** Serialize a gateway_response with the refund intent merged in, preserving
   *  every unrelated key (e.g. the raw charge response). Always valid JSON. */
  writeGatewayResponse(raw: unknown, intent: RefundIntent): string {
    const parsed = this.parseGatewayResponse(raw) ?? {};
    parsed.refundIntent = intent;
    return JSON.stringify(parsed);
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
