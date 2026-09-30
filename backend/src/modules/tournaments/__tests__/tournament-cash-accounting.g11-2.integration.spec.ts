import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3008';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * G11.2 — Tournament CASH registration accounting (org collected the cash).
 *
 * Approved model (entry_fee 1000, commission_rate 10 → commission 100):
 *   CourtZon book (org NULL):
 *     Dr 2202 Merchant Payable 100 · Cr 4192 Tournament Commission 100.
 *   Organisation book (org-scoped):
 *     Dr ORG-CASH 1000 · Dr MKT-COMM-EXP 100 · Cr 4140 1000 ·
 *     Cr MKT-CZ-PAY (CourtZon Payable) 100.
 *   Org-less CASH (LEGACY pre-Phase-3 row, organisation_id NULL) →
 *   FAIL-CLOSED, no posting. Since G11 Phase 3 creation is organisation-only,
 *   an org-less row can only predate it; the guard is load-bearing for it.
 *
 * Rules under test:
 *   - tax = 0 (no 2300) and account 1100 Payment Clearing is NEVER used for
 *     organisation-collected cash.
 *   - commission = round2(gross × tournament.commission_rate / 100) from the
 *     IMMUTABLE snapshot (never the live subscription rate).
 *   - payment amount is authoritative; registration_fee never used.
 *   - source_type='tournament', source_id=paymentId, dedicated event types.
 *   - each posting independently idempotent via hasPosting + uk_dedup.
 *   - FREE (amount <= 0) posts nothing.
 *   - G11.1 CARD regression unchanged (still 3 CourtZon + 3 org legs).
 */

const ORG = 10060300;
const PLAYER = 10060311;
const CREATOR = 10060310;
const PLAN = 10060390;
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

async function courtzonCashRows(paymentId: number): Promise<any[]> {
  const [rows] = await pool.execute<RowData>(
    `SELECT le.side, le.amount, le.event_type, le.source_type, le.source_id,
            le.organisation_id, c.code AS account_code
     FROM ledger_entries le JOIN chart_of_accounts c ON c.id = le.chart_account_id
     WHERE le.source_type = 'tournament' AND le.source_id = ? AND le.event_type = 'tournament_cash_commission_receivable'
     ORDER BY le.id`,
    [paymentId],
  );
  return rows as any[];
}

async function orgCashRows(paymentId: number): Promise<any[]> {
  const [rows] = await pool.execute<RowData>(
    `SELECT le.side, le.amount, le.event_type, le.source_type, le.source_id,
            le.organisation_id, c.code AS account_code
     FROM ledger_entries le JOIN chart_of_accounts c ON c.id = le.chart_account_id
     WHERE le.source_type = 'tournament' AND le.source_id = ? AND le.event_type = 'tournament_org_cash_payment'
     ORDER BY le.id`,
    [paymentId],
  );
  return rows as any[];
}

/** Card rows (G11.1 regression sanity) — CourtZon + org. */
async function courtzonCardRows(paymentId: number): Promise<any[]> {
  const [rows] = await pool.execute<RowData>(
    `SELECT le.side, le.amount, c.code AS account_code
     FROM ledger_entries le JOIN chart_of_accounts c ON c.id = le.chart_account_id
     WHERE le.source_type = 'tournament' AND le.source_id = ? AND le.event_type = 'tournament_registration_card_payment'
     ORDER BY le.id`,
    [paymentId],
  );
  return rows as any[];
}

async function orgCardRows(paymentId: number): Promise<any[]> {
  const [rows] = await pool.execute<RowData>(
    `SELECT le.side, le.amount, c.code AS account_code
     FROM ledger_entries le JOIN chart_of_accounts c ON c.id = le.chart_account_id
     WHERE le.source_type = 'tournament' AND le.source_id = ? AND le.event_type = 'tournament_org_registration_receivable'
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

async function createTournament(opts: { entryFee: number; rate: number; org: number | null; regFee?: number; currency?: string }) {
  // G11 Phase 3 — `tournament_type` is narrowed to 'community' only (the
  // platform never owns a tournament). `org` may still be null ONLY to simulate
  // a LEGACY pre-Phase-3 row exercising the fail-closed cash guard.
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournaments
       (public_id, creator_id, organisation_id, bracket_type_id, name,
        max_participants, min_participants, entry_fee, registration_fee,
        currency_code, price_type, tournament_type, commission_rate, status,
        start_date)
     VALUES (UUID(), ?, ?, ?, ?, 16, 2, ?, ?, ?, 'FIXED', 'community', ?, 'registration_open', '2026-12-01')`,
    [CREATOR, opts.org, BRACKET, `G11M2 ${Date.now()}`, opts.entryFee, opts.regFee ?? 0,
      opts.currency ?? 'EGP', opts.rate],
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

async function createPaidPayment(regId: number, amount: number, method: 'card' | 'cash', currency = 'EGP'): Promise<number> {
  const gatewayRef = `g11-2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

async function emitPaymentSucceeded(paymentId: number, regId: number, amount: number, method: 'card' | 'cash' = 'cash', currency = 'EGP', repeated = false) {
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
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ${ORG} OR account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id = ${ORG})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE id IN (${regIds.length ? regIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id = ${ORG})`);
  // Re-clean general_ledger immediately before the chart accounts so a prize/card
  // accounting posting that landed asynchronously during this cleanup is removed
  // too — otherwise `chart_of_accounts` deletion can trip the fk_gl_account FK
  // (async event-bus postings are awaited by waitFor on the CURRENT test but can
  // be emitted by a PREVIOUS test's event before the wait begins).
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ${ORG} OR account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id = ${ORG})`);
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

async function seedBase() {
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG}, UUID(), ?, 1, 'G11M2 Org', 'g11m2-org', 1)`, [otId]);

  const mkUser = async (id: number, email: string) => {
    await pool.execute(
      `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
       VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'G11M2 User', 'male', 'active')`,
      [id, `015${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, email],
    );
  };
  await mkUser(CREATOR, 'g11m2-creator@test.com');
  await mkUser(PLAYER, 'g11m2-player@test.com');

  await pool.execute(`INSERT INTO subscription_plans (id, plan_name, price_monthly, is_active, is_internal, sort_order) VALUES (?, 'G11M2 Plan', 0, 1, 1, 0)`, [PLAN]);
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

describe('G11.2 — tournament CASH registration accounting', () => {
  it('A/C — org-owned CASH tournament (1000 @ 10%): exact BALANCED CourtZon journal (Dr 2202 100 / Cr 4192 100)', async () => {
    const tid = await createTournament({ entryFee: 1000, rate: 10, org: ORG });
    const regId = await createRegistration(tid);
    const pid = await createPaidPayment(regId, 1000, 'cash');
    await emitPaymentSucceeded(pid, regId, 1000, 'cash');

    await waitFor(() => courtzonCashRows(pid), (rows) => rows.length === 2, 'CourtZon cash posting (2 legs)');
    const court = await courtzonCashRows(pid);

    expect(court.every((r) => r.organisation_id === null)).toBe(true);
    expect(amountFor(court, 'debit', '2202')).toBe(100);
    expect(amountFor(court, 'credit', '4192')).toBe(100);
    expect(sum(court, 'debit')).toBe(sum(court, 'credit'));
    // Organisation-collected cash NEVER debits the 1100 Payment Clearing asset.
    expect(court.some((r) => r.account_code === '1100')).toBe(false);
    expect(court.some((r) => r.account_code === '2300')).toBe(false); // no tax
  });

  it('B/C — org-owned CASH tournament (1000 @ 10%): exact BALANCED organisation journal', async () => {
    const tid = await createTournament({ entryFee: 1000, rate: 10, org: ORG });
    const regId = await createRegistration(tid);
    const pid = await createPaidPayment(regId, 1000, 'cash');
    await emitPaymentSucceeded(pid, regId, 1000, 'cash');

    await waitFor(() => orgCashRows(pid), (rows) => rows.length === 4, 'org cash posting (4 legs)');
    const org = await orgCashRows(pid);

    expect(org.every((r) => Number(r.organisation_id) === ORG)).toBe(true);
    expect(amountFor(org, 'debit', 'ORG-CASH')).toBe(1000);
    expect(amountFor(org, 'debit', 'MKT-COMM-EXP')).toBe(100);
    expect(amountFor(org, 'credit', '4140')).toBe(1000);
    expect(amountFor(org, 'credit', 'MKT-CZ-PAY')).toBe(100);
    expect(sum(org, 'debit')).toBe(sum(org, 'credit'));
  });

  it('D — commission comes from the IMMUTABLE tournament.commission_rate snapshot (live subscription change has no effect)', async () => {
    const tid = await createTournament({ entryFee: 1000, rate: 10, org: ORG });
    const regId = await createRegistration(tid);
    // Change the LIVE subscription tournament rate AFTER the snapshot.
    await pool.execute(`UPDATE subscription_plan_rates SET amount = 50 WHERE plan_id = ${PLAN} AND applicable_entity = 'tournament'`);
    try {
      const pid = await createPaidPayment(regId, 1000, 'cash');
      await emitPaymentSucceeded(pid, regId, 1000, 'cash');
      await waitFor(() => courtzonCashRows(pid), (rows) => rows.length === 2, 'CourtZon cash posting');
      const court = await courtzonCashRows(pid);
      // Snapshot 10% → commission 100 (NOT 500 from the changed live rate).
      expect(amountFor(court, 'credit', '4192')).toBe(100);
      expect(amountFor(court, 'debit', '2202')).toBe(100);
      const org = await orgCashRows(pid);
      expect(amountFor(org, 'credit', 'MKT-CZ-PAY')).toBe(100);
    } finally {
      await pool.execute(`UPDATE subscription_plan_rates SET amount = 10 WHERE plan_id = ${PLAN} AND applicable_entity = 'tournament'`);
    }
  });

  it('E — the PAYMENT amount is authoritative for cash', async () => {
    const tid = await createTournament({ entryFee: 1000, rate: 10, org: ORG });
    const regId = await createRegistration(tid);
    const pid = await createPaidPayment(regId, 1050, 'cash'); // payment 1050 vs entry_fee 1000
    await emitPaymentSucceeded(pid, regId, 1050, 'cash');
    await waitFor(() => orgCashRows(pid), (rows) => rows.length === 4, 'org cash posting');
    const org = await orgCashRows(pid);
    // commission = round2(1050 × 10%) = 105
    expect(amountFor(org, 'debit', 'ORG-CASH')).toBe(1050);
    expect(amountFor(org, 'debit', 'MKT-COMM-EXP')).toBe(105);
    expect(amountFor(org, 'credit', '4140')).toBe(1050);
    expect(amountFor(org, 'credit', 'MKT-CZ-PAY')).toBe(105);
  });

  it('F — registration_fee is NEVER consulted', async () => {
    const tid = await createTournament({ entryFee: 1000, rate: 10, org: ORG, regFee: 123 });
    const regId = await createRegistration(tid);
    const pid = await createPaidPayment(regId, 1000, 'cash');
    await emitPaymentSucceeded(pid, regId, 1000, 'cash');
    await waitFor(() => orgCashRows(pid), (rows) => rows.length === 4, 'org cash posting');
    const org = await orgCashRows(pid);
    expect(amountFor(org, 'debit', 'ORG-CASH')).toBe(1000); // entry/payment — never registration_fee 123
    expect(amountFor(org, 'credit', '4140')).toBe(1000);
  });

  it('G/E — source segregation: source_type always "tournament", source_id = paymentId, dedicated cash event types', async () => {
    const tid = await createTournament({ entryFee: 1000, rate: 10, org: ORG });
    const regId = await createRegistration(tid);
    const pid = await createPaidPayment(regId, 1000, 'cash');
    await emitPaymentSucceeded(pid, regId, 1000, 'cash');
    await waitFor(() => countTournamentRows(pid), (c) => c === 6, 'both cash postings (2 + 4 legs)');

    const [rows] = await pool.execute<RowData>(
      `SELECT le.source_type, le.source_id, le.event_type FROM ledger_entries le WHERE le.source_id = ?`, [pid]);
    const all = rows as any[];
    expect(all.length).toBe(6);
    expect(all.every((r) => r.source_type === 'tournament')).toBe(true);
    expect(all.every((r) => Number(r.source_id) === pid)).toBe(true);
    const eventTypes = new Set(all.map((r) => r.event_type));
    expect(Array.from(eventTypes).sort()).toEqual(['tournament_cash_commission_receivable', 'tournament_org_cash_payment']);
    expect(eventTypes.has('card_payment')).toBe(false);
    expect(eventTypes.has('booking_cod_payment')).toBe(false);
  });

  it('H — idempotency: replaying a cash payment:succeeded produces exactly ONE CourtZon and ONE org cash posting', async () => {
    const tid = await createTournament({ entryFee: 1000, rate: 10, org: ORG });
    const regId = await createRegistration(tid);
    const pid = await createPaidPayment(regId, 1000, 'cash');
    await emitPaymentSucceeded(pid, regId, 1000, 'cash', 'EGP', /* repeated = */ true);

    await waitFor(() => countTournamentRows(pid), (c) => c === 6, 'both cash postings (6 legs)');
    expect((await courtzonCashRows(pid)).length).toBe(2);
    expect((await orgCashRows(pid)).length).toBe(4);

    // Replay AGAIN post-posting → still no duplicates.
    await emitPaymentSucceeded(pid, regId, 1000, 'cash');
    await sleep(800);
    expect(await countTournamentRows(pid)).toBe(6);
    expect((await courtzonCashRows(pid)).length).toBe(2);
    expect((await orgCashRows(pid)).length).toBe(4);
  });

  it('I — PLATFORM/community CASH tournament creates NO accounting (fail-closed guard)', async () => {
    const tid = await createTournament({ entryFee: 1000, rate: 0, org: null });
    const regId = await createRegistration(tid);
    const pid = await createPaidPayment(regId, 1000, 'cash');
    await emitPaymentSucceeded(pid, regId, 1000, 'cash');
    await sleep(1200);
    expect(await countTournamentRows(pid)).toBe(0);
  });

  it('J — FREE (payment amount <= 0) CASH creates NO accounting', async () => {
    const tid = await createTournament({ entryFee: 0, rate: 10, org: ORG });
    const regId = await createRegistration(tid);
    const pid = await createPaidPayment(regId, 0, 'cash');
    await emitPaymentSucceeded(pid, regId, 0, 'cash');
    await sleep(1200);
    expect(await countTournamentRows(pid)).toBe(0);
  });

  it('K — G11.1 CARD regression: org card payment still posts the exact 3 CourtZon + 3 org legs', async () => {
    const tid = await createTournament({ entryFee: 1000, rate: 10, org: ORG });
    const regId = await createRegistration(tid);
    const pid = await createPaidPayment(regId, 1000, 'card');
    await emitPaymentSucceeded(pid, regId, 1000, 'card');
    await waitFor(() => courtzonCardRows(pid), (rows) => rows.length === 3, 'card CourtZon posting');
    await waitFor(() => orgCardRows(pid), (rows) => rows.length === 3, 'card org posting');
    const court = await courtzonCardRows(pid);
    const org = await orgCardRows(pid);
    expect(amountFor(court, 'debit', '1100')).toBe(1000);
    expect(amountFor(court, 'credit', '2202')).toBe(900);
    expect(amountFor(court, 'credit', '4192')).toBe(100);
    expect(amountFor(org, 'credit', '4140')).toBe(1000);
  });
});