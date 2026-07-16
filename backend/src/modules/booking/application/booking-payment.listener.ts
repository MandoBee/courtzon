import { eventBus } from '../../../shared/event-bus/index.js';
import { bookingService } from './booking.service.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { getPool } from '../../../database/mysql.js';

const log = createModuleLogger('booking-payment-listener');

export function registerBookingPaymentListeners() {
  eventBus.on('payment:succeeded', async (data) => {
    if (data.referenceType !== 'booking_intent') return;
    const intentId = data.referenceId;
    if (!intentId) {
      log.error({ paymentId: data.paymentId }, 'Booking payment succeeded but no intentId');
      return;
    }
    log.info({ paymentId: data.paymentId, intentId }, 'Booking: payment succeeded — fulfilling intent');
    try {
      const result = await bookingService.fulfillBookingIntent(intentId);
      if (result.success) {
        log.info({ intentId, bookingId: result.booking?.id }, 'Booking intent fulfilled via payment succeeded event');
      }
    } catch (err) {
      log.error({ err, paymentId: data.paymentId, intentId }, 'Booking: fulfillBookingIntent failed on payment succeeded');
    }
  });

  eventBus.on('payment:failed-event', async (data) => {
    if (data.referenceType !== 'booking_intent') return;
    const intentId = data.referenceId;
    if (!intentId) return;
    log.info({ paymentId: data.paymentId, intentId, reason: data.reason }, 'Booking: payment failed — cancelling intent');
    try {
      await markIntentStatus(intentId, 'failed', data.reason || 'Payment failed');
    } catch (err) {
      log.error({ err, intentId }, 'Booking: failed to cancel intent on payment failed');
    }
  });

  eventBus.on('payment:cancelled-event', async (data) => {
    if (data.referenceType !== 'booking_intent') return;
    const intentId = data.referenceId;
    if (!intentId) return;
    log.info({ paymentId: data.paymentId, intentId }, 'Booking: payment cancelled — marking intent cancelled');
    try {
      await markIntentStatus(intentId, 'cancelled', 'Payment cancelled');
    } catch (err) {
      log.error({ err, intentId }, 'Booking: failed to mark intent cancelled');
    }
  });

  eventBus.on('payment:expired-event', async (data) => {
    if (data.referenceType !== 'booking_intent') return;
    const intentId = data.referenceId;
    if (!intentId) return;
    log.info({ paymentId: data.paymentId, intentId }, 'Booking: payment expired — marking intent expired');
    try {
      await markIntentStatus(intentId, 'expired', 'Payment expired');
    } catch (err) {
      log.error({ err, intentId }, 'Booking: failed to mark intent expired');
    }
  });

  log.info('Booking payment listeners registered');
}

async function markIntentStatus(intentId: number, status: string, failureReason: string) {
  const pool = getPool();
  await pool.execute(
    `UPDATE booking_intents SET intent_status = ?, failure_reason = ?, expires_at = NOW() WHERE id = ? AND intent_status NOT IN ('fulfilled', 'cancelled', 'expired', 'failed')`,
    [status, failureReason, intentId],
  );
}
