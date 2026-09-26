import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

import { TimeEngine, FakeClock } from '../../time/index.js';

// ── R1 — Server-side player booking-window integration (REAL DB) ─────────
// Exercises bookingService.createBooking against the Docker MySQL dev DB
// (port 3307). The clock is frozen via TimeEngine.setClock(FakeClock) so the
// branch-local window is deterministic across every machine/timezone:
//   Cairo local date 2026-10-01 (12:00Z = 15:00 EEST) → window [10-01 .. 10-07].
//
// ALLOW_DATE = 2026-10-05 (inside the window)
// DAY8_DATE  = 2026-10-08 (today + 7 → rejected for non-bypass users)
//
// Authority matrix (per business contract):
//   super_admin role ................................................... bypass
//   admin.bookings.update-status permission ........................... bypass
//   org.bookings.manage permission ................................... bypass
//   any other permission / no authority .............................. NO bypass

const TEST_ORG = 10006300;
const TEST_BRANCH = 10006300;
const TEST_RESOURCE = 10006300;
const ALLOW_DATE = '2026-10-05';
const DAY8_DATE = '2026-10-08';

const PLAIN_USER = 10006301;      // no roles / no permissions
const SUPER_USER = 10006302;      // super_admin
const STATUS_PERM_USER = 10006303; // admin.bookings.update-status
const ORG_MANAGE_USER = 10006304; // org.bookings.manage
const CONTROL_USER = 10006305;    // bookings.check-in only (NOT a bypass)

let pool: mysql.Pool;
let bookingService: any;

async function cleanupFixtures(exec: (sql: string, params?: any[]) => Promise<any>) {
  const users = [PLAIN_USER, SUPER_USER, STATUS_PERM_USER, ORG_MANAGE_USER, CONTROL_USER].join(',');
  await exec(`DELETE FROM booking_matchmaking_requests WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (${users}))`);
  await exec(`DELETE FROM booking_participants WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (${users}))`);
  await exec(`DELETE FROM booking_cancellations WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (${users}))`);
  await exec(`DELETE FROM booking_slots WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (${users}))`);
  await exec(`DELETE FROM bookings WHERE user_id IN (${users})`);
  await exec(`DELETE FROM payment_transactions WHERE user_id IN (${users})`);
  await exec(`DELETE FROM user_roles WHERE user_id IN (${users})`);
  await exec(`DELETE FROM user_wallets WHERE user_id IN (${users})`);
  await exec(`DELETE FROM ledger_entries WHERE organisation_id = ${TEST_ORG}`);
  await exec(`DELETE FROM general_ledger WHERE organisation_id = ${TEST_ORG}`);
  await exec(`DELETE FROM users WHERE id IN (${users})`);
  await exec(`DELETE FROM resources WHERE id = ${TEST_RESOURCE}`);
  await exec(`DELETE FROM branches WHERE id = ${TEST_BRANCH}`);
  await exec(`DELETE FROM organisations WHERE id = ${TEST_ORG}`);
  await exec(`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE slug LIKE 'window-rbac-%')`);
  await exec(`DELETE FROM roles WHERE slug LIKE 'window-rbac-%'`);
}

async function createFixtureUser(id: number, email: string): Promise<void> {
  await pool.execute(
    `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'Window User', 'male', 'active')`,
    [id, `012${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, email],
  );
  await pool.execute(`INSERT INTO user_wallets (user_id, balance, currency_code, version) VALUES (?, 9999999, 'EGP', 1)`, [id]);
}

/** Grant a role identified by slug (e.g. super_admin) — used for fixtures. */
async function grantRole(userId: number, roleSlug: string): Promise<void> {
  await pool.execute(
    `INSERT INTO user_roles (user_id, role_id, assigned_by)
     SELECT ?, id, ? FROM roles WHERE slug = ? AND deleted_at IS NULL LIMIT 1`,
    [userId, userId, roleSlug],
  );
}

/** Grant exactly one permission key via a dedicated per-user private test role. */
async function grantPermission(userId: number, permissionKey: string): Promise<void> {
  const roleSlug = `window-rbac-${userId}`;
  await pool.execute(
    `INSERT IGNORE INTO roles (organisation_id, name, slug) VALUES (NULL, ?, ?)`,
    [`Window RBAC ${userId}`, roleSlug],
  );
  await pool.execute(
    `INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by)
     SELECT ?, id, ? FROM roles WHERE slug = ? LIMIT 1`,
    [userId, userId, roleSlug],
  );
  await pool.execute(
    `INSERT IGNORE INTO role_permissions (role_id, permission_id)
     SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = ?
     WHERE r.slug = ? LIMIT 1`,
    [permissionKey, roleSlug],
  );
}

async function countBookingsOn(userId: number, date: string): Promise<number> {
  const [rows] = await pool.execute<RowData>(
    "SELECT COUNT(*) AS cnt FROM bookings WHERE user_id = ? AND booking_date = ? AND booking_status NOT IN ('expired', 'cancelled')",
    [userId, date],
  );
  return Number((rows as any[])[0].cnt);
}

async function countPayments(userId: number): Promise<number> {
  const [rows] = await pool.execute<RowData>(
    'SELECT COUNT(*) AS cnt FROM payment_transactions WHERE user_id = ?',
    [userId],
  );
  return Number((rows as any[])[0].cnt);
}

function createBookingInput(date: string, startTime: string, endTime: string, paymentMethod = 'cash') {
  return {
    branchId: TEST_BRANCH,
    resourceId: TEST_RESOURCE,
    bookingType: 'private_match',
    bookingDate: date,
    startTime,
    endTime,
    paymentMethod,
  };
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

  // Users
  await createFixtureUser(PLAIN_USER, 'window-plain@test.com');
  await createFixtureUser(SUPER_USER, 'window-super@test.com');
  await createFixtureUser(STATUS_PERM_USER, 'window-status@test.com');
  await createFixtureUser(ORG_MANAGE_USER, 'window-org@test.com');
  await createFixtureUser(CONTROL_USER, 'window-control@test.com');

  // Authorities
  await grantRole(SUPER_USER, 'super_admin');
  await grantPermission(STATUS_PERM_USER, 'admin.bookings.update-status');
  await grantPermission(ORG_MANAGE_USER, 'org.bookings.manage');
  await grantPermission(CONTROL_USER, 'bookings.check-in'); // NOT a bypass authority

  // Org + branch + resource (Africa/Cairo)
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  await pool.execute(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
     VALUES (${TEST_ORG}, UUID(), ?, 1, 'Window Org', 'window-window-org', 1)`,
    [(ot as any[])[0].id],
  );
  await pool.execute(
    `INSERT INTO branches (id, public_id, organisation_id, name, slug, timezone, opening_time, closing_time)
     VALUES (${TEST_BRANCH}, UUID(), ${TEST_ORG}, 'Window Branch', 'window-branch', 'Africa/Cairo', '08:00', '22:00')`,
  );
  await pool.execute(
    `INSERT INTO resources (id, public_id, branch_id, resource_type_id, name, sport_id, hourly_price, opening_time, closing_time, is_active, slot_duration)
     VALUES (${TEST_RESOURCE}, UUID(), ${TEST_BRANCH}, 1, 'Window Court', (SELECT id FROM sports LIMIT 1), 100, '08:00', '22:00', TRUE, 60)`,
  );

  // Point the application pool at Docker MySQL and import services.
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });

  const mod = await import('../application/booking.service.js');
  bookingService = mod.bookingService;

  // Freeze "now" for deterministic branch-local windows (Cairo 2026-10-01).
  TimeEngine.setClock(new FakeClock('2026-10-01T12:00:00.000Z'));
}, 60000);

afterAll(async () => {
  TimeEngine.resetClock();
  vi.restoreAllMocks();
  await cleanupFixtures(async (sql, params) => pool.execute(sql, params));
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 30000);

describe('R1 — server-side player booking window', () => {
  it('10. a normal player booking on an allowed date succeeds', async () => {
    const result = await bookingService.createBooking(createBookingInput(ALLOW_DATE, '09:00', '10:00'), PLAIN_USER);
    expect(result).toBeDefined();
    expect(Number(result.id ?? result.bookingId)).toBeGreaterThan(0);
  });

  it('11. a normal player booking on Day 8 is rejected BEFORE booking creation', async () => {
    await expect(
      bookingService.createBooking(createBookingInput(DAY8_DATE, '09:00', '10:00'), PLAIN_USER),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(await countBookingsOn(PLAIN_USER, DAY8_DATE)).toBe(0);
  });

  it('12+13. rejected Day 8 player booking never reaches the payment gateway and creates no booking', async () => {
    const paymentsBefore = await countPayments(PLAIN_USER);
    await expect(
      bookingService.createBooking(createBookingInput(DAY8_DATE, '10:00', '11:00'), PLAIN_USER),
    ).rejects.toMatchObject({ statusCode: 403 });
    // No payment session was created (gateway never charged) and no booking row.
    expect(await countPayments(PLAIN_USER)).toBe(paymentsBefore);
    expect(await countBookingsOn(PLAIN_USER, DAY8_DATE)).toBe(0);
  });

  it('14. super_admin can book beyond Day 7', async () => {
    const result = await bookingService.createBooking(createBookingInput(DAY8_DATE, '09:00', '10:00'), SUPER_USER);
    const id = Number(result.id ?? result.bookingId);
    expect(id).toBeGreaterThan(0);
    expect(await countBookingsOn(SUPER_USER, DAY8_DATE)).toBe(1);
  });

  it('15. admin.bookings.update-status permission can bypass', async () => {
    const result = await bookingService.createBooking(createBookingInput(DAY8_DATE, '10:00', '11:00'), STATUS_PERM_USER);
    const id = Number(result.id ?? result.bookingId);
    expect(id).toBeGreaterThan(0);
    expect(await countBookingsOn(STATUS_PERM_USER, DAY8_DATE)).toBe(1);
  });

  it('16. org.bookings.manage permission can bypass', async () => {
    const result = await bookingService.createBooking(createBookingInput(DAY8_DATE, '11:00', '12:00'), ORG_MANAGE_USER);
    const id = Number(result.id ?? result.bookingId);
    expect(id).toBeGreaterThan(0);
    expect(await countBookingsOn(ORG_MANAGE_USER, DAY8_DATE)).toBe(1);
  });

  it('17. users without those authorities cannot bypass (even with another permission)', async () => {
    // CONTROL_USER holds bookings.check-in only — outside the stated authority set.
    await expect(
      bookingService.createBooking(createBookingInput(DAY8_DATE, '12:00', '13:00'), CONTROL_USER),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(await countBookingsOn(CONTROL_USER, DAY8_DATE)).toBe(0);
  });
});