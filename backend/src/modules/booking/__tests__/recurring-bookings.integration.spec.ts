import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

// ── R2 — Canonical recurring booking core (REAL DB) ───────────────────────
// Exercises bookingService.createRecurringSeries / previewRecurringSeries /
// listRecurringSeries against the Docker MySQL dev DB (port 3307).
//
// Authority (existing keys only): super_admin role, admin.bookings.update-status
// OR org.bookings.manage → responsible user; everyone else denied.

const ORG1 = 10008000, BRANCH1 = 10008000, RES1 = 10008000;
const ORG2 = 10008001, BRANCH2 = 10008001, RES2 = 10008001;
const BRANCH_NY = 10008002, RES_NY = 10008002; // ORG1, America/New_York

const ADMIN = 10008010;      // org.bookings.manage
const PLAYER = 10008011;     // no authorities
const SUPER = 10008012;      // super_admin role
const ADMIN2 = 10008013;     // org.bookings.manage

let pool: mysql.Pool;
let bookingService: any;

async function cleanupFixtures(exec: (sql: string, params?: any[]) => Promise<any>) {
  const users = [ADMIN, PLAYER, SUPER, ADMIN2].join(',');
  await exec(`DELETE FROM booking_matchmaking_requests WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (${users}))`);
  await exec(`DELETE FROM booking_participants WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (${users}))`);
  await exec(`DELETE FROM booking_cancellations WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (${users}))`);
  await exec(`DELETE FROM booking_slots WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (${users}))`);
  await exec(`DELETE FROM bookings WHERE user_id IN (${users})`);
  await exec(`DELETE FROM payment_transactions WHERE user_id IN (${users})`);
  await exec(`DELETE FROM user_roles WHERE user_id IN (${users})`);
  await exec(`DELETE FROM user_wallets WHERE user_id IN (${users})`);
  await exec(`DELETE FROM booking_series WHERE created_by IN (${users})`);
  await exec(`DELETE FROM ledger_entries WHERE organisation_id IN (${ORG1}, ${ORG2})`);
  await exec(`DELETE FROM general_ledger WHERE organisation_id IN (${ORG1}, ${ORG2})`);
  await exec(`DELETE FROM users WHERE id IN (${users})`);
  await exec(`DELETE FROM resources WHERE id IN (${RES1}, ${RES2}, ${RES_NY})`);
  await exec(`DELETE FROM branches WHERE id IN (${BRANCH1}, ${BRANCH2}, ${BRANCH_NY})`);
  await exec(`DELETE FROM organisations WHERE id IN (${ORG1}, ${ORG2})`);
  await exec(`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE slug LIKE 'r2-rbac-%')`);
  await exec(`DELETE FROM roles WHERE slug LIKE 'r2-rbac-%'`);
}

async function createUser(id: number, email: string): Promise<void> {
  await pool.execute(
    `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'R2 User', 'male', 'active')`,
    [id, `012${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, email],
  );
  await pool.execute(`INSERT INTO user_wallets (user_id, balance, currency_code, version) VALUES (?, 0, 'EGP', 1)`, [id]);
}

async function grantRole(userId: number, roleSlug: string): Promise<void> {
  await pool.execute(
    `INSERT INTO user_roles (user_id, role_id, assigned_by)
     SELECT ?, id, ? FROM roles WHERE slug = ? AND deleted_at IS NULL LIMIT 1`,
    [userId, userId, roleSlug],
  );
}

async function grantPermission(userId: number, permissionKey: string): Promise<void> {
  const roleSlug = `r2-rbac-${userId}`;
  await pool.execute(
    `INSERT IGNORE INTO roles (organisation_id, name, slug) VALUES (NULL, ?, ?)`,
    [`R2 RBAC ${userId}`, roleSlug],
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

async function countBookingsInSeries(seriesId: number): Promise<number> {
  const [rows] = await pool.execute<RowData>(
    'SELECT COUNT(*) AS cnt FROM bookings WHERE series_id = ?',
    [seriesId],
  );
  return Number((rows as any[])[0].cnt);
}

async function countSeriesAll(): Promise<number> {
  const [rows] = await pool.execute<RowData>('SELECT COUNT(*) AS cnt FROM booking_series');
  return Number((rows as any[])[0].cnt);
}

async function countOrgBookings(orgId: number): Promise<number> {
  const [rows] = await pool.execute<RowData>(
    'SELECT COUNT(*) AS cnt FROM bookings WHERE organisation_id = ?',
    [orgId],
  );
  return Number((rows as any[])[0].cnt);
}

function ctx(branchId: number, resourceId: number, overrides: Record<string, unknown> = {}) {
  return {
    branchId,
    resourceId,
    weekdays: [1, 4], // Mon + Thu
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    startTime: '18:00',
    endTime: '20:00',
    ...overrides,
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

  await createUser(ADMIN, 'r2-admin@test.com');
  await createUser(PLAYER, 'r2-player@test.com');
  await createUser(SUPER, 'r2-super@test.com');
  await createUser(ADMIN2, 'r2-admin2@test.com');
  await grantPermission(ADMIN, 'org.bookings.manage');
  await grantPermission(ADMIN2, 'org.bookings.manage');
  await grantPermission(PLAYER, 'bookings.view'); // NOT a responsible-user authority
  await grantRole(SUPER, 'super_admin');

  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const [sport] = await pool.execute<RowData>('SELECT id FROM sports LIMIT 1');
  const otId = (ot as any[])[0].id;
  const sportId = (sport as any[])[0].id;

  await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
    VALUES (${ORG1}, UUID(), ?, 1, 'R2 Org One', 'r2-org-one', 1)`, [otId]);
  await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
    VALUES (${ORG2}, UUID(), ?, 1, 'R2 Org Two', 'r2-org-two', 1)`, [otId]);
  await pool.execute(`INSERT INTO branches (id, public_id, organisation_id, name, slug, timezone, opening_time, closing_time)
    VALUES (${BRANCH1}, UUID(), ${ORG1}, 'R2 Branch One', 'r2-branch-one', 'Africa/Cairo', '08:00', '22:00')`);
  await pool.execute(`INSERT INTO branches (id, public_id, organisation_id, name, slug, timezone, opening_time, closing_time)
    VALUES (${BRANCH2}, UUID(), ${ORG2}, 'R2 Branch Two', 'r2-branch-two', 'Africa/Cairo', '08:00', '22:00')`);
  await pool.execute(`INSERT INTO branches (id, public_id, organisation_id, name, slug, timezone, opening_time, closing_time)
    VALUES (${BRANCH_NY}, UUID(), ${ORG1}, 'R2 Branch NY', 'r2-branch-ny', 'America/New_York', '08:00', '22:00')`);
  await pool.execute(`INSERT INTO resources (id, public_id, branch_id, resource_type_id, name, sport_id, hourly_price, opening_time, closing_time, is_active, slot_duration)
    VALUES (${RES1}, UUID(), ${BRANCH1}, 1, 'R2 Court One', ${sportId}, 100, '08:00', '22:00', TRUE, 60)`);
  await pool.execute(`INSERT INTO resources (id, public_id, branch_id, resource_type_id, name, sport_id, hourly_price, opening_time, closing_time, is_active, slot_duration)
    VALUES (${RES2}, UUID(), ${BRANCH2}, 1, 'R2 Court Two', ${sportId}, 100, '08:00', '22:00', TRUE, 60)`);
  await pool.execute(`INSERT INTO resources (id, public_id, branch_id, resource_type_id, name, sport_id, hourly_price, opening_time, closing_time, is_active, slot_duration)
    VALUES (${RES_NY}, UUID(), ${BRANCH_NY}, 1, 'R2 Court NY', ${sportId}, 100, '08:00', '22:00', TRUE, 60)`);

  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  const mod = await import('../application/booking.service.js');
  bookingService = mod.bookingService;
}, 60000);

afterAll(async () => {
  vi.restoreAllMocks();
  await cleanupFixtures(async (sql, params) => pool.execute(sql, params));
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 30000);

describe('R2 — canonical recurring booking core', () => {
  let S1 = 0; // ORG1 series id

  it('18. preview is side-effect free: zero bookings / zero series created', async () => {
    expect(await countOrgBookings(ORG1)).toBe(0);
    expect(await countSeriesAll()).toBe(0);
    const preview = await bookingService.previewRecurringSeries(ctx(BRANCH1, RES1));
    expect(preview.count).toBe(9);
    expect(preview.first).toEqual({ date: '2026-10-01', startTime: '18:00', endTime: '20:00' });
    expect(preview.last).toEqual({ date: '2026-10-29', startTime: '18:00', endTime: '20:00' });
    expect(preview.timezone).toBe('Africa/Cairo');
    expect(await countOrgBookings(ORG1)).toBe(0);
    expect(await countSeriesAll()).toBe(0);
  });

  it('17. an unauthorized player cannot create a series (no bookings, no series)', async () => {
    await expect(
      bookingService.createRecurringSeries(ctx(BRANCH1, RES1), PLAYER),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(await countOrgBookings(ORG1)).toBe(0);
    expect(await countSeriesAll()).toBe(0);
  });

  it('16. an authorized responsible user can create a series (Mon+Thu, Oct 2026 → 9 occurrences)', async () => {
    const result = await bookingService.createRecurringSeries(ctx(BRANCH1, RES1), ADMIN);
    expect(result.seriesId).toBeGreaterThan(0);
    expect(result.occurrenceCount).toBe(9);
    expect(result.weekdays).toEqual([1, 4]);
    S1 = result.seriesId;
  });

  it('19-21. creation produces exactly one canonical booking per occurrence, all linked to the series', async () => {
    expect(await countBookingsInSeries(S1)).toBe(9);
    const [rows] = await pool.execute<RowData>(
      'SELECT id, series_id, user_id, organisation_id, branch_id, resource_id, booking_status, payment_status FROM bookings WHERE series_id = ?',
      [S1],
    );
    expect((rows as any[]).length).toBe(9);
    for (const r of rows as any[]) {
      expect(Number(r.series_id)).toBe(S1);
      expect(Number(r.organisation_id)).toBe(ORG1);
      expect(Number(r.branch_id)).toBe(BRANCH1);
      expect(Number(r.resource_id)).toBe(RES1);
      expect(r.booking_status).toBe('pending');
      expect(r.payment_status).toBe('pending');
    }
    // Every generated occurrence maps to exactly one booking.
    const series = await bookingService.describeRecurringSeries(S1);
    expect(series.occurrences).toHaveLength(9);
    for (const occ of series.occurrences) {
      const [cnt] = await pool.execute<RowData>(
        'SELECT COUNT(*) AS cnt FROM bookings WHERE series_id = ? AND booking_date = ?',
        [S1, occ.date],
      );
      expect(Number((cnt as any[])[0].cnt)).toBe(1);
    }
  });

  it('22. retry with the same idempotency key reuses the series and does not duplicate occurrences', async () => {
    const input = ctx(BRANCH1, RES1, { idempotencyKey: 'r2-idem-test-key-0001', startDate: '2026-11-01', endDate: '2026-11-30' });
    const first = await bookingService.createRecurringSeries(input, ADMIN);
    const before = await countBookingsInSeries(first.seriesId);
    const second = await bookingService.createRecurringSeries(input, ADMIN);
    expect(second.seriesId).toBe(first.seriesId);
    expect(await countBookingsInSeries(first.seriesId)).toBe(before);
    expect(await countSeriesAll()).toBeGreaterThanOrEqual(2); // S1 + idempotent series only
  });

  it('29. no payment rows are created by R2', async () => {
    const [rows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM payment_transactions
       WHERE user_id = ? OR booking_id IN (SELECT id FROM bookings WHERE series_id = ?)`,
      [ADMIN, S1],
    );
    expect(Number((rows as any[])[0].cnt)).toBe(0);
  });

  it('30. no accounting rows are created by R2', async () => {
    const [le] = await pool.execute<RowData>(
      'SELECT COUNT(*) AS cnt FROM ledger_entries WHERE source_type = ? AND source_id IN (SELECT id FROM bookings WHERE series_id = ?)',
      ['booking', S1],
    );
    expect(Number((le as any[])[0].cnt)).toBe(0);
    const [gl] = await pool.execute<RowData>(
      'SELECT COUNT(*) AS cnt FROM general_ledger WHERE organisation_id = ?',
      [ORG1],
    );
    expect(Number((gl as any[])[0].cnt)).toBe(0);
  });

  it('24. existing booking queries still work — occurrences are normal bookings', async () => {
    // Normal user-booking query sees the occurrence bookings.
    const mine = await bookingService.getUserBookings(ADMIN);
    const myRows = mine?.data ?? mine;
    expect(Array.isArray(myRows)).toBe(true);
    expect((myRows as any[]).length).toBeGreaterThanOrEqual(9);
    // Availability for an occurrence date shows the slot as booked.
    const slots = await bookingService.getResourceSlots(RES1, '2026-10-05'); // Monday
    const s18 = slots.find((s: any) => s.slot_start === '18:00');
    expect(s18).toBeDefined();
    expect(s18.status).toBe('booked');
  });

  it('25. cancellation of individual bookings is unchanged (normal booking + one occurrence)', async () => {
    // Normal booking, then cancel as owner.
    const normal = await bookingService.createBooking({
      branchId: BRANCH1, resourceId: RES1, bookingType: 'private_match',
      bookingDate: '2026-10-06', startTime: '12:00', endTime: '13:00', paymentMethod: 'cash',
    }, ADMIN);
    const normalId = Number(normal.id ?? normal.bookingId);
    const cancelled = await bookingService.cancelBooking(normalId, ADMIN, 'player_request');
    expect(cancelled.booking_status).toBe('cancelled');

    // A series occurrence is an independent canonical booking: cancelling one
    // occurrence uses the exact existing single-booking cancellation path.
    const series = await bookingService.describeRecurringSeries(S1);
    const occBookingId = series.occurrences[0].bookingId;
    const occCancelled = await bookingService.cancelBooking(occBookingId, ADMIN, 'player_request');
    expect(occCancelled.booking_status).toBe('cancelled');
    expect(await countBookingsInSeries(S1)).toBe(9); // other occurrences untouched
  });

  it('23. an existing individual booking is never overwritten (series conflicts → atomic rollback)', async () => {
    // Single booking occupies Monday 2026-12-07 18:00-20:00 (a FREE month on RES1).
    const before = await countBookingsInSeries(S1);
    const single = await bookingService.createBooking({
      branchId: BRANCH1, resourceId: RES1, bookingType: 'private_match',
      bookingDate: '2026-12-07', startTime: '18:00', endTime: '20:00', paymentMethod: 'cash',
    }, ADMIN);
    const singleId = Number(single.id ?? single.bookingId);
    const beforeBookings = await countOrgBookings(ORG1);

    await expect(
      bookingService.createRecurringSeries(ctx(BRANCH1, RES1, { startDate: '2026-12-01', endDate: '2026-12-31' }), ADMIN),
    ).rejects.toMatchObject({ statusCode: 409 });

    // The conflicting series was rolled back entirely — no new series, no new
    // bookings, and the existing individual booking remains intact.
    expect(await countBookingsInSeries(S1)).toBe(before);
    expect(await countOrgBookings(ORG1)).toBe(beforeBookings);
    const [still] = await pool.execute<RowData>(
      "SELECT booking_status FROM bookings WHERE id = ?",
      [singleId],
    );
    expect((still as any[]).length).toBe(1);
    expect((still as any[])[0].booking_status).not.toBe('cancelled');
  });

  it('26. tenant isolation: series data stays inside its organisation', async () => {
    const s2 = await bookingService.createRecurringSeries(ctx(BRANCH2, RES2, { startDate: '2026-11-02', endDate: '2026-11-27' }), ADMIN2);
    expect(s2.occurrenceCount).toBe(8); // Nov 2026 Mon+Thu

    const [org1Rows] = await pool.execute<RowData>(
      'SELECT COUNT(*) AS cnt FROM bookings WHERE series_id = ? AND organisation_id = ?', [S1, ORG1],
    );
    expect(Number((org1Rows as any[])[0].cnt)).toBe(9);

    const [org2Rows] = await pool.execute<RowData>(
      'SELECT COUNT(*) AS cnt FROM bookings WHERE series_id = ? AND organisation_id = ?', [s2.seriesId, ORG2],
    );
    expect(Number((org2Rows as any[])[0].cnt)).toBe(8);

    // Global (super) list can see both orgs; each scoped by org.
    const globalList = await bookingService.listRecurringSeries({}, SUPER);
    expect((globalList.data as any[]).length).toBeGreaterThanOrEqual(3);
    const org1List = await bookingService.listRecurringSeries({ organisationId: ORG1 }, SUPER);
    expect((org1List.data as any[]).every((s: any) => s.organisationId === ORG1)).toBe(true);
    const org2List = await bookingService.listRecurringSeries({ organisationId: ORG2 }, SUPER);
    expect((org2List.data as any[]).every((s: any) => s.organisationId === ORG2)).toBe(true);
  });

  it('27. branch isolation: a resource from another branch is rejected', async () => {
    // RES2 belongs to BRANCH2 but the series targets BRANCH1 → forbidden.
    await expect(
      bookingService.createRecurringSeries(ctx(BRANCH1, RES2), ADMIN),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('28. DST recurrence persists the intended LOCAL times across the transition', async () => {
    const sNY = await bookingService.createRecurringSeries({
      branchId: BRANCH_NY, resourceId: RES_NY,
      weekdays: [7], // Sunday
      startDate: '2026-03-01', endDate: '2026-03-14',
      startTime: '18:00', endTime: '20:00',
    }, ADMIN);
    expect(sNY.occurrenceCount).toBe(2);

    const [rows] = await pool.execute<RowData>(
      `SELECT DATE_FORMAT(booking_date, '%Y-%m-%d') AS bd, DATE_FORMAT(start_time, '%H:%i') AS st, DATE_FORMAT(start_at_utc, '%Y-%m-%d %H:%i:%s') AS start_utc
       FROM bookings WHERE series_id = ? ORDER BY booking_date`,
      [sNY.seriesId],
    );
    const first = (rows as any[])[0];
    const second = (rows as any[])[1];
    expect(first.bd).toBe('2026-03-01');
    expect(first.st).toBe('18:00');
    expect(String(first.start_utc)).toContain('2026-03-01 23:00'); // EST, UTC-5
    expect(second.bd).toBe('2026-03-08');
    expect(second.st).toBe('18:00'); // local time preserved
    expect(String(second.start_utc)).toContain('2026-03-08 22:00'); // EDT, UTC-4
  });
});