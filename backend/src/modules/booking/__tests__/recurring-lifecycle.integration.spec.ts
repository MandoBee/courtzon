import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

import { TimeEngine, FakeClock } from '../../time/index.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { mapDomainEvent } from '../../../modules/realtime/application/socket-event-mapper.js';

// ── R4 — Recurring series lifecycle, realtime & notifications (REAL DB) ──
// Occurrences remain independent canonical bookings (single-booking cancel);
// series cancel only touches FUTURE non-terminal occurrences through the
// canonical CancelBooking path. Frozen clock: Cairo 2026-09-10 → Day-8 09-17.

const ORG1 = 10010000, BRANCH1 = 10010000;
const ORG2 = 10010001, BRANCH2 = 10010001;
const RES_A = 10010000; // ORG1/BRANCH1 sport19 08-22
const RES_B = 10010001; // ORG1/BRANCH1 sport19 08-22 (unrelated bookings live here)
const RES_X = 10010002; // ORG2/BRANCH2 sport19 08-22

const ADMIN = 10010010;    // org.bookings.manage (operator)
const PLAYER = 10010011;   // beneficiary / owner
const SUPER = 10010014;    // super_admin
const NO_AUTH = 10010015;  // no authority

let pool: mysql.Pool;
let bookingService: any;

async function cleanupFixtures(exec: (sql: string, params?: any[]) => Promise<any>) {
  const users = [ADMIN, PLAYER, SUPER, NO_AUTH].join(',');
  await exec(`DELETE FROM booking_matchmaking_requests WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (${users}))`);
  await exec(`DELETE FROM booking_participants WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (${users}))`);
  await exec(`DELETE FROM booking_cancellations WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (${users}))`);
  await exec(`DELETE FROM booking_slots WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (${users}))`);
  await exec(`DELETE FROM bookings WHERE user_id IN (${users})`);
  await exec(`DELETE FROM audit_logs WHERE entity_type = 'booking_series'`);
  await exec(`DELETE FROM payment_transactions WHERE user_id IN (${users})`);
  await exec(`DELETE FROM user_roles WHERE user_id IN (${users})`);
  await exec(`DELETE FROM user_wallets WHERE user_id IN (${users})`);
  await exec(`DELETE FROM booking_series WHERE created_by IN (${users})`);
  await exec(`DELETE FROM ledger_entries WHERE organisation_id IN (${ORG1}, ${ORG2})`);
  await exec(`DELETE FROM general_ledger WHERE organisation_id IN (${ORG1}, ${ORG2})`);
  await exec(`DELETE FROM users WHERE id IN (${users})`);
  await exec(`DELETE FROM resources WHERE id IN (${RES_A}, ${RES_B}, ${RES_X})`);
  await exec(`DELETE FROM branches WHERE id IN (${BRANCH1}, ${BRANCH2})`);
  await exec(`DELETE FROM organisations WHERE id IN (${ORG1}, ${ORG2})`);
  await exec(`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE slug LIKE 'r4-rbac-%')`);
  await exec(`DELETE FROM roles WHERE slug LIKE 'r4-rbac-%'`);
}

async function createUser(id: number, email: string): Promise<void> {
  await pool.execute(
    `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'R4 User', 'male', 'active')`,
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
  const roleSlug = `r4-rbac-${userId}`;
  await pool.execute(`INSERT IGNORE INTO roles (organisation_id, name, slug) VALUES (NULL, ?, ?)`, [`R4 RBAC ${userId}`, roleSlug]);
  await pool.execute(
    `INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by) SELECT ?, id, ? FROM roles WHERE slug = ? LIMIT 1`,
    [userId, userId, roleSlug],
  );
  await pool.execute(
    `INSERT IGNORE INTO role_permissions (role_id, permission_id)
     SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = ?
     WHERE r.slug = ? LIMIT 1`,
    [permissionKey, roleSlug],
  );
}

async function createSeries(resourceId: number, branchId: number = BRANCH1, operator: number = ADMIN, player: number = PLAYER) {
  return bookingService.createRecurringSeries({
    branchId, resourceId,
    weekdays: [4], // Thursdays
    startDate: '2026-10-01', endDate: '2026-10-29',
    startTime: '18:00', endTime: '20:00',
    playerUserId: player,
  }, operator);
}

async function seriesBookings(seriesId: number) {
  const [rows] = await pool.execute<RowData>(
    `SELECT id, user_id, organisation_id, DATE_FORMAT(booking_date, '%Y-%m-%d') AS bd, start_at_utc, booking_status FROM bookings WHERE series_id = ? ORDER BY booking_date`,
    [seriesId],
  );
  return rows as any[];
}

async function createOutsideBooking(date: string, resourceId: number = RES_B, branchId: number = BRANCH1) {
  const r = await bookingService.createBooking({
    branchId, resourceId, bookingType: 'private_match',
    bookingDate: date, startTime: '12:00', endTime: '13:00', paymentMethod: 'cash',
  }, ADMIN);
  return Number(r.id ?? r.bookingId);
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.REDIS_DB = '0'; process.env.REDIS_PASSWORD = '';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.ENABLE_API_DOCS = 'false';

  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  await cleanupFixtures(async (sql, params) => pool.execute(sql, params));

  await createUser(ADMIN, 'r4-admin@test.com');
  await createUser(PLAYER, 'r4-player@test.com');
  await createUser(SUPER, 'r4-super@test.com');
  await createUser(NO_AUTH, 'r4-noauth@test.com');
  await grantPermission(ADMIN, 'org.bookings.manage');
  await grantPermission(NO_AUTH, 'bookings.view');
  await grantRole(SUPER, 'super_admin');

  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
    VALUES (${ORG1}, UUID(), ?, 1, 'R4 Org One', 'r4-org-one', 1)`, [otId]);
  await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
    VALUES (${ORG2}, UUID(), ?, 1, 'R4 Org Two', 'r4-org-two', 1)`, [otId]);
  await pool.execute(`INSERT INTO branches (id, public_id, organisation_id, name, slug, timezone, opening_time, closing_time)
    VALUES (${BRANCH1}, UUID(), ${ORG1}, 'R4 Branch One', 'r4-branch-one', 'Africa/Cairo', '08:00', '22:00')`);
  await pool.execute(`INSERT INTO branches (id, public_id, organisation_id, name, slug, timezone, opening_time, closing_time)
    VALUES (${BRANCH2}, UUID(), ${ORG2}, 'R4 Branch Two', 'r4-branch-two', 'Africa/Cairo', '08:00', '22:00')`);
  for (const [id, name, branch, sport] of [
    [RES_A, 'R4 Court A', BRANCH1, 19], [RES_B, 'R4 Court B', BRANCH1, 19], [RES_X, 'R4 Court X', BRANCH2, 19],
  ] as const) {
    await pool.execute(
      `INSERT INTO resources (id, public_id, branch_id, resource_type_id, name, sport_id, hourly_price, opening_time, closing_time, is_active, slot_duration)
       VALUES (?, UUID(), ?, 1, ?, ?, 100, '08:00', '22:00', TRUE, 60)`,
      [id, branch, name, sport],
    );
  }

  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  const mod = await import('../application/booking.service.js');
  bookingService = mod.bookingService;

  TimeEngine.setClock(new FakeClock('2026-09-10T12:00:00.000Z'));
}, 60000);

afterAll(async () => {
  TimeEngine.resetClock();
  vi.restoreAllMocks();
  await cleanupFixtures(async (sql, params) => pool.execute(sql, params));
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 30000);

describe('R4 — recurring series lifecycle', () => {
  let S = 0;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('RULE 2: a single occurrence is cancelled independently — series stays active, other occurrences intact', async () => {
    S = (await createSeries(RES_A)).seriesId;
    expect((await seriesBookings(S)).length).toBe(5); // Thu 10-01..10-29

    const rows = await seriesBookings(S);
    const targetId = Number(rows[2].id); // 10-15
    const cancelled = await bookingService.cancelBooking(targetId, PLAYER, 'player_request');
    expect(cancelled.booking_status).toBe('cancelled');

    const after = await seriesBookings(S);
    expect(after.filter((b) => b.booking_status === 'cancelled').length).toBe(1);
    expect(after.filter((b) => b.booking_status === 'pending').length).toBe(4);
    // Series row is NOT changed by a single occurrence cancel.
    const [sr] = await pool.execute<RowData>("SELECT status FROM booking_series WHERE id = ?", [S]);
    expect((sr as any[])[0].status).toBe('active');
  });

  it('RULE 3: series cancellation — future occurrences via the canonical path; already-cancelled untouched; past/completed protected; unrelated bookings untouched; player ownership preserved', async () => {
    // Fixture state: 5 occurrences → 1 already cancelled (10-15), 1 becomes
    // 'past completed' (10-01, start BEFORE the frozen "now"), leaving 3
    // eligible (10-08, 10-22, 10-29).
    await pool.execute<RowData>(
      `UPDATE bookings SET booking_status = 'completed', start_at_utc = '2026-09-01 12:00:00', end_at_utc = '2026-09-01 14:00:00'
       WHERE series_id = ? AND booking_date = '2026-10-01'`, [S],
    );
    const unrelatedId = await createOutsideBooking('2026-10-02');

    const emitSpy = vi.spyOn(eventBusV2, 'emit');

    const result = await bookingService.cancelRecurringSeries(S, ADMIN, 'recurring_series_cancelled');

    expect(result.status).toBe('cancelled');
    expect(result.cancelledCount).toBe(3);
    expect(result.skipped.map((s: any) => s.reason)).toEqual(
      expect.arrayContaining(['past_or_not_yet_started', 'already_cancelled']),
    );

    const d = (v: any) => (v ? String(v.bd || v).slice(0, 10) : '');
    const after = await seriesBookings(S);
    // Exactly the 3 eligible future occurrences were cancelled.
    expect(after.filter((b) => b.booking_status === 'cancelled').length).toBe(4); // includes the RULE-2 manual cancel
    expect(after.filter((b) => d(b) === '2026-10-01' && b.booking_status === 'completed').length).toBe(1);
    expect(after.filter((b) => d(b) === '2026-10-15' && b.booking_status === 'cancelled').length).toBe(1);
    // The 3 newly cancelled are 10-08, 10-22, 10-29 — all owned by the player.
    for (const b of after.filter((x) => ['2026-10-08', '2026-10-22', '2026-10-29'].includes(d(x)))) {
      expect(Number(b.user_id)).toBe(PLAYER);
      expect(Number(b.organisation_id)).toBe(ORG1);
    }
    // Unrelated booking untouched.
    const [uni] = await pool.execute<RowData>('SELECT booking_status FROM bookings WHERE id = ?', [unrelatedId]);
    expect((uni as any[])[0].booking_status).not.toBe('cancelled');

    // Realtime: canonical booking:cancelled fired exactly once per ELIGIBLE
    // occurrence during this call (the 10-15 manual cancel happened earlier);
    // the series event fired ONCE with no duplicates.
    const names = emitSpy.mock.calls.map((c) => c[0] as string);
    expect(names.filter((n) => n === 'booking:cancelled').length).toBe(3);
    expect(names.filter((n) => n === 'recurring:series-cancelled').length).toBe(1);
    emitSpy.mockRestore();
  });

  it('realtime mapping: recurring:series-cancelled routes to admin/org/branch only (no player socket)', () => {
    const mapped = mapDomainEvent('recurring:series-cancelled', {
      seriesId: S, organisationId: ORG1, branchId: BRANCH1, playerUserId: PLAYER, cancelledCount: 3,
    });
    expect(mapped).not.toBeNull();
    expect(mapped!.type).toBe('recurring.series-cancelled');
    expect(mapped!.rooms).toContain('admin');
    expect(mapped!.rooms).toContain(`organisation:${ORG1}`);
    expect(mapped!.rooms).toContain(`branch:${BRANCH1}`);
    expect(mapped!.rooms).not.toContain(`user:${PLAYER}`);
  });

  it('series cancellation is idempotent — a second call cancels nothing and emits nothing new', async () => {
    const emitSpy = vi.spyOn(eventBusV2, 'emit');
    const again = await bookingService.cancelRecurringSeries(S, ADMIN, 'recurring_series_cancelled');
    expect(again.cancelledCount).toBe(0);
    expect(again.status).toBe('cancelled');
    const names = emitSpy.mock.calls.map((c) => c[0] as string);
    expect(names.filter((n) => n === 'recurring:series-cancelled').length).toBe(0);
    expect(names.filter((n) => n === 'booking:cancelled').length).toBe(0);
    emitSpy.mockRestore();
  });

  it('authorization: unauthorized users cannot cancel a series; super admin can', async () => {
    const S2 = (await createSeries(RES_B)).seriesId;
    await expect(
      bookingService.cancelRecurringSeries(S2, NO_AUTH, 'x'),
    ).rejects.toMatchObject({ statusCode: 403 });
    // Super admin can.
    const bySuper = await bookingService.cancelRecurringSeries(S2, SUPER, 'recurring_series_cancelled');
    expect(bySuper.cancelledCount).toBe(5);
    expect(bySuper.status).toBe('cancelled');
  });

  it('tenant isolation: cancelling an ORG2 series never touches ORG1 data', async () => {
    const org1Before = await seriesBookings(S);
    const sX = (await createSeries(RES_X, BRANCH2, ADMIN)).seriesId;
    const res = await bookingService.cancelRecurringSeries(sX, ADMIN, 'recurring_series_cancelled');
    expect(res.cancelledCount).toBe(5);
    const org1After = await seriesBookings(S);
    // ORG1 series bookings are unchanged (same statuses + ids).
    expect(org1After.map((b) => Number(b.id))).toEqual(org1Before.map((b) => Number(b.id)));
    expect(org1After.map((b) => b.booking_status)).toEqual(org1Before.map((b) => b.booking_status));
    // ORG2 series bookings live in ORG2.
    const [org2Check] = await pool.execute<RowData>(
      'SELECT COUNT(*) AS cnt FROM bookings WHERE series_id = ? AND organisation_id = ?', [sX, ORG2],
    );
    expect(Number((org2Check as any[])[0].cnt)).toBe(5);
  });

  it('no payment or accounting rows are created by series cancellation (pending/unpaid occurrences)', async () => {
    const [p] = await pool.execute<RowData>(
      'SELECT COUNT(*) AS cnt FROM payment_transactions WHERE booking_id IN (SELECT id FROM bookings WHERE series_id = ?)', [S],
    );
    expect(Number((p as any[])[0].cnt)).toBe(0);
    const [le] = await pool.execute<RowData>(
      'SELECT COUNT(*) AS cnt FROM ledger_entries WHERE source_type = ? AND source_id IN (SELECT id FROM bookings WHERE series_id = ?)',
      ['booking', S],
    );
    expect(Number((le as any[])[0].cnt)).toBe(0);
  });

  it('audit: the operator + player + affected ids are recorded for a series cancel', async () => {
    const S4 = (await createSeries(RES_B)).seriesId;
    const { cancelRecurringSeriesHandler } = await import('../presentation/booking.controller.js');
    const fakeRequest = { params: { id: String(S4) }, body: { reason: 'recurring_series_cancelled' }, userId: ADMIN, ip: '127.0.0.1', headers: {} } as any;
    const fakeReply = { send: (v: any) => v } as any;
    const handled = await cancelRecurringSeriesHandler(fakeRequest, fakeReply);
    await new Promise((r) => setTimeout(r, 400));
    const [audit] = await pool.execute<RowData>(
      "SELECT actor_id, action, after_state FROM audit_logs WHERE entity_type = 'booking_series' AND entity_id = ? ORDER BY id DESC LIMIT 1",
      [S4],
    );
    expect(Number((audit as any[])[0].actor_id)).toBe(ADMIN);
    expect((audit as any[])[0].action).toBe('BOOKING.CANCEL');
    const after = JSON.parse((audit as any[])[0].after_state);
    expect(after.operatorId).toBe(ADMIN);
    expect(after.playerId).toBe(PLAYER);
    expect(Array.isArray(after.affectedBookingIds)).toBe(true);
    expect(after.affectedBookingIds.length).toBe(handled.cancelledCount);
    expect(handled.cancelledCount).toBe(5);
  });
});