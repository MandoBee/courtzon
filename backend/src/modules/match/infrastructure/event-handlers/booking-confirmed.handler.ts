import { matchService } from '../../application/services/match.service.js';
import type { Match } from '../../domain/match.entity.js';
import { createModuleLogger } from '../../../../shared/utils/logger.js';

const log = createModuleLogger('booking-confirmed-handler');

export class BookingConfirmedHandler {
  async handle(bookingId: number, bookingType: string): Promise<Match | null> {
    try {
      log.info({ bookingId, bookingType }, 'BookingConfirmedHandler.handle called');
      const match = await matchService.createFromBooking(bookingId, bookingType);
      if (match) {
        log.info({ bookingId, matchId: match.id }, 'Match created successfully');
      } else {
        log.warn({ bookingId }, 'createFromBooking returned null');
      }
      return match;
    } catch (err) {
      log.error({ err, bookingId }, 'BookingConfirmedHandler threw');
      return null;
    }
  }
}

export const bookingConfirmedHandler = new BookingConfirmedHandler();
