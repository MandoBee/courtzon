import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { paymentRepository } from '../infrastructure/repositories/payment.repository.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { planTransition, isFinal } from '../domain/payment-aggregate.js';
import type { Command, CommandHandler, CommandEvent } from '../../../shared/command/command-base.js';
import type { PaymentStatus } from '../domain/payment-aggregate.js';

const log = createModuleLogger('payment');

export interface ProcessPaymentPayload {
  paymentId: number;
}

export interface ProcessPaymentResult {
  paymentId: number;
  aggregateVersion?: number;
  /**
   * Canonical outcome metadata so the command can emit the same
   * payment:succeeded / payment:completed events that the card/wallet paths
   * emit via _processPaymentOutcome. Without these, the accounting listener
   * would have no way to post GL for chargeV2 flows (paid-without-GL gap).
   */
  referenceType?: string;
  referenceId?: number | null;
  amount?: number;
  paymentMethod?: string;
  currency?: string;
  userId?: number;
}

export const processPaymentHandler: CommandHandler<Command, ProcessPaymentResult> = {

  validate: async (command) => {
    const p = command.payload as unknown as ProcessPaymentPayload;
    if (!p.paymentId || p.paymentId <= 0) throw new Error('paymentId is required and must be positive');
  },

  execute: async (command, conn: PoolConnection) => {
    const p = command.payload as unknown as ProcessPaymentPayload;
    const payment = await paymentRepository.findById(p.paymentId);
    if (!payment) throw new NotFoundError('Payment');

    if (isFinal(payment.payment_status as PaymentStatus)) {
      log.warn({ paymentId: p.paymentId, status: payment.payment_status }, 'payment.already_final');
      return { paymentId: p.paymentId };
    }

    const transition = planTransition({
      fromStatus: payment.payment_status as PaymentStatus,
      toStatus: 'paid',
      currentVersion: payment.aggregate_version || 1,
    });

    await paymentRepository.persistTransition(p.paymentId, 'paid', undefined, payment.aggregate_version || 1, conn);
    log.info({ paymentId: p.paymentId, version: transition.newVersion }, 'payment.processed');

    return {
      paymentId: p.paymentId,
      aggregateVersion: transition.newVersion,
      referenceType: (payment as any).reference_type,
      // Same referenceId precedence as _processPaymentOutcome (payment.service).
      referenceId: (payment as any).reference_id || (payment as any).order_id || (payment as any).booking_id || null,
      amount: Number((payment as any).amount),
      paymentMethod: (payment as any).payment_method || 'card',
      currency: (payment as any).currency_code || 'EGP',
      userId: (payment as any).user_id,
    };
  },

  events: (command, result) => {
    const events: CommandEvent[] = [{
      eventName: 'payment.processed',
      payload: { paymentId: result.paymentId, aggregateVersion: result.aggregateVersion },
      context: {
        aggregateType: 'payment',
        aggregateId: String(result.paymentId),
        aggregateVersion: result.aggregateVersion || 1,
        correlationId: command.correlationId,
        causationId: command.commandId,
      },
    }];

    // ── Canonical accounting events (paid path) ──
    // Emit the SAME payment:succeeded / payment:completed events that the
    // card/wallet flows emit in _processPaymentOutcome, so the Accounting
    // Engine posts the correct GL for chargeV2 payments too. Without these, a
    // payment could become `paid` with no canonical accounting posting.
    if (result.referenceType && result.referenceId && result.amount) {
      events.push({
        eventName: 'payment:succeeded',
        payload: {
          paymentId: result.paymentId,
          referenceType: result.referenceType,
          referenceId: result.referenceId,
          amount: result.amount,
          metadata: {
            gatewayRef: '',
            userId: result.userId,
            paymentMethod: result.paymentMethod,
            currency: result.currency,
            gateway: 'v2_pipeline',
          },
        },
        context: {
          aggregateType: 'payment',
          aggregateId: String(result.paymentId),
          aggregateVersion: result.aggregateVersion || 1,
          correlationId: command.correlationId,
          causationId: command.commandId,
        },
      });
      events.push({
        eventName: 'payment:completed',
        payload: {
          paymentId: result.paymentId,
          userId: result.userId,
          amount: result.amount,
          currency: result.currency,
          gateway: 'v2_pipeline',
        },
        context: {
          aggregateType: 'payment',
          aggregateId: String(result.paymentId),
          aggregateVersion: result.aggregateVersion || 1,
          correlationId: command.correlationId,
          causationId: command.commandId,
        },
      });
    }

    return events;
  },
};