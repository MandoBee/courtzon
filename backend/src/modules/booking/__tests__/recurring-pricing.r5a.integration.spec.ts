import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { TimeEngine, FakeClock } from '../../time/index.js';

// ── R5-A — Canonical date-aware pricing for recurring occurrences (REAL DB) ──
//
// Exercises the FULL recurring pricing path against the real schema:
//   previewRecurringSeries -> per-occurrence canonical price + series total
//   createRecurringSeries  -> per-occurrence persisted price + series total
//
// THE BUG BEING CLOSED:
//   PricingEngine.calculatePrice() derived the pricing weekday from
//   `new Date()` (the machine's current date). A Monday+Thursday series
//   therefore priced EVERY occurrence with the *server's* weekday rule.
//
//   The court has DIFFERENT peak multipliers per weekday — Monday x2.0
//   (1600) and Thursday x1.5 (1200) — so a series-wide constant is impossible
//   to fake. Every assertion below compares the persisted per-occurrence
//   amounts against the weekday-derived expectation.

const ORG1 = 10050000, BRANCH_CAIRO = 10050000, BRANCH_NY = 10050001;
const ORG2 = 10050002, BRANCH2 = 10050002;

const RES_MAIN = 10050000; // Cairo, hourly 400. Mon x2.0 / Thu x1.5 on 18-20
const RES_ALT = 10050001;  // Cairo, hourly 800. Mon x1.25 / Thu x1.75 on 18-20
const RES_MID = 10050002;  // Cairo, hourly 400. Wed x3.0 / Thu x1.5 on 00-02
const RES_NY = 10050003;   // New York, hourly 400. Sun x2.0 on 10-12
const RES_X = 10050004;    // ORG2 branch (tenant isolation), no peak rows

const ADMIN = 10050010;    // org.bookings.manage — OPERATOR
const PLAYER = 10050011;   // beneficiary / booking owner
const ADMIN2 = 10050012;   // org.bookings.manage in ORG2
const NO_AUTH = 10050013;  // no responsible-user authority
const PLAN = 10050090;     // subscription plan carrying the booking commission

const TZ = 'Africa/Cairo';
const TZ_NY = 'America/New_York';

// Commission + tax are CONFIGURED for ORG1 so the economic snapshot is real.
const COMMISSION_PCT = 10;
const TAX_PCT = 14;

// Clock frozen on a MONDAY (Cairo local 2026-09-07) -> Day-8 minimum = 2026-09-14.
const CLOCK_ISO = '2026-09-07T09:00:00.000Z';
const DAY8 = '2026-09-14';

// Canonical per-occurrence prices on RES_MAIN / RES_ALT for an 18:00-20:00 window.
const PRICE = { mon: 1600, thu: 1200 };
const ALT_PRICE = { mon: 2000, thu: 2800 };

let pool: mysql.Pool;
let bookingService: any;
let RecurringCreateSchema: any;

async function cleanup(exec: (sql: string, params?: any[]) => Promise<any>) {
  const users = [ADMIN, PLAYER, ADMIN2, NO_AUTH].join(',');
  // financial_journal_entries uses the loose-reference pattern (no org column).
  await exec(`DELETE FROM financial_journal_entries WHERE reference_type = 'booking' AND reference_id IN (SELECT id FROM bookings WHERE user_id IN (${users}))`);
  await exec(`DELETE FROM booking_slots WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (${users}))`);
  await exec(`DELETE FROM bookings WHERE user_id IN (${users})`);
  await exec(`DELETE FROM booking_series WHERE created_by IN (${users})`);
  await exec(`DELETE FROM ledger_entries WHERE organisation_id IN (${ORG1}, ${ORG2})`);
  await exec(`DELETE FROM general_ledger WHERE organisation_id IN (${ORG1}, ${ORG2})`);
  await exec(`DELETE FROM payment_transactions WHERE user_id IN (${users})`);
  await exec(`DELETE FROM user_roles WHERE user_id IN (${users})`);
  await exec(`DELETE FROM user_wallets WHERE user_id IN (${users})`);
  await exec(`DELETE FROM audit_logs WHERE entity_type = 'booking_series'`);
  await exec(`DELETE FROM users WHERE id IN (${users})`);
  await exec(`DELETE FROM organisation_subscriptions WHERE organisation_id IN (${ORG1}, ${ORG2})`);
  await exec(`DELETE FROM subscription_plan_rates WHERE plan_id = ?`, [PLAN]);
  await exec(`DELETE FROM subscription_plans WHERE id = ?`, [PLAN]);
  await exec(`DELETE FROM tax_rates WHERE organisation_id IN (${ORG1}, ${ORG2})`);
  await exec(`DELETE FROM peak_hour_pricing WHERE resource_id IN (${RES_MAIN}, ${RES_ALT}, ${RES_MID}, ${RES_NY}, ${RES_X})`);
  await exec(`DELETE FROM resources WHERE id IN (${RES_MAIN}, ${RES_ALT}, ${RES_MID}, ${RES_NY}, ${RES_X})`);
  await exec(`DELETE FROM branches WHERE id IN (${BRANCH_CAIRO}, ${BRANCH_NY}, ${BRANCH2})`);
  await exec(`DELETE FROM organisations WHERE id IN (${ORG1}, ${ORG2})`);
  await exec(`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE slug LIKE 'r5a-rbac-%')`);
  await exec(`DELETE FROM roles WHERE slug LIKE 'r5a-rbac-%'`);
}

async function createUser(id: number, email: string) {
  await pool.execute(
    `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'R5A User', 'male', 'active')`,
    [id, `015${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, email],
  );
  await pool.execute(`INSERT INTO user_wallets (user_id, balance, currency_code, version) VALUES (?, 0, 'EGP', 1)`, [id]);
}

async function grantPermission(userId: number, permissionKey: string) {
  const roleSlug = `r5a-rbac-${userId}`;
  await pool.execute(`INSERT IGNORE INTO roles (organisation_id, name, slug) VALUES (NULL, ?, ?)`, [`R5A RBAC ${userId}`, roleSlug]);
  await pool.execute(
    `INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by) SELECT ?, id, ? FROM roles WHERE slug = ? LIMIT 1`,
    [userId, userId, roleSlug],
  );
  await pool.execute(
    `INSERT IGNORE INTO role_permissions (role_id, permission_id)
     SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = ? WHERE r.slug = ? LIMIT 1`,
    [permissionKey, roleSlug],
  );
}

function def(opts: Record<string, any> = {}) {
  return {
    branchId: BRANCH_CAIRO,
    resourceId: RES_MAIN,
    weekdays: [1, 4],
    startDate: DAY8,
    endDate: '2026-10-08',
    startTime: '18:00',
    endTime: '20:00',
    ...opts,
  };
}
function create(defObj: Record<string, any>, operator = ADMIN, player = PLAYER) {
  return bookingService.createRecurringSeries({ ...defObj, playerUserId: player }, operator);
}
function preview(defObj: Record<string, any>) {
  return bookingService.previewRecurringSeries(defObj);
}

// ── Derived expectations (from the canonical weekday, never hardcoded counts) ─
/** The canonical occurrence dates a definition produces. */
function expectedDates(d: { weekdays: number[]; startDate: string; endDate: string }) {
  return TimeEngine.generateWeeklyOccurrences({
    startDate: d.startDate,
    endDate: d.endDate,
    weekdays: d.weekdays,
    startTime: '18:00',
    endTime: '20:00',
    timezone: TZ,
  }).map((o) => o.date);
}
/** Canonical RES_MAIN 18:00-20:00 price for a branch-local date. */
function expectedPrice(date: string) {
  return TimeEngine.getLocalDayOfWeekFromDate(date) === 1 ? PRICE.mon : PRICE.thu;
}
function expectedTotal(d: { weekdays: number[]; startDate: string; endDate: string }) {
  return Math.round(expectedDates(d).reduce((s, date) => s + expectedPrice(date), 0) * 100) / 100;
}

async function bookingRows(seriesId: number) {
  // DATE_FORMAT: mysql2 returns a DATE column as a local-midnight JS Date, so a
  // plain `booking_date` read is ambiguous. The repo convention is to format in
  // SQL (see booking-v2-business-date.integration.spec.ts).
  const [rows] = await pool.execute<RowData>(
    `SELECT DATE_FORMAT(booking_date, '%Y-%m-%d') AS booking_date, start_time, total_amount,
            commission_amount, club_amount, tax_amount, tax_rate, tax_treatment
       FROM bookings WHERE series_id = ? ORDER BY booking_date`,
    [seriesId],
  );
  return rows as any[];
}

/** Zero-delta guard: proves R5-A produces no financial side effects. */
async function financialSnapshot() {
  const users = [PLAYER, ADMIN].join(',');
  const [pt] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM payment_transactions WHERE user_id IN (?,?)', [PLAYER, ADMIN]);
  const [le] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM ledger_entries WHERE organisation_id IN (?,?)', [ORG1, ORG2]);
  const [gl] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM general_ledger WHERE organisation_id IN (?,?)', [ORG1, ORG2]);
  const [fj] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS c FROM financial_journal_entries
     WHERE reference_type = 'booking' AND reference_id IN (SELECT id FROM bookings WHERE user_id IN (${users}))`, []);
  return { payment: Number((pt as any[])[0].c), ledger: Number((le as any[])[0].c), gl: Number((gl as any[])[0].c), je: Number((fj as any[])[0].c) };
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.REDIS_DB = '0'; process.env.REDIS_PASSWORD = '';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.ENABLE_API_DOCS = 'false';

  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  await cleanup(async (sql, params) => pool.execute(sql, params));

  await createUser(ADMIN, 'r5a-admin@test.com');
  await createUser(PLAYER, 'r5a-player@test.com');
  await createUser(ADMIN2, 'r5a-admin2@test.com');
  await createUser(NO_AUTH, 'r5a-noauth@test.com');
  await grantPermission(ADMIN, 'org.bookings.manage');
  await grantPermission(ADMIN2, 'org.bookings.manage');
  await grantPermission(NO_AUTH, 'bookings.view');

  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG1}, UUID(), ?, 1, 'R5A Org One', 'r5a-org-one', 1)`, [otId]);
  await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG2}, UUID(), ?, 1, 'R5A Org Two', 'r5a-org-two', 1)`, [otId]);
  await pool.execute(`INSERT INTO branches (id, public_id, organisation_id, name, slug, timezone, opening_time, closing_time) VALUES (${BRANCH_CAIRO}, UUID(), ${ORG1}, 'R5A Cairo', 'r5a-cairo', '${TZ}', '00:00', '23:59')`);
  await pool.execute(`INSERT INTO branches (id, public_id, organisation_id, name, slug, timezone, opening_time, closing_time) VALUES (${BRANCH_NY}, UUID(), ${ORG1}, 'R5A NY', 'r5a-ny', '${TZ_NY}', '00:00', '23:59')`);
  await pool.execute(`INSERT INTO branches (id, public_id, organisation_id, name, slug, timezone, opening_time, closing_time) VALUES (${BRANCH2}, UUID(), ${ORG2}, 'R5A Two', 'r5a-two', '${TZ}', '08:00', '22:00')`);

  const mkResource = (id: number, name: string, branch: number, hourly: number, opening: string, closing: string, sport = 19) =>
    pool.execute(
      `INSERT INTO resources (id, public_id, branch_id, resource_type_id, name, sport_id, hourly_price, opening_time, closing_time, is_active, slot_duration)
       VALUES (?, UUID(), ?, 1, ?, ?, ?, ?, ?, TRUE, 60)`,
      [id, branch, name, sport, hourly, opening, closing],
    );
  await mkResource(RES_MAIN, 'R5A Main', BRANCH_CAIRO, 400, '00:00', '23:59');
  await mkResource(RES_ALT, 'R5A Alt', BRANCH_CAIRO, 800, '00:00', '23:59');
  await mkResource(RES_MID, 'R5A Midnight', BRANCH_CAIRO, 400, '00:00', '23:59');
  await mkResource(RES_NY, 'R5A NY Court', BRANCH_NY, 400, '00:00', '23:59');
  await mkResource(RES_X, 'R5A Foreign', BRANCH2, 400, '08:00', '22:00');

  // DIFFERENT peak multipliers per weekday — this is what makes the bug visible.
  const addPeak = (resource: number, day: number, from: string, to: string, mult: number) =>
    pool.execute(`INSERT INTO peak_hour_pricing (resource_id, day_of_week, start_time, end_time, price_multiplier) VALUES (?, ?, ?, ?, ?)`,
      [resource, day, from, to, mult]);
  await addPeak(RES_MAIN, 1, '18:00', '20:00', '2.00');   // Mon 400*2*2.00 = 1600
  await addPeak(RES_MAIN, 4, '18:00', '20:00', '1.50');   // Thu 400*2*1.50 = 1200
  await addPeak(RES_ALT, 1, '18:00', '20:00', '1.25');    // Mon 800*2*1.25 = 2000
  await addPeak(RES_ALT, 4, '18:00', '20:00', '1.75');    // Thu 800*2*1.75 = 2800
  await addPeak(RES_MID, 3, '00:00', '02:00', '3.00');    // Wed 400*1*3.00 = 1200
  await addPeak(RES_MID, 4, '00:00', '02:00', '1.50');    // Thu 400*1*1.50 =  600
  await addPeak(RES_NY, 7, '10:00', '12:00', '2.00');     // Sun 400*2*2.00 = 1600

  // Real commission + tax so the economic snapshot is genuinely non-zero.
  await pool.execute(
    `INSERT INTO subscription_plans (id, plan_name, price_monthly, is_active, is_internal, sort_order)
     VALUES (?, 'R5A Plan', 0, 1, 1, 0)`, [PLAN]);
  await pool.execute(
    `INSERT INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES (?, 'booking', 'percentage', ?)`,
    [PLAN, COMMISSION_PCT]);
  await pool.execute(
    `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, start_date, end_date, subscription_status, auto_renew)
     VALUES (?, ?, 'monthly', '2020-01-01', '2099-01-01', 'active', 0)`, [ORG1, PLAN]);
  await pool.execute(
    `INSERT INTO tax_rates (organisation_id, name, rate, type, tax_category, is_active, is_global)
     VALUES (?, 'R5A VAT', ?, 'percentage', 'vat', 1, 0)`, [ORG1, TAX_PCT]);

  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  const mod = await import('../application/booking.service.js');
  bookingService = mod.bookingService;
  const dto = await import('../presentation/booking.dto.js');
  RecurringCreateSchema = dto.RecurringCreateSchema;

  TimeEngine.setClock(new FakeClock(CLOCK_ISO));
}, 60000);

afterAll(async () => {
  TimeEngine.resetClock();
  vi.restoreAllMocks();
  await cleanup(async (sql, params) => pool.execute(sql, params));
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 30000);

// ─────────────────────────────────────────────────────────────────────────────
describe('R5-A — occurrence-local pricing (Monday vs Thursday)', () => {
  it('1. a Monday+Thursday series prices each occurrence on its OWN weekday', async () => {
    const d = def({ weekdays: [1, 4], startDate: DAY8, endDate: '2026-10-08' });
    const s = await create(d);
    const rows = await bookingRows(s.seriesId);

    expect(rows.map((r) => r.booking_date.slice(0, 10))).toEqual(expectedDates(d));
    for (const r of rows) expect(Number(r.total_amount)).toBe(expectedPrice(r.booking_date.slice(0, 10)));

    // BOTH weekday prices are present and DIFFER — no series-wide constant.
    const distinct = new Set(rows.map((r) => Number(r.total_amount)));
    expect(distinct).toEqual(new Set([PRICE.mon, PRICE.thu]));
    expect(s.seriesTotal).toBe(expectedTotal(d));
  });

  it('2. a Monday-only series prices every occurrence identically', async () => {
    const d = def({ weekdays: [1], startDate: '2026-10-12', endDate: '2026-10-26' });
    const s = await create(d);
    const rows = await bookingRows(s.seriesId);
    expect(rows.length).toBe(expectedDates(d).length);
    expect(rows.length).toBeGreaterThan(1);
    for (const r of rows) expect(Number(r.total_amount)).toBe(PRICE.mon);
    expect(s.seriesTotal).toBe(PRICE.mon * rows.length);
  });

  it('3. a Thursday-only series uses the THURSDAY rule, never the Monday one', async () => {
    const d = def({ weekdays: [4], startDate: '2026-11-02', endDate: '2026-11-16' });
    const s = await create(d);
    const rows = await bookingRows(s.seriesId);
    expect(rows.length).toBe(expectedDates(d).length);
    expect(rows.length).toBeGreaterThan(1);
    for (const r of rows) expect(Number(r.total_amount)).toBe(PRICE.thu);
    expect(s.seriesTotal).toBe(PRICE.thu * rows.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('R5-A — series total is the exact sum of occurrence canonical prices', () => {
  it('8.1 seriesTotal === SUM(persisted per-occurrence total_amount) exactly', async () => {
    const d = def({ weekdays: [1, 4], startDate: '2026-12-07', endDate: '2026-12-21' });
    const s = await create(d);
    const rows = await bookingRows(s.seriesId);
    const persisted = Math.round(rows.reduce((sum, r) => sum + Number(r.total_amount), 0) * 100) / 100;
    expect(s.seriesTotal).toBe(persisted);
    expect(s.seriesTotal).toBe(expectedTotal(d));
  });

  it('8.2 the stored amount is 2dp and each occurrence exposes its own breakdown', async () => {
    const d = def({ weekdays: [1, 4], startDate: '2027-01-04', endDate: '2027-01-18' });
    const s = await create(d);
    expect(s.occurrences.length).toBe(expectedDates(d).length);
    for (const occ of s.occurrences) {
      expect(occ.totalAmount).toBe(Math.round(occ.totalAmount * 100) / 100);
      expect(occ.totalAmount).toBe(expectedPrice(occ.date));
      expect(occ.weekday).toBe(TimeEngine.getLocalDayOfWeekFromDate(occ.date));
    }
    expect(s.seriesTotal).toBe(expectedTotal(d));
  });

  it('8.3 a longer mixed series is never collapsed to a single amount', async () => {
    const d = def({ weekdays: [1, 4], startDate: '2027-01-25', endDate: '2027-03-08' });
    const s = await create(d);
    const rows = await bookingRows(s.seriesId);
    expect(new Set(rows.map((r) => Number(r.total_amount))).size).toBe(2);
    expect(s.seriesTotal).toBe(expectedTotal(d));
    // And it is strictly less than "one price x occurrences" for either price.
    expect(s.seriesTotal).toBeLessThan(PRICE.mon * rows.length);
    expect(s.seriesTotal).toBeGreaterThan(PRICE.thu * rows.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('R5-A — preview exposes authoritative per-occurrence pricing', () => {
  it('9.1 preview prices every occurrence and exposes the series total', async () => {
    const d = def({ weekdays: [1, 4], startDate: '2027-03-22', endDate: '2027-04-05' });
    const p = await preview(d);

    expect(p.occurrences.map((o: any) => o.date)).toEqual(expectedDates(d));
    const sum = p.occurrences.reduce((s: number, o: any) => s + o.pricing.totalAmount, 0);
    expect(Math.round(sum * 100) / 100).toBe(p.seriesTotal);
    expect(p.seriesTotal).toBe(expectedTotal(d));

    for (const o of p.occurrences) {
      expect(o.pricing.date).toBe(o.date);
      expect(o.pricing.startTime).toBe('18:00');
      expect(o.pricing.endTime).toBe('20:00');
      expect(o.pricing.totalAmount).toBe(expectedPrice(o.date));
      // economics travel with the occurrence so the UI can render them
      expect(o.pricing).toHaveProperty('commissionAmount');
      expect(o.pricing).toHaveProperty('clubAmount');
      expect(o.pricing).toHaveProperty('taxAmount');
      expect(o.pricing).toHaveProperty('taxRate');
      expect(o.pricing).toHaveProperty('taxTreatment');
    }
  });

  it('9.2 the reported pricing weekday is the OCCURRENCE weekday', async () => {
    const d = def({ weekdays: [1, 4], startDate: '2027-04-12', endDate: '2027-04-26' });
    const p = await preview(d);
    const expectedWeekdays = expectedDates(d).map((date) => TimeEngine.getLocalDayOfWeekFromDate(date));
    expect(p.occurrences.map((o: any) => o.pricing.dayOfWeek)).toEqual(expectedWeekdays);
    expect(p.occurrences.map((o: any) => o.pricing.weekday)).toEqual(expectedWeekdays);
    expect(expectedWeekdays).toContain(1);
    expect(expectedWeekdays).toContain(4);
  });

  it('9.3 PREVIEW TOTAL EQUALS the authoritative server-side create total', async () => {
    const d = def({ weekdays: [1, 4], startDate: '2027-05-03', endDate: '2027-05-17' });
    const p = await preview(d);
    const s = await create(d);
    expect(s.seriesTotal).toBe(p.seriesTotal);

    const rows = await bookingRows(s.seriesId);
    const persisted = Math.round(rows.reduce((sum, r) => sum + Number(r.total_amount), 0) * 100) / 100;
    expect(s.seriesTotal).toBe(persisted);
    expect(s.seriesTotal).toBe(expectedTotal(d));
  });

  it('9.4 preview remains side-effect free (no bookings, no series rows)', async () => {
    const [before] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM bookings');
    const [sBefore] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM booking_series');
    const p = await preview(def({ weekdays: [1, 4], startDate: '2027-05-24', endDate: '2027-06-07' }));
    expect(p.occurrences.length).toBeGreaterThan(0);
    const [after] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM bookings');
    const [sAfter] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM booking_series');
    expect(Number((after as any[])[0].c)).toBe(Number((before as any[])[0].c));
    expect(Number((sAfter as any[])[0].c)).toBe(Number((sBefore as any[])[0].c));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('R5-A — final create recomputes; a client total is never trusted', () => {
  it('10.1 an injected client total is stripped by the schema and ignored by the service', async () => {
    const d = def({ weekdays: [1, 4], startDate: '2027-06-14', endDate: '2027-06-28' });
    const parsed = RecurringCreateSchema.parse({ ...d, playerUserId: PLAYER, seriesTotal: 999999, totalAmount: 1 });
    // The canonical schema carries NO client price field at all.
    expect((parsed as any).seriesTotal).toBeUndefined();
    expect((parsed as any).totalAmount).toBeUndefined();

    const s = await bookingService.createRecurringSeries(parsed, ADMIN);
    expect(s.seriesTotal).not.toBe(999999);
    expect(s.seriesTotal).not.toBe(1);
    expect(s.seriesTotal).toBe(expectedTotal(d));
  });

  it('10.2 each occurrence row carries ITS OWN price, never the series total', async () => {
    const d = def({ weekdays: [1, 4], startDate: '2027-07-05', endDate: '2027-07-19' });
    const s = await create(d);
    const rows = await bookingRows(s.seriesId);
    expect(new Set(rows.map((r) => Number(r.total_amount))).size).toBe(2);
    for (const r of rows) expect(Number(r.total_amount)).toBeLessThan(s.seriesTotal);
  });

  it('10.3 the persisted total is exactly the preview total (recomputation is stable)', async () => {
    const d = def({ weekdays: [1, 4], startDate: '2027-07-26', endDate: '2027-08-09' });
    const p = await preview(d);
    const s = await create(d);
    expect(s.seriesTotal).toBe(p.seriesTotal);
    // Re-reading the series returns the same authoritative total.
    const reread = await bookingService.describeRecurringSeries(s.seriesId);
    expect(reread.seriesTotal).toBe(s.seriesTotal);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('R5-A — commission and tax economics preserved per occurrence', () => {
  it('11.1 every occurrence snapshot equals the canonical computeBookingEconomics output', async () => {
    const d = def({ weekdays: [1, 4], startDate: '2027-08-16', endDate: '2027-08-30' });
    const s = await create(d);
    const rows = await bookingRows(s.seriesId);
    expect(rows.length).toBeGreaterThan(1);
    for (const r of rows) {
      const expected = await (bookingService as any).computeBookingEconomics(ORG1, BRANCH_CAIRO, Number(r.total_amount));
      expect(Number(r.commission_amount)).toBeCloseTo(expected.commissionAmount, 6);
      expect(Number(r.club_amount)).toBeCloseTo(expected.clubAmount, 6);
      expect(Number(r.tax_amount)).toBeCloseTo(expected.taxAmount, 6);
      expect(Number(r.tax_rate)).toBeCloseTo(expected.taxRate, 6);
      expect(r.tax_treatment).toBe(expected.taxTreatment);
    }
  });

  it('11.2 commission and tax are actually applied (non-zero, correctly derived)', async () => {
    const d = def({ weekdays: [1], startDate: '2027-09-06', endDate: '2027-09-20' });
    const s = await create(d);
    for (const r of await bookingRows(s.seriesId)) {
      const gross = Number(r.total_amount);
      const commission = Math.round(gross * COMMISSION_PCT) / 100;
      const club = Math.round((gross - commission) * 100) / 100;
      const tax = Math.round(club * TAX_PCT) / 100;
      expect(Number(r.commission_amount)).toBeCloseTo(commission, 6);
      expect(Number(r.club_amount)).toBeCloseTo(club, 6);
      expect(Number(r.tax_amount)).toBeCloseTo(tax, 6);
      expect(Number(r.commission_amount)).toBeGreaterThan(0);
      expect(Number(r.tax_amount)).toBeGreaterThan(0);
    }
  });

  it('11.3 the economic snapshot is per occurrence, not shared across the series', async () => {
    const d = def({ weekdays: [1, 4], startDate: '2027-09-27', endDate: '2027-10-11' });
    const s = await create(d);
    const rows = await bookingRows(s.seriesId);
    const mon = rows.find((r) => Number(r.total_amount) === PRICE.mon)!;
    const thu = rows.find((r) => Number(r.total_amount) === PRICE.thu)!;
    expect(mon).toBeDefined();
    expect(thu).toBeDefined();
    // Different gross -> different commission + tax snapshots.
    expect(Number(mon.commission_amount)).not.toBe(Number(thu.commission_amount));
    expect(Number(mon.tax_amount)).not.toBe(Number(thu.tax_amount));
    // Commission totals also reconcile across the whole series.
    const commissionSum = Math.round(rows.reduce((sum, r) => sum + Number(r.commission_amount), 0) * 100) / 100;
    expect(commissionSum).toBeCloseTo(Math.round(s.seriesTotal * COMMISSION_PCT) / 100, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('R5-A — timezone / DST correctness (REAL DB)', () => {
  it('4.1 a local 00:30 Thursday occurrence is priced as THURSDAY although its UTC date is Wednesday', async () => {
    // Cairo local 2026-10-08 00:30 (+03:00) == 2026-10-07T21:30Z (a Wednesday).
    const instant = TimeEngine.localToUtc('2026-10-08', '00:30', TZ);
    expect(new Date(instant).getUTCDay()).toBe(3);
    expect(TimeEngine.utcToLocalDate(instant, TZ)).toBe('2026-10-08');

    const d = def({
      resourceId: RES_MID, weekdays: [4],
      startDate: '2026-10-08', endDate: '2026-10-08',
      startTime: '00:30', endTime: '01:30',
    });
    const p = await preview(d);
    expect(p.occurrences[0].pricing.dayOfWeek).toBe(4);
    // Thursday x1.5 => 600. Using the UTC (Wednesday x3.0) rule would give 1200.
    expect(p.occurrences[0].pricing.totalAmount).toBe(600);
    expect(p.seriesTotal).toBe(600);

    const s = await create(d);
    const rows = await bookingRows(s.seriesId);
    expect(Number(rows[0].total_amount)).toBe(600);
    expect(s.seriesTotal).toBe(600);
  });

  it('4.2 the same local clock time resolves per branch timezone', async () => {
    const cairo = await preview(def({ resourceId: RES_MID, weekdays: [4], startDate: '2026-10-08', endDate: '2026-10-08', startTime: '00:30', endTime: '01:30' }));
    expect(cairo.occurrences[0].pricing.dayOfWeek).toBe(4);

    const ny = await preview({
      branchId: BRANCH_NY, resourceId: RES_NY, weekdays: [7],
      startDate: '2026-10-11', endDate: '2026-10-11', startTime: '00:30', endTime: '01:30',
    });
    expect(ny.timezone).toBe(TZ_NY);
    expect(ny.occurrences[0].pricing.dayOfWeek).toBe(7);
    // RES_NY only prices 10:00-12:00 on Sundays -> 00:30 is standard hourly.
    expect(ny.occurrences[0].pricing.totalAmount).toBe(400);
  });

  it('6.1 a Sunday series spanning the US DST transition keeps Sunday pricing on both sides', async () => {
    // 2027-03-14 is the second Sunday of March 2027 — the US spring-forward day.
    const d = {
      branchId: BRANCH_NY, resourceId: RES_NY, weekdays: [7],
      startDate: '2027-03-07', endDate: '2027-03-28',
      startTime: '10:00', endTime: '12:00',
    };
    const p = await preview(d);
    expect(p.occurrences.map((o: any) => o.date)).toEqual(['2027-03-07', '2027-03-14', '2027-03-21', '2027-03-28']);
    for (const o of p.occurrences) {
      expect(o.pricing.dayOfWeek).toBe(7);
      expect(o.pricing.totalAmount).toBe(1600);
    }
    expect(p.seriesTotal).toBe(6400);

    const s = await create(d);
    for (const r of await bookingRows(s.seriesId)) expect(Number(r.total_amount)).toBe(1600);
    expect(s.seriesTotal).toBe(6400);
  });

  it('6.2 the UTC offset really changes across the DST boundary (test is meaningful)', () => {
    const before = TimeEngine.getUtcOffsetMinutes(TimeEngine.localToUtc('2027-03-07', '10:00', TZ_NY), TZ_NY);
    const after = TimeEngine.getUtcOffsetMinutes(TimeEngine.localToUtc('2027-03-21', '10:00', TZ_NY), TZ_NY);
    expect(before).toBe(-300); // EST
    expect(after).toBe(-240);  // EDT
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('R5-A — alternative courts are priced on the court actually booked', () => {
  it('13.1 resolving an occurrence onto another court prices THAT court', async () => {
    const target = '2026-12-03'; // a Thursday, unused by any other test
    const blocker = await bookingService.createBooking({
      branchId: BRANCH_CAIRO, resourceId: RES_MAIN, bookingType: 'private_match',
      bookingDate: target, startTime: '18:00', endTime: '20:00', paymentMethod: 'cash',
    }, ADMIN);
    expect(Number(blocker.id ?? blocker.bookingId)).toBeGreaterThan(0);

    const d = def({ weekdays: [4], startDate: target, endDate: target });
    const p = await preview(d);
    expect(p.occurrences[0].status).toBe('conflict');
    // The preview shows the REQUESTED court's price.
    expect(p.occurrences[0].pricing.totalAmount).toBe(PRICE.thu);

    // Resolve onto RES_ALT (hourly 800, Thursday x1.75 => 2800).
    const s = await create({
      ...d,
      resolutions: [{ occurrenceDate: target, action: 'book', courtId: RES_ALT }],
    });
    const rows = await bookingRows(s.seriesId);
    expect(Number(rows[0].total_amount)).toBe(ALT_PRICE.thu);
    expect(s.seriesTotal).toBe(ALT_PRICE.thu);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('R5-A — no financial side effects', () => {
  it('13.2 preview + create produce ZERO payment / accounting / ledger rows', async () => {
    const before = await financialSnapshot();
    const d = def({ weekdays: [1, 4], startDate: '2027-10-18', endDate: '2027-11-01' });
    const p = await preview(d);
    const s = await create(d);
    expect(p.seriesTotal).toBe(expectedTotal(d));
    expect(s.seriesTotal).toBe(expectedTotal(d));
    const after = await financialSnapshot();
    expect(after).toEqual(before);
  });

  it('13.3 the created series stays pending/unpaid (R5-A never confirms or pays)', async () => {
    const d = def({ weekdays: [1, 4], startDate: '2027-11-08', endDate: '2027-11-22' });
    const s = await create(d);
    for (const occ of s.occurrences) expect(occ.status).toBe('pending');
    const [rows] = await pool.execute<RowData>('SELECT DISTINCT payment_status FROM bookings WHERE series_id = ?', [s.seriesId]);
    expect((rows as any[]).map((r) => r.payment_status)).toEqual(['pending']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('R5-A — tenant / branch isolation on the pricing lookup', () => {
  it('14.1 a resource from another branch cannot be priced into this series', async () => {
    await expect(preview(def({ resourceId: RES_X }))).rejects.toMatchObject({ statusCode: 403 });
    await expect(create(def({ resourceId: RES_X }))).rejects.toMatchObject({ statusCode: 403 });
  });

  it('14.2 an alternative court outside the branch is rejected and nothing is persisted', async () => {
    const target = '2026-12-10';
    const [sBefore] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM booking_series');
    const [bBefore] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM bookings WHERE booking_date = ?', [target]);

    // RES_X lives in ORG2's branch, so it is not a member of the Cairo branch's
    // court set. R3 rejects it before any occurrence row is written.
    await expect(
      create({
        ...def({ weekdays: [4], startDate: target, endDate: target }),
        resolutions: [{ occurrenceDate: target, action: 'book', courtId: RES_X }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    const [sAfter] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM booking_series');
    const [bAfter] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM bookings WHERE booking_date = ?', [target]);
    expect(Number((sAfter as any[])[0].c)).toBe(Number((sBefore as any[])[0].c));
    expect(Number((bAfter as any[])[0].c)).toBe(Number((bBefore as any[])[0].c));
  });

  it('14.3 another org branch prices its own court independently', async () => {
    const d = {
      branchId: BRANCH2, resourceId: RES_X, weekdays: [1, 4],
      startDate: '2027-11-29', endDate: '2027-12-13', startTime: '18:00', endTime: '20:00',
    };
    const other = await preview(d);
    expect(other.occurrences.map((o: any) => o.date)).toEqual(expectedDates(d));
    expect(other.occurrences.length).toBeGreaterThan(1);
    // RES_X has no peak rows at all -> standard hourly on BOTH weekdays.
    for (const o of other.occurrences) expect(o.pricing.totalAmount).toBe(800);
    expect(other.seriesTotal).toBe(800 * other.occurrences.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('R5-A — R1 / R2 / R3 / R4 behaviour preserved', () => {
  it('12.1 R3 Day-8 rule still hard-rejects a series before the window', async () => {
    const [before] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM bookings WHERE booking_date < ?', [DAY8]);
    await expect(create(def({ weekdays: [4], startDate: '2026-09-01', endDate: '2026-09-15' })))
      .rejects.toMatchObject({ statusCode: 409 });
    const [after] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM bookings WHERE booking_date < ?', [DAY8]);
    expect(Number((after as any[])[0].c)).toBe(Number((before as any[])[0].c));
  });

  it('12.2 R2 ownership model unchanged: player owns bookings, operator owns the series', async () => {
    const d = def({ weekdays: [4], startDate: '2027-12-20', endDate: '2028-01-03' });
    const s = await create(d);
    expect(s.playerUserId).toBe(PLAYER);
    const [rows] = await pool.execute<RowData>('SELECT DISTINCT user_id FROM bookings WHERE series_id = ?', [s.seriesId]);
    expect((rows as any[]).map((r) => Number(r.user_id))).toEqual([PLAYER]);
    const [ser] = await pool.execute<RowData>('SELECT created_by FROM booking_series WHERE id = ?', [s.seriesId]);
    expect(Number((ser as any[])[0].created_by)).toBe(ADMIN);
  });

  it('12.3 R2 occurrence-level uniqueness is still enforced', async () => {
    const d = def({ weekdays: [4], startDate: '2028-01-10', endDate: '2028-01-24' });
    const s = await create(d);
    const [rows] = await pool.execute<RowData>('SELECT booking_date, COUNT(*) AS c FROM bookings WHERE series_id = ? GROUP BY booking_date', [s.seriesId]);
    expect((rows as any[]).length).toBe(expectedDates(d).length);
    for (const r of rows as any[]) expect(Number(r.c)).toBe(1);
  });

  it('12.4 R3 TOCTOU re-check still rejects the whole series on a late conflict', async () => {
    const target = '2026-12-24'; // a Thursday, outside every other fixture window
    const d = def({ weekdays: [4], startDate: target, endDate: target });
    const p = await preview(d);
    expect(p.occurrences[0].status).toBe('available');
    // Something appears between preview and confirm.
    await bookingService.createBooking({
      branchId: BRANCH_CAIRO, resourceId: RES_MAIN, bookingType: 'private_match',
      bookingDate: target, startTime: '18:00', endTime: '20:00', paymentMethod: 'cash',
    }, ADMIN);
    await expect(create(d)).rejects.toMatchObject({ statusCode: 409 });
    // Nothing partial was left behind for that date beyond the blocking booking.
    const [rows] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM bookings WHERE booking_date = ? AND resource_id = ?', [target, RES_MAIN]);
    expect(Number((rows as any[])[0].c)).toBe(1);
  });

  it('12.5 R1 authority: an unauthorised user still cannot create a series', async () => {
    await expect(create(def({ weekdays: [4], startDate: '2028-01-31', endDate: '2028-01-31' }), NO_AUTH))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('12.6 series idempotency returns the same authoritative total on retry', async () => {
    const d = { ...def({ weekdays: [4], startDate: '2028-02-10', endDate: '2028-02-10' }), idempotencyKey: 'r5a-idem-key-0001' };
    const s1 = await create(d);
    const s2 = await create(d);
    expect(s2.seriesId).toBe(s1.seriesId);
    expect(s2.seriesTotal).toBe(s1.seriesTotal);
    expect(s1.seriesTotal).toBe(PRICE.thu);
  });
});
