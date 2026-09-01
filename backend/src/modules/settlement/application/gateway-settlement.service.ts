import { getPool } from '../../../database/mysql.js';
import { ConflictError } from '../../../shared/errors/app-error.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { postGatewaySettlementAccounting } from '../../financial/application/accounting-event.listener.js';
import type mysql from 'mysql2/promise';

const log = createModuleLogger('gateway-settlement');

type RowData = mysql.RowDataPacket[];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Payment methods that are collected through a payment GATEWAY and therefore
 * sit in 1100 Payment Clearing until CourtZon actually receives the funds.
 * Only these are eligible for "Receive Gateway Settlement".
 */
const GATEWAY_PAYMENT_METHODS = ['card', 'online'];

export interface GatewayEligibleTransaction {
  paymentTransactionId: number;
  referenceType: string | null;
  referenceId: number | null;
  orderId: number | null;
  bookingId: number | null;
  gatewayReference: string | null;
  gatewayProvider: string | null;
  paymentMethod: string;
  paymentMethodId: number | null;
  paidAt: string | null;
  currency: string;
  grossAmount: number;
  gatewayFeePct: number;
  gatewayFeeFixed: number;
  gatewayFeeAmount: number;
  netAmount: number;
}

/**
 * Admin "Receive Gateway Settlement" — records that CourtZon has actually
 * received/collected the funds for previously-paid card/online customer
 * payments. This is DISTINCT from customer payment state (payment_status=paid)
 * and from org/seller settlement. Eligibility, fees and amounts are always
 * recomputed from authoritative DB/config data — never trusted from the client.
 */
export const gatewaySettlementService = {

  /**
   * Payment transactions eligible for a gateway settlement:
   *   - payment_status = 'paid'
   *   - gateway payment method (card/online)
   *   - NOT already included in a gateway settlement (gateway_settlement_id IS NULL)
   *   - financially valid (paid_at present, positive amount)
   * Gateway fee is computed from the configured payment_method (never hard-coded).
   */
  async listEligible(): Promise<GatewayEligibleTransaction[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT pt.id, pt.reference_type, pt.reference_id, pt.order_id, pt.booking_id,
              pt.gateway_reference, pt.gateway_provider, pt.payment_method, pt.currency,
              pt.amount, pt.paid_at, pm.id AS payment_method_id,
              pm.processing_fee_pct, pm.processing_fee_fixed
       FROM payment_transactions pt
       LEFT JOIN payment_methods pm ON pm.slug = pt.payment_method
       WHERE pt.payment_status = 'paid'
         AND pt.payment_method IN ('card','online')
         AND pt.gateway_settlement_id IS NULL
         AND pt.paid_at IS NOT NULL
         AND pt.amount > 0
       ORDER BY pt.paid_at ASC, pt.id ASC`,
    );
    return (rows as any[]).map((r) => this._computeFee(r));
  },

  _computeFee(r: any): GatewayEligibleTransaction {
    const grossAmount = round2(Number(r.amount || 0));
    // Defensive: a card/online gateway payment MUST resolve its fee
    // configuration. If the payment_methods row is missing, fail loudly instead
    // of silently recording a 0% / E£0.00 fee on a settlement.
    if (r.payment_method_id == null && GATEWAY_PAYMENT_METHODS.includes(r.payment_method)) {
      throw new ConflictError(
        `Payment method fee configuration is missing for '${r.payment_method}' — cannot resolve gateway fees for payment transaction ${r.id}`,
      );
    }
    const gatewayFeePct = Number(r.processing_fee_pct ?? 0);
    const gatewayFeeFixed = Number(r.processing_fee_fixed ?? 0);
    const gatewayFeeAmount = round2(grossAmount * (gatewayFeePct / 100) + gatewayFeeFixed);
    const netAmount = round2(grossAmount - gatewayFeeAmount);
    return {
      paymentTransactionId: Number(r.id),
      referenceType: r.reference_type ?? null,
      referenceId: r.reference_id != null ? Number(r.reference_id) : null,
      orderId: r.order_id != null ? Number(r.order_id) : null,
      bookingId: r.booking_id != null ? Number(r.booking_id) : null,
      gatewayReference: r.gateway_reference ?? null,
      gatewayProvider: r.gateway_provider ?? null,
      paymentMethod: r.payment_method,
      paymentMethodId: r.payment_method_id != null ? Number(r.payment_method_id) : null,
      paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
      currency: r.currency || 'EGP',
      grossAmount,
      gatewayFeePct,
      gatewayFeeFixed,
      gatewayFeeAmount,
      netAmount,
    };
  },

  /**
   * Atomically create a gateway settlement for the selected payment
   * transactions. Runs in ONE DB transaction:
   *   - FOR UPDATE locks each selected payment row (concurrency guard)
   *   - re-validates eligibility from DB (never trusts client)
   *   - recomputes fees from configured payment_methods
   *   - inserts gateway_settlements + gateway_settlement_transactions (fee
   *     snapshot) + updates payment_transactions linkage
   *   - posts the accounting entry in the SAME transaction (atomic)
   *
   * Duplicate protection:
   *   - uk_gst_payment UNIQUE(payment_transaction_id) throws ER_DUP_ENTRY
   *     (full rollback) if any payment is already settled
   *   - UPDATE ... WHERE gateway_settlement_id IS NULL guard
   */
  async create(data: {
    paymentTransactionIds: number[];
    settledBy: number;
    notes?: string;
  }): Promise<any> {
    const ids = [...new Set((data.paymentTransactionIds || []).map(Number).filter((n) => n > 0))];
    if (ids.length === 0) throw new ConflictError('No eligible payment transactions selected for gateway settlement');

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Lock + validate each selected payment transaction.
      const lines: { id: number; gross: number; feePct: number; feeFixed: number; fee: number; net: number; currency: string; methodId: number | null }[] = [];
      for (const id of ids) {
        const [rows] = await conn.execute<RowData>(
          `SELECT pt.id, pt.payment_status, pt.payment_method, pt.currency, pt.amount, pt.gateway_settlement_id,
                  pm.id AS payment_method_id, pm.processing_fee_pct, pm.processing_fee_fixed
           FROM payment_transactions pt
           LEFT JOIN payment_methods pm ON pm.slug = pt.payment_method
           WHERE pt.id = ?
           FOR UPDATE`,
          [id],
        );
        const txn = (rows as any[])[0];
        if (!txn) throw new ConflictError(`Payment transaction ${id} not found`);
        if (txn.gateway_settlement_id != null) {
          throw new ConflictError(`Payment transaction ${id} is already included in a gateway settlement`);
        }
        if (txn.payment_status !== 'paid') {
          throw new ConflictError(`Payment transaction ${id} is not paid (status ${txn.payment_status})`);
        }
        if (!GATEWAY_PAYMENT_METHODS.includes(txn.payment_method)) {
          throw new ConflictError(`Payment transaction ${id} is not a gateway payment (${txn.payment_method})`);
        }
        // Defensive: a card/online gateway payment MUST resolve its fee
        // configuration. If the payment_methods row is missing, fail loudly
        // instead of silently recording a 0% / E£0.00 fee on the settlement.
        if (txn.payment_method_id == null) {
          throw new ConflictError(
            `Payment method fee configuration is missing for '${txn.payment_method}' — cannot resolve gateway fees for payment transaction ${id}`,
          );
        }
        const gross = round2(Number(txn.amount || 0));
        if (gross <= 0) throw new ConflictError(`Payment transaction ${id} has an invalid amount`);
        const feePct = Number(txn.processing_fee_pct ?? 0);
        const feeFixed = Number(txn.processing_fee_fixed ?? 0);
        const fee = round2(gross * (feePct / 100) + feeFixed);
        lines.push({
          id, gross, feePct, feeFixed, fee, net: round2(gross - fee),
          currency: txn.currency || 'EGP', methodId: txn.payment_method_id != null ? Number(txn.payment_method_id) : null,
        });
      }

      const grossTotal = round2(lines.reduce((s, l) => s + l.gross, 0));
      const feeTotal = round2(lines.reduce((s, l) => s + l.fee, 0));
      const netTotal = round2(grossTotal - feeTotal);
      const currency = lines[0].currency || 'EGP';

      // 2. Create the gateway settlement batch.
      const now = new Date();
      const batchCode = generateBatchCode(now);
      const [gsResult] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO gateway_settlements
           (batch_code, settlement_status, gross_amount, gateway_fee_amount, net_amount,
            currency, transaction_count, settled_by, settled_at, notes)
         VALUES (?, 'completed', ?, ?, ?, ?, ?, ?, NOW(), ?)`,
        [batchCode, grossTotal, feeTotal, netTotal, currency, lines.length, data.settledBy, data.notes || null],
      );
      const settlementId = gsResult.insertId;

      // 3. Link each transaction + snapshot fee config (duplicate protection).
      for (const l of lines) {
        await conn.execute<mysql.ResultSetHeader>(
          `INSERT INTO gateway_settlement_transactions
             (gateway_settlement_id, payment_transaction_id, payment_method_id,
              gross_amount, gateway_fee_pct, gateway_fee_fixed, gateway_fee_amount,
              net_amount, currency)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [settlementId, l.id, l.methodId, l.gross, l.feePct, l.feeFixed, l.fee, l.net, l.currency],
        );
      }

      // 4. Mark the payments as gateway-settled (guarded UPDATE).
      for (const l of lines) {
        const [upd] = await conn.execute<mysql.ResultSetHeader>(
          `UPDATE payment_transactions
           SET gateway_settlement_id = ?, gateway_settled_at = NOW(), updated_at = NOW()
           WHERE id = ? AND gateway_settlement_id IS NULL`,
          [settlementId, l.id],
        );
        if (upd.affectedRows !== 1) {
          throw new ConflictError(`Payment transaction ${l.id} was already settled (concurrent duplicate request)`);
        }
      }

      // 5. Post accounting in the SAME transaction (atomic): Dr Bank net,
      //    Dr Payment Gateway Fees, Cr Payment Clearing gross.
      await postGatewaySettlementAccounting(settlementId, grossTotal, netTotal, feeTotal, currency, conn);

      await conn.commit();
      conn.release();

      // Post-COMMIT realtime signal — the in-memory accounting listener skips
      // idempotently (already posted inside the transaction); other subscribers
      // (realtime/UI refresh) react to the durable event.
      eventBusV2.emit('payment:gateway-settled', {
        settlementId,
        gross: grossTotal,
        net: netTotal,
        fee: feeTotal,
        currency,
      });

      log.info({ settlementId, batchCode, count: lines.length, grossTotal, netTotal }, 'Gateway settlement created');
      return this.get(settlementId);
    } catch (err: any) {
      await conn.rollback();
      conn.release();
      if (err?.code === 'ER_DUP_ENTRY') {
        throw new ConflictError('One or more payment transactions are already included in a gateway settlement');
      }
      throw err;
    }
  },

  async list(filters: { page?: number; limit?: number }): Promise<{ data: any[]; total: number }> {
    const pool = getPool();
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const offset = (page - 1) * limit;
    const [countRows] = await pool.execute<RowData>('SELECT COUNT(*) AS total FROM gateway_settlements');
    const total = Number((countRows as any[])[0]?.total || 0);
    const [rows] = await pool.execute<RowData>(
      `SELECT gs.*, u.full_name AS settled_by_name
       FROM gateway_settlements gs
       LEFT JOIN users u ON u.id = gs.settled_by
       ORDER BY gs.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );
    return { data: (rows as any[]).map((r) => ({ ...r, gross_amount: Number(r.gross_amount), gateway_fee_amount: Number(r.gateway_fee_amount), net_amount: Number(r.net_amount) })), total };
  },

  async get(settlementId: number): Promise<any> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT gs.*, u.full_name AS settled_by_name
       FROM gateway_settlements gs
       LEFT JOIN users u ON u.id = gs.settled_by
       WHERE gs.id = ?`,
      [settlementId],
    );
    const settlement = (rows as any[])[0];
    if (!settlement) throw new ConflictError('Gateway settlement not found');
    const [txns] = await pool.execute<RowData>(
      `SELECT gst.*, pt.reference_type, pt.reference_id, pt.order_id, pt.booking_id,
              pt.gateway_reference, pt.gateway_provider, pt.paid_at, pm.name AS payment_method_name
       FROM gateway_settlement_transactions gst
       LEFT JOIN payment_transactions pt ON pt.id = gst.payment_transaction_id
       LEFT JOIN payment_methods pm ON pm.id = gst.payment_method_id
       WHERE gst.gateway_settlement_id = ?
       ORDER BY gst.id ASC`,
      [settlementId],
    );
    return {
      settlement: {
        ...settlement,
        gross_amount: Number(settlement.gross_amount),
        gateway_fee_amount: Number(settlement.gateway_fee_amount),
        net_amount: Number(settlement.net_amount),
      },
      transactions: (txns as any[]).map((t) => ({
        ...t,
        gross_amount: Number(t.gross_amount),
        gateway_fee_amount: Number(t.gateway_fee_amount),
        net_amount: Number(t.net_amount),
        gateway_fee_pct: Number(t.gateway_fee_pct),
        gateway_fee_fixed: Number(t.gateway_fee_fixed),
      })),
    };
  },
};

function generateBatchCode(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const seq = Math.floor(Math.random() * 999) + 1;
  return `GWS-${y}-${m}-${day}-${String(seq).padStart(3, '0')}`;
}