import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

// ── createBookingV2 Business-Day parity regression ─────────────────────
// DEFECT 4: createBookingV2 previously persisted `business_date = booking_date`
// because it never computed TimeEngine.getBusinessDate(). For an overnight
// after-midnight slot on a 13:00→01:00 branch, the booking_date is the
// user-facing calendar date while business_date must be the previous operating
// day. This exercises the REAL V2 create flow against the Docker DB.
//
// Runs against the Docker MySQL dev DB (port 3307) like the other booking
// integration specs.

const TEST_USER = 999992;
const TEST_ORG = 999992;
const TEST_BRANCH = 999992;
const TEST_RESOURCE = 999992;

let pool: mysql.Pool;
let bookingService: any;

async function cleanupFixtures(exec: (sql: string, params?: any[]) => Promise<any>) {
  await exec(`DELETE FROM booking_matchmaking_requests WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ${TEST_USER})`);
  await exec(`DELETE FROM booking_participants WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ${TEST_USER})`);
  await exec(`DELETE FROM booking_slots WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ${TEST_USER})`);
  await exec(`DELETE FROM bookings WHERE user_id = ${TEST_USER}`);
  await exec(`DELETE FROM resources WHERE id = ${TEST_RESOURCE}`);
  await exec(`DELETE FROM branches WHERE id = ${TEST_BRANCH}`);
  await exec(`DELETE FROM tax_rates WHERE organisation_id = ${TEST_ORG} AND org_scope = 'bd-fixture'`);
  await exec(`DELETE FROM organisations WHERE id = ${TEST_ORG}`);
  await exec(`DELETE FROM user_wallets WHERE user_id = ${TEST_USER}`);
  await exec(`DELETE FROM users WHERE id = ${TEST_USER}`);
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

  await cleanupFixtures(async (sql, params) => pool.execute(sql, params));

  await pool.execute(`INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
    VALUES (${TEST_USER}, UUID(), 1, '01299999992', '+201299999992', 'test-bd@test.com', '$2b$10$test', 'BD User', 'male', 'active')`);
  await pool.execute(`INSERT INTO user_wallets (user_id, balance, currency_code, version) VALUES (${TEST_USER}, 9999999, 'EGP', 1)`);

  const [ot] = await pool.execute<any[]>(`SELECT id FROM organisation_types LIMIT 1`);
  await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
    VALUES (${TEST_ORG}, UUID(), ${ot[0].id}, ${TEST_USER}, 'BD Fixture Org', 'bd-fixture', 1)`);
  await pool.execute(`INSERT INTO branches (id, public_id, organisation_id, name, slug, timezone)
    VALUES (${TEST_BRANCH}, UUID(), ${TEST_ORG}, 'BD Branch', 'bd-branch', 'Africa/Cairo')`);
  // Overnight resource: 13:00 → 01:00 (mirrors production ETAPA/MASPIRO).
  await pool.execute(`INSERT INTO resources (id, public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time, slot_duration)
    VALUES (${TEST_RESOURCE}, UUID(), 'BD Court', (SELECT id FROM resource_types LIMIT 1), ${TEST_BRANCH}, 100, 1, '13:00', '01:00', 60)`);

  const { bookingService: bs } = await import('../application/booking.service.js');
  bookingService = bs;
}, 60000);

afterAll(async () => {
  await cleanupFixtures(async (sql, params) => pool.execute(sql, params));
  await pool.end();
}, 30000);

async function loadBooking(bookingId: number): Promise<any> {
  const [rows] = await pool.execute<any[]>(
    'SELECT DATE_FORMAT(booking_date, "%Y-%m-%d") AS booking_date, DATE_FORMAT(business_date, "%Y-%m-%d") AS business_date, start_time, DATE_FORMAT(start_at_utc, "%Y-%m-%d %H:%i:%s") AS start_at_utc FROM bookings WHERE id = ?', [bookingId],
  );
  return rows[0];
}

describe('createBookingV2 Business-Day parity (DEFECT 4)', () => {
  it('persists the authoritative business_date for an after-midnight overnight slot', async () => {
    // Slot displayed as Business Day 15/09 at 00:00 — the actual instant is
    // 16/09 00:00 Cairo (overnight session 13:00→01:00), business day 15/09.
    const bookingDate = '2026-09-15';
    const startTime = '00:00';

    const result = await bookingService.createBooking({
      branchId: TEST_BRANCH,
      resourceId: TEST_RESOURCE,
      bookingType: 'private_match',
      bookingDate,
      startTime,
      endTime: '01:00',
      paymentMethod: 'cash',
    }, TEST_USER);

    expect(result).toBeDefined();
    const bookingId = Number(result.id ?? result.bookingId);

    const row = await loadBooking(bookingId);
    expect(String(row.booking_date)).toBe(bookingDate);
    // After-midnight slot: business_date is the PREVIOUS operating day (14/09),
    // NOT a copy of the user-facing booking_date (15/09). The 00:00 slot at
    // 15/09 belongs to the 13:00→01:00 session that started on 14/09.
    expect(String(row.business_date)).toBe('2026-09-14');
    // start_at_utc = localToUtc('2026-09-15','00:00','Africa/Cairo') = 14/09 21:00Z
    expect(String(row.start_at_utc)).toBe('2026-09-14 21:00:00');
  });

  it('rejects a matchmaking deadline at/after the authoritative start instant', async () => {
    const bookingDate = '2026-09-15';
    const startTime = '12:00';

    // Valid: 11:00 Cairo = 08:00Z, strictly before start 09:00Z.
    const ok = await bookingService.createBooking({
      branchId: TEST_BRANCH,
      resourceId: TEST_RESOURCE,
      bookingType: 'public_match',
      bookingDate,
      startTime,
      endTime: '13:00',
      paymentMethod: 'cash',
      matchmaking: {
        maxPlayers: 2,
        targetGender: 'any',
        deadline: '2026-09-15T08:00:00.000Z',
      },
    }, TEST_USER);
    expect(ok).toBeDefined();

    // Invalid: 12:00 Cairo = 09:00Z == start → rejected.
    await expect(bookingService.createBooking({
      branchId: TEST_BRANCH,
      resourceId: TEST_RESOURCE,
      bookingType: 'public_match',
      bookingDate,
      startTime,
      endTime: '13:00',
      paymentMethod: 'cash',
      matchmaking: {
        maxPlayers: 2,
        targetGender: 'any',
        deadline: '2026-09-15T09:00:00.000Z',
      },
    }, TEST_USER)).rejects.toMatchObject({ statusCode: 409 });
  });
});