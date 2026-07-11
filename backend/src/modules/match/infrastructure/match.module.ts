import { eventBus } from '../../../shared/event-bus/index.js';
import { bookingConfirmedHandler } from './event-handlers/booking-confirmed.handler.js';
import { bookingCancelledHandler } from './event-handlers/booking-cancelled.handler.js';
import { paymentFailedHandler } from './event-handlers/payment-failed.handler.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('match-module');

export function startMatchModule(): void {
  eventBus.on('booking:confirmed', (data: any) => {
    if (data.bookingType === 'public_match') {
      bookingConfirmedHandler.handle(data.bookingId, data.bookingType).catch((err) =>
        log.error({ err, bookingId: data.bookingId }, 'BookingConfirmedHandler failed')
      );
    }
  });

  eventBus.on('booking:cancelled', (data: any) => {
    bookingCancelledHandler.handle(data.bookingId).catch((err) =>
      log.error({ err, bookingId: data.bookingId }, 'BookingCancelledHandler failed')
    );
  });

  eventBus.on('payment:failed', (data: any) => {
    if (data.bookingId) {
      paymentFailedHandler.handle(data.bookingId).catch((err) =>
        log.error({ err, bookingId: data.bookingId }, 'PaymentFailedHandler failed')
      );
    }
  });

  log.info('Match module event handlers registered');
}
