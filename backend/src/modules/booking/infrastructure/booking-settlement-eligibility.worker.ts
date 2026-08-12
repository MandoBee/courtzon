import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';

const log = createModuleLogger('booking-settlement-eligibility');

/**
 * Automatic booking settlement eligibility process.
 *
 * Identifies bookings whose service obligation has been fulfilled
 * (booking_status = 'completed' or 'checked_in') and whose payment has been
 * collected, but which still have unsettled economics. This does NOT transfer
 * money — it only exposes the booking as settlement-eligible (derived state)
 * and emits an informational event for observability.
 *
 * Actual settlement remains an explicit administrative action via the
 * BookingSettlementService / admin API.
 */
export async function handleBookingSettlementEligibility(): Promise<void> {
  const pool = getPool();

  const [rows] = await pool.execute<any[]>(
    `SELECT id, organisation_id
     FROM bookings
     WHERE booking_status IN ('completed', 'checked_in')
       AND payment_status IN ('paid', 'partially_refunded')
       AND (coach_amount > coach_settled_amount OR club_amount > org_settled_amount)`
  );

  let eligible = 0;
  for (const b of rows) {
    try {
      eventBusV2.emit('booking:settlement-eligible', {
        bookingId: b.id,
        organisationId: b.organisation_id,
      } as any);
      eligible++;
    } catch (err) {
      log.error({ err, bookingId: b.id }, 'Failed to emit settlement-eligible event');
    }
  }

  log.info({ eligible }, `Identified ${eligible} settlement-eligible bookings`);
}
