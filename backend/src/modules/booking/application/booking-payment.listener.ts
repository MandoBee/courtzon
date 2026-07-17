import { eventBus } from '../../../shared/event-bus/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { confirmBooking, cancelBooking } from '../../../platform/booking/BookingSaga.js';
import { CancellationReason } from '../../../platform/shared/booking-types.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';

const log = createModuleLogger('booking-payment-listener');

export function registerBookingPaymentListeners() {
  eventBus.on('payment:succeeded', async (data) => {
    if (data.referenceType !== 'booking') return;
    const bookingId = data.referenceId;
    if (!bookingId) {
      log.error({ paymentId: data.paymentId }, 'Booking payment succeeded but no bookingId');
      return;
    }
    log.info({ paymentId: data.paymentId, bookingId }, 'Booking: payment succeeded — confirming booking');
    try {
      const booking = await bookingRepository.findById(bookingId);
      if (!booking) {
        log.error({ bookingId }, 'Booking not found for payment succeeded');
        return;
      }
      if (booking.booking_status === 'confirmed') {
        log.info({ bookingId }, 'Booking already confirmed — idempotent skip');
        return;
      }
      if (booking.booking_status !== 'pending_payment' && booking.booking_status !== 'pending') {
        log.warn({ bookingId, status: booking.booking_status }, 'Booking in unexpected status for payment confirmation');
        return;
      }
      await confirmBooking(bookingId, {
        paymentStatus: 'paid',
        paymentMethod: booking.payment_method || 'card',
      });
      log.info({ bookingId }, 'Booking confirmed via payment succeeded event');
    } catch (err) {
      log.error({ err, paymentId: data.paymentId, bookingId }, 'Booking: confirmBooking failed on payment succeeded');
    }
  });

  eventBus.on('payment:failed-event', async (data) => {
    if (data.referenceType !== 'booking') return;
    const bookingId = data.referenceId;
    if (!bookingId) return;
    log.info({ paymentId: data.paymentId, bookingId, reason: data.reason }, 'Booking: payment failed — cancelling booking');
    try {
      const booking = await bookingRepository.findById(bookingId);
      if (!booking) return;
      if (booking.booking_status === 'cancelled' || booking.booking_status === 'expired') return;
      await cancelBooking(bookingId, 0, data.reason || CancellationReason.PAYMENT_DECLINED);
    } catch (err) {
      log.error({ err, bookingId }, 'Booking: cancelBooking failed on payment failed');
    }
  });

  eventBus.on('payment:cancelled-event', async (data) => {
    if (data.referenceType !== 'booking') return;
    const bookingId = data.referenceId;
    if (!bookingId) return;
    log.info({ paymentId: data.paymentId, bookingId }, 'Booking: payment cancelled — cancelling booking');
    try {
      const booking = await bookingRepository.findById(bookingId);
      if (!booking) return;
      if (booking.booking_status === 'cancelled' || booking.booking_status === 'expired') return;
      await cancelBooking(bookingId, 0, CancellationReason.PAYMENT_CANCELLED_BY_USER);
    } catch (err) {
      log.error({ err, bookingId }, 'Booking: cancelBooking failed on payment cancelled');
    }
  });

  eventBus.on('payment:expired-event', async (data) => {
    if (data.referenceType !== 'booking') return;
    const bookingId = data.referenceId;
    if (!bookingId) return;
    log.info({ paymentId: data.paymentId, bookingId }, 'Booking: payment expired — cancelling booking');
    try {
      const booking = await bookingRepository.findById(bookingId);
      if (!booking) return;
      if (booking.booking_status === 'cancelled' || booking.booking_status === 'expired') return;
      await cancelBooking(bookingId, 0, CancellationReason.PAYMENT_TIMEOUT);
    } catch (err) {
      log.error({ err, bookingId }, 'Booking: cancelBooking failed on payment expired');
    }
  });

  log.info('Booking payment listeners registered');
}
