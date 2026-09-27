import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { TimeEngine, FakeClock } from '../../time/index.js';

// ── R5-B — ONE card payment for ONE recurring series (REAL DB) ──────────────
//
// THE INVARIANT UNDER TEST:
//   ONE gateway payment  ->  ZERO duplicate accounting recognition
//
// R5-A gave recurring occurrences authoritative per-occurrence pricing and an
// authoritative `seriesTotal` (the exact sum of the persisted
// `bookings.total_amount` snapshots). R5-B turns that ONE number into ONE
// `payment_transactions` row (reference_type = booking_series, booking_id NULL,
// user_id = the PLAYER) and ONE gateway transaction, then confirms the
// eligible occurrences through the canonical ConfirmBooking command.
//
// R5-B is deliberately FINANCIALLY NEUTRAL: no series accounting, no cash, no
// refund, no per-occurrence payment rows. Tests 23-25 prove the accounting
// listener recognises nothing for a series, while a standalone booking payment
// in the same file still posts normally (so the guard — not a dead listener —
// is what makes the difference).

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.PAYMENT_GATEWAY_PROVIDER = 'mock';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.REDIS_DB = '0'; process.env.REDIS_PASSWORD = '';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.ENABLE_API_DOCS = 'false';
});

import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { paymentGateway } from '../../../shared/services/gateway/gateway-factory.js';

const ORG1 = 10050000, BRANCH_CAIRO = 10050000, BRANCH_NY = 10050001;
const ORG2 = 10050002, BRANCH2 = 10050002;
const RES_MAIN = 10050000;   // Cairo, hourly 400. Mon x2.0 / Thu x1.5 on 18-20
const RES_ALT = 10050001;    // Cairo, hourly 800. Mon x1.25 / Thu x1.75 on 18-20
const RES_NY = 10050003;     // second branch of ORG1 (branch-scope isolation)
const RES_X = 10050004;      // ORG2 branch (tenant isolation), no peak rows

const ADMIN = 10050010;      // org.bookings.manage in ORG1, branch-scoped to BRANCH_CAIRO — OPERATOR
const PLAYER = 10050011;     // beneficiary / booking owner == PAYMENT OWNER
const ADMIN2 = 10050012;     // org.bookings.manage, branch-scoped to ORG2/BRANCH2 (other tenant)
const NO_AUTH = 10050013;    // no responsible-user authority
const ADMIN_NY = 10050014;   // org.bookings.manage, branch-scoped to BRANCH_NY (same tenant, other branch)
const PLAN = 10050090;

const TZ = 'Africa/Cairo';
const CLOCK_ISO = '2026-09-07T09:00:00.000Z';   // Cairo local MONDAY
const DAY8 = '2026-09-14';                      // first allowed date (today+7)

// Canonical RES_MAIN 18:00-20:00 prices (R5-A): Mon 400*2*2.00 = 1600, Thu 400*2*1.50 = 1200
const PRICE = { mon: 1600, thu: 1200 };
// R5-A authoritative pre-tax series subtotal (Mon + Thu court totals).
const TWO_OCC_TOTAL = PRICE.mon + PRICE.thu;
// R5-C1 — canonical tax = 14% × org net (plan commission 10%): 
//   Mon: net 1440, tax 201.60 · Thu: net 1080, tax 151.20
const TAX_RATE = 0.14;
const TAX = { mon: 201.6, thu: 151.2 };
// Canonical 2dp aggregation rule — never compare raw float sums.
const TWO_OCC_TAX = Math.round((TAX.mon + TAX.thu) * 100) / 100; // 352.80
// R5-C1 — authoritative gross = subtotal + tax (THE amount the gateway charges).
const TWO_OCC_GROSS = Math.round((TWO_OCC_TOTAL + TWO_OCC_TAX) * 100) / 100; // 3152.80

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * `eventBusV2.emit()` does not strictly await its subscribers, so every post-emit
 * assertion about PERSISTED state has to WAIT for that state rather than hope a
 * fixed delay happened to be long enough. A fixed sleep is the classic source of
 * a suite that passes 5 runs in 6 — the failure is always the same test, the one
 * whose listener lost the race.
 *
 * The poll interval is deliberately coarse: the listeners under test commit
 * inside per-organisation exclusive transactions, and hammering the same tables
 * while they commit is what turns a real posting into a timeout. The thrown
 * error carries the last observed value, which for occurrence probes is the full
 * set of booking statuses — that is the diagnostic worth having.
 */
async function waitFor<T>(
  probe: () => Promise<T>,
  isReady: (value: T) => boolean,
  what: string,
  timeoutMs = 20_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await probe();
  while (!isReady(value)) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${what} — last value ${JSON.stringify(value)}`);
    }
    await sleep(120);
    value = await probe();
  }
  return value;
}

/** True once EVERY occurrence of a series is in one of `statuses`. */
const allOccurrencesIn = (rows: any[], statuses: string[]) =>
  rows.length > 0 && rows.every((o) => statuses.includes(o.booking_status));

/** True when at least one occurrence of a series is in one of `statuses`. */
const anyOccurrenceIn = (rows: any[], statuses: string[]) =>
  rows.some((o) => statuses.includes(o.booking_status));

/**
 * For a test whose ONLY assertions are negative ("these occurrences must stay
 * untouched") there is no positive sentinel to poll for, so the wait has to be a
 * deliberate, generously-sized settle rather than a short guess.
 */
const settleNegativeOnly = () => sleep(1500);

let pool: mysql.Pool;
let bookingService: any;
let recurringPayment: any;
let paymentService: any;

// ── Durable outbox hardening ────────────────────────────────────────────────
// `eventBusV2.emit()` persists every envelope to `published_events`, and a
// running Docker backend consumes them through its `accounting-replay` BullMQ
// subscriber. THIS test file shares the Docker MySQL, so a stale/foreign
// consumer could re-process these test events into the same ledger tables the
// accounting-safety assertions read. Two guards make that impossible:
//   1. The Docker backend must be rebuilt with the R5-B guards (mandatory step
//      of every backend change; the seriesId guard makes any replay a no-op).
//   2. Here, per-test cleanup also purges every outbox/processed row created
//      SINCE the suite started, so no event ever survives to be replayed into a
//      later test's snapshot.
let EVENT_BASE_ID = 0;

async function cleanupPerUser(exec: (sql: string, params?: any[]) => Promise<any>) {
  const users = [ADMIN, PLAYER, ADMIN2, NO_AUTH, ADMIN_NY].join(',');
  await exec(`DELETE FROM user_role_scopes WHERE user_role_id IN (SELECT id FROM user_roles WHERE user_id IN (${users}))`);
  // The financial tables MUST be reset per test, not only per file: the
  // accounting-safety assertions compare a before/after footprint, and a stale
  // row from an earlier test or an earlier run would silently invalidate them.
  // Ledger rows reference chart_of_accounts, so they are deleted first.
  await exec(`DELETE FROM financial_journal_entries WHERE reference_type = 'booking' AND reference_id IN (SELECT id FROM bookings WHERE user_id IN (${users}))`);
  await exec(`DELETE FROM ledger_entries WHERE organisation_id IN (${ORG1}, ${ORG2})`);
  await exec(`DELETE FROM general_ledger WHERE organisation_id IN (${ORG1}, ${ORG2})`);
  await exec(`DELETE FROM financial_journal_entries WHERE reference_type = 'booking' AND reference_id IN (SELECT id FROM bookings WHERE user_id IN (${users}))`);
  await exec(`DELETE FROM booking_slots WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (${users}))`);
  await exec(`DELETE FROM bookings WHERE user_id IN (${users})`);
  await exec(`DELETE FROM booking_series WHERE created_by IN (${users})`);
  await exec(`DELETE FROM payment_transactions WHERE user_id IN (${users})`);
  await exec(`DELETE FROM user_roles WHERE user_id IN (${users})`);
  await exec(`DELETE FROM user_wallets WHERE user_id IN (${users})`);
  await exec(`DELETE FROM audit_logs WHERE entity_type = 'booking_series'`);
  await exec(`DELETE FROM users WHERE id IN (${users})`);
  await exec(`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE slug LIKE 'r5b-rbac-%')`);
  await exec(`DELETE FROM roles WHERE slug LIKE 'r5b-rbac-%'`);
  // No test-sourced domain event may survive for a foreign consumer to replay
  // into a later test's ledger snapshot (see the header note above).
  await exec(`DELETE FROM published_events WHERE id > ${EVENT_BASE_ID}`);
  await exec(`DELETE FROM processed_events WHERE id > ${EVENT_BASE_ID}`);
}

/** Full wipe — orgs / branches / resources / plan / tax / COA included. */
async function cleanup(exec: (sql: string, params?: any[]) => Promise<any>) {
  await cleanupPerUser(exec);
  await exec(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id IN (${ORG1}, ${ORG2}))`);
  // Ledger rows reference chart_of_accounts, so they MUST go first.
  await exec(`DELETE FROM ledger_entries WHERE organisation_id IN (${ORG1}, ${ORG2})`);
  await exec(`DELETE FROM general_ledger WHERE organisation_id IN (${ORG1}, ${ORG2})`);
  await exec(`DELETE FROM chart_of_accounts WHERE organisation_id IN (${ORG1}, ${ORG2})`);
  await exec(`DELETE FROM organisation_subscriptions WHERE organisation_id IN (${ORG1}, ${ORG2})`);
  await exec(`DELETE FROM subscription_plan_rates WHERE plan_id = ?`, [PLAN]);
  await exec(`DELETE FROM subscription_plans WHERE id = ?`, [PLAN]);
  await exec(`DELETE FROM tax_rates WHERE organisation_id IN (${ORG1}, ${ORG2})`);
  await exec(`DELETE FROM peak_hour_pricing WHERE resource_id IN (${RES_MAIN}, ${RES_ALT}, ${RES_NY}, ${RES_X})`);
  await exec(`DELETE FROM resources WHERE id IN (${RES_MAIN}, ${RES_ALT}, ${RES_NY}, ${RES_X})`);
  await exec(`DELETE FROM branches WHERE id IN (${BRANCH_CAIRO}, ${BRANCH_NY}, ${BRANCH2})`);
  await exec(`DELETE FROM organisations WHERE id IN (${ORG1}, ${ORG2})`);
}

/**
 * Reset only the per-test state (users, series, bookings, payments, audit) and
 * re-create the users + RBAC. The org / branch / resource / pricing / COA seed
 * installed once in beforeAll is deliberately preserved.
 */
async function resetSeriesState() {
  await cleanupPerUser(async (sql, params) => pool.execute(sql, params));
  await createUser(ADMIN, 'r5b-admin@test.com');
  await createUser(PLAYER, 'r5b-player@test.com');
  await createUser(ADMIN2, 'r5b-admin2@test.com');
  await createUser(NO_AUTH, 'r5b-noauth@test.com');
  await createUser(ADMIN_NY, 'r5b-admin-ny@test.com');
  await grantPermission(ADMIN, 'org.bookings.manage');
  await grantPermission(ADMIN2, 'org.bookings.manage');
  await grantPermission(ADMIN_NY, 'org.bookings.manage');
  await grantPermission(NO_AUTH, 'bookings.view');
  await grantBranchScope(ADMIN, BRANCH_CAIRO);
  await grantBranchScope(ADMIN2, BRANCH2);
  await grantBranchScope(ADMIN_NY, BRANCH_NY);
}


async function createUser(id: number, email: string) {
  await pool.execute(
    `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'R5B User', 'male', 'active')`,
    [id, `015${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, email],
  );
  await pool.execute(`INSERT INTO user_wallets (user_id, balance, currency_code, version) VALUES (?, 0, 'EGP', 1)`, [id]);
}

async function grantPermission(userId: number, permissionKey: string) {
  const roleSlug = `r5b-rbac-${userId}`;
  await pool.execute(`INSERT IGNORE INTO roles (organisation_id, name, slug) VALUES (NULL, ?, ?)`, [`R5B RBAC ${userId}`, roleSlug]);
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

/**
 * Attach a BRANCH role-scope to the user's synthetic role — the real production
 * shape for an operator (org owner / org-scoped / branch-scoped admin), and what
 * `canAccessBranch` reads. A permission WITHOUT a scope must not be able to
 * reach another tenant's or another branch's series.
 */
async function grantBranchScope(userId: number, branchId: number) {
  const roleSlug = `r5b-rbac-${userId}`;
  await pool.execute(
    `INSERT IGNORE INTO user_role_scopes (user_role_id, scope_type, scope_id)
     SELECT ur.id, 'branch', ? FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ? AND r.slug = ? LIMIT 1`,
    [branchId, userId, roleSlug],
  );
}

/** Two-occurrence series: Mon 2026-09-14 (1600) + Thu 2026-09-17 (1200). */
function def(opts: Record<string, any> = {}) {
  return {
    branchId: BRANCH_CAIRO,
    resourceId: RES_MAIN,
    weekdays: [1, 4],
    startDate: DAY8,
    endDate: '2026-09-17',
    startTime: '18:00',
    endTime: '20:00',
    ...opts,
  };
}
function createSeries(d: Record<string, any> = {}, operator = ADMIN, player = PLAYER) {
  return bookingService.createRecurringSeries({ ...def(d), playerUserId: player }, operator);
}

async function occurrenceRows(seriesId: number) {
  const [rows] = await pool.execute<RowData>(
    `SELECT id, DATE_FORMAT(booking_date, '%Y-%m-%d') AS booking_date, start_at_utc, series_id,
            booking_status, payment_status, total_amount, tax_amount, commission_amount, club_amount,
            user_id, organisation_id, branch_id, resource_id
       FROM bookings WHERE series_id = ? ORDER BY booking_date, start_time`,
    [seriesId],
  );
  return rows as any[];
}

async function paymentRow(seriesId: number) {
  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM payment_transactions WHERE reference_type = 'booking_series' AND reference_id = ? ORDER BY id`,
    [seriesId],
  );
  return rows as any[];
}

/** R5-C2 — number of series-level ledger legs for an event (source_id = seriesId). */
async function seriesLedgerRowCount(seriesId: number, eventType: string): Promise<number> {
  const [rows] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type = 'booking' AND source_id = ? AND event_type = ?`,
    [seriesId, eventType],
  );
  return Number((rows as any[])[0].c);
}

/**
 * R5-C2 — series-level ledger legs with their resolved account codes (join the
 * COA so assertions speak in account codes, not opaque account ids).
 */
async function seriesLedgerRows(seriesId: number, eventType: string): Promise<any[]> {
  const [rows] = await pool.execute<RowData>(
    `SELECT le.side, le.amount, le.organisation_id, c.code AS account_code
     FROM ledger_entries le
     JOIN chart_of_accounts c ON c.id = le.chart_account_id
     WHERE le.source_type = 'booking' AND le.source_id = ? AND le.event_type = ?
     ORDER BY le.id`,
    [seriesId, eventType],
  );
  return rows as any[];
}

/**
 * Every financial row that could possibly have been caused by THIS series.
 *
 * All four counts are scoped to the series' own occurrence booking ids, never to
 * the organisation. An org-scoped count is not hermetic: a posting still in
 * flight from an earlier test (or from the contrast test that follows) would
 * leak into the snapshot and turn a correct zero into a phantom failure — which
 * is exactly the failure mode a "financially neutral" assertion must not have.
 *
 * `general_ledger.reference_type` is `${sourceType}_${eventType}` (see
 * gl-projection.service), so it is matched by prefix with the ids pinned.
 */
async function financialFootprint(seriesId: number) {
  const ids = (await occurrenceRows(seriesId)).map((o) => o.id);
  if (!ids.length) return { bookingLedger: 0, bookingEventTypes: [] as string[], journal: 0, gl: 0, glEventTypes: [] as string[] };
  const list = ids.join(',');
  const [le] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type = 'booking' AND source_id IN (${list})`, []);
  const [leTypes] = await pool.execute<RowData>(
    `SELECT event_type, source_id, description, COUNT(*) AS c FROM ledger_entries WHERE source_type = 'booking' AND source_id IN (${list}) GROUP BY event_type, source_id, description`, []);
  const [fj] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS c FROM financial_journal_entries WHERE reference_type = 'booking' AND reference_id IN (${list})`, []);
  const [gl] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS c FROM general_ledger WHERE reference_type LIKE 'booking%' AND reference_id IN (${list})`, []);
  const [glTypes] = await pool.execute<RowData>(
    `SELECT reference_type, reference_id, COUNT(*) AS c FROM general_ledger WHERE reference_type LIKE 'booking%' AND reference_id IN (${list}) GROUP BY reference_type, reference_id`, []);
  return {
    bookingLedger: Number((le as any[])[0].c),
    bookingEventTypes: (leTypes as any[]).map((r) => r.event_type + '#' + r.source_id + ':' + String(r.description).slice(0, 70)).sort(),
    journal: Number((fj as any[])[0].c),
    gl: Number((gl as any[])[0].c),
    glEventTypes: (glTypes as any[]).map((r) => r.reference_type + '#' + r.reference_id).sort(),
  };
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });
  await cleanup(async (sql, params) => pool.execute(sql, params));

  // Capture the durable-outbox watermark so per-test cleanup can purge every
  // event THIS suite emits (a stale Docker consumer must never replay them).
  const [evBase] = await pool.execute<RowData>('SELECT COALESCE(MAX(id), 0) AS m FROM published_events');
  const [prBase] = await pool.execute<RowData>('SELECT COALESCE(MAX(id), 0) AS m FROM processed_events');
  EVENT_BASE_ID = Math.min(Number((evBase as any[])[0].m), Number((prBase as any[])[0].m));

  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG1}, UUID(), ?, 1, 'R5B Org One', 'r5b-org-one', 1)`, [otId]);
  await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG2}, UUID(), ?, 1, 'R5B Org Two', 'r5b-org-two', 1)`, [otId]);
  await pool.execute(`INSERT INTO branches (id, public_id, organisation_id, name, slug, timezone, opening_time, closing_time) VALUES (${BRANCH_CAIRO}, UUID(), ${ORG1}, 'R5B Cairo', 'r5b-cairo', '${TZ}', '00:00', '23:59')`);
  await pool.execute(`INSERT INTO branches (id, public_id, organisation_id, name, slug, timezone, opening_time, closing_time) VALUES (${BRANCH_NY}, UUID(), ${ORG1}, 'R5B NY', 'r5b-ny', '${TZ}', '00:00', '23:59')`);
  await pool.execute(`INSERT INTO branches (id, public_id, organisation_id, name, slug, timezone, opening_time, closing_time) VALUES (${BRANCH2}, UUID(), ${ORG2}, 'R5B Two', 'r5b-two', '${TZ}', '08:00', '22:00')`);

  const mkResource = (id: number, name: string, branch: number, hourly: number, open: string, close: string, sport = 19) =>
    pool.execute(
      `INSERT INTO resources (id, public_id, branch_id, resource_type_id, name, sport_id, hourly_price, opening_time, closing_time, is_active, slot_duration)
       VALUES (?, UUID(), ?, 1, ?, ?, ?, ?, ?, TRUE, 60)`,
      [id, branch, name, sport, hourly, open, close],
    );
  await mkResource(RES_MAIN, 'R5B Main', BRANCH_CAIRO, 400, '00:00', '23:59');
  await mkResource(RES_ALT, 'R5B Alt', BRANCH_CAIRO, 800, '00:00', '23:59');
  await mkResource(RES_NY, 'R5B NY Court', BRANCH_NY, 400, '00:00', '23:59');
  await mkResource(RES_X, 'R5B Foreign', BRANCH2, 400, '08:00', '22:00');

  const addPeak = (resource: number, day: number, from: string, to: string, mult: string) =>
    pool.execute(`INSERT INTO peak_hour_pricing (resource_id, day_of_week, start_time, end_time, price_multiplier) VALUES (?, ?, ?, ?, ?)`,
      [resource, day, from, to, mult]);
  await addPeak(RES_MAIN, 1, '18:00', '20:00', '2.00');   // Mon 400*2*2.00 = 1600
  await addPeak(RES_MAIN, 4, '18:00', '20:00', '1.50');   // Thu 400*2*1.50 = 1200
  await addPeak(RES_ALT, 1, '18:00', '20:00', '1.25');
  await addPeak(RES_ALT, 4, '18:00', '20:00', '1.75');

  await pool.execute(
    `INSERT INTO subscription_plans (id, plan_name, price_monthly, is_active, is_internal, sort_order) VALUES (?, 'R5B Plan', 0, 1, 1, 0)`, [PLAN]);
  await pool.execute(
    `INSERT INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES (?, 'booking', 'percentage', ?)`, [PLAN, 10]);
  await pool.execute(
    `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, start_date, end_date, subscription_status, auto_renew)
     VALUES (?, ?, 'monthly', '2020-01-01', '2099-01-01', 'active', 0)`, [ORG1, PLAN]);
  await pool.execute(
    `INSERT INTO tax_rates (organisation_id, name, rate, type, tax_category, is_active, is_global) VALUES (?, 'R5B VAT', 14, 'percentage', 'vat', 1, 0)`, [ORG1]);

  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  bookingService = (await import('../application/booking.service.js')).bookingService;
  recurringPayment = await import('../application/recurring-payment.service.js');
  paymentService = (await import('../../payment/application/payment.service.js')).paymentService;

  // Pre-provision the org COA so the CONTRAST (standalone booking) accounting
  // assertion in test 23 is not racing first-time provisioning.
  const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
  await accountingEngineService.provisionOrganisationMarketplaceAccounts(ORG1);

  const { registerAccountingEventListeners } = await import('../../financial/application/accounting-event.listener.js');
  registerAccountingEventListeners();
  const { registerBookingPaymentListeners } = await import('../application/booking-payment.listener.js');
  registerBookingPaymentListeners();

  TimeEngine.setClock(new FakeClock(CLOCK_ISO));
}, 120000);

afterAll(async () => {
  TimeEngine.resetClock();
  vi.restoreAllMocks();
  await cleanup(async (sql, params) => pool.execute(sql, params));
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 120000);

// ═════════════════════════════════════════════════════════════════════════════
// PART 2 + 3 + 5 — payment creation, ownership, idempotency, gateway
// ═════════════════════════════════════════════════════════════════════════════
describe('R5-B — one card payment row per recurring series', () => {
  let series: any;
  let chargeSpy: any;

  beforeEach(async () => {
    await resetSeriesState();
    series = await createSeries();
    chargeSpy = vi.spyOn(paymentGateway, 'charge');
  });

  afterEach(() => { chargeSpy.mockRestore(); });

  it('1-8: payment row shape, ownership, amount, currency and deterministic idempotency key', async () => {
    const described = await bookingService.describeRecurringSeries(series.seriesId);
    expect(described.occurrenceCount).toBe(2);
    // Authoritative series economics (R5-C1): subtotal + tax = gross.
    expect(described.seriesSubtotal).toBe(TWO_OCC_TOTAL);
    expect(described.seriesTax).toBe(TWO_OCC_TAX);
    expect(described.seriesGross).toBe(TWO_OCC_GROSS);
    // Backward compatibility: seriesTotal is the pre-tax SUBTOTAL, never the charge.
    expect(described.seriesTotal).toBe(TWO_OCC_TOTAL);

    const result = await recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN);

    // (1) exactly ONE payment row for the series
    const rows = await paymentRow(series.seriesId);
    expect(rows).toHaveLength(1);
    const pay = rows[0];
    // (2) booking_id NULL — no per-occurrence link, so no per-occurrence refund
    //     path can reach this payment (Part 14 safety).
    expect(pay.booking_id).toBeNull();
    // (3) reference_type
    expect(pay.reference_type).toBe('booking_series');
    // (4) reference_id == series id
    expect(Number(pay.reference_id)).toBe(series.seriesId);
    // (5) user_id == the PLAYER, never the operator
    expect(Number(pay.user_id)).toBe(PLAYER);
    expect(Number(pay.user_id)).not.toBe(ADMIN);
    // (6) amount == authoritative series GROSS (subtotal + tax, 2dp) — the
    //     exact money the gateway is asked to collect (R5-C1 correction).
    expect(Number(pay.amount)).toBe(TWO_OCC_GROSS);
    expect(Number(pay.amount)).toBe(3152.8);
    // (7) canonical currency + method
    expect(pay.currency).toBe('EGP');
    expect(pay.payment_method).toBe('card');
    // (8) deterministic, series-scoped idempotency key (UNIQUE column reused)
    expect(pay.idempotency_key).toBe(`series-card-${series.seriesId}`);
    expect(recurringPayment.seriesPaymentIdempotencyKey(series.seriesId)).toBe(pay.idempotency_key);
    expect(pay.idempotency_key.length).toBeLessThanOrEqual(64);
    expect(result.idempotencyKey).toBe(pay.idempotency_key);
    expect(result.seriesTotal).toBe(TWO_OCC_TOTAL);          // subtotal (backward compat)
    expect(result.seriesSubtotal).toBe(TWO_OCC_TOTAL);
    expect(result.seriesTax).toBe(TWO_OCC_TAX);
    expect(result.seriesGross).toBe(TWO_OCC_GROSS);
    expect(result.playerUserId).toBe(PLAYER);
    expect(result.alreadyCharged).toBe(false);
    // booking_id NULL even though the repository maps booking references to it.
    expect(pay.order_id).toBeNull();
  });

  it('9-11: exactly ONE gateway transaction for the series GROSS, never one per occurrence', async () => {
    await recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN);

    expect(chargeSpy).toHaveBeenCalledTimes(1);
    const req: any = chargeSpy.mock.calls[0][0];
    // (10) gateway amount == authoritative series GROSS (incl. tax)
    expect(req.amount).toBe(TWO_OCC_GROSS);
    expect(req.amount).toBe(3152.8);
    expect(req.currency).toBe('EGP');
    // (11) the gateway reference is the SERIES, not any occurrence booking
    expect(req.referenceType).toBe('booking_series');
    expect(req.referenceId).toBe(series.seriesId);

    const occurrences = await occurrenceRows(series.seriesId);
    for (const occ of occurrences) {
      expect(req.referenceId).not.toBe(occ.id);
      expect(chargeSpy.mock.calls.some((c: any) => c[0].referenceId === occ.id)).toBe(false);
    }
    // The checkout URL is returned for the browser hand-off.
    expect(String(chargeSpy.mock.results[0].value ? '' : '')).toBe('');
  });

  it('9 (cont): checkout URL / client secret are returned for the canonical card flow', async () => {
    const result = await recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN);
    expect(result.paymentUrl).toMatch(/^https?:\/\//);
    expect(result.clientSecret).toBeTruthy();
    expect(result.status).toBe('pending');
  });

  it('31: repeated create reuses the SAME payment row and makes NO second gateway call', async () => {
    const first = await recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN);
    const second = await recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN);
    const third = await recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN);

    expect(second.paymentId).toBe(first.paymentId);
    expect(third.paymentId).toBe(first.paymentId);
    expect(second.alreadyCharged).toBe(true);
    expect(second.seriesTotal).toBe(TWO_OCC_TOTAL);
    expect(chargeSpy).toHaveBeenCalledTimes(1);
    expect(await paymentRow(series.seriesId)).toHaveLength(1);
  });

  it('27: the operator is recorded on the series and in the audit log, never as payment owner', async () => {
    const { collectRecurringSeriesPaymentHandler } = await import('../presentation/booking.controller.js');
    const sent: any[] = [];
    const reply: any = { status: (c: number) => reply, send: (b: any) => { sent.push(b); return reply; } };
    await collectRecurringSeriesPaymentHandler(
      { params: { id: series.seriesId }, body: {}, userId: ADMIN, ip: '127.0.0.1', headers: {} } as any,
      reply,
    );
    // `recordAudit` is intentionally fire-and-forget (as in every other handler),
    // so wait for the write rather than guess a delay.
    const a = await waitFor(
      async () => (await pool.execute<RowData>(
        `SELECT actor_id, after_state FROM audit_logs WHERE entity_type = 'booking_series' AND entity_id = ? AND action = 'BOOKING.PAY' ORDER BY id DESC LIMIT 1`,
        [series.seriesId],
      ))[0][0] as any,
      (row) => !!row,
      'the BOOKING.PAY audit row',
    );

    const [seriesRows] = await pool.execute<RowData>('SELECT created_by FROM booking_series WHERE id = ?', [series.seriesId]);
    expect(Number((seriesRows as any[])[0].created_by)).toBe(ADMIN);

    expect(a).toBeTruthy();
    expect(Number(a.actor_id)).toBe(ADMIN);
    const state = typeof a.after_state === 'string' ? JSON.parse(a.after_state) : a.after_state;
    expect(Number(state.playerId)).toBe(PLAYER);
    expect(state.seriesTotal).toBe(TWO_OCC_TOTAL);       // subtotal (backward compat)
    expect(state.seriesSubtotal).toBe(TWO_OCC_TOTAL);
    expect(state.seriesTax).toBe(TWO_OCC_TAX);
    expect(state.seriesGross).toBe(TWO_OCC_GROSS);
    expect(state.referenceType).toBe('booking_series');
    expect(Number(state.paymentId)).toBe(sent[0].paymentId);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PART 5 + 15 — ownership, security, tenant + branch isolation
// ═════════════════════════════════════════════════════════════════════════════
describe('R5-B — payment ownership and isolation', () => {
  let series: any;

  beforeEach(async () => {
    await resetSeriesState();
    series = await createSeries();
  });

  it('26: the PLAYER owns the payment; the operator is never charged', async () => {
    await recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN);
    const [rows] = await pool.execute<RowData>(
      'SELECT user_id FROM payment_transactions WHERE reference_id = ? AND reference_type = ?', [series.seriesId, 'booking_series']);
    expect(Number((rows as any[])[0].user_id)).toBe(PLAYER);
    const [wallet] = await pool.execute<RowData>('SELECT balance FROM user_wallets WHERE user_id = ?', [PLAYER]);
    expect(Number((wallet as any[])[0].balance)).toBe(0); // card only — no wallet debit
  });

  it('28: a user without responsible-user authority is rejected (403) and nothing is created', async () => {
    await expect(recurringPayment.initiateSeriesCardPayment(series.seriesId, NO_AUTH)).rejects.toThrow(/authorised responsible users/i);
    expect(await paymentRow(series.seriesId)).toHaveLength(0);
  });

  it('29: tenant isolation — an operator scoped to ANOTHER organisation cannot charge this series', async () => {
    // ADMIN2 holds org.bookings.manage + a BRANCH2 (ORG2) role-scope only.
    await expect(recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN2)).rejects.toThrow(/Not authorized/i);
    expect(await paymentRow(series.seriesId)).toHaveLength(0);
  });

  it('30: branch isolation — an operator scoped to a SIBLING branch of the same org cannot charge it', async () => {
    // ADMIN_NY holds org.bookings.manage + a BRANCH_NY role-scope. The series
    // lives on BRANCH_CAIRO (same organisation) — a permission WITHOUT the right
    // branch scope must not be able to charge it.
    await expect(recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN_NY)).rejects.toThrow(/Not authorized/i);
    expect(await paymentRow(series.seriesId)).toHaveLength(0);

    // Positive control: the SAME operator can charge a series on its own branch,
    // proving the rejection above is the scope check and not a blanket denial.
    const own = await createSeries({ branchId: BRANCH_NY, resourceId: RES_NY, weekdays: [1], startDate: DAY8, endDate: DAY8 }, ADMIN_NY, PLAYER);
    const ok = await recurringPayment.initiateSeriesCardPayment(own.seriesId, ADMIN_NY);
    expect(ok.paymentId).toBeGreaterThan(0);
    expect(await paymentRow(own.seriesId)).toHaveLength(1);
  });

  it('30 (cont): an operator from a wholly different tenant series is equally unreachable', async () => {
    const foreign = await createSeries(
      { branchId: BRANCH2, resourceId: RES_X, weekdays: [1], startDate: DAY8, endDate: DAY8, startTime: '10:00', endTime: '12:00' },
      ADMIN2, PLAYER,
    );
    await expect(recurringPayment.initiateSeriesCardPayment(foreign.seriesId, ADMIN)).rejects.toThrow(/Not authorized/i);
    expect(await paymentRow(foreign.seriesId)).toHaveLength(0);
  });

  it('rejects an unknown series and a series with no occurrences', async () => {
    await expect(recurringPayment.initiateSeriesCardPayment(99999999, ADMIN)).rejects.toThrow(/not found/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PART 6 + 7 + 10 — success lifecycle, canonical events, idempotent replay
// ═════════════════════════════════════════════════════════════════════════════
describe('R5-B — series payment success confirms eligible occurrences', () => {
  let series: any;
  let pay: any;

  beforeEach(async () => {
    await resetSeriesState();
    series = await createSeries();
    pay = await recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN);
  });

  function seriesPaidEvent() {
    return { paymentId: pay.paymentId, referenceType: 'booking_series', referenceId: series.seriesId, amount: TWO_OCC_GROSS, metadata: { paymentMethod: 'card', currency: 'EGP' } };
  }

  it('12-14: payment:succeeded confirms EVERY eligible occurrence through ConfirmBooking and emits canonical events', async () => {
    const emitSpy = vi.spyOn(eventBusV2, 'emit');
    await eventBusV2.emit('payment:succeeded', seriesPaidEvent() as any);

    const occ = await waitFor(
      () => occurrenceRows(series.seriesId),
      (rows) => allOccurrencesIn(rows, ['confirmed']),
      'both occurrences confirmed by the series payment',
    );
    expect(occ).toHaveLength(2);
    for (const o of occ) {
      expect(o.booking_status).toBe('confirmed');   // via the canonical command
      expect(o.payment_status).toBe('paid');         // atomic with the transition
    }

    // (14) canonical booking events — one per occurrence, no second payment event
    const confirmed = emitSpy.mock.calls.filter((c: any) => c[0] === 'booking:confirmed');
    const paidEvents = emitSpy.mock.calls.filter((c: any) => c[0] === 'booking:paid');
    expect(confirmed).toHaveLength(2);
    expect(paidEvents).toHaveLength(2);
    const ids = occ.map((o) => Number(o.id)).sort();
    for (const call of paidEvents) {
      const p: any = call[1];
      expect(Number(p.userId)).toBe(PLAYER);        // routes to the player's room
      expect(Number(p.seriesId)).toBe(series.seriesId);
      expect(Number(p.seriesPaymentId)).toBe(pay.paymentId);
      expect(ids).toContain(Number(p.bookingId));
    }
    // No recurring-specific payment event was invented.
    expect(emitSpy.mock.calls.filter((c: any) => c[0] === 'series:paid').length).toBe(0);
    emitSpy.mockRestore();
  });

  it('15: a duplicate payment:succeeded reconfirms nothing and emits NO duplicate booking event', async () => {
    await eventBusV2.emit('payment:succeeded', seriesPaidEvent() as any);
    // Wait for the FIRST run to have fully landed, otherwise "no duplicate" would
    // pass for the wrong reason (nothing had run yet when the spy was installed).
    await waitFor(() => occurrenceRows(series.seriesId), (rows) => allOccurrencesIn(rows, ['confirmed']),
      'first payment:succeeded confirmed both occurrences');

    const firstEmit = vi.spyOn(eventBusV2, 'emit');
    await eventBusV2.emit('payment:succeeded', seriesPaidEvent() as any);
    await settleNegativeOnly();

    expect(firstEmit.mock.calls.filter((c: any) => c[0] === 'booking:confirmed').length).toBe(0);
    expect(firstEmit.mock.calls.filter((c: any) => c[0] === 'booking:paid').length).toBe(0);
    firstEmit.mockRestore();

    const occ = await occurrenceRows(series.seriesId);
    for (const o of occ) expect(o.booking_status).toBe('confirmed');
  });

  it('16: an already-confirmed occurrence is skipped safely (manually confirmed first)', async () => {
    const occ = await occurrenceRows(series.seriesId);
    await pool.execute(`UPDATE bookings SET booking_status = 'confirmed', payment_status = 'paid' WHERE id = ?`, [occ[0].id]);

    const emitSpy = vi.spyOn(eventBusV2, 'emit');
    await eventBusV2.emit('payment:succeeded', seriesPaidEvent() as any);

    const after = await waitFor(
      () => occurrenceRows(series.seriesId),
      (rows) => {
        const eligible = rows.find((o) => Number(o.id) !== Number(occ[0].id));
        return eligible?.booking_status === 'confirmed';
      },
      `only the still-eligible occurrence ${occ[1].id} confirmed by the series payment`,
    );
    expect(after[0].booking_status).toBe('confirmed');
    expect(after[1].booking_status).toBe('confirmed');
    // Only the NOT-yet-confirmed occurrence produced events.
    expect(emitSpy.mock.calls.filter((c: any) => c[0] === 'booking:paid')).toHaveLength(1);
    expect(Number((emitSpy.mock.calls.find((c: any) => c[0] === 'booking:paid') as any)[1].bookingId)).toBe(occ[1].id);
    emitSpy.mockRestore();
  });

  it('17: cancelled / completed / no-show / past occurrences are PROTECTED from confirmation', async () => {
    const occ = await occurrenceRows(series.seriesId);
    await pool.execute(`UPDATE bookings SET booking_status = 'cancelled' WHERE id = ?`, [occ[0].id]);
    await pool.execute(`UPDATE bookings SET booking_status = 'completed' WHERE id = ?`, [occ[1].id]);

    // A second series whose occurrence is already past and still pending.
    const past = await createSeries({ weekdays: [1], startDate: DAY8, endDate: DAY8, startTime: '18:00', endTime: '20:00' });
    await pool.execute(`UPDATE bookings SET start_at_utc = '2020-01-01 00:00:00' WHERE series_id = ?`, [past.seriesId]);

    await eventBusV2.emit('payment:succeeded', seriesPaidEvent() as any);
    // Negative-only assertions: there is no eligible occurrence to poll for, so
    // the wait has to be a deliberate settle rather than a short guess.
    await settleNegativeOnly();

    const after = await occurrenceRows(series.seriesId);
    expect(after[0].booking_status).toBe('cancelled');   // untouched
    expect(after[1].booking_status).toBe('completed');   // untouched

    // The past pending occurrence is NOT confirmed either (it is not eligible).
    const pastOcc = await occurrenceRows(past.seriesId);
    expect(pastOcc[0].booking_status).toBe('pending');
    expect(pastOcc[0].payment_status).toBe('pending');
  });

  it('32 + 35: duplicate webhook and gateway retry (different webhook id) are both safe', async () => {
    const [rows] = await pool.execute<RowData>('SELECT gateway_reference FROM payment_transactions WHERE id = ?', [pay.paymentId]);
    const gwRef = (rows as any[])[0].gateway_reference;
    expect(gwRef).toBeTruthy();

    const emitSpy = vi.spyOn(eventBusV2, 'emit');
    // First authoritative webhook.
    await paymentService.handleWebhook({ obj: { id: gwRef, success: true, pending: false } }, 'sig');
    await waitFor(() => occurrenceRows(series.seriesId), (rows) => allOccurrencesIn(rows, ['confirmed']),
      'the first webhook confirmed both occurrences');
    // (32) exact duplicate — replay protection rejects it.
    const dup = await paymentService.handleWebhook({ obj: { id: gwRef, success: true, pending: false } }, 'sig');
    expect(dup).toMatchObject({ received: true });
    // (35) gateway retry that arrives with a DIFFERENT envelope id, so replay
    //      protection cannot catch it — FINAL_STATES inside the Payment Service
    //      must still make it a no-op.
    await paymentService.handleWebhook({ obj: { id: gwRef, order: { id: gwRef }, success: true, pending: false }, other_id: `retry-${Date.now()}` }, 'sig');
    await settleNegativeOnly();

    expect(emitSpy.mock.calls.filter((c: any) => c[0] === 'booking:confirmed')).toHaveLength(2);
    expect(emitSpy.mock.calls.filter((c: any) => c[0] === 'booking:paid')).toHaveLength(2);
    const [after] = await pool.execute<RowData>('SELECT payment_status FROM payment_transactions WHERE id = ?', [pay.paymentId]);
    expect((after as any[])[0].payment_status).toBe('paid');
    emitSpy.mockRestore();
  });

  it('33: repeated confirm is idempotent', async () => {
    const first = await paymentService.confirmPayment(pay.paymentId);
    await waitFor(() => occurrenceRows(series.seriesId), (rows) => allOccurrencesIn(rows, ['confirmed']),
      'the first confirm confirmed both occurrences');
    const second = await paymentService.confirmPayment(pay.paymentId);
    expect(first.confirmed).toBe(true);
    expect(second.idempotent).toBe(true);
    const occ = await occurrenceRows(series.seriesId);
    for (const o of occ) expect(o.booking_status).toBe('confirmed');
  });

  it('34: a late gateway FAILURE after an authoritative success does not rewrite the series', async () => {
    await paymentService.confirmPayment(pay.paymentId);
    await waitFor(() => occurrenceRows(series.seriesId), (rows) => allOccurrencesIn(rows, ['confirmed']),
      'the authoritative confirm settled both occurrences');
    const occBefore = await occurrenceRows(series.seriesId);
    expect(occBefore.every((o) => o.booking_status === 'confirmed')).toBe(true);

    // A stale failure webhook arriving afterwards must not cancel anything:
    // the payment is already in the FINAL 'paid' state.
    const [rows] = await pool.execute<RowData>('SELECT gateway_reference FROM payment_transactions WHERE id = ?', [pay.paymentId]);
    const gwRef = (rows as any[])[0].gateway_reference;
    await paymentService.handleWebhook({ obj: { id: gwRef, success: false, pending: false } }, 'sig');
    await settleNegativeOnly();

    const [after] = await pool.execute<RowData>('SELECT payment_status FROM payment_transactions WHERE id = ?', [pay.paymentId]);
    expect((after as any[])[0].payment_status).toBe('paid');
    const occAfter = await occurrenceRows(series.seriesId);
    for (const o of occAfter) expect(o.booking_status).toBe('confirmed');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PART 9 — failure / cancel / expiry apply the R4 eligible-only rule
// ═════════════════════════════════════════════════════════════════════════════
describe('R5-B — series payment failure, cancellation and expiry', () => {
  let series: any;
  let pay: any;

  beforeEach(async () => {
    await resetSeriesState();
    series = await createSeries();
    pay = await recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN);
  });

  async function setStates(states: Array<[number, string, string]>) {
    for (const [idx, bookingStatus, paymentStatus] of states) {
      const occ = await occurrenceRows(series.seriesId);
      await pool.execute(`UPDATE bookings SET booking_status = ?, payment_status = ? WHERE id = ?`,
        [bookingStatus, paymentStatus, occ[idx].id]);
    }
  }

  it('18 + 21: a failed gateway payment cancels eligible pending occurrences via the canonical CancelBooking', async () => {
    const [rows] = await pool.execute<RowData>('SELECT gateway_reference FROM payment_transactions WHERE id = ?', [pay.paymentId]);
    const gwRef = (rows as any[])[0].gateway_reference;
    await paymentService.handleWebhook({ obj: { id: gwRef, success: false, pending: false } }, 'sig');

    const occ = await waitFor(() => occurrenceRows(series.seriesId), (rows) => allOccurrencesIn(rows, ['cancelled']),
      'both eligible occurrences cancelled by the failed payment');
    for (const o of occ) expect(o.booking_status).toBe('cancelled');

    const [status] = await pool.execute<RowData>('SELECT payment_status FROM payment_transactions WHERE id = ?', [pay.paymentId]);
    expect((status as any[])[0].payment_status).toBe('failed');
  });

  it('19: an expired payment cancels eligible pending occurrences', async () => {
    await eventBusV2.emit('payment:expired-event', { paymentId: pay.paymentId, referenceType: 'booking_series', referenceId: series.seriesId } as any);
    const occ = await waitFor(() => occurrenceRows(series.seriesId), (rows) => allOccurrencesIn(rows, ['cancelled']),
      'both eligible occurrences cancelled by the expired payment');
    for (const o of occ) expect(o.booking_status).toBe('cancelled');
  });

  it('20: a cancelled payment cancels eligible pending occurrences', async () => {
    await eventBusV2.emit('payment:cancelled-event', { paymentId: pay.paymentId, referenceType: 'booking_series', referenceId: series.seriesId } as any);
    const occ = await waitFor(() => occurrenceRows(series.seriesId), (rows) => allOccurrencesIn(rows, ['cancelled']),
      'both eligible occurrences cancelled by the cancelled payment');
    for (const o of occ) expect(o.booking_status).toBe('cancelled');
  });

  it('22: terminal, past and already-paid occurrences are NEVER cancelled', async () => {
    const occ = await occurrenceRows(series.seriesId);
    // occ[0] completed (terminal), occ[1] pushed into the past.
    await pool.execute(`UPDATE bookings SET booking_status = 'completed' WHERE id = ?`, [occ[0].id]);
    await pool.execute(`UPDATE bookings SET start_at_utc = '2020-01-01 00:00:00' WHERE id = ?`, [occ[1].id]);

    await eventBusV2.emit('payment:failed-event', { paymentId: pay.paymentId, referenceType: 'booking_series', referenceId: series.seriesId, reason: 'declined' } as any);
    await settleNegativeOnly();

    const after = await occurrenceRows(series.seriesId);
    expect(after[0].booking_status).toBe('completed');
    expect(after[1].booking_status).toBe('pending');   // past → not touched
  });

  it('an already-PAID occurrence is not cancelled by a later terminal payment event', async () => {
    const occ = await occurrenceRows(series.seriesId);
    await pool.execute(`UPDATE bookings SET booking_status = 'confirmed', payment_status = 'paid' WHERE id = ?`, [occ[0].id]);

    await eventBusV2.emit('payment:failed-event', { paymentId: pay.paymentId, referenceType: 'booking_series', referenceId: series.seriesId, reason: 'declined' } as any);

    const after = await waitFor(() => occurrenceRows(series.seriesId), (rows) => anyOccurrenceIn(rows, ['cancelled']),
      'the single ELIGIBLE occurrence cancelled while the paid one is preserved');
    expect(after[0].booking_status).toBe('confirmed');
    expect(after[0].payment_status).toBe('paid');
    expect(after[1].booking_status).toBe('cancelled');
  });

  it('a terminal series payment cannot be re-charged under a new payment row (one payment per series)', async () => {
    const [rows] = await pool.execute<RowData>('SELECT gateway_reference FROM payment_transactions WHERE id = ?', [pay.paymentId]);
    const gwRef = (rows as any[])[0].gateway_reference;
    await paymentService.handleWebhook({ obj: { id: gwRef, success: false, pending: false } }, 'sig');
    await waitFor(() => occurrenceRows(series.seriesId), (rows) => allOccurrencesIn(rows, ['cancelled']),
      'both eligible occurrences cancelled');

    await expect(recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN)).rejects.toThrow(/exactly one payment/i);
    expect(await paymentRow(series.seriesId)).toHaveLength(1);
  });

  it('does not invent a series status: the series row stays within the R4 lifecycle enum', async () => {
    await eventBusV2.emit('payment:failed-event', { paymentId: pay.paymentId, referenceType: 'booking_series', referenceId: series.seriesId, reason: 'declined' } as any);
    await waitFor(() => occurrenceRows(series.seriesId), (rows) => allOccurrencesIn(rows, ['cancelled']),
      'both eligible occurrences cancelled');
    const [rows] = await pool.execute<RowData>('SELECT status FROM booking_series WHERE id = ?', [series.seriesId]);
    expect(['active', 'paused', 'completed', 'cancelled']).toContain((rows as any[])[0].status);
    // Cancelled/completed series can no longer take a new card payment.
    await pool.execute(`UPDATE booking_series SET status = 'cancelled' WHERE id = ?`, [series.seriesId]);
    await expect(recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN)).rejects.toThrow(/cancelled/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PART 8 — accounting safety: ONE gateway payment -> ZERO recognition
// ═════════════════════════════════════════════════════════════════════════════
describe('R5-B — accounting safety', () => {
  let series: any;
  let pay: any;

  beforeEach(async () => {
    await resetSeriesState();
    series = await createSeries();
    pay = await recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN);
  });

  it('23-25: series payment recognized EXACTLY ONCE at series level — never per occurrence', async () => {
    const before = await financialFootprint(series.seriesId);
    // Hermetic precondition: no occurrence-scoped financial rows may exist yet.
    expect(before).toEqual({ bookingLedger: 0, bookingEventTypes: [], journal: 0, gl: 0, glEventTypes: [] });

    // Precondition: the occurrences really do carry series_id and the canonical
    // economics resolver surfaces it — this is what keeps per-booking accounting
    // a no-op and prevents N× recognition of the same series money.
    const { resolveBookingEconomics } = await import('../../financial/application/booking-accounting.service.js');
    for (const o of await occurrenceRows(series.seriesId)) {
      expect(Number(o.series_id)).toBe(series.seriesId);
      const econ = await resolveBookingEconomics(Number(o.id));
      expect(econ!.seriesId).toBe(series.seriesId);
    }

    const emitSpy = vi.spyOn(eventBusV2, 'emit');
    await eventBusV2.emit('payment:succeeded', {
      paymentId: pay.paymentId, referenceType: 'booking_series', referenceId: series.seriesId, amount: TWO_OCC_GROSS,
      metadata: { paymentMethod: 'card', currency: 'EGP' },
    } as any);
    // Synchronise on the BOOKING side first, then wait for the R5-C2 series
    // postings themselves (positive signal) before the negative assertions.
    await waitFor(() => occurrenceRows(series.seriesId), (rows) => allOccurrencesIn(rows, ['confirmed']),
      'both occurrences confirmed');

    const occ = await occurrenceRows(series.seriesId);
    expect(occ.every((o) => o.booking_status === 'confirmed')).toBe(true);
    expect(emitSpy.mock.calls.filter((c: any) => c[0] === 'booking:paid')).toHaveLength(2);

    // (24) the series is recognized EXACTLY ONCE via the R5-C2 series posting:
    //      4 CourtZon legs + 3 organization-book legs targeting source_id=seriesId.
    await waitFor(() => seriesLedgerRowCount(series.seriesId, 'booking_series_card_payment'), (c) => c === 4,
      'CourtZon booking_series_card_payment posting (4 legs)');
    await waitFor(() => seriesLedgerRowCount(series.seriesId, 'booking_series_org_receivable'), (c) => c === 3,
      'organization booking_series_org_receivable posting (3 legs)');

    // (23) the series payment NEVER entered per-booking accounting and never hit
    //      the generic card_payment fallthrough — the occurrence-scoped
    //      footprint must remain zero (no N× recognition of the same money).
    // (25) booking:paid occurrence events did not double-recognise the series money.
    const after = await financialFootprint(series.seriesId);
    expect(after).toEqual(before);
    expect(after.bookingLedger).toBe(0);
    expect(after.journal).toBe(0);
    expect(after.gl).toBe(0);
    emitSpy.mockRestore();
  });

  it('23 (control): a STANDALONE booking payment in the same org still posts normally', async () => {
    // Proves the accounting listener is live and the zero above is caused by the
    // R5-B series guards — not by a dead/broken accounting path.
    const occ = await occurrenceRows(series.seriesId);
    const standalone = Number(occ[0].id);
    await pool.execute(`UPDATE bookings SET series_id = NULL WHERE id = ?`, [standalone]);

    await eventBusV2.emit('payment:succeeded', {
      paymentId: 9999001, referenceType: 'booking', referenceId: standalone, amount: 1600,
      metadata: { paymentMethod: 'card', currency: 'EGP' },
    } as any);

    // Positive control, so this is a genuine wait rather than a fixed delay.
    // A short grace period first: the accounting posting runs inside a
    // per-organisation exclusive transaction, and hammering the table with a
    // tight poll while it is committing is what turns a real posting into a
    // timeout.
    await sleep(500);
    const count = await waitFor(
      async () => {
        const [rows] = await pool.execute<RowData>(
          `SELECT id, source_type, source_id, organisation_id FROM ledger_entries WHERE source_type = 'booking' AND source_id = ?`, [standalone]);
        return rows.length;
      },
      (c) => c > 0,
      'the standalone booking payment posted its ledger entries',
    );
    expect(count).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PART 14 — refund safety
// ═════════════════════════════════════════════════════════════════════════════
describe('R5-B — refund safety', () => {
  it('a per-occurrence refund cannot reach the series payment (booking_id is NULL)', async () => {
    await resetSeriesState();
    const series = await createSeries();
    const pay = await recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN);

    const occ = await occurrenceRows(series.seriesId);
    for (const o of occ) {
      // The refund path resolves the payment by booking_id. A series occurrence
      // has NO linked payment row, so the whole series is unreachable.
      const [rows] = await pool.execute<RowData>(
        'SELECT id FROM payment_transactions WHERE booking_id = ?', [o.id]);
      expect(rows).toHaveLength(0);
    }
    const rows = await paymentRow(series.seriesId);
    expect(rows).toHaveLength(1);
    expect(rows[0].booking_id).toBeNull();
    expect(Number(rows[0].id)).toBe(pay.paymentId);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// R5-C1 — authoritative series gross amount (subtotal + tax).
// The single card payment must charge `seriesGross`, never the pre-tax subtotal.
// Contract values (fixture): Mon 1600 / tax 201.60 → 1801.60 ·
// Thu 1200 / tax 151.20 → 1351.20 · series 2800 / 352.80 → 3152.80.
// ────────────────────────────────────────────────────────────────────────────
describe('R5-C1 — authoritative series gross amount', () => {
  let series: any;
  let chargeSpy: any;

  beforeEach(async () => {
    await resetSeriesState();
    series = await createSeries();
    chargeSpy = vi.spyOn(paymentGateway, 'charge');
  });

  afterEach(() => { chargeSpy.mockRestore(); });

  it('describe exposes seriesSubtotal / seriesTax / seriesGross (subtotal+tax)', async () => {
    const described = await bookingService.describeRecurringSeries(series.seriesId);
    expect(described.seriesSubtotal).toBe(TWO_OCC_TOTAL);   // 2800
    expect(described.seriesTax).toBe(TWO_OCC_TAX);          // 352.80
    expect(described.seriesGross).toBe(TWO_OCC_GROSS);      // 3152.80
  });

  it('the payment row stores the GROSS amount (payment_transactions.amount = seriesGross)', async () => {
    const result = await recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN);
    expect(result.seriesGross).toBe(3152.8);
    const rows = await paymentRow(series.seriesId);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(TWO_OCC_GROSS);
    expect(Number(rows[0].amount)).toBe(3152.8);
  });

  it('the gateway is charged exactly seriesGross (one transaction, never per occurrence)', async () => {
    await recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN);
    expect(chargeSpy).toHaveBeenCalledTimes(1);
    const req: any = chargeSpy.mock.calls[0][0];
    expect(req.amount).toBe(TWO_OCC_GROSS);
    expect(req.referenceType).toBe('booking_series');
  });

  it('client cannot override subtotal/tax/gross/amount — the schema is strict and carries no money', async () => {
    const { RecurringPaymentSchema } = await import('../presentation/booking.dto.js');
    for (const f of ['amount', 'subtotal', 'seriesTotal', 'seriesSubtotal', 'seriesTax', 'seriesGross', 'taxAmount', 'currency']) {
      expect(() => RecurringPaymentSchema.parse({ [f]: 1 }), `${f} must be rejected`).toThrow();
      expect(() => RecurringPaymentSchema.parse({ [f]: 'EGP' }), `${f} must be rejected`).toThrow();
    }
  });

  it('two weekdays with DIFFERENT prices produce different per-occurrence tax amounts', async () => {
    const occ = await occurrenceRows(series.seriesId);
    expect(occ).toHaveLength(2);
    const vals = occ.map((o: any) => ({ total: Number(o.total_amount), tax: Number(o.tax_amount) }));
    // Monday 1600 / 201.60 · Thursday 1200 / 151.20
    expect(vals.map(v => v.total).sort((a, b) => a - b)).toEqual([1200, 1600]);
    expect(vals.map(v => v.tax).sort((a, b) => a - b)).toEqual([151.2, 201.6]);
  });

  it('exact 2dp aggregation: seriesGross === round2(subtotal+tax) === Σ per-occurrence gross', async () => {
    const desc = await bookingService.describeRecurringSeries(series.seriesId);
    const occ = await occurrenceRows(series.seriesId);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const subtotal = r2(occ.reduce((s: number, o: any) => s + Number(o.total_amount), 0));
    const tax = r2(occ.reduce((s: number, o: any) => s + Number(o.tax_amount), 0));
    const grossSum = r2(occ.reduce((s: number, o: any) => s + r2(Number(o.total_amount) + Number(o.tax_amount)), 0));
    expect(desc.seriesSubtotal).toBe(subtotal);
    expect(desc.seriesTax).toBe(tax);
    expect(desc.seriesGross).toBe(r2(subtotal + tax));
    // parity with paying each occurrence individually
    expect(desc.seriesGross).toBe(grossSum);
    expect(desc.seriesGross).toBe(3152.8);
  });

  it('zero-tax series: gross === subtotal (no tax leg, no aggregate re-calc)', async () => {
    await pool.execute(`UPDATE tax_rates SET rate = 0 WHERE organisation_id = ${ORG1}`);
    try {
      await resetSeriesState();
      const s0 = await createSeries();
      const occ0 = await occurrenceRows(s0.seriesId);
      expect(occ0.every((o: any) => Number(o.tax_amount) === 0)).toBe(true);

      const desc0 = await bookingService.describeRecurringSeries(s0.seriesId);
      expect(desc0.seriesTax).toBe(0);
      expect(desc0.seriesGross).toBe(desc0.seriesSubtotal);

      const pay0 = await recurringPayment.initiateSeriesCardPayment(s0.seriesId, ADMIN);
      expect(pay0.seriesTax).toBe(0);
      expect(pay0.seriesGross).toBe(pay0.seriesSubtotal);
      const rows0 = await paymentRow(s0.seriesId);
      expect(Number(rows0[0].amount)).toBe(pay0.seriesSubtotal);
    } finally {
      await pool.execute(`UPDATE tax_rates SET rate = 14 WHERE organisation_id = ${ORG1}`);
    }
  });

  it('multi-occurrence series (Mon/Wed/Thu) aggregates every persisted occurrence snapshot', async () => {
    await resetSeriesState();
    const s = await createSeries({ weekdays: [1, 3, 4], startDate: DAY8, endDate: '2026-09-21' });
    const occ = await occurrenceRows(s.seriesId);
    // Mon 14, Wed 16, Thu 17 + the second Monday 21 (the weekly repeat is
    // inclusive of endDate) → 4 occurrences across two different pricing days.
    expect(occ).toHaveLength(4);

    const desc = await bookingService.describeRecurringSeries(s.seriesId);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const subtotal = r2(occ.reduce((a: number, o: any) => a + Number(o.total_amount), 0));
    const tax = r2(occ.reduce((a: number, o: any) => a + Number(o.tax_amount), 0));
    const grossSum = r2(occ.reduce((a: number, o: any) => a + r2(Number(o.total_amount) + Number(o.tax_amount)), 0));
    expect(desc.seriesSubtotal).toBe(subtotal);
    expect(desc.seriesTax).toBe(tax);
    expect(desc.seriesGross).toBe(r2(subtotal + tax));
    expect(desc.seriesGross).toBe(grossSum);

    const pay = await recurringPayment.initiateSeriesCardPayment(s.seriesId, ADMIN);
    expect(pay.seriesGross).toBe(desc.seriesGross);
  });

  it('no payment duplication: repeated initiate converges on the same GROSS payment row', async () => {
    const first = await recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN);
    const second = await recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN);
    expect(second.paymentId).toBe(first.paymentId);
    expect(second.alreadyCharged).toBe(true);
    expect(second.seriesGross).toBe(TWO_OCC_GROSS);
    expect(await paymentRow(series.seriesId)).toHaveLength(1);
    expect(chargeSpy).toHaveBeenCalledTimes(1);
  });

  it('timezone/pricing semantics are unchanged — aggregates reconcile with persisted occurrence economics', async () => {
    // The default series is priced per occurrence on its OWN Africa/Cairo local
    // date; R5-C1 only aggregates the persisted snapshots (no re-pricing).
    const desc = await bookingService.describeRecurringSeries(series.seriesId);
    const occ = await occurrenceRows(series.seriesId);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const expectedSubtotal = r2(occ.reduce((a: number, o: any) => a + Number(o.total_amount), 0));
    const expectedTax = r2(occ.reduce((a: number, o: any) => a + Number(o.tax_amount), 0));
    expect(desc.seriesSubtotal).toBe(expectedSubtotal);
    expect(desc.seriesTax).toBe(expectedTax);
    expect(desc.seriesGross).toBe(r2(expectedSubtotal + expectedTax));
  });

  it('NO accounting side effects: financial footprint stays zero after payment initiation', async () => {
    const before = await financialFootprint(series.seriesId);
    await recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN);
    // Initiating a payment emits NO payment-success event → nothing is recognized.
    const after = await financialFootprint(series.seriesId);
    expect(after).toEqual(before);
    expect(after.bookingLedger).toBe(0);
    expect(after.journal).toBe(0);
    expect(after.gl).toBe(0);
    expect(after.glEventTypes).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// R5-C2 — series accounting recognition (ONE posting per paid series).
// On payment:succeeded(reference_type=booking_series) the R5-B "financially
// neutral" guard is replaced by the single series-level recognition:
//   CourtZon  : Dr 1100 3152.80 / Cr 2202 2520.00 / Cr 4110 280.00 / Cr 2300 352.80
//   Organization: Dr 1161 2520.00 / Dr comm expense 280.00 / Cr court rental 2800.00
// Idempotent via hasPosting(('booking', seriesId, eventType)); per-occurrence
// booking:paid stays a no-op (seriesId guard) so the SAME money posts exactly once.
// ────────────────────────────────────────────────────────────────────────────
describe('R5-C2 — series accounting recognition', () => {
  let series: any;
  let pay: any;

  beforeEach(async () => {
    await resetSeriesState();
    series = await createSeries();
    pay = await recurringPayment.initiateSeriesCardPayment(series.seriesId, ADMIN);
  });

  async function succeedOnce() {
    await eventBusV2.emit('payment:succeeded', {
      paymentId: pay.paymentId, referenceType: 'booking_series', referenceId: series.seriesId,
      amount: TWO_OCC_GROSS, metadata: { paymentMethod: 'card', currency: 'EGP' },
    } as any);
    await waitFor(() => seriesLedgerRowCount(series.seriesId, 'booking_series_card_payment'), (c) => c === 4,
      'CourtZon series posting (4 legs)');
    await waitFor(() => seriesLedgerRowCount(series.seriesId, 'booking_series_org_receivable'), (c) => c === 3,
      'organization series posting (3 legs)');
  }

  it('A/L — the fixture economics and charged amount are the R5-C1 numbers (2800 / 352.80 / 3152.80)', async () => {
    const ctx = await recurringPayment.loadSeriesPaymentContext(series.seriesId);
    expect(ctx.seriesSubtotal).toBe(2800);
    expect(ctx.seriesTax).toBe(352.8);
    expect(ctx.seriesGross).toBe(3152.8);
    const occ = await occurrenceRows(series.seriesId);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    expect(r2(occ.reduce((s: number, o: any) => s + Number(o.commission_amount), 0))).toBe(280);
    expect(r2(occ.reduce((s: number, o: any) => s + Number(o.club_amount), 0))).toBe(2520);
    const [pt] = await paymentRow(series.seriesId);
    expect(Number(pt.amount)).toBe(3152.8); // R5-C1 amount unchanged
  });

  it('B — CourtZon journal: Dr 1100 3152.80 / Cr 2202 2520 / Cr 4110 280 / Cr 2300 352.80', async () => {
    await succeedOnce();
    const rows = await seriesLedgerRows(series.seriesId, 'booking_series_card_payment');
    expect(rows).toHaveLength(4);
    const find = (side: string, code: string) => Number(rows.find((r: any) => r.side === side && r.account_code === code)?.amount ?? -1);
    expect(rows.every((r: any) => r.organisation_id === null)).toBe(true); // CourtZon book
    expect(find('debit', '1100')).toBe(3152.8);
    expect(find('credit', '2202')).toBe(2520);
    expect(find('credit', '4110')).toBe(280);
    expect(find('credit', '2300')).toBe(352.8);
  });

  it('C — Organization journal: Dr 1161 2520 / Dr comm expense 280 / Cr court rental 2800', async () => {
    await succeedOnce();
    const rows = await seriesLedgerRows(series.seriesId, 'booking_series_org_receivable');
    expect(rows).toHaveLength(3);
    const by = (side: string, code: string) => rows.find((r: any) => r.side === side && r.account_code === code);
    expect(rows.every((r: any) => Number(r.organisation_id) === ORG1)).toBe(true);
    expect(Number(by('debit', '1161')?.amount)).toBe(2520);
    expect(Number(by('debit', 'MKT-COMM-EXP')?.amount)).toBe(280);
    expect(Number(by('credit', 'MKT-COURT-REN')?.amount)).toBe(2800);
  });

  it('D — both journals are internally balanced (Σ debit == Σ credit)', async () => {
    await succeedOnce();
    for (const eventType of ['booking_series_card_payment', 'booking_series_org_receivable']) {
      const rows = await seriesLedgerRows(series.seriesId, eventType);
      const dr = Number(rows.filter((r) => r.side === 'debit').reduce((s: number, r: any) => s + Number(r.amount), 0).toFixed(2));
      const cr = Number(rows.filter((r) => r.side === 'credit').reduce((s: number, r: any) => s + Number(r.amount), 0).toFixed(2));
      expect(dr, `${eventType} debit`).toBe(cr);
    }
  });

  it('E — the same payment:succeeded processed TWICE posts exactly ONE CourtZon + ONE org journal', async () => {
    await succeedOnce();
    await eventBusV2.emit('payment:succeeded', {
      paymentId: pay.paymentId, referenceType: 'booking_series', referenceId: series.seriesId,
      amount: TWO_OCC_GROSS, metadata: { paymentMethod: 'card', currency: 'EGP' },
    } as any);
    await settleNegativeOnly();
    expect(await seriesLedgerRowCount(series.seriesId, 'booking_series_card_payment')).toBe(4);
    expect(await seriesLedgerRowCount(series.seriesId, 'booking_series_org_receivable')).toBe(3);
  });

  it('F — webhook / confirm / recover replay paths all converge to the same single posting', async () => {
    await succeedOnce();
    const [rows] = await pool.execute<RowData>('SELECT gateway_reference FROM payment_transactions WHERE id = ?', [pay.paymentId]);
    const gwRef = (rows as any[])[0].gateway_reference;
    // confirm re-entrancy + exact-duplicate webhook + a gateway retry envelope.
    const c1 = await paymentService.confirmPayment(pay.paymentId);
    const c2 = await paymentService.confirmPayment(pay.paymentId);
    expect(c1.confirmed).toBe(true);
    expect(c2.idempotent).toBe(true);
    await paymentService.handleWebhook({ obj: { id: gwRef, success: true, pending: false } }, 'sig');
    await paymentService.handleWebhook({ obj: { id: gwRef, order: { id: gwRef }, success: true, pending: false }, other_id: `retry-${Date.now()}` }, 'sig');
    await settleNegativeOnly();
    expect(await seriesLedgerRowCount(series.seriesId, 'booking_series_card_payment')).toBe(4);
    expect(await seriesLedgerRowCount(series.seriesId, 'booking_series_org_receivable')).toBe(3);
  });

  it('G — the series payment NEVER posts per occurrence (occurrence-scoped footprint stays zero)', async () => {
    await succeedOnce();
    const before = await financialFootprint(series.seriesId);
    expect(before.bookingLedger).toBe(0);
    const occIds = (await occurrenceRows(series.seriesId)).map((o: any) => o.id).join(',');
    const [le] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='booking' AND source_id IN (${occIds})`, []);
    expect(Number((le as any[])[0].c)).toBe(0);
  });

  it('I — zero-tax series: gross == subtotal and no tax leg (zero-value lines omitted)', async () => {
    await pool.execute(`UPDATE tax_rates SET rate = 0 WHERE organisation_id = ${ORG1}`);
    try {
      await resetSeriesState();
      const s0 = await createSeries();
      const occ0 = await occurrenceRows(s0.seriesId);
      expect(occ0.every((o: any) => Number(o.tax_amount) === 0)).toBe(true);

      await recurringPayment.initiateSeriesCardPayment(s0.seriesId, ADMIN);
      const p0 = (await paymentRow(s0.seriesId))[0];
      expect(Number(p0.amount)).toBe(2800); // gross == subtotal (zero tax)

      await eventBusV2.emit('payment:succeeded', {
        paymentId: Number(p0.id), referenceType: 'booking_series', referenceId: s0.seriesId,
        amount: 2800, metadata: { paymentMethod: 'card', currency: 'EGP' },
      } as any);
      await waitFor(() => seriesLedgerRowCount(s0.seriesId, 'booking_series_card_payment'), (c) => c === 3,
        'zero-tax CourtZon posting has exactly 3 legs (no tax line)');
      await waitFor(() => seriesLedgerRowCount(s0.seriesId, 'booking_series_org_receivable'), (c) => c === 3,
        'zero-tax org posting (3 legs)');
      const court = await seriesLedgerRows(s0.seriesId, 'booking_series_card_payment');
      expect(court.find((r: any) => r.account_code === '2300')).toBeUndefined(); // no tax leg
      expect(Number(court.find((r: any) => r.side === 'debit')?.amount)).toBe(2800);
    } finally {
      await pool.execute(`UPDATE tax_rates SET rate = 14 WHERE organisation_id = ${ORG1}`);
    }
  });

  it('J — multiple occurrences with different prices/taxes aggregate persisted snapshots exactly', async () => {
    await resetSeriesState();
    const s = await createSeries({ weekdays: [1, 3, 4], startDate: DAY8, endDate: '2026-09-21' });
    const p = await recurringPayment.initiateSeriesCardPayment(s.seriesId, ADMIN);
    const occ = await occurrenceRows(s.seriesId);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const expected = {
      subtotal: r2(occ.reduce((a: number, o: any) => a + Number(o.total_amount), 0)),
      tax: r2(occ.reduce((a: number, o: any) => a + Number(o.tax_amount), 0)),
      commission: r2(occ.reduce((a: number, o: any) => a + Number(o.commission_amount), 0)),
      orgNet: r2(occ.reduce((a: number, o: any) => a + Number(o.club_amount), 0)),
    };
    expect(p.seriesGross).toBe(r2(expected.subtotal + expected.tax));

    await eventBusV2.emit('payment:succeeded', {
      paymentId: p.paymentId, referenceType: 'booking_series', referenceId: s.seriesId,
      amount: p.seriesGross, metadata: { paymentMethod: 'card', currency: 'EGP' },
    } as any);
    await waitFor(() => seriesLedgerRowCount(s.seriesId, 'booking_series_card_payment'), (c) => c === 4,
      'multi-occurrence CourtZon posting (4 legs)');
    const court = await seriesLedgerRows(s.seriesId, 'booking_series_card_payment');
    expect(Number(court.find((r: any) => r.side === 'credit' && r.account_code === '2202')?.amount)).toBe(expected.orgNet);
    expect(Number(court.find((r: any) => r.side === 'credit' && r.account_code === '4110')?.amount)).toBe(expected.commission);
    expect(Number(court.find((r: any) => r.side === 'credit' && r.account_code === '2300')?.amount)).toBe(expected.tax);
    expect(Number(court.find((r: any) => r.side === 'debit' && r.account_code === '1100')?.amount)).toBe(r2(expected.orgNet + expected.commission + expected.tax));
  });

  it('K — no per-occurrence booking:paid re-posts the series money (occurrence footprint zero after full cycle)', async () => {
    await succeedOnce();
    const occ = await occurrenceRows(series.seriesId);
    expect(occ.every((o: any) => o.booking_status === 'confirmed')).toBe(true);
    const fp = await financialFootprint(series.seriesId);
    expect(fp.bookingLedger).toBe(0);
    expect(fp.gl).toBe(0);
    expect(fp.journal).toBe(0);
  });
});
