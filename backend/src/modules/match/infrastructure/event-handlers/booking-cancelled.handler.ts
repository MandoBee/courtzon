import { getPool } from '../../../../database/mysql.js';
import { matchService } from '../../application/services/match.service.js';
import { createModuleLogger } from '../../../../shared/utils/logger.js';

type RowData = import('mysql2').RowDataPacket[];

const log = createModuleLogger('booking-cancelled-handler');

export class BookingCancelledHandler {
  async handle(bookingId: number): Promise<void> {
    try {
      const pool = getPool();
      const [rows] = await pool.execute<RowData>(
        'SELECT id FROM matches WHERE booking_id = ?', [bookingId]
      );
      if (!rows.length) return;

      const matchId = (rows[0] as any).id;
      await matchService.cancelMatch(matchId, 'Booking cancelled');
      log.info({ bookingId, matchId }, 'Match cancelled due to booking cancellation');
    } catch (err) {
      log.error({ err, bookingId }, 'Failed to cancel match for cancelled booking');
    }
  }
}

export const bookingCancelledHandler = new BookingCancelledHandler();
