import { randomUUID } from 'node:crypto';
import { paymentRepository } from '../infrastructure/repositories/payment.repository.js';
import { paymentGateway } from '../../../shared/services/gateway/gateway-factory.js';
import { walletService } from '../../wallet/application/wallet.service.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { withTransaction } from '../../../database/database.transaction.js';
import type { ChargeInput } from '../presentation/payment.dto.js';
import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { getRedisClient } from '../../../infrastructure/redis/redis.client.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { commandPipeline } from '../../../shared/command/command-pipeline.js';
import { isFeatureEnabled } from '../../../shared/utils/feature-flags.js';
import { processPaymentHandler, type ProcessPaymentPayload } from '../commands/process-payment.command.js';
import type { Command } from '../../../shared/command/command-base.js';


const log = createModuleLogger('payment');

type RowData = mysql.RowDataPacket[];

const FINAL_STATES = new Set(['paid', 'failed', 'cancelled', 'expired', 'refunded']);

const PCI_SENSITIVE_FIELDS = new Set([
  'pan', 'card_number', 'cvv', 'cvv2', 'exp', 'expiry', 'expire',
  'source_data', 'card_holder', 'card_holder_name', 'billing_data',
  'first_6_digits', 'last_4_digits', 'bin', 'sub_brand',
]);

function sanitizeGatewayResponse(raw: unknown): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return sanitizeGatewayResponse(JSON.parse(raw)); } catch { return null; }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return raw as Record<string, any>;
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(raw as Record<string, any>)) {
    if (PCI_SENSITIVE_FIELDS.has(key.toLowerCase().replace(/_/g, '').replace(/-/g, ''))) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      cleaned[key] = sanitizeGatewayResponse(value);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}



export class PaymentService {
  async charge(userId: number, input: ChargeInput) {
    if (isFeatureEnabled('PAYMENT_V2_PROCESS')) {
      return this.chargeV2(userId, input);
    }

    if (input.paymentMethod === 'wallet') {
      return this.chargeByWallet(userId, input);
    }
    return this.chargeByGateway(userId, input);
  }

  private async chargeByWallet(userId: number, input: ChargeInput) {
    const traceId = randomUUID();
    const result = await walletService.withdraw(userId, input.amount, `${input.referenceType} #${input.referenceId}`);

    // Create payment as 'pending' first, then process through the same pipeline
    const { id: paymentId } = await paymentRepository.create({
      userId,
      bookingId: input.referenceType === 'booking' ? input.referenceId : undefined,
      orderId: input.referenceType === 'order' ? input.referenceId : undefined,
      referenceType: input.referenceType,
      paymentMethod: 'wallet',
      gatewayProvider: 'wallet_system',
      gatewayReference: `wallet_${Date.now()}`,
      amount: input.amount,
      status: 'pending',
      traceId,
    });

    // Process through the unified payment outcome pipeline
    await withTransaction(async (conn) => {
      const locked = await paymentRepository.lockById(paymentId, conn);
      if (!locked) throw new ConflictError('Payment locked by another process');

      await this._processPaymentOutcome(
        conn, locked, 'paid', `wallet_${paymentId}`, traceId, 'wallet',
      );
    });

    // Business-specific journal entry (payment outcome creates a generic one too)
    await paymentRepository.createJournalEntry({
      entryType: 'payment',
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      debitAccount: 'Cash',
      creditAccount: 'Revenue',
      amount: input.amount,
      description: `${input.referenceType} payment via wallet`,
    });

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
      bookingId: input.referenceType === 'booking' ? input.referenceId : undefined,
      orderId: input.referenceType === 'order' ? input.referenceId : undefined,
      referenceType: input.referenceType,
      paymentMethod: input.paymentMethod,
      gatewayProvider: paymentGateway.provider,
      gatewayReference: paymentResult.gatewayReference || '',
      amount: input.amount,
      currency: input.currency,
      status: 'pending',
      gatewayResponse: sanitizeGatewayResponse(paymentResult.rawResponse),
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
    const _whStart = Date.now();
    const _whTrace = (label: string, extra?: string) => {
      const now = Date.now();
      console.log(`[TRACE][Webhook][+${now - _whStart}ms][${new Date(now).toISOString()}] [handleWebhook] ${label}${extra ? ' ' + extra : ''}`);
    };
    _whTrace('ENTRY');
    console.log(`[FLOW] ▶ handleWebhook RECEIVED`);
    const valid = await paymentGateway.verifyWebhook(payload, signature);
    _whTrace('HMAC verified', `valid=${valid}`);
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

    // ── Replay protection (Redis-based dedup, 24h TTL) ────────────────
    // Non-blocking: if Redis is unavailable, webhook still processes
    const webhookId = obj.id || data.id || obj.merchant_order_id || obj.intention_id || data.transaction_id;
    if (webhookId) {
      try {
        const replayKey = `webhook:processed:${webhookId}`;
        const redis = getRedisClient();
        const alreadyProcessed = await redis.get(replayKey);
        if (alreadyProcessed) {
          log.info({ webhookId }, 'Duplicate webhook rejected (replay protection)');
          return { received: true, note: 'duplicate (replay protected)' };
        }
        await redis.set(replayKey, '1', 'EX', 86400);
      } catch (err) {
        log.warn({ err, webhookId }, 'Replay protection unavailable — processing webhook anyway');
      }
    }

    // ── Timestamp check (informational only — Paymob timestamps can     ─
    //    be older than 5 min due to delivery delays / retries)           ─
    const timestamp = obj.created_at || obj.timestamp || data.timestamp || data.created_at;
    if (timestamp) {
      const webhookTime = new Date(timestamp).getTime();
      const ageMs = Date.now() - webhookTime;
      if (Number.isNaN(webhookTime) || Math.abs(ageMs) > 5 * 60 * 1000) {
        log.warn({ webhookId, timestamp, ageMs }, 'Webhook timestamp outside 5min window — processing anyway');
      }
    }

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
      // Intention API: payment outcome is conveyed via boolean flags
      // (success + pending), NOT a string "status" field.
      if (obj.pending === true) {
        log.info({ possibleRefs, objSuccess: obj.success, objPending: obj.pending }, 'Intention API webhook: transaction still pending, ignoring');
        console.log(`[FLOW] ✗ handleWebhook: Intention API pending=true — ignored`);
        return { received: true, note: 'ignored' };
      }
      if (obj.success === true) {
        newStatus = 'paid';
      } else {
        newStatus = 'failed';
      }

      if (newStatus === 'failed') {
        log.warn({ possibleRefs, objSuccess: obj.success, objPending: obj.pending }, 'Intention webhook: payment failed');
      }
      console.log(`[FLOW] ▶ handleWebhook: Intention API success=${obj.success} pending=${obj.pending} → newStatus="${newStatus}"`);
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

    _whTrace('PAYMENT FOUND', `id=${(preCheck as any).id} payment_status=${(preCheck as any).payment_status} resolvedGatewayRef=${resolvedGatewayRef}`);

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
          const refId = transaction.order_id || transaction.booking_id || null;
          const eventName = newStatus === 'cancelled' ? 'payment:cancelled-event' as const : 'payment:expired-event' as const;
          await eventBusV2.emit(eventName, {
            paymentId: transaction.id,
            referenceType: transaction.reference_type,
            referenceId: refId,
            metadata: {
              userId: transaction.user_id,
              paymentMethod: transaction.payment_method,
            },
          }, undefined, conn);
        }
        return { idempotent: updateResult.affectedRows === 0 };
      });
      return result;
    }

    // --- paid / failed → full outcome processing ---
    console.log(`[FLOW] ▶ handleWebhook: Processing ${newStatus} via _processPaymentOutcome...`);
    _whTrace('ENTERING _processPaymentOutcome', `newStatus=${newStatus} gatewayRef=${resolvedGatewayRef}`);
    log.info({ gatewayRef: resolvedGatewayRef, newStatus, traceId }, 'PAYMENT PATH = WEBHOOK');
    const paidResult = await withTransaction(async (conn) => {
      const transaction = await paymentRepository.lockByGatewayRef(resolvedGatewayRef, conn);
      if (!transaction) throw new NotFoundError('Payment transaction');
      return this._processPaymentOutcome(
        conn, transaction, newStatus as 'paid' | 'failed',
        resolvedGatewayRef, traceId, 'webhook', obj.status, obj.success,
      );
    });

    // Events already emitted inside _processPaymentOutcome — no duplicate needed here.

    _whTrace('EXITING handleWebhook', `result.idempotent=${paidResult.idempotent}`);
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
   * Called by webhook, sync, manual recovery, and confirm paths.
   * Runs inside an existing transaction with FOR UPDATE lock
   * already held on the payment row.
   *
   * Updates the payment status and emits outcome events
   * (payment:succeeded/payment:failed-event + payment:completed/payment:failed).
   * Business modules handle their own fulfillment via event listeners.
   *
   * If any step fails, the entire transaction rolls back.
   */
  private async _processPaymentOutcome(
    conn: mysql.PoolConnection,
    transaction: any,
    newStatus: 'paid' | 'failed',
    gatewayRef: string,
    traceId: string,
    source: 'webhook' | 'sync' | 'manual' | 'confirm' | 'wallet',
    gatewayStatus?: string,
    payloadSuccess?: boolean,
  ): Promise<{ idempotent: boolean }> {
    const _opmStart = Date.now();
    // Idempotency: skip if already in a final state
    if (FINAL_STATES.has(transaction.payment_status)) {
      console.log(`[FLOW] ✗ _processPaymentOutcome: Already final "${transaction.payment_status}" — idempotent skip`);
      log.info({ traceId, txnId: transaction.id, status: transaction.payment_status, source }, 'Already final — idempotent skip');
      return { idempotent: true };
    }
    console.log(`[FLOW] ▶ _processPaymentOutcome: txn#${transaction.id} ${transaction.payment_status} → ${newStatus} (source=${source})`);
    {
      const _now = Date.now();
      console.log(`[TRACE][EventBus][+${_now - _opmStart}ms][${new Date(_now).toISOString()}] [_processPaymentOutcome:${transaction.id}] ENTRY source=${source} oldStatus=${transaction.payment_status} newStatus=${newStatus}`);
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
      {
        const _now = Date.now();
        console.log(`[TRACE][EventBus][+${_now - _opmStart}ms][${new Date(_now).toISOString()}] [_processPaymentOutcome:${transaction.id}] IDEMPOTENT SKIP (another process updated)`);
      }
      return { idempotent: true };
    }

    // ── SINGLE CANONICAL EMISSION POINT ──
    // Emit directly within the transaction (conn) so:
    //   1. published_events is written atomically with the status update
    //   2. emit()'s own onAfterCommit fires in-memory handlers (booking listener,
    //      notification engine, socket publisher) after commit — no nested hook nesting.
    const refId = transaction.order_id || transaction.booking_id || null;
    const commonMeta = {
      gatewayRef,
      userId: transaction.user_id,
      paymentMethod: transaction.payment_method,
      currency: transaction.currency_code || 'EGP',
      gateway: paymentGateway.provider,
    };
    if (newStatus === 'paid') {
      console.log(`[FLOW] ▶ _processPaymentOutcome: Emitting payment:succeeded + payment:completed (refType=${transaction.reference_type} refId=${refId})`);
      {
        const _now = Date.now();
        console.log(`[TRACE][EventBus][+${_now - _opmStart}ms][${new Date(_now).toISOString()}] [_processPaymentOutcome:${transaction.id}] DB_UPDATE_DONE affectedRows=${updateResult.affectedRows} → emitting payment:succeeded`);
      }
      await eventBusV2.emit('payment:succeeded', {
        paymentId: transaction.id,
        referenceType: transaction.reference_type,
        referenceId: refId,
        amount: Number(transaction.amount),
        metadata: commonMeta,
      }, undefined, conn);
      await eventBusV2.emit('payment:completed', {
        paymentId: transaction.id,
        userId: transaction.user_id,
        amount: Number(transaction.amount),
        currency: commonMeta.currency,
        gateway: commonMeta.gateway,
      }, undefined, conn);
      {
        const _now = Date.now();
        console.log(`[TRACE][EventBus][+${_now - _opmStart}ms][${new Date(_now).toISOString()}] [_processPaymentOutcome:${transaction.id}] payment:succeeded + payment:completed EMITTED (registered onAfterCommit hooks)`);
      }
    } else if (newStatus === 'failed') {
      await eventBusV2.emit('payment:failed-event', {
        paymentId: transaction.id,
        referenceType: transaction.reference_type,
        referenceId: refId,
        amount: Number(transaction.amount),
        reason: gatewayStatus || `Payment ${newStatus}`,
        metadata: commonMeta,
      }, undefined, conn);
      await eventBusV2.emit('payment:failed', {
        paymentId: transaction.id,
        userId: transaction.user_id,
        amount: Number(transaction.amount),
        currency: commonMeta.currency,
        error: gatewayStatus || `Payment ${newStatus}`,
      }, undefined, conn);
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
    {
      const _now = Date.now();
      console.log(`[TRACE][EventBus][+${_now - _opmStart}ms][${new Date(_now).toISOString()}] [_processPaymentOutcome:${transaction.id}] EXIT source=${source} status=${newStatus}`);
    }

    return { idempotent: false };
  }

  /**
   * Immediate payment confirmation endpoint.
   * Verifies with Paymob, then runs _processPaymentOutcome (same as webhook).
   * Returns immediately if already confirmed (idempotent).
   */
  async confirmPayment(paymentId: number) {
    const totalStart = Date.now();
    const _trace = (label: string, extra?: string) => {
      const now = Date.now();
      console.log(`[TRACE][HTTP][+${now - totalStart}ms][${new Date(now).toISOString()}] [confirmPayment:${paymentId}] ${label}${extra ? ' ' + extra : ''}`);
    };
    _trace('ENTRY');
    const transaction = await paymentRepository.findById(paymentId);
    if (!transaction) throw new NotFoundError('Payment transaction');

    _trace('DB.findById done', `payment_status=${(transaction as any).payment_status} gateway_ref=${(transaction as any).gateway_reference}`);
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
      _trace('FAST PATH: already paid → returning immediately');
      log.info({ ...meta, localStatus: 'paid', idempotent: true, totalDurationMs: Date.now() - totalStart }, 'Payment already confirmed — idempotent');
      return { confirmed: true, idempotent: true, paymentStatus: 'paid' };
    }

    log.info({ ...meta, localStatus: transaction.payment_status }, 'Payment confirmation requested');

    // ── Verify with Paymob (retry up to 60s for pending → paid transition) ──
    const RETRY_MS = 60_000;
    const POLL_INTERVAL = 1_000;
    _trace('ENTERING PAYMOB POLLING LOOP', `RETRY_MS=${RETRY_MS} POLL_INTERVAL=${POLL_INTERVAL}`);
    const verifyStart = Date.now();
    let remoteStatus: any;
    let paymobError: string | undefined;

    let _pollIteration = 0;

    while (Date.now() - verifyStart < RETRY_MS) {
      _pollIteration++;
      _trace(`POLL_ITERATION_${_pollIteration}`, `elapsed=${Date.now() - verifyStart}ms calling getTransactionStatus...`);
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
      _trace(`POLL_RESULT_${_pollIteration}`, `paymob_status="${s}" elapsed=${Date.now() - verifyStart}ms`);
      if (s === 'paid' || s === 'failed') { _trace(`POLL_LOOP_BREAK`, `status="${s}" after ${_pollIteration} iterations, ${Date.now() - verifyStart}ms total`); break; }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    }

    const verificationDurationMs = Date.now() - verifyStart;
    _trace('POLLING LOOP EXITED', `verificationDurationMs=${verificationDurationMs} paymobError=${paymobError || 'none'} remoteStatus=${remoteStatus?.status || 'null'}`);

    if (paymobError || !remoteStatus) {
      log.error({ ...meta, error: paymobError, verificationDurationMs, totalDurationMs: Date.now() - totalStart }, 'Paymob verification failed after retries');
      return { confirmed: false, paymentStatus: 'pending', error: paymobError, note: 'Failed to verify with Paymob — will rely on webhook' };
    }

    const paymobStatus = remoteStatus.status || 'unknown';
    console.log(`[FLOW] ▶ confirmPayment: Paymob status="${paymobStatus}"`);

    if (paymobStatus === 'paid' || paymobStatus === 'failed') {
      const newStatus = paymobStatus === 'paid' ? 'paid' as const : 'failed' as const;
      _trace('ENTERING _processPaymentOutcome', `newStatus=${newStatus}`);

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
      // After confirming the booking, the payment_transaction now has a booking_id.
      let bookingId: number | null = null;
      if (confirmed && newStatus === 'paid') {
        const updated = await paymentRepository.findById(paymentId);
        bookingId = (updated as any)?.booking_id || null;
      }

      const txnDurationMs = Date.now() - txnStart;
      const totalDurationMs = Date.now() - totalStart;
      _trace('EXITING confirmPayment', `confirmed=${confirmed} idempotent=${idempotent} totalDurationMs=${totalDurationMs} bookingId=${bookingId}`);

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

  // Fulfillment removed — PaymentService is now generic.
  // Business modules subscribe to payment:succeeded / payment:failed-event
  // to handle their own fulfillment.

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

    eventBusV2.emit('payment:refunded', { paymentId, amount, reason });

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
          await conn.execute(
            `UPDATE payment_transactions SET payment_status = 'expired', expired_at = NOW(), updated_at = NOW() WHERE id = ? AND payment_status NOT IN ('paid', 'failed', 'cancelled', 'expired', 'refunded')`,
            [ptx.id],
          );
          const refId = ptx.order_id || ptx.booking_id || null;
          await eventBusV2.emit('payment:expired-event', {
            paymentId: ptx.id,
            referenceType: ptx.reference_type,
            referenceId: refId,
            metadata: {
              userId: ptx.user_id,
              paymentMethod: ptx.payment_method,
            },
          }, undefined, conn);
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

  private async chargeV2(userId: number, input: ChargeInput) {
    const traceId = randomUUID();
    const { id: paymentId } = await paymentRepository.create({
      userId,
      bookingId: input.referenceType === 'booking' ? input.referenceId : undefined,
      orderId: input.referenceType === 'order' ? input.referenceId : undefined,
      referenceType: input.referenceType,
      paymentMethod: input.paymentMethod,
      gatewayProvider: 'v2_pipeline',
      gatewayReference: `v2_${Date.now()}`,
      amount: input.amount,
      status: 'pending',
      traceId,
    });

    const command: Command = {
      commandId: `process-payment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      commandType: 'ProcessPayment',
      aggregateType: 'payment',
      aggregateId: String(paymentId),
      payload: { paymentId } satisfies ProcessPaymentPayload,
      correlationId: traceId,
    };

    const result = await commandPipeline.execute(command, {
      validate: async () => {},
      execute: async (cmd, conn) => processPaymentHandler.execute(cmd, conn),
      events: (cmd, res) => processPaymentHandler.events!(cmd, res),
    });

    if (result.status === 'error') {
      throw new Error(`ProcessPayment failed: ${result.message}`);
    }

    return { paymentId, traceId, success: true, status: 'paid' };
  }

  /**
   * Create a Paymob payment intention directly via the gateway.
   * Used by the booking prepare flow which MUST return a clientSecret
   * for the frontend card widget. Bypasses V2 pipeline routing.
   */
  async createGatewayIntention(userId: number, input: ChargeInput) {
    const traceId = randomUUID();
    const paymentResult = await paymentGateway.charge({
      amount: input.amount,
      currency: input.currency,
      referenceId: input.referenceId,
      referenceType: input.referenceType,
      returnUrl: input.returnUrl,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      customerName: input.customerName,
    });

    if (!paymentResult.success) {
      return {
        success: false,
        traceId,
        paymentId: undefined,
        clientSecret: null,
        errorMessage: paymentResult.errorMessage,
      };
    }

    const { id: paymentId } = await paymentRepository.create({
      userId,
      bookingId: input.referenceType === 'booking' ? input.referenceId : undefined,
      orderId: input.referenceType === 'order' ? input.referenceId : undefined,
      referenceType: input.referenceType,
      paymentMethod: input.paymentMethod,
      gatewayProvider: paymentGateway.provider,
      gatewayReference: paymentResult.gatewayReference || '',
      amount: input.amount,
      currency: input.currency || 'EGP',
      status: 'pending',
      gatewayResponse: sanitizeGatewayResponse(paymentResult.rawResponse),
      traceId,
      idempotencyKey: input.idempotencyKey,
    });

    return {
      success: true,
      paymentId,
      traceId,
      clientSecret: paymentResult.clientSecret || null,
      intentionId: paymentResult.intentionId || null,
    };
  }

  async getTransactions(userId: number, page: number, limit: number) {
    return paymentRepository.findByUser(userId, page, limit);
  }
}

export const paymentService = new PaymentService();
