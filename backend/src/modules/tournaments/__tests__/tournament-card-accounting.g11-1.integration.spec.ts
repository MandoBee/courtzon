import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3007';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * G11.1 — Tournament CARD registration accounting (per paid registration).
 *
 * Approved model:
 *   Organisation-owned tournament (organisation_id NOT NULL), entry_fee 1000,
 *   commission_rate 10:
 *     CourtZon book (org NULL): Dr 1100 Payment Clearing 1000 · Cr 2202
 *       Merchant Payable 900 · Cr 4192 Tournament Commission 100.
 *     Org book (org-scoped): Dr 1161 900 · Dr MKT-COMM-EXP 100 ·
 *       Cr 4140 Tournament / Event Revenue 1000.
 *   Platform tournament (organisation_id NULL, commission_rate 0): CourtZon
 *     owns everything: Dr 1100 1000 · Cr 4140 1000. No org journal.
 *
 * Rules under test:
 *   - tax = 0 (G11.1 decision) → NO 2300 leg.
 *   - commission = round2(gross × tournament.commission_rate / 100) from the
 *     IMMUTABLE tournament snapshot (never the live subscription rate).
 *   - payment amount is authoritative (entry_fee only verified defensively);
 *     registration_fee is NEVER used.
 *   - source_type='tournament', source_id=paymentId, dedicated event types
 *     (no generic card_payment fallthrough, no 'booking' source).
 *   - each posting is independently idempotent via hasPosting + uk_dedup.
 *   - FREE (zero fee) and CASH are out of scope → no posting.
 */

const ORG = 10060100;
const PLAYER = 10060111;
const CREATOR = 10060110;
const PLAN = 10060090;
const BRACKET = 1; // single-elimination (existing bracket_type)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(probe: () => Promise<T>, isReady: (value: T) => boolean, what: string, timeoutMs = 20_000): Promise<T> {
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

let pool: mysql.Pool;
const paymentIds: number[] = [];
const regIds: number[] = [];
const tournamentIds: number[] = [];
let EVENT_BASE_ID = 0;

async function exec(sql: string, params: any[] = []) {
  return pool.execute(sql, params);
}

/** rows of the two G11.1 events for ONE payment (CourtZon + org), source_type='tournament'. */
async function courtzonRows(paymentId: number): Promise<any[]> {
  const [rows] = await pool.execute<RowData>(
    `SELECT le.side, le.amount, le.event_type, le.source_type, le.source_id,
            le.organisation_id, c.code AS account_code
     FROM ledger_entries le JOIN chart_of_accounts c ON c.id = le.chart_account_id
     WHERE le.source_type = 'tournament' AND le.source_id = ? AND le.event_type = 'tournament_registration_card_payment'
     ORDER BY le.id`,
    [paymentId],
  );
  return rows as any[];
}

async function orgRows(paymentId: number): Promise<any[]> {
  const [rows] = await pool.execute<RowData>(
    `SELECT le.side, le.amount, le.event_type, le.source_type, le.source_id,
            le.organisation_id, c.code AS account_code
     FROM ledger_entries le JOIN chart_of_accounts c ON c.id = le.chart_account_id
     WHERE le.source_type = 'tournament' AND le.source_id = ? AND le.event_type = 'tournament_org_registration_receivable'
     ORDER BY le.id`,
    [paymentId],
  );
  return rows as any[];
}

async function platformRows(paymentId: number): Promise<any[]> {
  const [rows] = await pool.execute<RowData>(
    `SELECT le.side, le.amount, le.event_type, le.source_type, le.source_id,
            le.organisation_id, c.code AS account_code
     FROM ledger_entries le JOIN chart_of_accounts c ON c.id = le.chart_account_id
     WHERE le.source_type = 'tournament' AND le.source_id = ? AND le.event_type = 'tournament_platform_card_payment'
     ORDER BY le.id`,
    [paymentId],
  );
  return rows as any[];
}

async function countTournamentRows(paymentId: number): Promise<number> {
  const [rows] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type = 'tournament' AND source_id = ?`,
    [paymentId],
  );
  return Number((rows as any[])[0].c);
}

async function createTournament(opts: { id?: number; entryFee: number; rate: number; org: number | null; regFee?: number; currency?: string }) {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournaments
       (public_id, creator_id, organisation_id, bracket_type_id, name,
        max_participants, min_participants, entry_fee, registration_fee,
        currency_code, price_type, tournament_type, commission_rate, status,
        start_date)
     VALUES (UUID(), ?, ?, ?, ?, 16, 2, ?, ?, ?, 'FIXED', ?, ?, 'registration_open', '2026-12-01')`,
    [CREATOR, opts.org, BRACKET, `G11M ${opts.id ?? 'T'}`, opts.entryFee, opts.regFee ?? 0,
      opts.currency ?? 'EGP', opts.org != null ? 'community' : 'platform', opts.rate],
  );
  const tournamentId = Number((res as any).insertId);
  tournamentIds.push(tournamentId);
  return tournamentId;
}

async function createRegistration(tournamentId: number): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status)
     VALUES (?, ?, 'unpaid', 'registered')`,
    [tournamentId, PLAYER],
  );
  const regId = Number((res as any).insertId);
  regIds.push(regId);
  return regId;
}

async function createPaidCardPayment(regId: number, amount: number, currency = 'EGP', method = 'card'): Promise<number> {
  const gatewayRef = `g11-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [res] = await pool.execute<RowData>(
    `INSERT INTO payment_transactions
       (user_id, reference_type, reference_id, payment_method, gateway_reference,
        amount, currency, payment_status, paid_at, trace_id)
     VALUES (?, 'tournament', ?, ?, ?, ?, ?, 'paid', NOW(), UUID())`,
    [PLAYER, regId, method, gatewayRef, amount, currency],
  );
  const paymentId = Number((res as any).insertId);
  paymentIds.push(paymentId);
  return paymentId;
}

async function emitPaymentSucceeded(paymentId: number, regId: number, amount: number, currency = 'EGP', method = 'card', repeated = false) {
  const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
  await eventBusV2.emit('payment:succeeded', {
    paymentId,
    referenceType: 'tournament',
    referenceId: regId,
    amount,
    metadata: { paymentMethod: method, currency, userId: PLAYER },
  } as any);
  if (repeated) {
    await eventBusV2.emit('payment:succeeded', {
      paymentId,
      referenceType: 'tournament',
      referenceId: regId,
      amount,
      metadata: { paymentMethod: method, currency, userId: PLAYER },
    } as any);
  }
}

const sum = (rows: any[], side: string) =>
  Math.round(rows.filter((r) => r.side === side).reduce((s: number, r: any) => s + Number(r.amount), 0) * 100) / 100;

const amountFor = (rows: any[], side: string, code: string) =>
  Number(rows.find((r) => r.side === side && r.account_code === code)?.amount ?? -1);

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });

  // Outbox watermark — no event THIS suite emits may survive to be replayed by
  // a foreign consumer into a later test's ledger snapshot.
  const [evBase] = await pool.execute<RowData>('SELECT COALESCE(MAX(id), 0) AS m FROM published_events');
  const [prBase] = await pool.execute<RowData>('SELECT COALESCE(MAX(id), 0) AS m FROM processed_events');
  EVENT_BASE_ID = Math.min(Number((evBase as any[])[0].m), Number((prBase as any[])[0].m));

  await seedBase();

  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  const { registerAccountingEventListeners } = await import('../../financial/application/accounting-event.listener.js');
  registerAccountingEventListeners();
}, 120000);

afterAll(async () => {
  await cleanupAll();
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 120000);

async function cleanupAll() {
  if (!pool) return;
  await pool.execute(`DELETE FROM payment_transactions WHERE id IN (${paymentIds.length ? paymentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ${ORG} OR source_type = 'tournament'`);
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ${ORG}`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE id IN (${regIds.length ? regIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id = ${ORG})`);
  await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id = ${ORG}`);
  await pool.execute(`DELETE FROM organisation_subscriptions WHERE organisation_id = ${ORG}`);
  await pool.execute(`DELETE FROM subscription_plan_rates WHERE plan_id = ${PLAN}`);
  await pool.execute(`DELETE FROM subscription_plans WHERE id = ${PLAN}`);
  await pool.execute(`DELETE FROM users WHERE id IN (${CREATOR}, ${PLAYER})`);
  await pool.execute(`DELETE FROM organisations WHERE id = ${ORG}`);
  await pool.execute(`DELETE FROM published_events WHERE id > ${EVENT_BASE_ID}`);
  await pool.execute(`DELETE FROM processed_events WHERE id > ${EVENT_BASE_ID}`);
  paymentIds.length = 0; regIds.length = 0; tournamentIds.length = 0;
}

/** Base org/user/plan fixtures — re-seeded after every per-test wipe. */
async function seedBase() {
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG}, UUID(), ?, 1, 'G11M Org', 'g11m-org', 1)`, [otId]);

  const mkUser = async (id: number, email: string) => {
    await pool.execute(
      `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
       VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'G11M User', 'male', 'active')`,
      [id, `015${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, email],
    );
  };
  await mkUser(CREATOR, 'g11m-creator@test.com');
  await mkUser(PLAYER, 'g11m-player@test.com');

  await pool.execute(`INSERT INTO subscription_plans (id, plan_name, price_monthly, is_active, is_internal, sort_order) VALUES (?, 'G11M Plan', 0, 1, 1, 0)`, [PLAN]);
  await pool.execute(`INSERT INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES (?, 'tournament', 'percentage', ?)`, [PLAN, 10]);
  await pool.execute(
    `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, start_date, end_date, subscription_status, auto_renew)
     VALUES (?, ?, 'monthly', '2020-01-01', '2099-01-01', 'active', 0)`, [ORG, PLAN]);
  const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
  await accountingEngineService.provisionOrganisationMarketplaceAccounts(ORG);
}

beforeEach(async () => {
  await cleanupAll();
  await seedBase();
});

afterEach(() => { vi.clearAllMocks(); });

describe('G11.1 — tournament card registration accounting', () => {
  it('A/C — org-owned tournament (1000 @ 10%): exact CourtZon + organisation journals, each balanced', async () => {
    const tid = await createTournament({ entryFee: 1000, rate: 10, org: ORG });
    const regId = await createRegistration(tid);
    const pid = await createPaidCardPayment(regId, 1000);
    await emitPaymentSucceeded(pid, regId, 1000);

    await waitFor(() => courtzonRows(pid), (rows) => rows.length === 3, 'CourtZon posting (3 legs)');
    await waitFor(() => orgRows(pid), (rows) => rows.length === 3, 'org posting (3 legs)');

    const court = await courtzonRows(pid);
    const org = await orgRows(pid);

    // CourtZon book: Dr 1100 1000 · Cr 2202 900 · Cr 4192 100.
    expect(court.every((r) => r.organisation_id === null)).toBe(true);
    expect(amountFor(court, 'debit', '1100')).toBe(1000);
    expect(amountFor(court, 'credit', '2202')).toBe(900);
    expect(amountFor(court, 'credit', '4192')).toBe(100);
    expect(sum(court, 'debit')).toBe(sum(court, 'credit'));

    // Org book: Dr 1161 900 · Dr MKT-COMM-EXP 100 · Cr 4140 1000.
    expect(org.every((r) => Number(r.organisation_id) === ORG)).toBe(true);
    expect(amountFor(org, 'debit', '1161')).toBe(900);
    expect(amountFor(org, 'debit', 'MKT-COMM-EXP')).toBe(100);
    expect(amountFor(org, 'credit', '4140')).toBe(1000);
    expect(sum(org, 'debit')).toBe(sum(org, 'credit'));
  });

  it('B/C — platform tournament (1000 @ 0%): CourtZon owns everything, NO organisation journal', async () => {
    const tid = await createTournament({ entryFee: 1000, rate: 0, org: null });
    const regId = await createRegistration(tid);
    const pid = await createPaidCardPayment(regId, 1000);
    await emitPaymentSucceeded(pid, regId, 1000);

    await waitFor(() => platformRows(pid), (rows) => rows.length === 2, 'platform posting (2 legs)');
    const rows = await platformRows(pid);

    expect(rows.every((r) => r.organisation_id === null)).toBe(true);
    expect(amountFor(rows, 'debit', '1100')).toBe(1000);
    expect(amountFor(rows, 'credit', '4140')).toBe(1000);
    expect(sum(rows, 'debit')).toBe(sum(rows, 'credit'));
    // No org journal for a platform tournament.
    const [orgCount] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='tournament' AND source_id=? AND event_type='tournament_org_registration_receivable'`, [pid]);
    expect(Number((orgCount as any[])[0].c)).toBe(0);
  });

  it('D — NO 2300 Tax Liability leg for any tournament posting (G11.1 tax = 0)', async () => {
    const tid = await createTournament({ entryFee: 1000, rate: 10, org: ORG });
    const regId = await createRegistration(tid);
    const pid = await createPaidCardPayment(regId, 1000);
    await emitPaymentSucceeded(pid, regId, 1000);
    await waitFor(() => countTournamentRows(pid), (c) => c === 6, 'both postings (3 + 3 legs)');

    const [rows] = await pool.execute<RowData>(
      `SELECT c.code FROM ledger_entries le JOIN chart_of_accounts c ON c.id = le.chart_account_id
       WHERE le.source_type='tournament' AND le.source_id = ? AND c.code = '2300'`, [pid]);
    expect((rows as any[]).length).toBe(0);
  });

  it('E — source segregation: source_type always "tournament", source_id = paymentId, never generic card_payment / booking', async () => {
    const tid = await createTournament({ entryFee: 1000, rate: 10, org: ORG });
    const regId = await createRegistration(tid);
    const pid = await createPaidCardPayment(regId, 1000);
    await emitPaymentSucceeded(pid, regId, 1000);
    await waitFor(() => countTournamentRows(pid), (c) => c === 6, 'both postings');

    const [rows] = await pool.execute<RowData>(
      `SELECT le.source_type, le.source_id, le.event_type FROM ledger_entries le WHERE le.source_id = ?`, [pid]);
    const all = rows as any[];
    expect(all.length).toBe(6);
    expect(all.every((r) => r.source_type === 'tournament')).toBe(true);
    expect(all.every((r) => Number(r.source_id) === pid)).toBe(true);
    const eventTypes = new Set(all.map((r) => r.event_type));
    expect(eventTypes.has('card_payment')).toBe(false); // generic fallthrough never used
    expect(eventTypes.has('booking_card_payment')).toBe(false);
    expect(Array.from(eventTypes).sort()).toEqual(['tournament_org_registration_receivable', 'tournament_registration_card_payment']);
  });

  it('F — idempotency: replaying payment:succeeded produces exactly ONE CourtZon and ONE org posting', async () => {
    const tid = await createTournament({ entryFee: 1000, rate: 10, org: ORG });
    const regId = await createRegistration(tid);
    const pid = await createPaidCardPayment(regId, 1000);
    await emitPaymentSucceeded(pid, regId, 1000, 'EGP', 'card', /* repeated = */ true);

    await waitFor(() => countTournamentRows(pid), (c) => c === 6, 'both postings (6 legs)');
    expect((await courtzonRows(pid)).length).toBe(3);
    expect((await orgRows(pid)).length).toBe(3);

    // Replay AGAIN post-posting → still no duplicates.
    await emitPaymentSucceeded(pid, regId, 1000);
    await sleep(800);
    expect((await countTournamentRows(pid))).toBe(6);
    expect((await courtzonRows(pid)).length).toBe(3);
    expect((await orgRows(pid)).length).toBe(3);
  });

  it('G — commission uses the IMMUTABLE tournament.commission_rate snapshot (live subscription rate change has no effect)', async () => {
    const tid = await createTournament({ entryFee: 1000, rate: 10, org: ORG });
    const regId = await createRegistration(tid);
    // Change the LIVE subscription tournament rate AFTER the tournament's
    // commission_rate snapshot was taken.
    await pool.execute(`UPDATE subscription_plan_rates SET amount = 50 WHERE plan_id = ${PLAN} AND applicable_entity = 'tournament'`);
    try {
      const pid = await createPaidCardPayment(regId, 1000);
      await emitPaymentSucceeded(pid, regId, 1000);
      await waitFor(() => courtzonRows(pid), (rows) => rows.length === 3, 'CourtZon posting');
      const court = await courtzonRows(pid);
      // Snapshot 10% → commission 100 (NOT 500 from the changed live rate).
      expect(amountFor(court, 'credit', '4192')).toBe(100);
      expect(amountFor(court, 'credit', '2202')).toBe(900);
    } finally {
      await pool.execute(`UPDATE subscription_plan_rates SET amount = 10 WHERE plan_id = ${PLAN} AND applicable_entity = 'tournament'`);
    }
  });

  it('H — the PAYMENT amount is authoritative and registration_fee is never consulted', async () => {
    // registration_fee deliberately set to a DIFFERENT value — it must be ignored.
    const tid = await createTournament({ entryFee: 1000, rate: 10, org: ORG, regFee: 123 });
    const regId = await createRegistration(tid);
    const pid = await createPaidCardPayment(regId, 1000);
    await emitPaymentSucceeded(pid, regId, 1000);
    await waitFor(() => courtzonRows(pid), (rows) => rows.length === 3, 'CourtZon posting');
    const court = await courtzonRows(pid);
    expect(amountFor(court, 'debit', '1100')).toBe(1000); // entry_fee / payment amount, NOT registration_fee=123
    expect(amountFor(court, 'credit', '2202')).toBe(900);

    // The charged amount is the PAYMENT amount even if it drifts from entry_fee
    // (defensive verification only — never silently re-priced).
    const tid2 = await createTournament({ entryFee: 1000, rate: 10, org: null });
    const regId2 = await createRegistration(tid2);
    const pid2 = await createPaidCardPayment(regId2, 1005);
    await emitPaymentSucceeded(pid2, regId2, 1005);
    await waitFor(() => platformRows(pid2), (rows) => rows.length === 2, 'platform posting');
    const plat = await platformRows(pid2);
    expect(amountFor(plat, 'debit', '1100')).toBe(1005);
    expect(amountFor(plat, 'credit', '4140')).toBe(1005);
  });

  it('I — FREE / zero-fee registration creates NO accounting journal', async () => {
    const tid = await createTournament({ entryFee: 0, rate: 10, org: ORG });
    const regId = await createRegistration(tid);
    const pid = await createPaidCardPayment(regId, 0);
    await emitPaymentSucceeded(pid, regId, 0);
    await sleep(1000);
    expect(await countTournamentRows(pid)).toBe(0);

    // CASH is out of G11.1 scope — no posting either.
    const tid2 = await createTournament({ entryFee: 1000, rate: 10, org: ORG });
    const regId2 = await createRegistration(tid2);
    const pid2 = await createPaidCardPayment(regId2, 1000, 'EGP', 'cash');
    await emitPaymentSucceeded(pid2, regId2, 1000, 'EGP', 'cash');
    await sleep(1000);
    expect(await countTournamentRows(pid2)).toBe(0);
  });
});