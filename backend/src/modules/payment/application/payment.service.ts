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

const log = createModuleLogger('payment');

type RowData = mysql.RowDataPacket[];

const FINAL_STATES = new Set(['paid', 'failed', 'cancelled', 'expired', 'refunded']);

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

    log.info({ traceId, userId, amount: input.amount, referenceType: input.referenceType, referenceId: input.referenceId }, 'Gateway charge initiated');

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
      log.error({ msg: 'HMAC verification failed' });
      throw new Error('Invalid webhook signature');
    }

    const data = payload as any;
    const isIntentionWebhook = !!data.obj;
    const obj = data.obj ?? data;

    const gatewayRef = String(obj.intention_order_id || obj.order?.id || data.order?.id || obj.id || '');
    if (!gatewayRef) {
      log.error({ msg: 'Missing gateway reference' });
      throw new Error('Missing gateway reference');
    }

    log.info({ webhookSource: isIntentionWebhook ? 'intention' : 'accept', gatewayRef, objStatus: obj.status });

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
        log.warn({ gatewayRef, objStatus: obj.status, objSuccess: obj.success }, 'Intention webhook: payment failed');
      }

      if (!newStatus) {
        log.info({ gatewayRef, status: obj.status }, 'Non-final webhook ignored');
        return { received: true, note: 'ignored' };
      }
    } else {
      // Accept API webhook: use success flag, but respect pending
      if (obj.success === true) {
        newStatus = 'paid';
      } else if (obj.pending === true) {
        log.info({ gatewayRef, objStatus: obj.status }, 'Accept API webhook: transaction still pending, ignoring');
        return { received: true, note: 'ignored' };
      } else {
        newStatus = 'failed';
      }

      if (newStatus === 'failed') {
        log.warn({ gatewayRef, objStatus: obj.status, objSuccess: obj.success }, 'Accept webhook: payment failed');
      }
    }

    // --- Pre-check: transaction must exist ---
    const preCheck = await paymentRepository.findByGatewayRef(gatewayRef);
    if (!preCheck) {
      log.error({ msg: 'Payment transaction not found', gatewayRef });
      throw new NotFoundError('Payment transaction');
    }

    const traceId = (preCheck as any).trace_id || '';

    // --- cancelled / expired → direct status update (no fulfillment) ---
    if (newStatus === 'cancelled' || newStatus === 'expired') {
      return withTransaction(async (conn) => {
        const transaction = await paymentRepository.lockByGatewayRef(gatewayRef, conn);
        if (!transaction) throw new NotFoundError('Payment transaction');
        const [updateResult] = await conn.execute<mysql.ResultSetHeader>(
          `UPDATE payment_transactions
           SET payment_status = ?, cancelled_at = NOW(), updated_at = NOW()
           WHERE id = ? AND payment_status NOT IN ('paid', 'failed', 'cancelled', 'expired', 'refunded')`,
          [newStatus, transaction.id],
        );
        if (updateResult.affectedRows > 0) {
          log.info({ traceId, txnId: transaction.id, status: newStatus }, 'Payment cancelled/expired via webhook');
        }
        return { idempotent: updateResult.affectedRows === 0 };
      });
    }

    // --- paid / failed → full outcome processing ---
    return withTransaction(async (conn) => {
      const transaction = await paymentRepository.lockByGatewayRef(gatewayRef, conn);
      if (!transaction) throw new NotFoundError('Payment transaction');
      return this._processPaymentOutcome(
        conn, transaction, newStatus as 'paid' | 'failed',
        gatewayRef, traceId, 'webhook', obj.status, obj.success,
      );
    });
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
   * Fulfill paid but unfulfilled booking intents — safety net for when the
   * user closes the browser before the frontend fulfill retry loop completes.
   * Called from the sync_pending_payments cron job.
   */
  async fulfillOrphanedBookingIntents() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT pt.id as txn_id, pt.booking_id as intent_id
       FROM payment_transactions pt
       WHERE pt.reference_type = 'booking_intent'
         AND pt.payment_status = 'paid'
         AND pt.updated_at < NOW() - INTERVAL 2 MINUTE
         AND EXISTS (SELECT 1 FROM booking_intents bi WHERE bi.id = pt.booking_id)
       ORDER BY pt.id`,
    );
    if (!rows.length) return { fulfilled: 0 };

    log.info({ count: rows.length }, 'Fulfilling orphaned booking intents');
    let fulfilled = 0;
    for (const row of rows as any[]) {
      try {
        const bookingService = await import('../../booking/application/booking.service.js');
        await bookingService.bookingService.fulfillBookingIntent(row.intent_id);
        fulfilled++;
      } catch (err) {
        log.error({ intentId: row.intent_id, error: String(err) }, 'Failed to fulfill orphaned intent');
      }
    }
    log.info({ fulfilled, total: rows.length }, 'Orphaned intent fulfillment complete');
    return { fulfilled, total: rows.length };
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
    source: 'webhook' | 'sync',
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
   * Route fulfillment logic by reference type.
   * ALL side effects happen within the same transaction as the payment status update.
   */
  private async _fulfillPayment(conn: mysql.PoolConnection, transaction: any, _gatewayRef: string, traceId: string): Promise<void> {
    const refType = transaction.reference_type;

    if (refType === 'order' && transaction.order_id) {
      await this._fulfillOrder(conn, transaction, traceId);
    } else if (refType === 'booking_intent') {
      // Booking intent fulfillment is handled by the frontend (POST /booking-intents/:intentId/fulfill)
      // to avoid race conditions. The webhook only marks payment_status = 'paid' here.
      // Paid but unfulfilled intents are cleaned up by the sync_pending_payments cron.
      log.info({ traceId, txnId: transaction.id }, 'Booking intent payment confirmed — awaiting frontend fulfillment');
    } else if (refType === 'wallet_topup') {
      await this._fulfillWalletTopup(conn, transaction, traceId);
    }
  }

  private async _fulfillOrder(conn: mysql.PoolConnection, transaction: any, traceId: string): Promise<void> {
    const [orderRows] = await conn.execute<RowData>(
      'SELECT buyer_id FROM orders WHERE id = ?', [transaction.order_id],
    );
    await conn.execute<mysql.ResultSetHeader>(
      "UPDATE orders SET status = 'confirmed', paid_at = NOW(), payment_status = 'paid' WHERE id = ? AND status = 'pending'",
      [transaction.order_id],
    );
    if (orderRows.length && (orderRows[0] as any)?.buyer_id) {
      await conn.execute('DELETE FROM cart_items WHERE user_id = ?', [(orderRows[0] as any).buyer_id]);
    }
    log.info({ traceId, orderId: transaction.order_id }, 'Order confirmed');
  }

  private async _fulfillBookingIntent(conn: mysql.PoolConnection, transaction: any, traceId: string): Promise<void> {
    const intentId = transaction.booking_id;
    if (!intentId) {
      log.error({ traceId, txnId: transaction.id }, 'No booking intent on payment');
      return;
    }
    const [intents] = await conn.execute<RowData>(
      'SELECT * FROM booking_intents WHERE id = ?', [intentId],
    );
    const intent = intents[0] as any;
    if (!intent) {
      log.error({ traceId, intentId }, 'Booking intent not found');
      return;
    }

    const [result] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type,
        booking_date, start_time, end_time, total_amount, commission_amount, club_amount,
        booking_status, payment_status, notes, payment_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'paid', ?, ?)`,
      [randomUUID(), intent.user_id, intent.organisation_id, intent.branch_id,
       intent.resource_id, intent.booking_type, intent.booking_date, intent.start_time,
       intent.end_time, intent.total_amount, intent.commission_amount, intent.club_amount,
       intent.notes, intent.payment_method],
    );
    const bookingId = result.insertId;

    await conn.execute(
      'UPDATE payment_transactions SET booking_id = ?, reference_type = ? WHERE id = ?',
      [bookingId, 'booking', transaction.id],
    );
    await conn.execute('DELETE FROM booking_intents WHERE id = ?', [intent.id]);

    if (intent.matchmaking) {
      try {
        const mm = typeof intent.matchmaking === 'string' ? JSON.parse(intent.matchmaking) : intent.matchmaking;
        if (intent.booking_type === 'public_match') {
          const { bookingRepository } = await import('../../booking/infrastructure/repositories/booking.repository.js');
          await bookingRepository.createMatchmakingRequest({
            bookingId, minAge: mm.minAge, maxAge: mm.maxAge,
            targetGender: mm.targetGender || 'any', targetLevelId: mm.targetLevelId,
            maxPlayers: mm.maxPlayers || 2, deadline: mm.deadline, autoApply: mm.autoApply || false,
          });
        }
      } catch (e) { log.error({ traceId, bookingId, error: String(e) }, 'Matchmaking setup failed'); }
    }
    log.info({ traceId, bookingId, intentId }, 'Booking confirmed');
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

    await paymentRepository.updateStatus(paymentId, 'refunded');

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
      const expired_ = await paymentRepository.expirePayment(ptx.id);
      if (expired_) {
        // Release booking intent if associated
        if (ptx.reference_type === 'booking_intent' && ptx.booking_id) {
          await getPool().execute(
            "UPDATE booking_intents SET expires_at = NOW() WHERE id = ? AND expires_at > NOW()",
            [ptx.booking_id],
          );
        }
        expired++;
        log.info({ txnId: ptx.id, gatewayRef: ptx.gateway_reference, created: ptx.created_at }, 'Payment expired');
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
