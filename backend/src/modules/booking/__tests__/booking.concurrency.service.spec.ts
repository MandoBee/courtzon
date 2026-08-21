import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

// ── Service-layer booking concurrency tests ─────────────────────────────
// These exercise the REAL booking creation service flow (createBooking → V2
// command pipeline → checkSlotAvailability + insert) against the Docker MySQL
// development database (port 3307), with the application pool + Redis pointed
// at the same environment. No raw INSERTs as the primary proof.

let pool: mysql.Pool;
let bookingService: any;

async function cleanupFixtures(exec: (sql: string, params?: any[]) => Promise<any>) {
  await exec(`DELETE FROM booking_cancellations WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ${TEST_USER})`);
  await exec(`DELETE FROM booking_participants WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ${TEST_USER})`);
  await exec(`DELETE FROM booking_slots WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ${TEST_USER})`);
  await exec(`DELETE FROM bookings WHERE user_id = ${TEST_USER}`);
  await exec(`DELETE FROM resources WHERE id = ${TEST_RESOURCE}`);
  await exec(`DELETE FROM branches WHERE id = ${TEST_BRANCH}`);
  await exec(`DELETE FROM tax_rates WHERE organisation_id = ${TEST_ORG} AND org_scope = 'gd-fixture'`);
  await exec(`DELETE FROM organisations WHERE id = ${TEST_ORG}`);
  await exec(`DELETE FROM user_wallets WHERE user_id = ${TEST_USER}`);
  await exec(`DELETE FROM users WHERE id = ${TEST_USER}`);
}

const TEST_USER = 999991;
const TEST_ORG = 999991;
const TEST_BRANCH = 999991;
const TEST_RESOURCE = 999991;

async function cleanDate(date: string): Promise<void> {
  await pool.execute(
    `DELETE bs FROM booking_slots bs
     JOIN bookings b ON b.id = bs.booking_id
     WHERE b.user_id = ${TEST_USER} AND b.booking_date = ?`, [date]);
  await pool.execute(
    `DELETE pc FROM booking_cancellations pc
     JOIN bookings b ON b.id = pc.booking_id
     WHERE b.user_id = ${TEST_USER} AND b.booking_date = ?`, [date]);
  await pool.execute(
    `DELETE FROM bookings WHERE user_id = ${TEST_USER} AND booking_date = ?`, [date]);
}

async function createBooking(userId: number, branchId: number, resourceId: number, date: string, start: string, end: string) {
  return bookingService.createBooking({
    branchId,
    resourceId,
    bookingType: 'private_match',
    bookingDate: date,
    startTime: start,
    endTime: end,
    paymentMethod: 'cash',
  }, userId);
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6379';
  process.env.REDIS_DB = '0';
  process.env.REDIS_PASSWORD = '';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = 'courtzon2026';
  process.env.DB_NAME = 'courtzon_v3';
  process.env.ENABLE_API_DOCS = 'false';

  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });

  // Clean up leftovers from prior runs
  await cleanupFixtures(async (sql, params) => pool.execute(sql, params));

  // User + wallet
  await pool.execute(`INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
    VALUES (${TEST_USER}, UUID(), 1, '01299999991', '+201299999991', 'test-conc-svc@test.com', '$2b$10$test', 'Conc Svc User', 'male', 'active')`);
  await pool.execute(`INSERT INTO user_wallets (user_id, balance, currency_code, version) VALUES (${TEST_USER}, 9999999, 'EGP', 1)`);

  // Org + branch + resource
  await pool.execute(`INSERT IGNORE INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
    VALUES (${TEST_ORG}, UUID(), 1, ${TEST_USER}, 'Test Conc Org', 'test-conc-org', TRUE)`);
  // Org-specific tax rate owned by this fixture (prevents cross-test FK
  // interference from other suites that delete global tax_rates mid-run).
  await pool.execute(`INSERT IGNORE INTO tax_rates (organisation_id, name, rate, type, tax_category, org_scope, is_active, is_global)
    VALUES (${TEST_ORG}, 'GD Fixture VAT', 0, 'percentage', 'vat', 'gd-fixture', 1, 0)`);
  await pool.execute(`INSERT IGNORE INTO branches (id, public_id, organisation_id, name, slug, timezone, opening_time, closing_time)
    VALUES (${TEST_BRANCH}, UUID(), ${TEST_ORG}, 'Test Conc Branch', 'test-conc-branch', 'Africa/Cairo', '08:00:00', '22:00:00')`);
  const [sports] = await pool.execute<any[]>(`SELECT id FROM sports WHERE deleted_at IS NULL ORDER BY id LIMIT 1`);
  const sportId = sports[0]?.id ?? 19;
  const [rIns] = await pool.execute<any[]>(`INSERT IGNORE INTO resources (id, public_id, branch_id, resource_type_id, name, sport_id, hourly_price, opening_time, closing_time, is_active, slot_duration, max_bookings_per_slot)
    VALUES (${TEST_RESOURCE}, UUID(), ${TEST_BRANCH}, 1, 'Test Conc Court', ${sportId}, 50, '08:00:00', '22:00:00', TRUE, 60, 1)`);
  if ((rIns as any).affectedRows !== 1) {
    const [chk] = await pool.execute<any[]>(`SELECT id FROM resources WHERE id = ${TEST_RESOURCE}`);
    if (!chk.length) throw new Error('Fixture resource insert failed (affectedRows != 1)');
  }

  // Verify fixtures exist via raw pool
  const [rCheck] = await pool.execute<any[]>(`SELECT id FROM resources WHERE id = ${TEST_RESOURCE} AND is_active = TRUE`);
  if (!rCheck.length) throw new Error('Fixture resource not visible through raw pool');

  // Point the application pool at Docker MySQL and import the booking service.
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });

  const mod = await import('../application/booking.service.js');
  bookingService = mod.bookingService;

  // Verify the service's own pool sees the fixtures (same DB).
  const { getPool } = await import('../../../database/mysql.js');
  const [dbRow] = await getPool().execute<any[]>('SELECT DATABASE() as db');
  if (dbRow[0]?.db !== 'courtzon_v3') throw new Error(`Service pool on wrong db: ${dbRow[0]?.db}`);
  const [svcCheck] = await getPool().execute<any[]>(`SELECT id FROM resources WHERE id = ${TEST_RESOURCE} AND is_active = TRUE`);
  if (!svcCheck.length) throw new Error('Fixture resource not visible through service pool');
}, 60000);

afterAll(async () => {
  await pool.execute(`DELETE FROM booking_cancellations WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ${TEST_USER})`);
  await pool.execute(`DELETE FROM booking_participants WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ${TEST_USER})`);
  await pool.execute(`DELETE FROM booking_slots WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ${TEST_USER})`);
  await pool.execute(`DELETE FROM bookings WHERE user_id = ${TEST_USER}`);
  await pool.execute(`DELETE FROM resources WHERE id = ${TEST_RESOURCE}`);
  await pool.execute(`DELETE FROM branches WHERE id = ${TEST_BRANCH}`);
  await pool.execute(`DELETE FROM tax_rates WHERE organisation_id = ${TEST_ORG} AND org_scope = 'gd-fixture'`);
  await pool.execute(`DELETE FROM organisations WHERE id = ${TEST_ORG}`);
  await pool.execute(`DELETE FROM user_wallets WHERE user_id = ${TEST_USER}`);
  await pool.execute(`DELETE FROM users WHERE id = ${TEST_USER}`);
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 30000);

describe('Booking service-layer concurrency', () => {

  it('TEST 1 — identical concurrent requests: exactly one succeeds, one conflicts, one blocking booking', async () => {
    const date = '2027-11-01';
    await cleanDate(date);
    const results = await Promise.allSettled([
      createBooking(TEST_USER, TEST_BRANCH, TEST_RESOURCE, date, '10:00', '11:00'),
      createBooking(TEST_USER, TEST_BRANCH, TEST_RESOURCE, date, '10:00', '11:00'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    // The loser must surface the application conflict (HTTP 409), not a raw
    // database error — verifies BKG-500 in the real concurrent service flow.
    const loser = rejected[0] as PromiseRejectedResult;
    expect((loser.reason as any)?.statusCode).toBe(409);
    expect(String((loser.reason as any)?.message ?? '')).toMatch(/available|booked|Conflict/i);

    const [rows] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt FROM bookings
       WHERE user_id = ${TEST_USER} AND booking_date = ? AND booking_status NOT IN ('cancelled','expired','no_show')`,
      [date],
    );
    expect(rows[0].cnt).toBe(1);
  });

  it('TEST 2 — partial overlap race (10:00-11:00 vs 10:30-11:30): exactly one succeeds', async () => {
    const date = '2027-11-02';
    await cleanDate(date);
    const results = await Promise.allSettled([
      createBooking(TEST_USER, TEST_BRANCH, TEST_RESOURCE, date, '10:00', '11:00'),
      createBooking(TEST_USER, TEST_BRANCH, TEST_RESOURCE, date, '10:30', '11:30'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const [rows] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt FROM bookings
       WHERE user_id = ${TEST_USER} AND booking_date = ? AND booking_status NOT IN ('cancelled','expired','no_show')`,
      [date],
    );
    expect(rows[0].cnt).toBe(1);
  });

  it('TEST 3 — non-overlapping concurrent bookings (10:00-11:00 vs 11:00-12:00): both succeed', async () => {
    const date = '2027-11-03';
    await cleanDate(date);
    const results = await Promise.allSettled([
      createBooking(TEST_USER, TEST_BRANCH, TEST_RESOURCE, date, '10:00', '11:00'),
      createBooking(TEST_USER, TEST_BRANCH, TEST_RESOURCE, date, '11:00', '12:00'),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(2);
    const [rows] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt FROM bookings
       WHERE user_id = ${TEST_USER} AND booking_date = ? AND booking_status NOT IN ('cancelled','expired','no_show')`,
      [date],
    );
    expect(rows[0].cnt).toBe(2);
  });

  it('TEST 4 — database duplicate is normalized to a ConflictError (HTTP 409 semantics)', async () => {
    const date = '2027-11-04';
    await cleanDate(date);
    // First booking occupies the slot.
    await createBooking(TEST_USER, TEST_BRANCH, TEST_RESOURCE, date, '14:00', '15:00');
    // A second attempt on the exact same start_time hits uq_booking_slot /
    // availability and must raise the application ConflictError.
    await expect(
      createBooking(TEST_USER, TEST_BRANCH, TEST_RESOURCE, date, '14:00', '15:00'),
    ).rejects.toMatchObject({ statusCode: 409 });

    const [rows] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt FROM bookings WHERE user_id = ${TEST_USER} AND booking_date = ?`,
      [date],
    );
    expect(rows[0].cnt).toBe(1);
  });

  it('TEST 5 — data integrity after concurrent runs: no duplicate blocking bookings, no orphans', async () => {
    const date = '2027-11-05';
    await cleanDate(date);
    // Three concurrent attempts: 09:00-10:00, 09:30-10:30 (overlaps first),
    // 10:00-11:00 (adjacent to first). Depending on the race order, either the
    // adjacent pair or the overlapping single may win — so the count is not
    // fixed. The invariants that MUST hold: every blocking booking overlaps
    // none of the others, and no orphan segments exist.
    const results = await Promise.allSettled([
      createBooking(TEST_USER, TEST_BRANCH, TEST_RESOURCE, date, '09:00', '10:00'),
      createBooking(TEST_USER, TEST_BRANCH, TEST_RESOURCE, date, '09:30', '10:30'),
      createBooking(TEST_USER, TEST_BRANCH, TEST_RESOURCE, date, '10:00', '11:00'),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    // At least one must succeed; the fulfilled count must match the persisted count.
    expect(ok).toBeGreaterThanOrEqual(1);

    const [bookings] = await pool.execute<any[]>(
      `SELECT id, start_time, end_time, booking_status FROM bookings
       WHERE user_id = ${TEST_USER} AND booking_date = ? AND booking_status NOT IN ('cancelled','expired','no_show')
       ORDER BY start_time`, [date],
    );
    expect(bookings.length).toBe(ok);

    // No two blocking bookings may overlap.
    for (let i = 1; i < bookings.length; i++) {
      const prev = bookings[i - 1];
      const cur = bookings[i];
      const overlaps = cur.start_time < prev.end_time && prev.start_time < cur.end_time;
      expect(overlaps).toBe(false);
    }
    // No orphan slot segments.
    const [slots] = await pool.execute<any[]>(
      `SELECT bs.id FROM booking_slots bs
       LEFT JOIN bookings b ON b.id = bs.booking_id
       WHERE bs.booking_id IN (SELECT id FROM bookings WHERE user_id = ${TEST_USER} AND booking_date = ?) AND b.id IS NULL`, [date]);
    expect(slots.length).toBe(0);
  });

});

describe('Group D — booking history preservation / terminal rebooking', () => {

  async function createBookingRow(date: string, start: string, end: string, status: string): Promise<number> {
    const [r] = await pool.execute<any[]>(
      `INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type,
         booking_date, business_date, start_time, end_time, start_at_utc, end_at_utc,
         total_amount, booking_status, payment_status, payment_method)
       VALUES (UUID(), ${TEST_USER}, ${TEST_ORG}, ${TEST_BRANCH}, ${TEST_RESOURCE}, 'private_match',
         ?, ?, ?, ?, TIMESTAMP(?), TIMESTAMP(?),
         100, ?, 'paid', 'cash')`,
      [date, date, start, end, `${date} ${start}:00`, `${date} ${end}:00`, status],
    );
    return (r as any).insertId;
  }

  async function rebookSameSlot(date: string, start: string, end: string) {
    return bookingService.createBooking({
      branchId: TEST_BRANCH,
      resourceId: TEST_RESOURCE,
      bookingType: 'private_match',
      bookingDate: date,
      startTime: start,
      endTime: end,
      paymentMethod: 'cash',
    }, TEST_USER);
  }

  it('TEST 1 — cancelled booking remains in DB after a new booking for the same slot is created', async () => {
    const date = '2027-12-01';
    await cleanDate(date);
    const oldId = await createBookingRow(date, '10:00', '11:00', 'cancelled');

    const result = await rebookSameSlot(date, '10:00', '11:00');

    // Old terminal booking preserved.
    const [oldRows] = await pool.execute<any[]>(`SELECT booking_status FROM bookings WHERE id = ?`, [oldId]);
    expect(oldRows[0].booking_status).toBe('cancelled');
    // New booking exists.
    const [newRows] = await pool.execute<any[]>(`SELECT COUNT(*) as cnt FROM bookings WHERE id = ?`, [result.bookingId]);
    expect(newRows[0].cnt).toBe(1);
    // Total = 2 (old + new), nothing deleted.
    const [total] = await pool.execute<any[]>(`SELECT COUNT(*) as cnt FROM bookings WHERE user_id = ${TEST_USER} AND booking_date = ?`, [date]);
    expect(total[0].cnt).toBe(2);
  });

  it('TEST 2 — expired booking remains in DB after same-slot rebooking', async () => {
    const date = '2027-12-02';
    await cleanDate(date);
    const oldId = await createBookingRow(date, '10:00', '11:00', 'expired');
    const result = await rebookSameSlot(date, '10:00', '11:00');

    const [oldRows] = await pool.execute<any[]>(`SELECT booking_status FROM bookings WHERE id = ?`, [oldId]);
    expect(oldRows[0].booking_status).toBe('expired');
    const [newRows] = await pool.execute<any[]>(`SELECT COUNT(*) as cnt FROM bookings WHERE id = ?`, [result.bookingId]);
    expect(newRows[0].cnt).toBe(1);
    const [total] = await pool.execute<any[]>(`SELECT COUNT(*) as cnt FROM bookings WHERE user_id = ${TEST_USER} AND booking_date = ?`, [date]);
    expect(total[0].cnt).toBe(2);
  });

  it('TEST 3 — no-show booking remains in DB after same-slot rebooking', async () => {
    const date = '2027-12-03';
    await cleanDate(date);
    const oldId = await createBookingRow(date, '10:00', '11:00', 'no_show');
    const result = await rebookSameSlot(date, '10:00', '11:00');

    const [oldRows] = await pool.execute<any[]>(`SELECT booking_status FROM bookings WHERE id = ?`, [oldId]);
    expect(oldRows[0].booking_status).toBe('no_show');
    const [total] = await pool.execute<any[]>(`SELECT COUNT(*) as cnt FROM bookings WHERE user_id = ${TEST_USER} AND booking_date = ?`, [date]);
    expect(total[0].cnt).toBe(2);
    expect(result.bookingId).toBeGreaterThan(0);
  });

  it('TEST 4 — concurrent rebooking after a terminal booking: one new booking wins, loser 409, old terminal remains', async () => {
    const date = '2027-12-04';
    await cleanDate(date);
    const oldId = await createBookingRow(date, '10:00', '11:00', 'cancelled');

    const results = await Promise.allSettled([
      rebookSameSlot(date, '10:00', '11:00'),
      rebookSameSlot(date, '10:00', '11:00'),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    const loser = rejected[0] as PromiseRejectedResult;
    expect((loser.reason as any)?.statusCode).toBe(409);

    // Old terminal booking still present + exactly one new active booking.
    const [oldRows] = await pool.execute<any[]>(`SELECT booking_status FROM bookings WHERE id = ?`, [oldId]);
    expect(oldRows[0].booking_status).toBe('cancelled');
    const [active] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt FROM bookings WHERE user_id = ${TEST_USER} AND booking_date = ? AND booking_status NOT IN ('cancelled','expired','no_show')`, [date]);
    expect(active[0].cnt).toBe(1);
  });

  it('TEST 5 — partial-overlap concurrency after a terminal booking: only non-overlapping booking commits', async () => {
    const date = '2027-12-05';
    await cleanDate(date);
    const oldId = await createBookingRow(date, '10:00', '11:00', 'expired');

    // 10:00-11:00 and 10:30-11:30 overlap → only one may commit.
    const results = await Promise.allSettled([
      rebookSameSlot(date, '10:00', '11:00'),
      rebookSameSlot(date, '10:30', '11:30'),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    const loser = rejected[0] as PromiseRejectedResult;
    expect((loser.reason as any)?.statusCode).toBe(409);

    // Old terminal preserved; only one new active booking.
    const [oldRows] = await pool.execute<any[]>(`SELECT booking_status FROM bookings WHERE id = ?`, [oldId]);
    expect(oldRows[0].booking_status).toBe('expired');
    const [active] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt FROM bookings WHERE user_id = ${TEST_USER} AND booking_date = ? AND booking_status NOT IN ('cancelled','expired','no_show')`, [date]);
    expect(active[0].cnt).toBe(1);
  });

  it('TEST 6 — public match / matches RESTRICT: terminal booking with attached match is not deleted, rebooking succeeds', async () => {
    const date = '2027-12-06';
    await cleanDate(date);
    // Terminal booking with an attached match row (matches.booking_id is UNIQUE + RESTRICT).
    const bookingId = await createBookingRow(date, '10:00', '11:00', 'cancelled');
    await pool.execute(`INSERT INTO matches (type, status, booking_id, sport_id) VALUES ('public', 'cancelled', ?, (SELECT id FROM sports WHERE deleted_at IS NULL ORDER BY id LIMIT 1))`, [bookingId]);

    const result = await rebookSameSlot(date, '10:00', '11:00');

    // Historical booking + its match remain intact.
    const [oldRows] = await pool.execute<any[]>(`SELECT booking_status FROM bookings WHERE id = ?`, [bookingId]);
    expect(oldRows[0].booking_status).toBe('cancelled');
    const [matchRows] = await pool.execute<any[]>(`SELECT COUNT(*) as cnt FROM matches WHERE booking_id = ?`, [bookingId]);
    expect(matchRows[0].cnt).toBe(1);
    // New booking created.
    expect(result.bookingId).toBeGreaterThan(0);

    await pool.execute(`DELETE FROM matches WHERE booking_id = ?`, [bookingId]);
  });

  it('TEST 7 — completed booking still blocks identical slot (past context: completed is blocking)', async () => {
    const date = '2027-12-07';
    await cleanDate(date);
    await createBookingRow(date, '10:00', '11:00', 'completed');

    // completed is NOT in the availability exclusion list → identical slot rebook is rejected (409).
    await expect(rebookSameSlot(date, '10:00', '11:00')).rejects.toMatchObject({ statusCode: 409 });
  });

});