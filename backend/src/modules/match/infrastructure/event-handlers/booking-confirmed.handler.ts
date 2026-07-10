import { matchService } from '../../application/services/match.service.js';
import { createModuleLogger } from '../../../../shared/utils/logger.js';

const log = createModuleLogger('booking-confirmed-handler');

export class BookingConfirmedHandler {
  async handle(bookingId: number, bookingType: string): Promise<void> {
    try {
      const match = await matchService.createFromBooking(bookingId, bookingType);
      if (match) {
        log.info({ bookingId, matchId: match.id }, 'Match created from booking');
      }
    } catch (err) {
      log.error({ err, bookingId }, 'Failed to create match from booking');
    }
  }
}

export const bookingConfirmedHandler = new BookingConfirmedHandler();
