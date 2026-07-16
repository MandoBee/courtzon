import { eventBus } from '../../../shared/event-bus/index.js';
import { bookingConfirmedHandler } from './event-handlers/booking-confirmed.handler.js';
import { bookingCancelledHandler } from './event-handlers/booking-cancelled.handler.js';
import { paymentFailedHandler } from './event-handlers/payment-failed.handler.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('match-module');

export function startMatchModule(): void {
  log.info('startMatchModule() called — registering event handlers');

  eventBus.on('booking:confirmed', (data: any) => {
    log.info({ event: 'booking:confirmed', bookingId: data.bookingId, bookingType: data.bookingType, userId: data.userId }, 'booking:confirmed event received by match module');
    if (data.bookingType === 'public_match') {
      log.info({ bookingId: data.bookingId }, 'booking:confirmed is public_match — calling BookingConfirmedHandler');
      bookingConfirmedHandler.handle(data.bookingId, data.bookingType).then((match) => {
        if (match) {
          log.info({ bookingId: data.bookingId, matchId: match.id }, 'Match created successfully from booking');
        } else {
          log.warn({ bookingId: data.bookingId }, 'createFromBooking returned null (match not created)');
        }
      }).catch((err) => {
        log.error({ err, bookingId: data.bookingId }, 'BookingConfirmedHandler threw');
      });
    } else {
      log.info({ bookingId: data.bookingId, bookingType: data.bookingType }, 'booking:confirmed is NOT public_match — skipping match creation');
    }
  });

  eventBus.on('booking:cancelled', (data: any) => {
    log.info({ event: 'booking:cancelled', bookingId: data.bookingId }, 'booking:cancelled event received');
    bookingCancelledHandler.handle(data.bookingId).catch((err) =>
      log.error({ err, bookingId: data.bookingId }, 'BookingCancelledHandler failed')
    );
  });

  eventBus.on('payment:failed-event', (data: any) => {
    if (data.referenceType === 'booking_intent' && data.referenceId) {
      log.info({ event: 'payment:failed-event', intentId: data.referenceId, reason: data.reason }, 'payment:failed-event received — cancelling match');
      paymentFailedHandler.handle(data.referenceId).catch((err) =>
        log.error({ err, intentId: data.referenceId }, 'PaymentFailedHandler failed')
      );
    }
  });

  log.info('Match module event handlers registered — ready to receive booking:confirmed');
}
