import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

import { TimeEngine, FakeClock } from '../../time/index.js';

// ── R3 — Recurring booking conflict preview & resolution (REAL DB) ─────────
// Exercises previewRecurringSeries (conflict matrix + alternatives) and
// createRecurringSeries (Day-8 rule, player ownership, admin operator audit,
// resolution plan, TOCTOU re-check). Authority = existing responsible-user keys.
//
// Frozen clock: Cairo local 2026-09-10 → Day-8 = 2026-09-17 (players book
// through Day-7; recurring starts Day-8).
//
// Sports: 19 (RES_A/RES_B), 20 (RES_C), 21 (RES_NARROW). Alternative courts
// must share the requested court's sport.

const ORG1 = 10009000, BRANCH1 = 10009000;
const ORG2 = 10009001, BRANCH2 = 10009001;
const BRANCH_NY = 10009002;

const RES_A = 10009000;        // ORG1/BRANCH1, sport19, 08:00-22:00 (requested)
const RES_B = 10009001;        // ORG1/BRANCH1, sport19, 08:00-22:00 (alternative court)
const RES_C = 10009002;        // ORG1/BRANCH1, sport20, 08:00-22:00 (incompatible)
const RES_NARROW = 10009003;   // ORG1/BRANCH1, sport21, 18:00-20:00 (no alternative possible)
const RES_NY = 10009004;       // ORG1/BRANCH_NY, sport19, 08:00-22:00
const RES_X = 10009005;        // ORG2/BRANCH2, sport19, 08:00-22:00

const ADMIN = 10009010;        // org.bookings.manage — OPERATOR
const PLAYER = 10009011;       // beneficiary / booking owner
const ADMIN2 = 10009013;       // org.bookings.manage (ORG2)
const SUPER = 10009014;        // super_admin role
const NO_AUTH = 10009015;      // no responsible-user authority

let pool: mysql.Pool;
let bookingService: any;

const DAY8 = '2026-09-17';
const TZ = 'Africa/Cairo';

async function cleanupFixtures(exec: (sql: string, params?: any[]) => Promise<any>) {
  const users = [ADMIN, PLAYER, ADMIN2, SUPER, NO_AUTH].join(',');
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
  await exec(`DELETE FROM resources WHERE id IN (${RES_A}, ${RES_B}, ${RES_C}, ${RES_NARROW}, ${RES_NY}, ${RES_X})`);
  await exec(`DELETE FROM branches WHERE id IN (${BRANCH1}, ${BRANCH2}, ${BRANCH_NY})`);
  await exec(`DELETE FROM organisations WHERE id IN (${ORG1}, ${ORG2})`);
  await exec(`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE slug LIKE 'r3-rbac-%')`);
  await exec(`DELETE FROM roles WHERE slug LIKE 'r3-rbac-%'`);
}

async function createUser(id: number, email: string): Promise<void> {
  await pool.execute(
    `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'R3 User', 'male', 'active')`,
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
  const roleSlug = `r3-rbac-${userId}`;
  await pool.execute(`INSERT IGNORE INTO roles (organisation_id, name, slug) VALUES (NULL, ?, ?)`, [`R3 RBAC ${userId}`, roleSlug]);
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

function seriesDef(opts: Record<string, any> = {}) {
  return {
    branchId: opts.branchId ?? BRANCH1,
    resourceId: opts.resourceId ?? RES_A,
    weekdays: opts.weekdays ?? [4],
    startDate: opts.startDate ?? '2026-10-01',
    endDate: opts.endDate ?? '2026-10-08',
    startTime: '18:00',
    endTime: '20:00',
    ...opts.extra,
  };
}

async function createSeries(def: Record<string, any>, operator: number = ADMIN, player: number = PLAYER) {
  return bookingService.createRecurringSeries({ ...def, playerUserId: player }, operator);
}

/** Occupy a court 18:00–20:00 on `date` with a normal cash booking (ADMIN owns it). */
async function block(courtId: number, date: string, branchId: number = BRANCH1) {
  const r = await bookingService.createBooking({
    branchId, resourceId: courtId, bookingType: 'private_match',
    bookingDate: date, startTime: '18:00', endTime: '20:00', paymentMethod: 'cash',
  }, ADMIN);
  return Number(r.id ?? r.bookingId);
}

async function countSeriesBookings(seriesId: number): Promise<number> {
  const [rows] = await pool.execute<RowData>('SELECT COUNT(*) AS cnt FROM bookings WHERE series_id = ?', [seriesId]);
  return Number((rows as any[])[0].cnt);
}

function previewOf(def: Record<string, any>) {
  return bookingService.previewRecurringSeries(def);
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.REDIS_DB = '0'; process.env.REDIS_PASSWORD = '';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.ENABLE_API_DOCS = 'false';

  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  await cleanupFixtures(async (sql, params) => pool.execute(sql, params));

  await createUser(ADMIN, 'r3-admin@test.com');
  await createUser(PLAYER, 'r3-player@test.com');
  await createUser(ADMIN2, 'r3-admin2@test.com');
  await createUser(SUPER, 'r3-super@test.com');
  await createUser(NO_AUTH, 'r3-noauth@test.com');
  await grantPermission(ADMIN, 'org.bookings.manage');
  await grantPermission(ADMIN2, 'org.bookings.manage');
  await grantPermission(NO_AUTH, 'bookings.view');
  await grantRole(SUPER, 'super_admin');

  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;

  await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
    VALUES (${ORG1}, UUID(), ?, 1, 'R3 Org One', 'r3-org-one', 1)`, [otId]);
  await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
    VALUES (${ORG2}, UUID(), ?, 1, 'R3 Org Two', 'r3-org-two', 1)`, [otId]);
  await pool.execute(`INSERT INTO branches (id, public_id, organisation_id, name, slug, timezone, opening_time, closing_time)
    VALUES (${BRANCH1}, UUID(), ${ORG1}, 'R3 Branch One', 'r3-branch-one', 'Africa/Cairo', '08:00', '22:00')`);
  await pool.execute(`INSERT INTO branches (id, public_id, organisation_id, name, slug, timezone, opening_time, closing_time)
    VALUES (${BRANCH2}, UUID(), ${ORG2}, 'R3 Branch Two', 'r3-branch-two', 'Africa/Cairo', '08:00', '22:00')`);
  await pool.execute(`INSERT INTO branches (id, public_id, organisation_id, name, slug, timezone, opening_time, closing_time)
    VALUES (${BRANCH_NY}, UUID(), ${ORG1}, 'R3 Branch NY', 'r3-branch-ny', 'America/New_York', '08:00', '22:00')`);

  const mkResource = (id: number, name: string, branch: number, sport: number, opening: string, closing: string) =>
    pool.execute(
      `INSERT INTO resources (id, public_id, branch_id, resource_type_id, name, sport_id, hourly_price, opening_time, closing_time, is_active, slot_duration)
       VALUES (?, UUID(), ?, 1, ?, ?, 100, ?, ?, TRUE, 60)`,
      [id, branch, name, sport, opening, closing],
    );
  await mkResource(RES_A, 'R3 Court A', BRANCH1, 19, '08:00', '22:00');
  await mkResource(RES_B, 'R3 Court B', BRANCH1, 19, '08:00', '22:00');
  await mkResource(RES_C, 'R3 Court C', BRANCH1, 20, '08:00', '22:00');
  await mkResource(RES_NARROW, 'R3 Court Narrow', BRANCH1, 21, '18:00', '20:00');
  await mkResource(RES_NY, 'R3 Court NY', BRANCH_NY, 19, '08:00', '22:00');
  await mkResource(RES_X, 'R3 Court X', BRANCH2, 19, '08:00', '22:00');

  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  const mod = await import('../application/booking.service.js');
  bookingService = mod.bookingService;

  TimeEngine.setClock(new FakeClock('2026-09-10T12:00:00.000Z')); // Cairo 2026-09-10 → Day-8 09-17
}, 60000);

afterAll(async () => {
  TimeEngine.resetClock();
  vi.restoreAllMocks();
  await cleanupFixtures(async (sql, params) => pool.execute(sql, params));
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 30000);

describe('R3 — recurring conflict preview & resolution', () => {
  it('1. recurring starts Day 8 — a series on Day 8 is allowed (never before)', async () => {
    const s = await createSeries(seriesDef({ resourceId: RES_B, weekdays: [4], startDate: '2026-10-01', endDate: '2026-10-08' }));
    expect(s.occurrenceCount).toBe(2);
    for (const occ of s.occurrences) expect(occ.date >= DAY8).toBe(true);
  });

  it('2. Day 7 is rejected — any occurrence before Day 8 rejects the whole series', async () => {
    await expect(
      createSeries(seriesDef({ resourceId: RES_B, weekdays: [4], startDate: '2026-09-10', endDate: '2026-09-24' })),
    ).rejects.toMatchObject({ statusCode: 409 });
    // Nothing created, nothing truncated.
    const [rows] = await pool.execute<RowData>("SELECT COUNT(*) AS cnt FROM bookings WHERE booking_date < ? AND booking_date >= '2026-09-10'", [DAY8]);
    expect(Number((rows as any[])[0].cnt)).toBe(0);
  });

  it('3. preview contains every occurrence of the full selected range', async () => {
    const def = seriesDef({ resourceId: RES_C, weekdays: [1, 4], startDate: '2026-10-05', endDate: '2026-10-19' });
    const p = await previewOf(def);
    const expected = ['2026-10-05', '2026-10-08', '2026-10-12', '2026-10-15', '2026-10-19'];
    expect(p.count).toBe(5);
    expect(p.occurrences).toHaveLength(5);
    expect(p.occurrences.map((o: any) => o.date)).toEqual(expected);
    for (const o of p.occurrences) {
      expect(o.status).toMatch(/^(available|conflict)$/);
      expect(o.occurrenceKey).toBe(o.date);
      expect([1, 4]).toContain(o.weekday);
    }
    expect(p.allowedStartDate).toBe(DAY8);
  });

  it('4+5+8+9. an existing booking is a visible conflict; alternative COURTS are offered first (same branch/sport, same date), never another date/weekday', async () => {
    await block(RES_A, '2026-10-22'); // occupy requested court on Thu 10-22
    const def = seriesDef({ resourceId: RES_A, weekdays: [4], startDate: '2026-10-22', endDate: '2026-11-05' });
    const p = await previewOf(def);

    const conflict = p.occurrences.find((o: any) => o.date === '2026-10-22');
    expect(conflict.status).toBe('conflict');
    expect(conflict.conflictReason).toBeTruthy();
    // Alternative courts FIRST: RES_B (same branch + same sport) is offered.
    const courtIds = conflict.alternativeCourts.map((c: any) => c.courtId);
    expect(courtIds).toContain(RES_B);
    expect(courtIds).not.toContain(RES_C); // different sport — incompatible
    // No alternative time is suggested while a court alternative exists.
    expect(conflict.alternativeTimes).toHaveLength(0);
    // Never another date/weekday: every occurrence is the requested date/weekday.
    for (const o of p.occurrences) {
      expect(o.weekday).toBe(4);
      expect(o.date >= DAY8).toBe(true);
    }
  });

  it('6. same-day alternative TIMES are returned only when no court alternative exists', async () => {
    // Occupy BOTH same-sport courts on 11-05 → no court alternative.
    await block(RES_A, '2026-11-05');
    await block(RES_B, '2026-11-05');
    const def = seriesDef({ resourceId: RES_A, weekdays: [4], startDate: '2026-11-05', endDate: '2026-11-05' });
    const p = await previewOf(def);
    const occ = p.occurrences[0];
    expect(occ.status).toBe('conflict');
    expect(occ.alternativeCourts).toHaveLength(0);
    expect(occ.alternativeTimes.length).toBeGreaterThan(0);
    // All alternatives stay on the SAME date and court: they carry no date and
    // the occurrence date itself never changes.
    expect(occ.date).toBe('2026-11-05');
    for (const t of occ.alternativeTimes) {
      expect(t.startTime).toMatch(/^\d{2}:\d{2}$/);
      expect(t.endTime).toMatch(/^\d{2}:\d{2}$/);
      expect(t.endTime > t.startTime).toBe(true);
    }
  });

  it('7. no alternatives produces an explicit "no alternative available" state', async () => {
    await block(RES_NARROW, '2026-10-08'); // narrow court 18:00-20:00, sport 21
    const def = seriesDef({ resourceId: RES_NARROW, weekdays: [4], startDate: '2026-10-08', endDate: '2026-10-08' });
    const p = await previewOf(def);
    const occ = p.occurrences[0];
    expect(occ.status).toBe('conflict');
    expect(occ.alternativeCourts).toHaveLength(0); // no other sport-21 court
    expect(occ.alternativeTimes).toHaveLength(0);  // operating hours == requested window
    expect(occ.hasAlternative).toBe(false);
  });

  it('10. an admin can select an ALTERNATIVE COURT for a conflicting occurrence', async () => {
    const def = seriesDef({ resourceId: RES_A, weekdays: [4], startDate: '2026-10-22', endDate: '2026-10-29' });
    const s = await createSeries({ ...def, resolutions: [{ occurrenceDate: '2026-10-22', action: 'book', courtId: RES_B }] });
    expect(s.occurrenceCount).toBe(2); // 10-22 (→ RES_B), 10-29 (RES_A)

    const [rows] = await pool.execute<RowData>(
      `SELECT resource_id FROM bookings WHERE series_id = ? AND booking_date = '2026-10-22'`,
      [s.seriesId],
    );
    expect(Number((rows as any[])[0].resource_id)).toBe(RES_B);
    // The conflicting original court was NOT overwritten (still the blocking booking).
    const [still] = await pool.execute<RowData>(
      "SELECT COUNT(*) AS cnt FROM bookings WHERE resource_id = ? AND booking_date = '2026-10-22' AND start_time = '18:00:00' AND booking_status <> 'cancelled'",
      [RES_A],
    );
    expect(Number((still as any[])[0].cnt)).toBe(1);
  });

  it('11. an admin can select a SAME-DAY alternative time (same court, same date, duration preserved)', async () => {
    // RES_A + RES_B occupied on 11-05 → preview offered alternative times on RES_A.
    const def = seriesDef({ resourceId: RES_A, weekdays: [4], startDate: '2026-11-05', endDate: '2026-11-05' });
    const s = await createSeries({ ...def, resolutions: [{ occurrenceDate: '2026-11-05', action: 'book', startTime: '11:00', endTime: '13:00' }] });
    expect(s.occurrenceCount).toBe(1);
    const [rows] = await pool.execute<RowData>(
      `SELECT resource_id, DATE_FORMAT(start_time, '%H:%i') AS st, DATE_FORMAT(end_time, '%H:%i') AS et FROM bookings WHERE series_id = ?`,
      [s.seriesId],
    );
    expect(Number((rows as any[])[0].resource_id)).toBe(RES_A); // same court
    expect((rows as any[])[0].st).toBe('11:00');
    expect((rows as any[])[0].et).toBe('13:00'); // same duration (120 min)
  });

  it('12+17. an admin can cancel ONE occurrence — no booking row is created for it', async () => {
    const def = seriesDef({ resourceId: RES_C, weekdays: [1], startDate: '2026-10-26', endDate: '2026-11-09' });
    const s = await createSeries({ ...def, resolutions: [{ occurrenceDate: '2026-10-26', action: 'skip' }] });
    expect(s.occurrenceCount).toBe(2); // 11-02, 11-09; 10-26 cancelled
    const [cancelled] = await pool.execute<RowData>(
      'SELECT COUNT(*) AS cnt FROM bookings WHERE series_id = ? AND booking_date = ?',
      [s.seriesId, '2026-10-26'],
    );
    expect(Number((cancelled as any[])[0].cnt)).toBe(0); // no fake booking row
    expect(await countSeriesBookings(s.seriesId)).toBe(2);
  });

  it('13. an admin can cancel the ENTIRE proposed series — nothing is created', async () => {
    const def = seriesDef({ resourceId: RES_C, weekdays: [1], startDate: '2026-10-26', endDate: '2026-11-09' });
    await expect(
      createSeries({ ...def, resolutions: [
        { occurrenceDate: '2026-10-26', action: 'skip' },
        { occurrenceDate: '2026-11-02', action: 'skip' },
        { occurrenceDate: '2026-11-09', action: 'skip' },
      ] }),
    ).rejects.toMatchObject({ statusCode: 409 });
    const [rows] = await pool.execute<RowData>(
      "SELECT COUNT(*) AS cnt FROM booking_series WHERE resource_id = ? AND created_by = ?", [RES_C, ADMIN],
    );
    // only the #12 series (RES_C) exists — nothing from this attempted full cancel.
    expect(Number((rows as any[])[0].cnt)).toBe(1);
  });

  it('14+15+16. final confirmation RE-CHECKS availability (TOCTOU) and never overwrites an existing booking', async () => {
    const def = seriesDef({ resourceId: RES_A, weekdays: [4], startDate: '2026-11-12', endDate: '2026-11-12' });
    const previewBefore = await previewOf(def);
    expect(previewBefore.occurrences[0].status).toBe('available');

    // Another booking appears between preview and confirm (an admin books it).
    const blockerId = await block(RES_A, '2026-11-12');
    await expect(createSeries({ ...def })).rejects.toMatchObject({ statusCode: 409 });

    // Nothing created; the existing booking is untouched.
    const [seriesRows] = await pool.execute<RowData>("SELECT COUNT(*) AS cnt FROM booking_series WHERE resource_id = ? AND start_date = '2026-11-12'", [RES_A]);
    expect(Number((seriesRows as any[])[0].cnt)).toBe(0);
    const [bk] = await pool.execute<RowData>('SELECT booking_status FROM bookings WHERE id = ?', [blockerId]);
    expect((bk as any[])[0].booking_status).not.toBe('cancelled');
  });

  it('18+19+20. final plan creates exactly one canonical booking per selected occurrence, owned by the PLAYER, with the ADMIN operator auditable', async () => {
    const def = seriesDef({ resourceId: RES_C, weekdays: [4], startDate: '2026-11-12', endDate: '2026-11-26' });
    const s = await createSeries({ ...def,
      resolutions: [{ occurrenceDate: '2026-11-19', action: 'book', courtId: RES_B }],
    });
    expect(s.occurrenceCount).toBe(3); // 11-12, 11-19→RES_B, 11-26
    const [rows] = await pool.execute<RowData>(
      `SELECT resource_id, user_id, series_id, notes FROM bookings WHERE series_id = ? ORDER BY booking_date`,
      [s.seriesId],
    );
    expect((rows as any[]).length).toBe(3);
    for (const r of rows as any[]) {
      expect(Number(r.series_id)).toBe(s.seriesId);
      expect(Number(r.user_id)).toBe(PLAYER); // OWNER = player
    }
    // Operator on the series row.
    const [sr] = await pool.execute<RowData>('SELECT created_by FROM booking_series WHERE id = ?', [s.seriesId]);
    expect(Number((sr as any[])[0].created_by)).toBe(ADMIN);
    // Operator embedded in every occurrence booking's notes (audit reference).
    for (const r of rows as any[]) {
      const notes = JSON.parse(r.notes);
      expect(notes.operatorId).toBe(ADMIN);
      expect(notes.playerId).toBe(PLAYER);
      expect(notes.seriesId).toBe(s.seriesId);
    }
    // The Audit Log records the operator + player (via the real controller path).
    const { createRecurringSeriesHandler } = await import('../presentation/booking.controller.js');
    const auditDef = seriesDef({ resourceId: RES_A, weekdays: [4], startDate: '2026-12-03', endDate: '2026-12-03' });
    const fakeRequest = {
      body: { ...auditDef, playerUserId: PLAYER },
      userId: ADMIN,
      ip: '127.0.0.1',
      headers: { 'user-agent': 'r3-test' },
    } as any;
    const fakeReply = { status: () => fakeReply, send: () => fakeReply } as any;
    await createRecurringSeriesHandler(fakeRequest, fakeReply);
    await new Promise((r) => setTimeout(r, 400));
    const [audit] = await pool.execute<RowData>(
      "SELECT actor_id, after_state FROM audit_logs WHERE entity_type = 'booking_series' ORDER BY id DESC LIMIT 1",
    );
    expect(Number((audit as any[])[0].actor_id)).toBe(ADMIN);
    const after = JSON.parse((audit as any[])[0].after_state);
    expect(after.playerId).toBe(PLAYER);
    expect(after.operatorId).toBe(ADMIN);
    expect(after.resolutions).toBeDefined();
  });

  it('21. tenant isolation: series data stays inside its organisation', async () => {
    const s2 = await createSeries(seriesDef({ resourceId: RES_X, branchId: BRANCH2, weekdays: [1], startDate: '2026-11-16', endDate: '2026-11-23' }), ADMIN2);
    expect(s2.occurrenceCount).toBe(2);
    const [rows] = await pool.execute<RowData>(
      'SELECT DISTINCT organisation_id, branch_id FROM bookings WHERE series_id = ?', [s2.seriesId],
    );
    expect(Number((rows as any[])[0].organisation_id)).toBe(ORG2);
    expect(Number((rows as any[])[0].branch_id)).toBe(BRANCH2);
    const globalList = await bookingService.listRecurringSeries({}, SUPER);
    expect((globalList.data as any[]).length).toBeGreaterThan(0);
    const org2List = await bookingService.listRecurringSeries({ organisationId: ORG2 }, SUPER);
    expect((org2List.data as any[]).every((x: any) => x.organisationId === ORG2)).toBe(true);
  });

  it('22. branch isolation: a resource from another branch is rejected', async () => {
    await expect(
      createSeries(seriesDef({ resourceId: RES_X, branchId: BRANCH1 })),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('23. no payment rows and 24. no accounting rows are created by the recurring core', async () => {
    const [p] = await pool.execute<RowData>(
      'SELECT COUNT(*) AS cnt FROM payment_transactions WHERE user_id = ? AND booking_id IN (SELECT id FROM bookings WHERE series_id IN (SELECT id FROM booking_series WHERE created_by = ?))',
      [PLAYER, ADMIN],
    );
    expect(Number((p as any[])[0].cnt)).toBe(0);
    const [le] = await pool.execute<RowData>(
      'SELECT COUNT(*) AS cnt FROM ledger_entries WHERE source_type = ? AND source_id IN (SELECT id FROM bookings WHERE series_id IN (SELECT id FROM booking_series WHERE created_by = ?))',
      ['booking', ADMIN],
    );
    expect(Number((le as any[])[0].cnt)).toBe(0);
  });

  it('25. idempotency is preserved through the new resolution flow', async () => {
    const def = seriesDef({ resourceId: RES_NARROW, weekdays: [4], startDate: '2026-10-15', endDate: '2026-10-15', extra: { idempotencyKey: 'r3-idem-key-0002' } });
    const first = await createSeries(def);
    const before = await countSeriesBookings(first.seriesId);
    const second = await createSeries(def);
    expect(second.seriesId).toBe(first.seriesId);
    expect(await countSeriesBookings(first.seriesId)).toBe(before);
  });

  it('26. DST-safe alternative evaluation keeps LOCAL times across the transition', async () => {
    await block(RES_NY, '2026-11-01', BRANCH_NY); // EDT→EST fall-back 18:00-20:00
    const def = seriesDef({ resourceId: RES_NY, branchId: BRANCH_NY, weekdays: [6, 7], startDate: '2026-10-31', endDate: '2026-11-07' });
    const p = await previewOf(def);
    const sunday = p.occurrences.find((o: any) => o.date === '2026-11-01');
    expect(sunday.status).toBe('conflict');
    // Alternative times (same court, same date) are evaluated in LOCAL time.
    for (const t of sunday.alternativeTimes) {
      expect(t.startTime).toMatch(/^\d{2}:\d{2}$/);
    }
    // Occurrences preserve local 18:00 and the UTC instant reflects the DST offset.
    expect(p.occurrences[0].startTime).toBe('18:00');   // 10-31 EDT → 22:00Z
    expect(p.occurrences[0].startAtUtc).toBe('2026-10-31T22:00:00.000Z');
    expect(sunday.startTime).toBe('18:00');              // 11-01 EST → 23:00Z
    expect(sunday.startAtUtc).toBe('2026-11-01T23:00:00.000Z');
  });

  it('27. branch timezone correctness in the preview matrix', async () => {
    const cairo = await previewOf(seriesDef({ resourceId: RES_B, weekdays: [4], startDate: '2026-11-05', endDate: '2026-11-05' }));
    expect(cairo.timezone).toBe('Africa/Cairo');
    expect(cairo.allowedStartDate).toBe(DAY8);
    // Cairo 18:00 on 2026-11-05 = 16:00Z (EET UTC+2 from the last Friday of October).
    expect(cairo.occurrences[0].startTime).toBe('18:00');
    expect(cairo.occurrences[0].startAtUtc).toBe('2026-11-05T16:00:00.000Z');

    const ny = await previewOf(seriesDef({ resourceId: RES_NY, branchId: BRANCH_NY, weekdays: [4], startDate: '2026-11-05', endDate: '2026-11-05' }));
    expect(ny.timezone).toBe('America/New_York');
    expect(ny.occurrences[0].startAtUtc).toBe('2026-11-05T23:00:00.000Z'); // EST UTC-5
  });
});