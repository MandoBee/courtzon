import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { paymentRepository } from '../infrastructure/repositories/payment.repository.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { planTransition, isFinal } from '../domain/payment-aggregate.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';
import type { PaymentStatus } from '../domain/payment-aggregate.js';

const log = createModuleLogger('payment');

export interface ProcessPaymentPayload {
  paymentId: number;
}

export interface ProcessPaymentResult {
  paymentId: number;
  aggregateVersion?: number;
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
    return { paymentId: p.paymentId, aggregateVersion: transition.newVersion };
  },

  events: (command, result) => [{
    eventName: 'payment.processed',
    payload: { paymentId: result.paymentId, aggregateVersion: result.aggregateVersion },
    context: {
      aggregateType: 'payment',
      aggregateId: String(result.paymentId),
      aggregateVersion: result.aggregateVersion || 1,
      correlationId: command.correlationId,
      causationId: command.commandId,
    },
  }],
};
