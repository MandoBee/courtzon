import { paymentRepository } from '../infrastructure/repositories/payment.repository.js';
import { paymentGateway } from '../../../shared/services/gateway/gateway-factory.js';
import { walletService } from '../../wallet/application/wallet.service.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { withTransaction } from '../../../database/database.transaction.js';
import type { ChargeInput } from '../presentation/payment.dto.js';
import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('payment-webhook');

type RowData = mysql.RowDataPacket[];

export class PaymentService {
  /**
   * Charge a payment using the specified method.
   * If method = 'wallet', deduct from user's wallet directly.
   * If method = 'card' or 'bank_transfer', redirect to payment gateway.
   */
  async charge(userId: number, input: ChargeInput) {
    if (input.paymentMethod === 'wallet') {
      return this.chargeByWallet(userId, input);
    }
    return this.chargeByGateway(userId, input);
  }

  private async chargeByWallet(userId: number, input: ChargeInput) {
    const result = await walletService.withdraw(userId, input.amount, `${input.referenceType} #${input.referenceId}`);

    const paymentId = await paymentRepository.create({
      userId,
      bookingId: input.referenceType === 'booking' ? input.referenceId : undefined,
      orderId: input.referenceType === 'order' ? input.referenceId : undefined,
      referenceType: input.referenceType,
      paymentMethod: 'wallet',
      gatewayProvider: 'wallet_system',
      gatewayReference: `wallet_${Date.now()}`,
      amount: input.amount,
      status: 'paid',
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

    return {
      success: true,
      paymentId,
      status: 'paid',
      balance: result.balance,
    };
  }

  private async chargeByGateway(userId: number, input: ChargeInput) {
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
      return {
        success: false,
        paymentId: undefined,
        status: paymentResult.status,
        paymentUrl: paymentResult.paymentUrl,
        clientSecret: paymentResult.clientSecret,
        intentionId: paymentResult.intentionId,
        transactionId: paymentResult.transactionId,
        errorMessage: paymentResult.errorMessage,
        rawResponse: paymentResult.rawResponse,
      };
    }

    const paymentId = await paymentRepository.create({
      userId,
      bookingId: (input.referenceType === 'booking' || input.referenceType === 'booking_intent') ? input.referenceId : undefined,
      orderId: input.referenceType === 'order' ? input.referenceId : undefined,
      referenceType: input.referenceType,
      paymentMethod: input.paymentMethod,
      gatewayProvider: paymentGateway.provider,
      gatewayReference: paymentResult.gatewayReference || '',
      amount: input.amount,
      currency: input.currency,
      status: paymentResult.status,
      gatewayResponse: paymentResult.rawResponse || null,
    });

    return {
      success: paymentResult.success,
      paymentId,
      status: paymentResult.status,
      paymentUrl: paymentResult.paymentUrl,
      clientSecret: paymentResult.clientSecret,
      intentionId: paymentResult.intentionId,
      transactionId: paymentResult.transactionId,
      rawResponse: paymentResult.rawResponse,
      errorMessage: paymentResult.errorMessage,
    };
  }

  /**
   * Handle payment gateway webhook (idempotent + transactional).
   */
  async handleWebhook(payload: unknown, signature: string) {
    const valid = await paymentGateway.verifyWebhook(payload, signature);
    if (!valid) {
      log.error({ msg: 'HMAC verification failed' });
      throw new Error('Invalid webhook signature');
    }

    const data = payload as any;
    const obj = data.obj ?? data;
    const gatewayRef = String(obj.order?.id || data.order?.id || obj.id || '');
    if (!gatewayRef) {
      log.error({ msg: 'Missing gateway reference' });
      throw new Error('Missing gateway reference');
    }

    const isSuccess = obj.success === true || obj.status === 'paid';

    log.info({
      webhookSource: data.obj ? 'intention' : 'accept',
      gatewayRef,
      success: isSuccess,
    });

    // Fast-path check before entering transaction
    const preCheck = await paymentRepository.findByGatewayRef(gatewayRef);
    if (!preCheck) {
      log.error({ msg: 'Payment transaction not found', gatewayRef });
      throw new NotFoundError('Payment transaction');
    }

    const newStatus = isSuccess ? 'paid' : 'failed';

    // ── Transactional fulfillment with FOR UPDATE lock ──
    return withTransaction(async (conn) => {
      // Lock the payment row to prevent duplicate webhook processing
      const transaction = await paymentRepository.lockByGatewayRef(gatewayRef, conn);
      if (!transaction) {
        throw new NotFoundError('Payment transaction');
      }

      // Idempotency: skip if already processed (checked under lock)
      if (transaction.payment_status === 'paid' || transaction.payment_status === 'refunded') {
        log.info({ msg: 'Webhook already processed', txnId: transaction.id, status: transaction.payment_status });
        return { success: true, transactionId: transaction.id, status: transaction.payment_status, idempotent: true };
      }

      // Update payment status
      await conn.execute(
        'UPDATE payment_transactions SET payment_status = ?, paid_at = IF(? = "paid", NOW(), paid_at) WHERE id = ?',
        [newStatus, newStatus, transaction.id],
      );

      if (isSuccess && transaction.reference_type === 'order' && transaction.order_id) {
        const [orderRows] = await conn.execute<RowData>(
          'SELECT buyer_id FROM orders WHERE id = ?',
          [transaction.order_id],
        );
        await conn.execute(
          "UPDATE orders SET status = 'confirmed', paid_at = NOW(), payment_status = 'paid' WHERE id = ? AND status = 'pending'",
          [transaction.order_id],
        );
        if (orderRows.length && (orderRows[0] as any)?.buyer_id) {
          await conn.execute('DELETE FROM cart_items WHERE user_id = ?', [(orderRows[0] as any).buyer_id]);
          log.info({ msg: 'Cart cleared', userId: (orderRows[0] as any).buyer_id });
        }
      }

      if (isSuccess && transaction.reference_type === 'booking_intent') {
        await this._fulfillBookingIntent(conn, transaction);
      }

      if (isSuccess) {
        await conn.execute(
          `INSERT INTO financial_journal_entries (entry_type, reference_type, reference_id, debit_account, credit_account, amount, description)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ['payment', 'gateway_webhook', transaction.id, 'Cash', 'Revenue',
           Number(transaction.amount), `Gateway webhook: ${gatewayRef}`],
        );
      }

      return { success: isSuccess, transactionId: transaction.id, status: newStatus };
    });
  }

  private async _fulfillBookingIntent(conn: mysql.PoolConnection, transaction: any): Promise<void> {
    const intentId = transaction.booking_id;
    if (!intentId) {
      log.error({ msg: 'No intent ID on payment transaction', txnId: transaction.id });
      return;
    }

    const [intents] = await conn.execute<RowData>(
      'SELECT * FROM booking_intents WHERE id = ?',
      [intentId],
    );

    const intent = intents[0] as any;
    if (!intent) {
      log.error({ msg: 'Booking intent not found', intentId, txnId: transaction.id });
      return;
    }

    const [result] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type,
        booking_date, start_time, end_time, total_amount, commission_amount, club_amount,
        booking_status, payment_status, notes, payment_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'paid', ?, ?)`,
      [
        require('crypto').randomUUID(), intent.user_id, intent.organisation_id, intent.branch_id,
        intent.resource_id, intent.booking_type, intent.booking_date, intent.start_time,
        intent.end_time, intent.total_amount, intent.commission_amount, intent.club_amount,
        intent.notes, intent.payment_method,
      ],
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
            bookingId,
            minAge: mm.minAge,
            maxAge: mm.maxAge,
            targetGender: mm.targetGender || 'any',
            targetLevelId: mm.targetLevelId,
            maxPlayers: mm.maxPlayers || 2,
            deadline: mm.deadline,
            autoApply: mm.autoApply || false,
          });
        }
      } catch (e) {
        log.error({ msg: 'Matchmaking setup failed', bookingId, error: String(e) });
      }
    }

    log.info({ bookingId, intentId: intent.id }, `Booking #${bookingId} created from intent #${intent.id}`);
  }

  /**
   * Refund a payment.
   */
  async refund(paymentId: number, amount: number, reason?: string) {
    const transaction = await paymentRepository.findById(paymentId);
    if (!transaction) throw new NotFoundError('Payment transaction');

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

    return result;
  }

  async getTransactions(userId: number, page: number, limit: number) {
    return paymentRepository.findByUser(userId, page, limit);
  }
}

export const paymentService = new PaymentService();
