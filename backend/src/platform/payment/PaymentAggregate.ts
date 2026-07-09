import type { PaymentStatus } from '../shared/payment-types.js';
import { PlatformValidationError } from '../shared/errors.js';

const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  created: ['pending', 'cancelled'],
  pending: ['processing', 'paid', 'failed', 'expired', 'cancelled'],
  processing: ['paid', 'failed'],
  paid: ['refunded'],
  failed: [],
  cancelled: [],
  expired: [],
  refunded: [],
};

const TERMINAL_STATUSES: Set<PaymentStatus> = new Set([
  'failed', 'cancelled', 'expired', 'refunded',
]);

export interface PaymentContext {
  paidAmount?: number;
  refundAmount?: number;
  totalPaid?: number;
  gatewayReference?: string;
}

export class PaymentAggregate {
  transition(
    currentStatus: PaymentStatus,
    targetStatus: PaymentStatus,
    context?: PaymentContext,
  ): PaymentStatus {
    this.validateTransition(currentStatus, targetStatus, context);
    return targetStatus;
  }

  startProcessing(currentStatus: PaymentStatus): PaymentStatus {
    return this.transition(currentStatus, 'processing');
  }

  markPaid(currentStatus: PaymentStatus, context?: PaymentContext): PaymentStatus {
    if (currentStatus !== 'pending' && currentStatus !== 'processing') {
      throw new PlatformValidationError({
        message: `Cannot mark payment as paid from '${currentStatus}'. Only pending or processing payments can be marked paid.`,
        details: { currentStatus, targetStatus: 'paid' },
        platform: 'payment',
      });
    }
    if (!context?.gatewayReference) {
      throw new PlatformValidationError({
        message: 'Gateway reference is required to mark payment as paid.',
        platform: 'payment',
      });
    }
    if (!context?.paidAmount || context.paidAmount <= 0) {
      throw new PlatformValidationError({
        message: 'Paid amount must be greater than zero.',
        details: { paidAmount: context?.paidAmount },
        platform: 'payment',
      });
    }
    return 'paid';
  }

  markFailed(currentStatus: PaymentStatus): PaymentStatus {
    return this.transition(currentStatus, 'failed');
  }

  markCancelled(currentStatus: PaymentStatus): PaymentStatus {
    return this.transition(currentStatus, 'cancelled');
  }

  markExpired(currentStatus: PaymentStatus): PaymentStatus {
    return this.transition(currentStatus, 'expired');
  }

  refund(currentStatus: PaymentStatus, context?: PaymentContext): PaymentStatus {
    if (currentStatus !== 'paid') {
      throw new PlatformValidationError({
        message: `Cannot refund payment in '${currentStatus}' status. Only paid payments can be refunded.`,
        details: { currentStatus, targetStatus: 'refunded' },
        platform: 'payment',
      });
    }
    if (!context?.refundAmount || context.refundAmount <= 0) {
      throw new PlatformValidationError({
        message: 'Refund amount must be greater than zero.',
        details: { refundAmount: context?.refundAmount },
        platform: 'payment',
      });
    }
    return 'refunded';
  }

  partialRefund(currentStatus: PaymentStatus, context?: PaymentContext): PaymentStatus {
    if (currentStatus !== 'paid') {
      throw new PlatformValidationError({
        message: `Cannot partially refund payment in '${currentStatus}' status. Only paid payments can be refunded.`,
        details: { currentStatus },
        platform: 'payment',
      });
    }
    if (!context?.refundAmount || context.refundAmount <= 0) {
      throw new PlatformValidationError({
        message: 'Partial refund amount must be greater than zero.',
        details: { refundAmount: context?.refundAmount },
        platform: 'payment',
      });
    }
    if (context.totalPaid !== undefined && context.refundAmount > context.totalPaid) {
      throw new PlatformValidationError({
        message: `Partial refund amount (${context.refundAmount}) exceeds remaining balance (${context.totalPaid}).`,
        details: { refundAmount: context.refundAmount, totalPaid: context.totalPaid },
        platform: 'payment',
      });
    }
    return 'refunded';
  }

  private validateTransition(
    currentStatus: PaymentStatus,
    targetStatus: PaymentStatus,
    _context?: PaymentContext,
  ): void {
    if (TERMINAL_STATUSES.has(currentStatus)) {
      throw new PlatformValidationError({
        message: `Payment is already in terminal status '${currentStatus}'. No further transitions allowed.`,
        details: { currentStatus, targetStatus },
        platform: 'payment',
      });
    }

    const allowed = ALLOWED_TRANSITIONS[currentStatus];
    if (!allowed.includes(targetStatus)) {
      throw new PlatformValidationError({
        message: `Transition from '${currentStatus}' to '${targetStatus}' is not allowed.`,
        details: { currentStatus, targetStatus, allowedTransitions: allowed },
        platform: 'payment',
      });
    }
  }
}

export const paymentAggregate = new PaymentAggregate();
