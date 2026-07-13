import { randomUUID } from 'node:crypto';
import { paymentRepository } from '../infrastructure/repositories/payment.repository.js';
import { paymentGateway } from '../../../shared/services/gateway/gateway-factory.js';
import { walletService } from '../../wallet/application/wallet.service.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { withTransaction } from '../../../database/database.transaction.js';
import type { ChargeInput } from '../presentation/payment.dto.js';
import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { eventBus } from '../../../shared/event-bus/index.js';
import { bookingService } from '../../booking/application/booking.service.js';
import { confirmBooking } from '../../../platform/booking/BookingSaga.js';
import { confirmPayment, failPayment, refundPayment, expirePayment as sagaExpirePayment, emitPaymentCompleted } from '../../../platform/payment/PaymentSaga.js';

const log = createModuleLogger('payment');

type RowData = mysql.RowDataPacket[];

const FINAL_STATES = new Set(['paid', 'failed', 'cancelled', 'expired', 'refunded']);

function parseBookingDateTime(bookingDate: unknown, startTime: unknown): Date | null {
  if (bookingDate == null || startTime == null) return null;

  let dateStr: string;
  if (bookingDate instanceof Date) {
    dateStr = bookingDate.toISOString().split('T')[0];
  } else {
    dateStr = String(bookingDate).split('T')[0];
  }

  let timeStr: string;
  if (startTime instanceof Date) {
    timeStr = [
      String(startTime.getUTCHours()).padStart(2, '0'),
      String(startTime.getUTCMinutes()).padStart(2, '0'),
      String(startTime.getUTCSeconds()).padStart(2, '0'),
    ].join(':');
  } else {
    timeStr = String(startTime);
  }

  const result = new Date(`${dateStr}T${timeStr}`);
  if (isNaN(result.getTime())) return null;
  return result;
}

export class PaymentService {
  async charge(userId: number, input: ChargeInput) {
    if (input.paymentMethod === 'wallet') {
      return this.chargeByWallet(userId, input);
    }
    return this.chargeByGateway(userId, input);
  }

  private async chargeByWallet(userId: number, input: ChargeInput) {
    const traceId = randomUUID();
    const result = await walletService.withdraw(userId, input.amount, `${input.referenceType} #${input.referenceId}`);

    const { id: paymentId } = await paymentRepository.create({
      userId,
      bookingId: input.referenceType === 'booking' ? input.referenceId : undefined,
      orderId: input.referenceType === 'order' ? input.referenceId : undefined,
      referenceType: input.referenceType,
      paymentMethod: 'wallet',
      gatewayProvider: 'wallet_system',
      gatewayReference: `wallet_${Date.now()}`,
      amount: input.amount,
      status: 'paid',
      traceId,
    });

    await paymentRepository.createJournalEntry({
      entryType: 'payment',
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      debitAccount: 'Cash',
      creditAccount: 'Revenue',
      amount: input.amount,
      description: `${input.referenceType} payment via wallet`,
    });

    emitPaymentCompleted(paymentId).catch((err) => log.error({ err, paymentId }, 'Failed to emit payment:completed via saga'));

    log.info({ traceId, paymentId, userId, amount: input.amount, referenceType: input.referenceType }, 'Wallet payment completed');

    return {
      success: true,
      paymentId,
      status: 'paid',
      balance: result.balance,
      traceId,
    };
  }

  private async chargeByGateway(userId: number, input: ChargeInput) {
    const traceId = randomUUID();

    // ── Idempotency: if client sends idempotencyKey, check for existing payment ──
    if (input.idempotencyKey) {
      const existing = await paymentRepository.findByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        if (existing.payment_status === 'paid') {
          log.info({ traceId, existingPaymentId: existing.id, idempotencyKey: input.idempotencyKey }, 'Idempotency hit — payment already completed');
          return { success: true, paymentId: existing.id, traceId, status: 'paid' };
        }
        if (existing.payment_status === 'pending' || existing.payment_status === 'processing') {
          log.info({ traceId, existingPaymentId: existing.id, idempotencyKey: input.idempotencyKey }, 'Idempotency hit — returning existing pending payment');
          return { success: true, paymentId: existing.id, traceId, status: existing.payment_status };
        }
      }
    }

    log.info({ traceId, userId, amount: input.amount, referenceType: input.referenceType, referenceId: input.referenceId, idempotencyKey: input.idempotencyKey }, 'Gateway charge initiated');

    const paymentResult = await paymentGateway.charge({
      amount: input.amount,
      currency: input.currency,
      referenceId: input.referenceId,
      referenceType: input.referenceType,
      returnUrl: input.returnUrl,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      customerName: input.customerName,
      customerAddress: input.customerAddress,
    });

    if (!paymentResult.success) {
      log.error({ traceId, errorMessage: paymentResult.errorMessage }, 'Gateway charge failed');
      return {
        success: false,
        traceId,
        paymentId: undefined,
        status: paymentResult.status,
        paymentUrl: paymentResult.paymentUrl,
        clientSecret: paymentResult.clientSecret,
        intentionId: paymentResult.intentionId,
        transactionId: paymentResult.transactionId,
        errorMessage: paymentResult.errorMessage,
      };
    }

    const { id: paymentId } = await paymentRepository.create({
      userId,
      bookingId: (input.referenceType === 'booking' || input.referenceType === 'booking_intent') ? input.referenceId : undefined,
      orderId: input.referenceType === 'order' ? input.referenceId : undefined,
      referenceType: input.referenceType,
      paymentMethod: input.paymentMethod,
      gatewayProvider: paymentGateway.provider,
      gatewayReference: paymentResult.gatewayReference || '',
      amount: input.amount,
      currency: input.currency,
      status: 'pending',
      gatewayResponse: paymentResult.rawResponse || null,
      traceId,
      idempotencyKey: input.idempotencyKey,
    });

    log.info({ traceId, paymentId, gatewayRef: paymentResult.gatewayReference, paymentUrl: paymentResult.paymentUrl }, 'Gateway payment created — awaiting customer');

    return {
      success: true,
      paymentId,
      traceId,
      status: 'pending',
      paymentUrl: paymentResult.paymentUrl,
      clientSecret: paymentResult.clientSecret,
      intentionId: paymentResult.intentionId,
      transactionId: paymentResult.transactionId,
    };
  }

  /**
   * Handle payment gateway webhook (idempotent + transactional).
   *
   * Only final payment outcomes may change payment state:
   *   paid / success / captured / authorized  →  paid
   *   failed                                  →  failed
   *   cancelled                               →  cancelled
   *   expired                                 →  expired
   *   All other statuses (intended, created, pending, processing, waiting) → ignored.
   */
  async handleWebhook(payload: unknown, signature: string) {
    const valid = await paymentGateway.verifyWebhook(payload, signature);
    if (!valid) {
      log.error({
        msg: 'HMAC verification failed',
        payloadKeys: Object.keys(payload as any),
        hasObj: !!(payload as any)?.obj,
        signatureLength: signature?.length,
        signaturePreview: signature?.slice(0, 20),
      });
      throw new Error('Invalid webhook signature');
    }

    const data = payload as any;
    const isIntentionWebhook = !!data.obj;
    const obj = data.obj ?? data;

    // Collect all possible gateway references from the payload
    const intentionOrderId = obj.intention_order_id;
    const intentionId = obj.intention_id;
    const orderId = obj.order?.id;
    const rootOrderId = data.order?.id;
    const txnId = obj.id;
    const merchantOrderId = obj.order?.merchant_order_id;

    const possibleRefs = [...new Set(
      [intentionOrderId, intentionId, orderId, rootOrderId, txnId]
        .filter(v => v != null)
        .map(v => String(v))
    )];

    if (possibleRefs.length === 0) {
      log.error({ msg: 'Missing gateway reference from webhook payload' });
      throw new Error('Missing gateway reference');
    }

    log.info({
      webhookSource: isIntentionWebhook ? 'intention' : 'accept',
      possibleRefs,
      objStatus: obj.status,
      objKeys: Object.keys(obj),
      merchantOrderId,
    }, 'Webhook received');

    // --- Determine new payment status ---
    let newStatus: string | null = null;

    if (isIntentionWebhook) {
      // Intention API: only final statuses may update payment state
      const STATUS_MAP: Record<string, string> = {
        paid: 'paid',
        success: 'paid',
        captured: 'paid',
        authorized: 'paid',
        failed: 'failed',
        cancelled: 'cancelled',
        expired: 'expired',
      };
      newStatus = STATUS_MAP[obj.status];

      if (obj.status === 'failed') {
        log.warn({ possibleRefs, objStatus: obj.status, objSuccess: obj.success }, 'Intention webhook: payment failed');
      }

      if (!newStatus) {
        log.info({ possibleRefs, status: obj.status }, 'Non-final webhook ignored');
        return { received: true, note: 'ignored' };
      }
    } else {
      // Accept API webhook: use success flag, but respect pending
      if (obj.success === true) {
        newStatus = 'paid';
      } else if (obj.pending === true) {
        log.info({ possibleRefs, objStatus: obj.status }, 'Accept API webhook: transaction still pending, ignoring');
        return { received: true, note: 'ignored' };
      } else {
        newStatus = 'failed';
      }

      if (newStatus === 'failed') {
        log.warn({ possibleRefs, objStatus: obj.status, objSuccess: obj.success }, 'Accept webhook: payment failed');
      }
    }

    // --- Resolve gateway reference by trying each possible ref ---
    let resolvedGatewayRef = '';
    let preCheck = null as any;

    for (const ref of possibleRefs) {
      preCheck = await paymentRepository.findByGatewayRef(ref);
      if (preCheck) {
        resolvedGatewayRef = ref;
        break;
      }
    }

    // Fallback: try to find by merchant_order_id (contains our custom reference)
    if (!preCheck && merchantOrderId && typeof merchantOrderId === 'string') {
      const parts = merchantOrderId.split('_');
      const refId = Number(parts[parts.length - 2]);
      if (refId > 0) {
        const refType = parts.slice(0, parts.length - 2).join('_');
        preCheck = await paymentRepository.findByReference(refType, refId);
        if (preCheck) {
          resolvedGatewayRef = String(preCheck.gateway_reference || '');
          log.warn({ merchantOrderId, matchedId: (preCheck as any).id }, 'Webhook: matched via merchant_order_id');
        }
      }
    }

    if (!preCheck) {
      log.error({ possibleRefs, merchantOrderId }, 'Payment transaction not found via any reference');
      throw new NotFoundError('Payment transaction');
    }

    const traceId = (preCheck as any).trace_id || '';

    // --- cancelled / expired → direct status update + cancel pending booking ---
    if (newStatus === 'cancelled' || newStatus === 'expired') {
      const result = await withTransaction(async (conn) => {
        const transaction = await paymentRepository.lockByGatewayRef(resolvedGatewayRef, conn);
        if (!transaction) throw new NotFoundError('Payment transaction');
        const [updateResult] = await conn.execute<mysql.ResultSetHeader>(
          `UPDATE payment_transactions
           SET payment_status = ?, cancelled_at = NOW(), updated_at = NOW()
           WHERE id = ? AND payment_status NOT IN ('paid', 'failed', 'cancelled', 'expired', 'refunded')`,
          [newStatus, transaction.id],
        );
        if (updateResult.affectedRows > 0) {
          log.info({ traceId, txnId: transaction.id, status: newStatus }, 'Payment cancelled/expired via webhook');
          if (transaction.booking_id) {
            if (transaction.reference_type === 'booking_intent') {
              await conn.execute(
                'UPDATE booking_intents SET intent_status = ?, failure_reason = ? WHERE id = ?',
                [newStatus, `Payment ${newStatus} via webhook`, transaction.booking_id],
              );
              await this._cancelPendingBooking(conn, transaction.booking_id, traceId);
            } else if (transaction.reference_type === 'booking') {
              await conn.execute(
                `UPDATE bookings SET booking_status = ?, payment_status = ?, updated_at = NOW() WHERE id = ? AND booking_status = 'pending'`,
                [newStatus, newStatus, transaction.booking_id],
              );
            }
          }
        }
        return { idempotent: updateResult.affectedRows === 0 };
      });
      return result;
    }

    // --- paid / failed → full outcome processing ---
    log.info({ gatewayRef: resolvedGatewayRef, newStatus, traceId }, 'PAYMENT PATH = WEBHOOK');
    const paidResult = await withTransaction(async (conn) => {
      const transaction = await paymentRepository.lockByGatewayRef(resolvedGatewayRef, conn);
      if (!transaction) throw new NotFoundError('Payment transaction');
      return this._processPaymentOutcome(
        conn, transaction, newStatus as 'paid' | 'failed',
        resolvedGatewayRef, traceId, 'webhook', obj.status, obj.success,
      );
    });

    if (!paidResult.idempotent) {
      const txn = await paymentRepository.findByGatewayRef(resolvedGatewayRef);
      if (txn) {
        const paymentId = (txn as any).id;
        if (newStatus === 'paid') {
          await confirmPayment(paymentId, {
            gatewayReference: resolvedGatewayRef,
            paidAmount: Number((txn as any).amount) || 0,
          }).catch((err) => log.error({ err, paymentId }, 'Failed to emit payment:completed via saga'));
        } else if (newStatus === 'failed') {
          await failPayment(paymentId).catch((err) => log.error({ err, paymentId }, 'Failed to emit payment:failed via saga'));
        }
      }
    }

    return paidResult;
  }

  /**
   * Synchronize pending payments by polling Paymob.
   * Should be called by a scheduled job every ~5 minutes.
   */
  async syncPendingPayments() {
    const payments = await paymentRepository.findPendingPayments(1);
    if (payments.length === 0) return { synced: 0 };

    log.info({ count: payments.length }, 'Starting payment sync');

    let synced = 0;
    for (const ptx of payments as any[]) {
      try {
        const remoteStatus = await paymentGateway.getTransactionStatus(ptx.gateway_reference, ptx.order_id);
        const traceId = ptx.trace_id || '';
        const newStatus: 'paid' | 'failed' | null =
          remoteStatus.status === 'paid' ? 'paid' :
          remoteStatus.status === 'failed' ? 'failed' : null;

        if (newStatus === 'failed') {
          log.warn({ txnId: ptx.id, gatewayRef: ptx.gateway_reference, remoteStatus: remoteStatus.status }, 'Sync detected failed payment');
        }

        if (!newStatus) continue;

        log.info({ txnId: ptx.id, gatewayRef: ptx.gateway_reference, newStatus, traceId }, 'PAYMENT PATH = SYNC_JOB');
        await withTransaction(async (conn) => {
          const locked = await paymentRepository.lockByGatewayRef(ptx.gateway_reference, conn);
          if (!locked) return;
          const result = await this._processPaymentOutcome(
            conn, locked, newStatus, ptx.gateway_reference, traceId, 'sync',
            remoteStatus.status, remoteStatus.success,
          );
          if (!result.idempotent) synced++;
        });

        log.info({ traceId, txnId: ptx.id, gatewayRef: ptx.gateway_reference, newStatus }, 'Payment synced');
      } catch (err) {
        log.error({ txnId: ptx.id, gatewayRef: ptx.gateway_reference, error: String(err) }, 'Sync failed for payment');
      }
    }

    log.info({ synced, total: payments.length }, 'Payment sync complete');
    return { synced, total: payments.length };
  }

  /**
   * Manual recovery for a specific payment by gateway reference.
   * Admin-initiated — calls getTransactionStatus() on Paymob and runs
   * _processPaymentOutcome() with the same idempotency protections as webhook/sync.
   */
  async recoverPayment(gatewayReference: string, initiatedBy: number) {
    const transaction = await paymentRepository.findByGatewayRef(gatewayReference);
    if (!transaction) throw new NotFoundError('Payment transaction not found for gateway reference');

    const traceId = (transaction as any).trace_id || '';
    log.info({ traceId, gatewayRef: gatewayReference, initiatedBy }, 'Manual recovery initiated');

    const remoteStatus = await paymentGateway.getTransactionStatus(gatewayReference, (transaction as any).order_id);
    const newStatus: 'paid' | 'failed' | null =
      remoteStatus.status === 'paid' ? 'paid' :
      remoteStatus.status === 'failed' ? 'failed' : null;

    if (!newStatus) {
      return { recovered: false, note: `Remote status is '${remoteStatus.status}' — no update needed` };
    }

    let recovered = false;
    let idempotent = true;
    await withTransaction(async (conn) => {
      const locked = await paymentRepository.lockByGatewayRef(gatewayReference, conn);
      if (!locked) return;
      const result = await this._processPaymentOutcome(
        conn, locked, newStatus, gatewayReference, traceId, 'manual',
        remoteStatus.status, remoteStatus.success,
      );
      idempotent = result.idempotent;
      if (!idempotent) recovered = true;
    });

    log.info({ traceId, gatewayRef: gatewayReference, recovered, idempotent, initiatedBy }, 'Manual recovery completed');
    return {
      recovered,
      idempotent,
      gatewayReference,
      paymentStatus: newStatus,
      remoteStatus: remoteStatus.status,
    };
  }

  /**
   * Single unified method for processing a payment outcome.
   * Called by both webhook and sync. Runs inside an existing transaction
   * with FOR UPDATE lock already held on the payment row.
   *
   * ALL financial side effects (wallet credit, booking creation, order
   * confirmation, journal entry) happen within this same transaction.
   * If any step fails, the entire transaction rolls back.
   */
  private async _processPaymentOutcome(
    conn: mysql.PoolConnection,
    transaction: any,
    newStatus: 'paid' | 'failed',
    gatewayRef: string,
    traceId: string,
    source: 'webhook' | 'sync' | 'manual' | 'confirm',
    gatewayStatus?: string,
    payloadSuccess?: boolean,
  ): Promise<{ idempotent: boolean }> {
    // Idempotency: skip if already in a final state
    if (FINAL_STATES.has(transaction.payment_status)) {
      log.info({ traceId, txnId: transaction.id, status: transaction.payment_status, source }, 'Already final — idempotent skip');
      return { idempotent: true };
    }

    // Log every status change (BEFORE every UPDATE)
    log.info({
      traceId, source,
      txnId: transaction.id,
      orderId: transaction.order_id,
      oldStatus: transaction.payment_status,
      newStatus,
      gatewayStatus: gatewayStatus ?? null,
      gatewayRef,
    }, 'Payment status change');

    if (newStatus === 'failed') {
      log.warn({
        traceId, source,
        txnId: transaction.id,
        orderId: transaction.order_id,
        oldStatus: transaction.payment_status,
        newStatus,
        gatewayStatus: gatewayStatus ?? null,
        gatewayRef,
      }, 'Payment failed');
    }

    // Update payment status (safe conditional — only if still mutable)
    const [updateResult] = await conn.execute<mysql.ResultSetHeader>(
      `UPDATE payment_transactions
       SET payment_status = ?, paid_at = IF(? = 'paid', NOW(), paid_at), updated_at = NOW()
       WHERE id = ? AND payment_status NOT IN ('paid', 'failed', 'cancelled', 'expired', 'refunded')`,
      [newStatus, newStatus, transaction.id],
    );

    if (updateResult.affectedRows === 0) {
      // Another process beat us — idempotent exit
      log.info({ traceId, txnId: transaction.id, source }, 'Race condition — another process already updated status');
      return { idempotent: true };
    }

    // Fulfill business side-effects for successful payments
    if (newStatus === 'paid') {
      await this._fulfillPayment(conn, transaction, gatewayRef, traceId);
    }

    // Cancel/update booking when payment fails
    if (newStatus === 'failed' && transaction.booking_id) {
      if (transaction.reference_type === 'booking_intent') {
        await conn.execute(
          'UPDATE booking_intents SET intent_status = ?, failure_reason = ? WHERE id = ?',
          [newStatus, gatewayStatus || `Payment ${newStatus}`, transaction.booking_id],
        );
        await this._cancelPendingBooking(conn, transaction.booking_id, traceId);
      } else if (transaction.reference_type === 'booking') {
        await conn.execute(
          "UPDATE bookings SET booking_status = 'cancelled', payment_status = 'failed', updated_at = NOW() WHERE id = ? AND booking_status = 'pending'",
          [transaction.booking_id],
        );
      }
    }

    // Journal entry for this outcome
    await conn.execute(
      `INSERT INTO financial_journal_entries
        (entry_type, reference_type, reference_id, debit_account, credit_account, amount, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['payment', `gateway_${source}`, transaction.id,
       newStatus === 'paid' ? 'Cash' : 'Bad Debt',
       newStatus === 'paid' ? 'Revenue' : 'Cash',
       Number(transaction.amount),
       `${source}: ${gatewayRef} → ${newStatus}`],
    );

    log.info({ traceId, txnId: transaction.id, status: newStatus, source }, 'Payment outcome processed');

    return { idempotent: false };
  }

  /**
   * Immediate payment confirmation endpoint.
   * Verifies with Paymob, then runs _processPaymentOutcome (same as webhook).
   * Returns immediately if already confirmed (idempotent).
   */
  async confirmPayment(paymentId: number) {
    const totalStart = Date.now();
    const transaction = await paymentRepository.findById(paymentId);
    if (!transaction) throw new NotFoundError('Payment transaction');

    const traceId = (transaction as any).trace_id || randomUUID();

    const meta = {
      paymentId,
      gatewayReference: transaction.gateway_reference,
      orderId: (transaction as any).order_id,
      referenceType: (transaction as any).reference_type,
      paymentMethod: (transaction as any).payment_method,
      confirmationSource: 'confirm',
    } as Record<string, unknown>;

    // Already in a final paid state → idempotent success
    if ((transaction as any).payment_status === 'paid') {
      log.info({ ...meta, localStatus: 'paid', idempotent: true, totalDurationMs: Date.now() - totalStart }, 'Payment already confirmed — idempotent');
      return { confirmed: true, idempotent: true, paymentStatus: 'paid' };
    }

    log.info({ ...meta, localStatus: transaction.payment_status }, 'Payment confirmation requested');

    // ── Verify with Paymob (retry up to 10s for pending → paid transition) ──
    const verifyStart = Date.now();
    let remoteStatus: any;
    let paymobError: string | undefined;

    const RETRY_MS = 60_000;
    const POLL_INTERVAL = 1_000;

    while (Date.now() - verifyStart < RETRY_MS) {
      paymobError = undefined;
      remoteStatus = undefined;
      try {
        remoteStatus = await paymentGateway.getTransactionStatus(
          transaction.gateway_reference,
          (transaction as any).order_id,
        );
      } catch (err: unknown) {
        paymobError = err instanceof Error ? err.message : String(err);
      }

      if (paymobError || !remoteStatus) {
        log.error({ ...meta, error: paymobError, verificationDurationMs: Date.now() - verifyStart }, 'Paymob verification failed — will retry');
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        continue;
      }

      const s = remoteStatus.status || 'unknown';
      if (s === 'paid' || s === 'failed') break;

      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    }

    const verificationDurationMs = Date.now() - verifyStart;

    if (paymobError || !remoteStatus) {
      log.error({ ...meta, error: paymobError, verificationDurationMs, totalDurationMs: Date.now() - totalStart }, 'Paymob verification failed after retries');
      return { confirmed: false, paymentStatus: 'pending', error: paymobError, note: 'Failed to verify with Paymob — will rely on webhook' };
    }

    const paymobStatus = remoteStatus.status || 'unknown';

    if (paymobStatus === 'paid' || paymobStatus === 'failed') {
      const newStatus = paymobStatus === 'paid' ? 'paid' as const : 'failed' as const;

      let confirmed = false;
      let idempotent = false;
      let outcomeError: string | undefined;

      const txnStart = Date.now();
      try {
        await withTransaction(async (conn) => {
          const locked = await paymentRepository.lockById(paymentId, conn);
          if (!locked) return;
          const result = await this._processPaymentOutcome(
            conn, locked, newStatus, transaction.gateway_reference, traceId, 'confirm',
            paymobStatus, remoteStatus.success,
          );
          idempotent = result.idempotent;
          if (!idempotent) confirmed = true;
        });
      } catch (err: unknown) {
        outcomeError = err instanceof Error ? err.message : String(err);
      }
      // After fulfilling a booking_intent, the payment_transaction now has a booking_id.
      let bookingId: number | null = null;
      if (confirmed && newStatus === 'paid') {
        const updated = await paymentRepository.findById(paymentId);
        bookingId = (updated as any)?.booking_id || null;
      }

      const txnDurationMs = Date.now() - txnStart;
      const totalDurationMs = Date.now() - totalStart;

      log.info({
        ...meta,
        paymobStatus,
        localStatus: newStatus,
        idempotent,
        bookingId,
        confirmationSource: 'confirm',
        verificationDurationMs,
        txnDurationMs,
        totalDurationMs,
        finalStatus: newStatus,
        error: outcomeError || undefined,
      }, 'Payment confirmation processed');

      return {
        confirmed,
        idempotent,
        paymentStatus: newStatus,
        bookingId,
        paymobStatus,
        verificationDurationMs,
        totalDurationMs,
        error: outcomeError,
      };
    }

    // Paymob returned pending/unpaid
    const totalDurationMs = Date.now() - totalStart;
    log.info({
      ...meta,
      paymobStatus,
      localStatus: transaction.payment_status,
      idempotent: false,
      verificationDurationMs,
      totalDurationMs,
      finalStatus: transaction.payment_status,
    }, 'Payment not yet confirmed by Paymob — pending');

    return {
      confirmed: false,
      paymentStatus: paymobStatus,
      note: `Remote status is '${paymobStatus}' — not yet confirmed`,
      verificationDurationMs,
      totalDurationMs,
    };
  }

  /**
   * Get current payment status from DB.
   */
  async getPaymentStatus(paymentId: number) {
    const transaction = await paymentRepository.findById(paymentId);
    if (!transaction) throw new NotFoundError('Payment transaction');
    return {
      paymentId: (transaction as any).id,
      paymentStatus: (transaction as any).payment_status,
      referenceType: (transaction as any).reference_type,
      bookingId: (transaction as any).booking_id,
      orderId: (transaction as any).order_id,
      gatewayReference: (transaction as any).gateway_reference,
      updatedAt: (transaction as any).updated_at,
    };
  }

  /**
   * Route fulfillment logic by reference type.
   * ALL side effects happen within the same transaction as the payment status update.
   */
  private async _fulfillPayment(conn: mysql.PoolConnection, transaction: any, _gatewayRef: string, traceId: string): Promise<void> {
    const refType = transaction.reference_type;

    if (refType === 'order' && transaction.order_id) {
      await this._fulfillOrder(conn, transaction, traceId);
    } else if (refType === 'booking') {
      await this._fulfillBooking(conn, transaction, traceId);
    } else if (refType === 'booking_intent') {
      const intentId = transaction.booking_id;
      if (intentId) {
        await bookingService.fulfillBookingIntent(intentId, conn);
      }
    } else if (refType === 'wallet_topup') {
      await this._fulfillWalletTopup(conn, transaction, traceId);
    }
  }

  private async _fulfillBooking(conn: mysql.PoolConnection, transaction: any, traceId: string): Promise<void> {
    const bookingId = transaction.booking_id;
    if (!bookingId) {
      log.error({ traceId, txnId: transaction.id }, 'No booking on payment');
      return;
    }
    await confirmBooking(bookingId, { paymentStatus: 'paid', paymentMethod: 'card' }, conn);

    log.info({ traceId, bookingId }, 'Booking confirmed via webhook');
  }

  private async _fulfillOrder(conn: mysql.PoolConnection, transaction: any, traceId: string): Promise<void> {
    const [orderRows] = await conn.execute<RowData>(
      'SELECT buyer_id FROM orders WHERE id = ?', [transaction.order_id],
    );
    await conn.execute<mysql.ResultSetHeader>(
      "UPDATE orders SET status = 'confirmed', paid_at = NOW(), payment_status = 'paid' WHERE id = ? AND status = 'pending'",
      [transaction.order_id],
    );
    const buyerId = orderRows.length ? (orderRows[0] as any).buyer_id : null;
    if (buyerId) {
      await conn.execute('DELETE FROM cart_items WHERE user_id = ?', [buyerId]);
    }
    eventBus.emit('marketplace:order-confirmed', {
      orderId: transaction.order_id,
      userId: buyerId || (transaction as any).user_id || 0,
      sellerId: 0,
    });
    log.info({ traceId, orderId: transaction.order_id }, 'Order confirmed');
  }

  private async _cancelPendingBooking(_conn: mysql.PoolConnection, intentId: number, traceId: string): Promise<void> {
    // Under the payment-first architecture, no pending booking exists at this point
    // (the booking is only created after payment confirmation via webhook).
    // The booking_intent status is already updated by the caller.
    log.info({ traceId, intentId }, 'No pending booking to cancel (payment-first architecture)');
  }

  private async _fulfillWalletTopup(conn: mysql.PoolConnection, transaction: any, traceId: string): Promise<void> {
    const userId = transaction.user_id;
    const amount = Number(transaction.amount);
    const gatewayRef = transaction.gateway_reference;

    // Idempotency: prevent double-credit by checking wallet_transactions for this gateway_ref
    const [existing] = await conn.execute<RowData>(
      `SELECT id FROM wallet_transactions
       WHERE wallet_id = (SELECT id FROM user_wallets WHERE user_id = ?) AND transaction_type = 'deposit' AND description LIKE ?`,
      [userId, `%${gatewayRef}%`],
    );
    if (existing.length > 0) {
      log.info({ traceId, userId, gatewayRef }, 'Wallet already credited — idempotent skip');
      return;
    }

    const [wallets] = await conn.execute<RowData>(
      'SELECT * FROM user_wallets WHERE user_id = ? FOR UPDATE', [userId],
    );
    let wallet = wallets[0] as any;
    if (!wallet) {
      const [userRows] = await conn.execute<RowData>(
        `SELECT c.default_currency FROM users u JOIN countries c ON c.id = u.country_id WHERE u.id = ?`,
        [userId],
      );
      const currency = (userRows[0] as any)?.default_currency || 'EGP';
      const [ins] = await conn.execute<mysql.ResultSetHeader>(
        'INSERT INTO user_wallets (user_id, balance, currency_code) VALUES (?, ?, ?)',
        [userId, 0, currency],
      );
      wallet = { id: ins.insertId, balance: 0, user_id: userId };
    }

    const newBalance = Number(wallet.balance) + amount;
    await conn.execute(
      'UPDATE user_wallets SET balance = ?, version = version + 1, updated_at = NOW() WHERE id = ?',
      [newBalance, wallet.id],
    );

    await conn.execute(
      `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, direction, reference_type, description)
       VALUES (?, 'deposit', ?, 'credit', 'payment_gateway', ?)`,
      [wallet.id, amount, `Paymob top-up — ref ${gatewayRef}`],
    );

    log.info({ traceId, userId, amount, newBalance, gatewayRef }, 'Wallet credited');
  }

  /**
   * Refund a payment.
   */
  async refund(paymentId: number, amount: number, reason?: string) {
    const transaction = await paymentRepository.findById(paymentId);
    if (!transaction) throw new NotFoundError('Payment transaction');

    const traceId = (transaction as any).trace_id || randomUUID();

    const result = await paymentGateway.refund({
      transactionId: String(transaction.gateway_reference || transaction.id),
      amount,
      reason,
    });

    await refundPayment(paymentId, amount).catch((err: any) => log.error({ err, paymentId }, 'Failed to emit payment:refunded via saga'));

    await paymentRepository.createJournalEntry({
      entryType: 'refund',
      referenceType: 'payment',
      referenceId: paymentId,
      debitAccount: 'Refund Expense',
      creditAccount: 'Cash',
      amount,
      description: reason || `Refund of ${amount}`,
    });

    log.info({ traceId, paymentId, amount, reason }, 'Payment refunded');

    return result;
  }

  /**
   * Expire stale payments that exceeded the timeout.
   * Should be called by a scheduled job every ~2 minutes.
   */
  async expireStalePayments(timeoutMinutes: number = 15) {
    const payments = await paymentRepository.findPendingPayments(timeoutMinutes);
    if (payments.length === 0) return { expired: 0 };

    log.info({ count: payments.length, timeoutMinutes }, 'Starting payment expiry');

    let expired = 0;
    for (const ptx of payments as any[]) {
      try {
        await withTransaction(async (conn) => {
          await sagaExpirePayment(ptx.id, conn);
          if (ptx.booking_id) {
            if (ptx.reference_type === 'booking_intent') {
              await conn.execute(
                "UPDATE booking_intents SET intent_status = 'expired', expires_at = NOW() WHERE id = ? AND expires_at > NOW()",
                [ptx.booking_id],
              );
              await this._cancelPendingBooking(conn, ptx.booking_id, 'expiry-job');
            } else if (ptx.reference_type === 'booking') {
              await conn.execute(
                "UPDATE bookings SET booking_status = 'expired', payment_status = 'expired', updated_at = NOW() WHERE id = ? AND booking_status = 'pending'",
                [ptx.booking_id],
              );
            }
          }
          expired++;
          log.info({ txnId: ptx.id, gatewayRef: ptx.gateway_reference, created: ptx.created_at }, 'Payment expired');
        });
      } catch (err) {
        log.error({ err, txnId: ptx.id }, 'Failed to expire payment');
      }
    }

    log.info({ expired, total: payments.length }, 'Payment expiry complete');
    return { expired, total: payments.length };
  }

  async getTransactions(userId: number, page: number, limit: number) {
    return paymentRepository.findByUser(userId, page, limit);
  }
}

export const paymentService = new PaymentService();
