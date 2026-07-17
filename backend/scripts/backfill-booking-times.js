/**
 * One-time migration: backfill business_date, start_at_utc, end_at_utc
 * for legacy booking rows created before the TimeEngine was introduced.
 *
 * Uses the same TimeEngine logic as new bookings — guarantees identical behavior.
 *
 * Safe to run multiple times (idempotent — skips already-migrated rows).
 */
import { getPool } from '../database/mysql.js';
import { TimeEngine } from '../modules/time/index.js';
import { createModuleLogger } from '../shared/utils/logger.js';

const log = createModuleLogger('backfill-booking-times');

async function main() {
  const pool = getPool();

  // Step 1: Find all legacy bookings
  const [rows] = await pool.execute(
    `SELECT b.id, b.booking_date, b.start_time, b.end_time,
            b.branch_id, COALESCE(br.timezone, 'Africa/Cairo') as timezone
     FROM bookings b
     LEFT JOIN branches br ON br.id = b.branch_id
     WHERE b.business_date IS NULL OR b.start_at_utc IS NULL OR b.end_at_utc IS NULL
     ORDER BY b.id ASC`,
  );

  log.info({ total: rows.length }, 'Legacy bookings found');
  if (rows.length === 0) {
    log.info('No legacy bookings to migrate');
    return { migrated: 0, skipped: 0, total: 0 };
  }

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    const { id, booking_date: bookingDate, start_time: startTime, end_time: endTime, timezone: tz } = row;

    try {
      // Convert local times to UTC (same logic as createBooking)
      const startAtUtc = TimeEngine.localToUtc(bookingDate, startTime, tz);
      const endAtUtc = TimeEngine.localToUtc(bookingDate, endTime, tz);

      // Get branch operating hours for business date computation
      const [branchRows] = await pool.execute(
        `SELECT opening_time, closing_time FROM branches WHERE id = ?`,
        [row.branch_id],
      );
      const branchData = branchRows[0] || {};
      const opening = branchData.opening_time || '08:00';
      const closing = branchData.closing_time || '22:00';

      let endUtcToStore = endAtUtc;
      let businessDate;

      // For cross-midnight sessions (end time is before start time)
      if (endTime < startTime) {
        const [y, m, d] = bookingDate.split('-').map(Number);
        const next = new Date(Date.UTC(y, m - 1, d + 1));
        const nextDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
        endUtcToStore = TimeEngine.localToUtc(nextDate, endTime, tz);
        // Business date is the start date
        businessDate = TimeEngine.getBusinessDate(startAtUtc, '00:00', '23:59', tz);
      } else {
        businessDate = TimeEngine.getBusinessDate(startAtUtc, opening, closing, tz);
      }

      await pool.execute(
        `UPDATE bookings
         SET business_date = ?, start_at_utc = ?, end_at_utc = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          businessDate,
          String(startAtUtc).replace('T', ' ').replace(/\.\d+Z$/, ''),
          String(endUtcToStore).replace('T', ' ').replace(/\.\d+Z$/, ''),
          id,
        ],
      );

      migrated++;
      log.info({ bookingId: id, bookingDate, startTime, endTime, tz, businessDate }, 'Migrated');
    } catch (err) {
      log.warn({ bookingId: id, bookingDate, startTime, endTime, tz, error: err.message }, 'Skipped');
      skipped++;
    }
  }

  log.info({ migrated, skipped, total: rows.length }, 'Backfill complete');

  // Verify
  const [remaining] = await pool.execute(
    `SELECT COUNT(*) as cnt FROM bookings WHERE business_date IS NULL OR start_at_utc IS NULL OR end_at_utc IS NULL`,
  );
  log.info({ remainingLegacy: remaining[0].cnt }, 'Remaining legacy bookings');

  return { migrated, skipped, total: rows.length };
}

main()
  .then((result) => {
    console.log(JSON.stringify(result));
    process.exit(0);
  })
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
