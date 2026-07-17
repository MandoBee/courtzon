import { getPool } from './dist/database/mysql.js';
import { TimeEngine } from './dist/modules/time/index.js';
import { createModuleLogger } from './dist/shared/utils/logger.js';

const log = createModuleLogger('backfill');

async function main() {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT b.id, b.booking_date, b.start_time, b.end_time,
            b.branch_id, COALESCE(br.timezone, 'Africa/Cairo') as timezone
     FROM bookings b
     LEFT JOIN branches br ON br.id = b.branch_id
     WHERE b.business_date IS NULL OR b.start_at_utc IS NULL OR b.end_at_utc IS NULL
     ORDER BY b.id ASC`,
  );
  log.info({ total: rows.length }, 'Legacy bookings found');
  if (rows.length === 0) { log.info('None to migrate'); return { migrated: 0, skipped: 0 }; }

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    const { id, booking_date: rawBd, start_time: st, end_time: et, timezone: tz } = row;
    const bd = rawBd instanceof Date ? rawBd.toISOString().slice(0, 10) : String(rawBd).slice(0, 10);
    const stStr = st instanceof Date ? `${String(st.getHours()).padStart(2,'0')}:${String(st.getMinutes()).padStart(2,'0')}` : String(st).slice(0, 5);
    const etStr = et instanceof Date ? `${String(et.getHours()).padStart(2,'0')}:${String(et.getMinutes()).padStart(2,'0')}` : String(et).slice(0, 5);
    try {
      const startAtUtc = TimeEngine.localToUtc(bd, stStr, tz);
      const endAtUtc = TimeEngine.localToUtc(bd, etStr, tz);
      const [brRows] = await pool.execute(
        'SELECT opening_time, closing_time FROM branches WHERE id = ?', [row.branch_id],
      );
      const bd2 = brRows[0] || {};
      const opening = bd2.opening_time || '08:00';
      const closing = bd2.closing_time || '22:00';

      let endUtcStore = endAtUtc;
      let businessDate;

      if (etStr < stStr) {
        const [y, m, d] = bd.split('-').map(Number);
        const nxt = new Date(Date.UTC(y, m - 1, d + 1));
        const nd = `${nxt.getUTCFullYear()}-${String(nxt.getUTCMonth() + 1).padStart(2, '0')}-${String(nxt.getUTCDate()).padStart(2, '0')}`;
        endUtcStore = TimeEngine.localToUtc(nd, et, tz);
        businessDate = TimeEngine.getBusinessDate(startAtUtc, '00:00', '23:59', tz);
      } else {
        businessDate = TimeEngine.getBusinessDate(startAtUtc, opening, closing, tz);
      }

      await pool.execute(
        `UPDATE bookings SET business_date = ?, start_at_utc = ?, end_at_utc = ?, updated_at = NOW() WHERE id = ?`,
        [
          businessDate,
          String(startAtUtc).replace('T', ' ').replace(/\.\d+Z$/, ''),
          String(endUtcStore).replace('T', ' ').replace(/\.\d+Z$/, ''),
          id,
        ],
      );
      migrated++;
      log.info({ bookingId: id, bd, st, et, tz, businessDate }, 'Migrated');
    } catch (err) {
      log.warn({ bookingId: id, bd, st, et, tz, error: err.message }, 'Skipped');
      skipped++;
    }
  }

  log.info({ migrated, skipped }, 'Backfill complete');
  const [rem] = await pool.execute(
    'SELECT COUNT(*) as cnt FROM bookings WHERE business_date IS NULL OR start_at_utc IS NULL OR end_at_utc IS NULL',
  );
  log.info({ remaining: rem[0].cnt }, 'Remaining legacy bookings');
  return { migrated, skipped };
}

main()
  .then((r) => { console.log(JSON.stringify(r)); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
