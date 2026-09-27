import { getPool } from '../../../../database/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { createModuleLogger } from '../../../../shared/utils/logger.js';

const log = createModuleLogger('payment-allocation');

type RowData = RowDataPacket[];

/** Canonical money rounding — the project's `Math.round(n*100)/100` rule. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface PaymentAllocationInput {
  paymentTransactionId: number;
  seriesId: number | null;
  bookingId: number;
  subtotal: number;
  taxAmount: number;
  commissionAmount: number;
  orgNetAmount: number;
  grossAmount: number;
  currency: string;
  paymentMethod: string;
}

export interface PaymentAllocationRow {
  id: number;
  paymentTransactionId: number;
  seriesId: number | null;
  bookingId: number;
  subtotal: number;
  taxAmount: number;
  commissionAmount: number;
  orgNetAmount: number;
  grossAmount: number;
  currency: string;
  refundedAmount: number;
  status: 'allocated' | 'partially_refunded' | 'refunded';
  paymentMethod: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapRow(r: any): PaymentAllocationRow {
  return {
    id: Number(r.id),
    paymentTransactionId: Number(r.payment_transaction_id),
    seriesId: r.series_id != null ? Number(r.series_id) : null,
    bookingId: Number(r.booking_id),
    subtotal: Number(r.subtotal),
    taxAmount: Number(r.tax_amount),
    commissionAmount: Number(r.commission_amount),
    orgNetAmount: Number(r.org_net_amount),
    grossAmount: Number(r.gross_amount),
    currency: String(r.currency),
    refundedAmount: Number(r.refunded_amount),
    status: r.status,
    paymentMethod: String(r.payment_method),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const paymentAllocationRepository = {
  /**
   * Create exactly one allocation row. Idempotent by the
   * `uk_pa_payment_booking` unique key: a duplicate (payment, booking) insert
   * is caught and the EXISTING row returned — a migration replay or a retried
   * payment-success handler can never double-allocate an occurrence.
   */
  async createAllocation(input: PaymentAllocationInput, conn?: import('mysql2/promise').PoolConnection): Promise<PaymentAllocationRow> {
    const db = conn ?? getPool();
    try {
      const [res] = await db.execute<ResultSetHeader>(
        `INSERT INTO payment_allocations
           (payment_transaction_id, series_id, booking_id,
            subtotal, tax_amount, commission_amount, org_net_amount, gross_amount,
            currency, refunded_amount, status, payment_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'allocated', ?)`,
        [
          input.paymentTransactionId,
          input.seriesId ?? null,
          input.bookingId,
          round2(input.subtotal),
          round2(input.taxAmount),
          round2(input.commissionAmount),
          round2(input.orgNetAmount),
          round2(input.grossAmount),
          input.currency,
          input.paymentMethod,
        ],
      );
      const id = res.insertId;
      const row = await this.findById(id, conn);
      if (!row) throw new Error(`Allocation ${id} not readable after insert`);
      return row;
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        const existing = await this.findByPaymentAndBooking(input.paymentTransactionId, input.bookingId, conn);
        if (existing) return existing;
        log.warn({ paymentId: input.paymentTransactionId, bookingId: input.bookingId }, 'Duplicate allocation insert — existing row not found');
        throw err;
      }
      throw err;
    }
  },

  async findById(id: number, conn?: import('mysql2/promise').PoolConnection): Promise<PaymentAllocationRow | null> {
    const db = conn ?? getPool();
    const [rows] = await db.execute<RowData>('SELECT * FROM payment_allocations WHERE id = ? LIMIT 1', [id]);
    return rows.length ? mapRow(rows[0]) : null;
  },

  async findByPaymentAndBooking(paymentTransactionId: number, bookingId: number, conn?: import('mysql2/promise').PoolConnection): Promise<PaymentAllocationRow | null> {
    const db = conn ?? getPool();
    const [rows] = await db.execute<RowData>(
      `SELECT * FROM payment_allocations WHERE payment_transaction_id = ? AND booking_id = ? LIMIT 1`,
      [paymentTransactionId, bookingId],
    );
    return rows.length ? mapRow(rows[0]) : null;
  },

  /** All allocation rows for a payment (no lock). */
  async findByPayment(paymentTransactionId: number): Promise<PaymentAllocationRow[]> {
    const [rows] = await getPool().execute<RowData>(
      `SELECT * FROM payment_allocations WHERE payment_transaction_id = ? ORDER BY booking_id`, [paymentTransactionId],
    );
    return (rows as any[]).map(mapRow);
  },

  /** All allocation rows for a payment LOCKED FOR UPDATE (inside a caller transaction). */
  async findByPaymentForUpdate(paymentTransactionId: number, conn: import('mysql2/promise').PoolConnection): Promise<PaymentAllocationRow[]> {
    const [rows] = await conn.execute<RowData>(
      `SELECT * FROM payment_allocations WHERE payment_transaction_id = ? ORDER BY booking_id FOR UPDATE`, [paymentTransactionId],
    );
    return (rows as any[]).map(mapRow);
  },

  /** R5-D2-B — a single allocation row LOCKED FOR UPDATE (partial-refund guard). */
  async findByIdForUpdate(id: number, conn: import('mysql2/promise').PoolConnection): Promise<PaymentAllocationRow | null> {
    const [rows] = await conn.execute<RowData>(
      `SELECT * FROM payment_allocations WHERE id = ? FOR UPDATE`, [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  },

  /** R5-D2-B — cumulative refunded amount across a payment's allocations (transaction-consistent). */
  async sumRefundedByPayment(paymentTransactionId: number, conn: import('mysql2/promise').PoolConnection): Promise<number> {
    const [rows] = await conn.execute<RowData>(
      `SELECT COALESCE(SUM(refunded_amount), 0) AS total FROM payment_allocations WHERE payment_transaction_id = ?`, [paymentTransactionId],
    );
    return round2(Number((rows as any[])[0]?.total ?? 0));
  },

  async findBySeries(seriesId: number): Promise<PaymentAllocationRow[]> {
    const [rows] = await getPool().execute<RowData>(
      `SELECT * FROM payment_allocations WHERE series_id = ? ORDER BY booking_id`, [seriesId],
    );
    return (rows as any[]).map(mapRow);
  },

  /** Remaining refundable balance from persisted allocation state. */
  async getRefundableBalance(paymentTransactionId: number): Promise<number> {
    const [rows] = await getPool().execute<RowData>(
      `SELECT COALESCE(SUM(gross_amount - refunded_amount), 0) AS balance
       FROM payment_allocations WHERE payment_transaction_id = ?`, [paymentTransactionId],
    );
    return round2(Number((rows as any[])[0]?.balance ?? 0));
  },
};