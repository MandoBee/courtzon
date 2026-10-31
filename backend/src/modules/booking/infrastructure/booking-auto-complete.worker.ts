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

/** Maximum number of failing booking ids included in the batch summary log. */
const MAX_REPORTED_FAILED_IDS = 10;

export async function handleAutoCompleteBookings(): Promise<void> {
  const pool = getPool();

  // booking_type='tournament' rows are G8 NON-FINANCIAL court reservations —
  // they must never be auto-completed into the financial booking lifecycle
  // (which would emit booking:completed / notifications). Match progress is
  // owned by the tournament engine.
  const [candidates] = await pool.execute<any[]>(
    `SELECT id, user_id, organisation_id FROM bookings
     WHERE booking_status = 'confirmed'
       AND booking_type != 'tournament'
       AND CONCAT(booking_date, ' ', start_time) < NOW()`
  );

  // Successful and failed completions are tracked independently: the candidate
  // count is never reported as a success count.
  let succeeded = 0;
  let failed = 0;
  const failedBookingIds: number[] = [];

  for (const booking of candidates) {
    try {
      await completeBooking(booking.id);
      succeeded++;
    } catch (err) {
      failed++;
      if (failedBookingIds.length < MAX_REPORTED_FAILED_IDS) {
        failedBookingIds.push(booking.id);
      }
      log.error({ err, bookingId: booking.id }, 'Failed to auto-complete booking');
    }
  }

  if (succeeded > 0) {
    log.info(
      { completed: succeeded, failed, candidates: candidates.length },
      `Auto-completed ${succeeded} past bookings`,
    );
  }

  if (failed > 0) {
    log.warn(
      {
        failed,
        candidates: candidates.length,
        failedBookingIds,
        truncated: failed > failedBookingIds.length,
      },
      `Failed to auto-complete ${failed} of ${candidates.length} past bookings`,
    );
  }
}
