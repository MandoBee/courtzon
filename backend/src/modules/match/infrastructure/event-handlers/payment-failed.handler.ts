import { getPool } from '../../../../database/mysql.js';
import { matchService } from '../../application/services/match.service.js';
import { createModuleLogger } from '../../../../shared/utils/logger.js';

type RowData = import('mysql2').RowDataPacket[];

const log = createModuleLogger('payment-failed-handler');

export class PaymentFailedHandler {
  async handle(bookingId: number): Promise<void> {
    try {
      const pool = getPool();
      const [rows] = await pool.execute<RowData>(
        'SELECT id FROM matches WHERE booking_id = ?', [bookingId]
      );
      if (!rows.length) return;

      const matchId = (rows[0] as any).id;
      await matchService.cancelMatch(matchId, 'Payment failed');
      log.info({ bookingId, matchId }, 'Match cancelled due to payment failure');
    } catch (err) {
      log.error({ err, bookingId }, 'Failed to cancel match for failed payment');
    }
  }
}

export const paymentFailedHandler = new PaymentFailedHandler();
