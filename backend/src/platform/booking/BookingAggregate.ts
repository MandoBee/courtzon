import type { BookingStatus } from '../shared/booking-types.js';
import { PlatformValidationError } from '../shared/errors.js';

const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['confirmed', 'cancelled', 'expired'],
  pending_payment: ['confirmed', 'cancelled', 'expired'],
  confirmed: ['completed', 'cancelled', 'cancelled_with_fee', 'checked_in', 'no_show'],
  checked_in: ['completed'],
  cancelled: [],
  cancelled_with_fee: [],
  no_show: [],
  completed: [],
  expired: [],
};

const TERMINAL_STATUSES: Set<BookingStatus> = new Set([
  'cancelled', 'cancelled_with_fee', 'no_show', 'completed', 'expired',
]);

export interface ConfirmContext {
  paymentStatus: string;
  paymentMethod?: string | null;
}

export class BookingAggregate {
  transition(
    currentStatus: BookingStatus,
    targetStatus: BookingStatus,
    context?: Record<string, unknown>,
  ): BookingStatus {
    this.validateTransition(currentStatus, targetStatus, context);
    return targetStatus;
  }

  confirm(currentStatus: BookingStatus, context?: ConfirmContext): BookingStatus {
    if (currentStatus !== 'pending' && currentStatus !== 'pending_payment') {
      throw new PlatformValidationError({
        message: `Cannot confirm booking in '${currentStatus}' status. Only pending or pending_payment bookings can be confirmed.`,
        details: { currentStatus, targetStatus: 'confirmed' },
        platform: 'booking',
      });
    }
    if (!context) {
      throw new PlatformValidationError({
        message: 'Confirmation context required: paymentStatus and paymentMethod.',
        platform: 'booking',
      });
    }
    const isPaid = context.paymentStatus === 'paid';
    const isCOD = context.paymentMethod === 'cash' || context.paymentMethod === 'cod';
    if (!isPaid && !isCOD) {
      throw new PlatformValidationError({
        message: `Cannot confirm booking with payment_status '${context.paymentStatus}'. Must be 'paid' or payment method must be cash/COD.`,
        details: { paymentStatus: context.paymentStatus, paymentMethod: context.paymentMethod },
        platform: 'booking',
      });
    }
    return 'confirmed';
  }

  cancel(currentStatus: BookingStatus): BookingStatus {
    return this.transition(currentStatus, 'cancelled');
  }

  expire(currentStatus: BookingStatus): BookingStatus {
    return this.transition(currentStatus, 'expired');
  }

  checkIn(currentStatus: BookingStatus): BookingStatus {
    if (currentStatus !== 'confirmed') {
      throw new PlatformValidationError({
        message: `Cannot check in booking in '${currentStatus}' status. Only confirmed bookings can be checked in.`,
        details: { currentStatus, targetStatus: 'checked_in' },
        platform: 'booking',
      });
    }
    return 'checked_in';
  }

  noShow(currentStatus: BookingStatus): BookingStatus {
    return this.transition(currentStatus, 'no_show');
  }

  complete(currentStatus: BookingStatus): BookingStatus {
    if (currentStatus !== 'confirmed' && currentStatus !== 'checked_in') {
      throw new PlatformValidationError({
        message: `Cannot complete booking in '${currentStatus}' status. Only confirmed or checked-in bookings can be completed.`,
        details: { currentStatus, targetStatus: 'completed' },
        platform: 'booking',
      });
    }
    return 'completed';
  }

  cancelWithFee(currentStatus: BookingStatus): BookingStatus {
    if (currentStatus !== 'confirmed') {
      throw new PlatformValidationError({
        message: `Cannot cancel with fee booking in '${currentStatus}' status. Only confirmed bookings can be cancelled with fee.`,
        details: { currentStatus, targetStatus: 'cancelled_with_fee' },
        platform: 'booking',
      });
    }
    return 'cancelled_with_fee';
  }

  private validateTransition(
    currentStatus: BookingStatus,
    targetStatus: BookingStatus,
    _context?: Record<string, unknown>,
  ): void {
    if (TERMINAL_STATUSES.has(currentStatus)) {
      throw new PlatformValidationError({
        message: `Booking is already in terminal status '${currentStatus}'. No further transitions allowed.`,
        details: { currentStatus, targetStatus },
        platform: 'booking',
      });
    }

    const allowed = ALLOWED_TRANSITIONS[currentStatus];
    if (!allowed.includes(targetStatus)) {
      throw new PlatformValidationError({
        message: `Transition from '${currentStatus}' to '${targetStatus}' is not allowed.`,
        details: {
          currentStatus,
          targetStatus,
          allowedTransitions: allowed,
        },
        platform: 'booking',
      });
    }
  }
}

export const bookingAggregate = new BookingAggregate();
