import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { commandPipeline } from '../../../shared/command/command-pipeline.js';
import { completeBookingHandler } from '../commands/complete-booking.command.js';
import type { Command } from '../../../shared/command/command-base.js';

const log = createModuleLogger('booking-auto-complete');

async function completeBooking(bookingId: number): Promise<void> {
  const command: Command = {
    commandId: `complete-booking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    commandType: 'CompleteBooking',
    aggregateType: 'booking',
    aggregateId: String(bookingId),
    payload: { bookingId },
  };
  const result = await commandPipeline.execute(command, {
    validate: async () => {},
    execute: async (cmd, conn) => completeBookingHandler.execute(cmd, conn),
    events: (cmd, res) => completeBookingHandler.events!(cmd, res),
  });
  if (result.status === 'error') throw new Error(`CompleteBooking failed: ${result.message}`);
}

export async function handleAutoCompleteBookings(): Promise<void> {
  const pool = getPool();

  const [completed] = await pool.execute<any[]>(
    `SELECT id, user_id, organisation_id FROM bookings
     WHERE booking_status = 'confirmed'
       AND CONCAT(booking_date, ' ', start_time) < NOW()`
  );

  for (const booking of completed) {
    try {
      await completeBooking(booking.id);
    } catch (err) {
      log.error({ err, bookingId: booking.id }, 'Failed to auto-complete booking');
    }
  }

  const affected = completed.length || 0;
  if (affected > 0) {
    log.info({ completed: affected }, `Auto-completed ${affected} past bookings`);
  }
}
