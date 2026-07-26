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
    const _lnStart = Date.now();
    const _lnTrace = (label: string, extra?: string) => {
      const now = Date.now();
      console.log(`[TRACE][BookingListener][+${now - _lnStart}ms][${new Date(now).toISOString()}] [payment:succeeded:${data.paymentId}] ${label}${extra ? ' ' + extra : ''}`);
    };
    _lnTrace('EVENT RECEIVED', `referenceType=${data.referenceType} referenceId=${data.referenceId} paymentId=${data.paymentId}`);
    console.log(`[FLOW] ▶ booking-payment-listener: payment:succeeded received refType=${data.referenceType} refId=${data.referenceId} paymentId=${data.paymentId}`);

    if (data.referenceType !== 'booking') {
      _lnTrace('EARLY RETURN', `reason=referenceType_mismatch got="${data.referenceType}" expected="booking"`);
      return;
    }
    _lnTrace('CHECK PASSED', `referenceType=booking`);

    const bookingId = data.referenceId;
    if (!bookingId) {
      _lnTrace('EARLY RETURN', `reason=bookingId_missing referenceId=${data.referenceId}`);
      log.error({ paymentId: data.paymentId }, 'Booking payment succeeded but no bookingId');
      return;
    }
    _lnTrace('CHECK PASSED', `bookingId=${bookingId}`);

    log.info({ paymentId: data.paymentId, bookingId }, 'Booking: payment succeeded — confirming booking');
    try {
      _lnTrace('LOADING BOOKING', `bookingId=${bookingId}`);
      const booking = await bookingRepository.findById(bookingId);
      _lnTrace('BOOKING LOADED', `found=${!!booking} bookingId=${bookingId}`);

      if (!booking) {
        _lnTrace('EARLY RETURN', `reason=booking_not_found bookingId=${bookingId}`);
        log.error({ bookingId }, 'Booking not found for payment succeeded');
        return;
      }
      _lnTrace('BOOKING FOUND', `booking_status=${booking.booking_status} aggregate_version=${booking.aggregate_version}`);

      if (booking.booking_status === 'confirmed') {
        _lnTrace('EARLY RETURN', `reason=already_confirmed bookingId=${bookingId} status=${booking.booking_status}`);
        log.info({ bookingId }, 'Booking already confirmed — idempotent skip');
        return;
      }

      if (booking.booking_status !== 'pending_payment' && booking.booking_status !== 'pending') {
        _lnTrace('EARLY RETURN', `reason=unexpected_status bookingId=${bookingId} status=${booking.booking_status} expected=pending_payment|pending`);
        log.warn({ bookingId, status: booking.booking_status }, 'Booking in unexpected status for payment confirmation');
        return;
      }
      _lnTrace('CHECK PASSED', `booking_status=${booking.booking_status} — valid for confirmation`);

      const confirmCommand: Command = {
        commandId: `ConfirmBooking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        commandType: 'ConfirmBooking',
        aggregateType: 'booking',
        aggregateId: String(bookingId),
        payload: { bookingId },
        correlationId: `corr_${Date.now()}`,
      };
      _lnTrace('DISPATCHING ConfirmBooking', `commandId=${confirmCommand.commandId} bookingId=${bookingId}`);
      console.log(`[FLOW] ▶ booking-payment-listener: Dispatching ConfirmBooking for booking #${bookingId}`);

      const confirmResult = await commandPipeline.execute(confirmCommand, {
        validate: async () => confirmBookingHandler.validate(confirmCommand),
        execute: async (cmd, conn) => confirmBookingHandler.execute(cmd, conn),
        events: (cmd, res) => confirmBookingHandler.events!(cmd, res),
      });

      _lnTrace('ConfirmBooking RETURNED', `status=${confirmResult.status} message=${(confirmResult as any).message || 'none'}`);

      if (confirmResult.status === 'error') {
        _lnTrace('ConfirmBooking FAILED', `status=error message=${confirmResult.message}`);
        throw new Error(`ConfirmBooking failed: ${confirmResult.message}`);
      }

      _lnTrace('ConfirmBooking COMPLETED', `status=${confirmResult.status}`);
      console.log(`[FLOW] ✓ booking-payment-listener: Booking #${bookingId} CONFIRMED via payment:succeeded`);
      log.info({ bookingId }, 'Booking confirmed via payment succeeded event');
    } catch (err: any) {
      _lnTrace('CAUGHT EXCEPTION', `error=${err?.message} stack=${err?.stack?.split('\n').slice(0, 5).join(' | ')}`);
      console.log(`[FLOW] ✗ booking-payment-listener: FAILED booking #${bookingId} error=${err?.message}`);
      console.log(`[TRACE][BookingListener][+${Date.now() - _lnStart}ms][${new Date().toISOString()}] [payment:succeeded:${data.paymentId}] STACK_TRACE: ${err?.stack}`);
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
