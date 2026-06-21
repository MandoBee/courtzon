import { paymentRepository } from '../infrastructure/repositories/payment.repository.js';
import { paymentGateway } from '../../../shared/services/gateway/gateway-factory.js';
import { walletService } from '../../wallet/application/wallet.service.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import type { ChargeInput } from '../presentation/payment.dto.js';
import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('payment-webhook');

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

    const paymentId = await paymentRepository.create({
      userId,
      bookingId: (input.referenceType === 'booking' || input.referenceType === 'booking_intent') ? input.referenceId : undefined,
      orderId: input.referenceType === 'order' ? input.referenceId : undefined,
      referenceType: input.referenceType,
      paymentMethod: input.paymentMethod,
      gatewayProvider: paymentGateway.provider,
      gatewayReference: paymentResult.gatewayReference || '',
      amount: input.amount,
      status: paymentResult.status,
    });

    return {
      success: paymentResult.success,
      paymentId,
      status: paymentResult.status,
      paymentUrl: paymentResult.paymentUrl,
      clientSecret: paymentResult.clientSecret,
      intentionId: paymentResult.intentionId,
      transactionId: paymentResult.transactionId,
    };
  }

  /**
   * Handle payment gateway webhook.
   */
  async handleWebhook(payload: unknown, signature: string) {
    const valid = await paymentGateway.verifyWebhook(payload, signature);
    if (!valid) {
      console.error('[webhook] HMAC verification failed — payload:', JSON.stringify(payload).slice(0, 500));
      throw new Error('Invalid webhook signature');
    }

    const data = payload as any;
    const obj = data.obj ?? data;
    const gatewayRef = String(obj.order?.id || data.order?.id || obj.id || '');
    if (!gatewayRef) {
      console.error('[webhook] Missing gateway reference — payload:', JSON.stringify(payload).slice(0, 500));
      throw new Error('Missing gateway reference');
    }

    const isSuccess = obj.success === true || obj.status === 'paid';

    log.info({
      webhookSource: data.obj ? 'intention' : 'accept',
      gatewayRef,
      success: isSuccess,
    });
    console.log('[webhook] received:', { gatewayRef, isSuccess, source: data.obj ? 'intention' : 'accept' });

    const transaction = await paymentRepository.findByGatewayRef(gatewayRef);
    if (!transaction) {
      console.error(`[webhook] Payment transaction not found for gatewayRef: ${gatewayRef}`);
      throw new NotFoundError('Payment transaction');
    }

    const newStatus = isSuccess ? 'paid' : 'failed';

    await paymentRepository.updateStatus(transaction.id, newStatus);

    if (isSuccess && transaction.reference_type === 'order' && transaction.order_id) {
      const pool = getPool();
      const [orderRows] = await pool.execute<any>(
        'SELECT buyer_id FROM orders WHERE id = ?',
        [transaction.order_id]
      );
      await pool.execute(
        "UPDATE orders SET status = 'confirmed', paid_at = NOW(), payment_status = 'paid' WHERE id = ? AND status = 'pending'",
        [transaction.order_id]
      );
      if (orderRows.length && orderRows[0]?.buyer_id) {
        await pool.execute('DELETE FROM cart_items WHERE user_id = ?', [orderRows[0].buyer_id]);
        console.log(`[webhook] Cleared cart for user ${orderRows[0].buyer_id}`);
      }
    }

    if (isSuccess && transaction.reference_type === 'booking_intent') {
      await this._fulfillBookingIntent(transaction);
    }

    if (isSuccess) {
      await paymentRepository.createJournalEntry({
        entryType: 'payment',
        referenceType: 'gateway_webhook',
        referenceId: transaction.id,
        debitAccount: 'Cash',
        creditAccount: 'Revenue',
        amount: Number(transaction.amount),
        description: `Gateway webhook: ${gatewayRef}`,
      });
    }

    return { success: isSuccess, transactionId: transaction.id, status: newStatus };
  }

  private async _fulfillBookingIntent(transaction: any): Promise<void> {
    const pool = getPool();
    const intentId = transaction.booking_id;
    if (!intentId) {
      console.error(`[webhook] No intent ID on payment transaction ${transaction.id}`);
      return;
    }

    const [intents] = await pool.execute<any>(
      'SELECT * FROM booking_intents WHERE id = ?',
      [intentId]
    );

    const intent = intents[0];
    if (!intent) {
      console.error(`[webhook] Booking intent #${intentId} not found for payment ${transaction.id}`);
      return;
    }

    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type,
        booking_date, start_time, end_time, total_amount, commission_amount, club_amount,
        booking_status, payment_status, notes, payment_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'paid', ?, ?)`,
      [
        require('crypto').randomUUID(), intent.user_id, intent.organisation_id, intent.branch_id,
        intent.resource_id, intent.booking_type, intent.booking_date, intent.start_time,
        intent.end_time, intent.total_amount, intent.commission_amount, intent.club_amount,
        intent.notes, intent.payment_method,
      ]
    );
    const bookingId = result.insertId;

    await pool.execute(
      'UPDATE payment_transactions SET booking_id = ?, reference_type = ? WHERE id = ?',
      [bookingId, 'booking', transaction.id]
    );

    await pool.execute('DELETE FROM booking_intents WHERE id = ?', [intent.id]);

    if (intent.matchmaking) {
      try {
        const mm = typeof intent.matchmaking === 'string' ? JSON.parse(intent.matchmaking) : intent.matchmaking;
        const { bookingRepository } = await import('../../booking/infrastructure/repositories/booking.repository.js');
        if (intent.booking_type === 'public_match') {
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
        console.error(`[webhook] Matchmaking setup failed for booking ${bookingId}:`, e);
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
      transactionId: String(transaction.id),
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
