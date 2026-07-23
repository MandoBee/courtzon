import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { expireBooking } from '../../../platform/booking/BookingSaga.js';
import { CancellationReason } from '../../../platform/shared/booking-types.js';
import { isFeatureEnabled } from '../../../shared/utils/feature-flags.js';
import { commandPipeline } from '../../../shared/command/command-pipeline.js';
import { expireBookingHandler } from '../commands/expire-booking.command.js';
import type { CancelExpiredBookingsJob } from '../../../infrastructure/queue/queue.service.js';
import type { Command } from '../../../shared/command/command-base.js';

const log = createModuleLogger('booking-expiry');

async function expireViaV2(bookingId: number): Promise<void> {
  const command: Command = {
    commandId: `expire-booking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    commandType: 'ExpireBooking',
    aggregateType: 'booking',
    aggregateId: String(bookingId),
    payload: { bookingId },
  };

  const result = await commandPipeline.execute(command, {
    validate: async () => {},
    execute: async (cmd, conn) => expireBookingHandler.execute(cmd, conn),
    events: (cmd, res) => expireBookingHandler.events!(cmd, res),
  });

  if (result.status === 'error') {
    throw new Error(`ExpireBooking failed: ${result.message}`);
  }
}

export async function handleCancelExpiredBookings(job: CancelExpiredBookingsJob): Promise<void> {
  const pool = getPool();

  const [pendingPaymentBookings] = await pool.execute<any[]>(
    `SELECT id, user_id FROM bookings
     WHERE booking_status = 'pending_payment'
       AND expires_at IS NOT NULL AND expires_at < NOW()`,
  );

  for (const booking of pendingPaymentBookings) {
    try {
      if (isFeatureEnabled('BOOKING_V2_EXPIRE')) {
        await expireViaV2(booking.id);
      } else {
        await expireBooking(booking.id);
      }
      log.info({ bookingId: booking.id }, `Expired pending_payment booking #${booking.id}`);
    } catch (err) {
      log.error({ err, bookingId: booking.id }, 'Failed to expire pending_payment booking');
    }
  }

  log.info({
    expiredPendingPayment: pendingPaymentBookings.length,
  }, `Cleanup complete: ${pendingPaymentBookings.length} pending_payment bookings expired`);
}
