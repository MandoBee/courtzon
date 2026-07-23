import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { commandPipeline } from '../../../shared/command/command-pipeline.js';
import { confirmBookingHandler } from '../commands/confirm-booking.command.js';
import { cancelBookingHandler } from '../commands/cancel-booking.command.js';
import { CancellationReason } from '../../../platform/shared/booking-types.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import type { Command } from '../../../shared/command/command-base.js';

const log = createModuleLogger('booking-payment-listener');

export function registerBookingPaymentListeners() {
  eventBusV2.on('payment:succeeded', async (data) => {
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
      const confirmCommand: Command = {
        commandId: `ConfirmBooking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        commandType: 'ConfirmBooking',
        aggregateType: 'booking',
        aggregateId: String(bookingId),
        payload: { bookingId },
        correlationId: `corr_${Date.now()}`,
      };
      const confirmResult = await commandPipeline.execute(confirmCommand, {
        validate: async () => confirmBookingHandler.validate(confirmCommand),
        execute: async (cmd, conn) => confirmBookingHandler.execute(cmd, conn),
        events: (cmd, res) => confirmBookingHandler.events!(cmd, res),
      });
      if (confirmResult.status === 'error') throw new Error(`ConfirmBooking failed: ${confirmResult.message}`);
      log.info({ bookingId }, 'Booking confirmed via payment succeeded event');
    } catch (err) {
      log.error({ err, paymentId: data.paymentId, bookingId }, 'Booking: confirmBooking failed on payment succeeded');
    }
  });

  eventBusV2.on('payment:failed-event', async (data) => {
    if (data.referenceType !== 'booking') return;
    const bookingId = data.referenceId;
    if (!bookingId) return;
    log.info({ paymentId: data.paymentId, bookingId, reason: data.reason }, 'Booking: payment failed — cancelling booking');
    try {
      const booking = await bookingRepository.findById(bookingId);
      if (!booking) return;
      if (booking.booking_status === 'cancelled' || booking.booking_status === 'expired') return;
      const reason1 = data.reason || CancellationReason.PAYMENT_DECLINED;
      const cancelCmd1: Command = {
        commandId: `CancelBooking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        commandType: 'CancelBooking',
        aggregateType: 'booking',
        aggregateId: String(bookingId),
        payload: { bookingId, reason: reason1 },
        correlationId: `corr_${Date.now()}`,
      };
      const cancelRes1 = await commandPipeline.execute(cancelCmd1, {
        validate: async () => cancelBookingHandler.validate(cancelCmd1),
        execute: async (cmd, conn) => cancelBookingHandler.execute(cmd, conn),
        events: (cmd, res) => cancelBookingHandler.events!(cmd, res),
      });
      if (cancelRes1.status === 'error') throw new Error(`CancelBooking failed: ${cancelRes1.message}`);
    } catch (err) {
      log.error({ err, bookingId }, 'Booking: cancelBooking failed on payment failed');
    }
  });

  eventBusV2.on('payment:cancelled-event', async (data) => {
    if (data.referenceType !== 'booking') return;
    const bookingId = data.referenceId;
    if (!bookingId) return;
    log.info({ paymentId: data.paymentId, bookingId }, 'Booking: payment cancelled — cancelling booking');
    try {
      const booking = await bookingRepository.findById(bookingId);
      if (!booking) return;
      if (booking.booking_status === 'cancelled' || booking.booking_status === 'expired') return;
      const cancelCmd2: Command = {
        commandId: `CancelBooking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        commandType: 'CancelBooking',
        aggregateType: 'booking',
        aggregateId: String(bookingId),
        payload: { bookingId, reason: CancellationReason.PAYMENT_CANCELLED_BY_USER },
        correlationId: `corr_${Date.now()}`,
      };
      const cancelRes2 = await commandPipeline.execute(cancelCmd2, {
        validate: async () => cancelBookingHandler.validate(cancelCmd2),
        execute: async (cmd, conn) => cancelBookingHandler.execute(cmd, conn),
        events: (cmd, res) => cancelBookingHandler.events!(cmd, res),
      });
      if (cancelRes2.status === 'error') throw new Error(`CancelBooking failed: ${cancelRes2.message}`);
    } catch (err) {
      log.error({ err, bookingId }, 'Booking: cancelBooking failed on payment cancelled');
    }
  });

  eventBusV2.on('payment:expired-event', async (data) => {
    if (data.referenceType !== 'booking') return;
    const bookingId = data.referenceId;
    if (!bookingId) return;
    log.info({ paymentId: data.paymentId, bookingId }, 'Booking: payment expired — cancelling booking');
    try {
      const booking = await bookingRepository.findById(bookingId);
      if (!booking) return;
      if (booking.booking_status === 'cancelled' || booking.booking_status === 'expired') return;
      const cancelCmd3: Command = {
        commandId: `CancelBooking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        commandType: 'CancelBooking',
        aggregateType: 'booking',
        aggregateId: String(bookingId),
        payload: { bookingId, reason: CancellationReason.PAYMENT_TIMEOUT },
        correlationId: `corr_${Date.now()}`,
      };
      const cancelRes3 = await commandPipeline.execute(cancelCmd3, {
        validate: async () => cancelBookingHandler.validate(cancelCmd3),
        execute: async (cmd, conn) => cancelBookingHandler.execute(cmd, conn),
        events: (cmd, res) => cancelBookingHandler.events!(cmd, res),
      });
      if (cancelRes3.status === 'error') throw new Error(`CancelBooking failed: ${cancelRes3.message}`);
    } catch (err) {
      log.error({ err, bookingId }, 'Booking: cancelBooking failed on payment expired');
    }
  });

  log.info('Booking payment listeners registered');
}
