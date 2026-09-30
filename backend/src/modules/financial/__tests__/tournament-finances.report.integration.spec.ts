import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3012';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * G11 Phase 4 — LEDGER-AUTHORITATIVE Tournament Finances / P&L (read-only).
 *
 * The report is derived from ACTUAL posted accounting entries only. Test
 * fixtures create the real posted ledger by emitting the canonical events
 * (payment:succeeded for card/cash registration, prize binding for awards), so
 * every number below reconciles to ledger_entries / general_ledger. Sponsors
 * are record-only (never recognized). IN-KIND = 0. No mutations.
 */

const ORG_A = 2490101;
const ORG_B = 2490102;
const ADMIN = 2490201;
const WINNER = 2490202;
const WINNER2 = 2490203;
const PLAN = 2490090;

let pool: mysql.Pool;
const tournamentIds: number[] = [];
let svc: any;
const regIds: number[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const num = async (sql: string, params: any[] = []) => {
  const [rows] = await pool.execute<RowData>(sql, params);
  return Number((rows as any[])[0]?.v ?? 0);
};

async function waitFor<T>(probe: () => Promise<T>, isReady: (v: T) => boolean, what: string, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let v = await probe();
  while (!isReady(v)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for: ${what} — last=${JSON.stringify(v)}`);
    await sleep(120);
    v = await probe();
  }
  return v;
}

async function mkUser(id: number, email: string) {
  await pool.execute(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'FIN', 'male', 'active')`,
    [id, `015${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, email],
  );
  await pool.execute(`INSERT IGNORE INTO user_wallets (user_id, balance, reserved_balance, currency_code, is_locked, version) VALUES (?, 0, 0, 'EGP', 0, 1)`, [id]);
}

async function seedOrg(orgId: number, slug: string) {
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  await pool.execute(`INSERT IGNORE INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${orgId}, UUID(), ?, 1, 'FIN Org', '${slug}', 1)`, [otId]);
  await pool.execute(`INSERT IGNORE INTO subscription_plans (id, plan_name, price_monthly, is_active, is_internal, sort_order) VALUES (?, 'FIN Plan', 0, 1, 1, 0)`, [PLAN]);
  await pool.execute(`INSERT IGNORE INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES (?, 'tournament', 'percentage', ?)`, [PLAN, 10]);
  await pool.execute(`INSERT IGNORE INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, start_date, end_date, subscription_status, auto_renew) VALUES (?, ?, 'monthly', '2020-01-01', '2099-01-01', 'active', 0)`, [orgId, PLAN]);
  const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
  await accountingEngineService.provisionOrganisationMarketplaceAccounts(orgId);
}

async function createOrgTournament(orgId: number, base: Record<string, unknown> = {}): Promise<number> {
  const body: Record<string, unknown> = {
    organisation_id: orgId,
    bracket_type_id: 1,
    name: `FIN Cup ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    max_participants: 16,
    min_participants: 2,
    entry_fee: 0,
    price_type: 'FREE',
    currency_code: 'EGP',
    start_date: '2026-12-01',
    ...base,
  };
  const t = await svc.create(body, ADMIN);
  tournamentIds.push(t.id);
  return t.id;
}

async function addPaidPayment(regId: number, amount: number, userId: number = WINNER, currency = 'EGP', method = 'card') {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO payment_transactions
       (user_id, reference_type, reference_id, payment_method, gateway_reference, amount, currency, payment_status, paid_at, trace_id)
     VALUES (?, 'tournament', ?, ?, CONCAT('fin-', UUID()), ?, ?, 'paid', NOW(), UUID())`,
    [userId, regId, method, amount, currency],
  );
  return Number((res as any).insertId);
}

/** Emit the canonical card/cash registration-paid event so the REAL ledger posts. */
async function emitPaid(paymentId: number, regId: number, amount: number, method: 'card' | 'cash' = 'card', currency = 'EGP', userId: number = WINNER) {
  const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
  await eventBusV2.emit('payment:succeeded', {
    paymentId,
    referenceType: 'tournament',
    referenceId: regId,
    amount,
    metadata: { paymentMethod: method, currency, userId },
  } as any);
}

async function paidAndPosted(regId: number, amount: number, method: 'card' | 'cash' = 'card', userId: number = WINNER): Promise<number> {
  const paymentId = await addPaidPayment(regId, amount, userId, 'EGP', method);
  await emitPaid(paymentId, regId, amount, method, 'EGP', userId);
  // Org book leg posted for this payment (CARD: 3 legs incl. commission; CASH: 4).
  const orgEvent = method === 'cash' ? 'tournament_org_cash_payment' : 'tournament_org_registration_receivable';
  await waitFor(() => num(`SELECT COUNT(*) AS v FROM ledger_entries WHERE source_type='tournament' AND source_id=? AND event_type=?`, [paymentId, orgEvent]), (n) => n > 0, `${method} org book posting`);
  return paymentId;
}

async function createOrgTournamentWithFixture(orgId: number, entryFee = 0): Promise<number> {
  const tid = await createOrgTournament(orgId, { entry_fee: entryFee, price_type: entryFee > 0 ? 'FIXED' : 'FREE' });
  return tid;
}

/** Walk the canonical state machine to 'completed' so the prize binder binds. */
async function completeTournament(tid: number) {
  await svc.updateStatus(tid, 'published');
  await svc.updateStatus(tid, 'registration_open');
  await svc.updateStatus(tid, 'registration_closed');
  await svc.updateStatus(tid, 'running');
  await svc.complete(tid);
}

async function bindCashPrize(tid: number, regId: number, amount = 500) {
  await pool.execute(
    `INSERT INTO tournament_prizes (tournament_id, placement, prize_type, description, amount, currency_code, display_order) VALUES (?, 1, 'cash', 'Prize', ?, 'EGP', 0)`, [tid, amount],
  );
  await pool.execute(
    `INSERT INTO tournament_standings (tournament_id, registration_id, rank_position) VALUES (?, ?, 1)`, [tid, regId],
  );
  const { tournamentPrizeAwardService } = await import('../../tournaments/application/tournament-prize-award.service.js');
  const awards = await tournamentPrizeAwardService.bindAwardsForTournament(tid);
  await waitFor(() => num(`SELECT COUNT(*) AS v FROM ledger_entries WHERE source_type='tournament' AND source_id IN (SELECT id FROM tournament_prize_awards WHERE tournament_id=?) AND event_type='tournament_org_prize_award_book'`, [tid]), (n) => n >= 2, 'org prize award book posting');
  return awards;
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  const { registerAccountingEventListeners } = await import('../../financial/application/accounting-event.listener.js');
  registerAccountingEventListeners();
  const { registerTournamentPrizeListeners } = await import('../../tournaments/application/tournament-prize-award.listener.js');
  registerTournamentPrizeListeners();
  const m = await import('../../tournaments/application/tournament.service.js');
  svc = m.tournamentService;
  await mkUser(ADMIN, 'fin-admin@test.com');
  await mkUser(WINNER, 'fin-winner@test.com');
  await mkUser(WINNER2, 'fin-winner2@test.com');
  await seedOrg(ORG_A, 'fin-org-a');
  await seedOrg(ORG_B, 'fin-org-b');
}, 120000);

async function cleanup() {
  if (!pool) return;
  await pool.execute(`DELETE FROM payment_transactions WHERE reference_type='tournament' AND reference_id IN (${regIds.length ? regIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM tournament_prize_awards WHERE tournament_id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM financial_entitlements WHERE organisation_id IN (${ORG_A}, ${ORG_B}) OR source_type='tournament'`);
  await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id IN (${ORG_A}, ${ORG_B}) OR source_type='tournament'`);
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (${ORG_A}, ${ORG_B}) OR account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id IN (${ORG_A}, ${ORG_B}))`);
  await pool.execute(`DELETE FROM tournament_sponsors WHERE tournament_id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM tournament_prizes WHERE tournament_id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM tournament_standings WHERE tournament_id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE id IN (${regIds.length ? regIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM user_wallets WHERE user_id IN (${ADMIN}, ${WINNER}, ${WINNER2})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${ADMIN}, ${WINNER}, ${WINNER2})`);
  await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id IN (${ORG_A}, ${ORG_B}))`);
  await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id IN (${ORG_A}, ${ORG_B})`);
  await pool.execute(`DELETE FROM organisation_subscriptions WHERE organisation_id IN (${ORG_A}, ${ORG_B})`);
  await pool.execute(`DELETE FROM subscription_plan_rates WHERE plan_id = ${PLAN}`);
  await pool.execute(`DELETE FROM subscription_plans WHERE id = ${PLAN}`);
  await pool.execute(`DELETE FROM organisations WHERE id IN (${ORG_A}, ${ORG_B})`);
  tournamentIds.length = 0; regIds.length = 0;
}

afterAll(async () => {
  await cleanup();
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 120000);

beforeEach(async () => {
  await cleanup();
  await mkUser(ADMIN, 'fin-admin@test.com');
  await mkUser(WINNER, 'fin-winner@test.com');
  await mkUser(WINNER2, 'fin-winner2@test.com');
  await seedOrg(ORG_A, 'fin-org-a');
  await seedOrg(ORG_B, 'fin-org-b');
});

afterEach(() => vi.clearAllMocks());

describe('G11 Phase 4 — ledger-authoritative tournament P&L (read-only)', () => {
  it('reconciles registration revenue + commission expense to the POSTED ledger (no source-row inference)', async () => {
    const tid = await createOrgTournamentWithFixture(ORG_A, 300);
    const [reg] = await pool.execute<RowData>(
      `INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status) VALUES (?, ?, 'paid', 'registered')`, [tid, WINNER],
    );
    const regId = Number((reg as any).insertId);
    regIds.push(regId);
    await paidAndPosted(regId, 300, 'card');

    // Sponsors are record-only — cash sponsor config contributes 0 (no ledger).
    await svc.update(tid, {
      sponsors: [
        { name: 'Cash Co', support_type: 'cash', amount: 500 },
        { name: 'Gift Co', support_type: 'inkind', description: 'Gifts' },
      ],
    });

    const { tournamentFinancesService } = await import('../../financial/application/tournament-finances.service.js');
    const report = await tournamentFinancesService.forOrganisation(ORG_A, tid);
    // 300 gross, 10% commission = 30: revenue 4140 Cr 300, expense MKT-COMM-EXP Dr 30.
    expect(report.revenue.registration).toBe(300);
    expect(report.revenue.sponsorCash).toBe(0);           // sponsors never post
    expect(report.revenue.total).toBe(300);
    expect(report.expenses.commissionExpense).toBe(30);
    expect(report.expenses.total).toBe(30);
    expect(report.net).toBe(270);
    expect(report.platform.commissionRevenue).toBe(30);   // CourtZon 4192 Cr 30
    expect(report.platform.merchantPayable).toBe(270);    // Cr 2202 270 (no prize yet)
    expect(report.ledger.authoritative).toBe(true);
    expect(report.ledger.postings).toBeGreaterThanOrEqual(6); // 3 CourtZon + 3 org
    // Facility/counts informational only.
    expect(report.counts.paidRegistrations).toBe(1);
    expect(report.counts.cashSponsors).toBe(1);
    expect(report.counts.inKindSponsors).toBe(1);
  });

  it('recognizes prize EXPENSE only when posted (org prize award book Dr 4140) and tracks 2100 liability', async () => {
    const tid = await createOrgTournamentWithFixture(ORG_A, 0);
    await completeTournament(tid);
    const [reg] = await pool.execute<RowData>(
      `INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status) VALUES (?, ?, 'paid', 'registered')`, [tid, WINNER],
    );
    const regId = Number((reg as any).insertId);
    regIds.push(regId);

    // Bind a 500 prize through the REAL pipeline → org prize award book posts.
    const awards = await bindCashPrize(tid, regId, 500);
    expect(awards).toHaveLength(1);

    const { tournamentFinancesService } = await import('../../financial/application/tournament-finances.service.js');
    const report = await tournamentFinancesService.forOrganisation(ORG_A, tid);
    expect(report.expenses.cashPrizes).toBe(500);
    expect(report.net).toBe(-500);
    // CourtZon book: org-funded prize Dr 2202 500 · Cr 2100 500.
    expect(report.platform.prizeLiability).toBe(500);
    expect(report.platform.merchantPayable).toBe(-500);
    expect(report.counts.cashPrizes).toBe(1);
  });

  it('zero-ledger clean state: config without postings is recognized as 0', async () => {
    // A FREE tournament with an in-kind prize + cash sponsor configured but NO
    // posted accounting → the P&L must be financially 0 (never inferred).
    const tid = await createOrgTournament(ORG_A, {
      prizes: [{ placement: 1, prize_type: 'trophy', description: 'Cup' }],
      sponsors: [{ name: 'Cash Co', support_type: 'cash', amount: 500 }],
    });
    const { tournamentFinancesService } = await import('../../financial/application/tournament-finances.service.js');
    const report = await tournamentFinancesService.forOrganisation(ORG_A, tid);
    expect(report.revenue.registration).toBe(0);
    expect(report.revenue.sponsorCash).toBe(0);
    expect(report.expenses.cashPrizes).toBe(0);
    expect(report.expenses.commissionExpense).toBe(0);
    expect(report.net).toBe(0);
    expect(report.ledger.postings).toBe(0);
    expect(report.counts.inKindPrizes).toBe(1);
    expect(report.counts.cashSponsors).toBe(1);
  });

  it('multiple registrations sum once — no double counting (payments + postings counted once)', async () => {
    const tid = await createOrgTournamentWithFixture(ORG_A, 300);
    const [reg1] = await pool.execute<RowData>(
      `INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status) VALUES (?, ?, 'paid', 'registered')`, [tid, WINNER],
    );
    regIds.push(Number((reg1 as any).insertId));
    await paidAndPosted(Number((reg1 as any).insertId), 150, 'card');
    const [reg2] = await pool.execute<RowData>(
      `INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status) VALUES (?, ?, 'paid', 'registered')`, [tid, WINNER2],
    );
    regIds.push(Number((reg2 as any).insertId));
    await paidAndPosted(Number((reg2 as any).insertId), 150, 'card', WINNER2);
    const { tournamentFinancesService } = await import('../../financial/application/tournament-finances.service.js');
    const report = await tournamentFinancesService.forOrganisation(ORG_A, tid);
    // 2 × 150 @ 10% = 30 commission: revenue 300, expenses 30, net 270. NOT 600.
    expect(report.revenue.registration).toBe(300);
    expect(report.expenses.commissionExpense).toBe(30);
    expect(report.counts.paidRegistrations).toBe(2);
  });

  it('CASH collection reconciles through the org cash book (4140 gross − commission expense)', async () => {
    const tid = await createOrgTournamentWithFixture(ORG_A, 300);
    const [reg] = await pool.execute<RowData>(
      `INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status) VALUES (?, ?, 'paid', 'registered')`, [tid, WINNER],
    );
    const regId = Number((reg as any).insertId);
    regIds.push(regId);
    await paidAndPosted(regId, 300, 'cash');
    const { tournamentFinancesService } = await import('../../financial/application/tournament-finances.service.js');
    const report = await tournamentFinancesService.forOrganisation(ORG_A, tid);
    expect(report.revenue.registration).toBe(300);
    expect(report.expenses.commissionExpense).toBe(30);
    expect(report.net).toBe(270);
    expect(report.platform.commissionRevenue).toBe(30);
  });

  it('organization isolation: another org cannot read ORG_A finances', async () => {
    const tidA = await createOrgTournament(ORG_A);
    const { tournamentFinancesService } = await import('../../financial/application/tournament-finances.service.js');
    await expect(tournamentFinancesService.forOrganisation(ORG_B, tidA)).rejects.toThrow();
  });

  it('org-less / non-existent tournaments are rejected in org-facing calls', async () => {
    const { tournamentFinancesService } = await import('../../financial/application/tournament-finances.service.js');
    await expect(tournamentFinancesService.forOrganisation(ORG_A, 999999999)).rejects.toThrow();
  });

  it('the report is READ-ONLY — no ledger/GL/wallet/settlement/entitlement mutation', async () => {
    const l0 = await num(`SELECT COUNT(*) AS v FROM ledger_entries`);
    const gl0 = await num(`SELECT COUNT(*) AS v FROM general_ledger`);
    const wl0 = await num(`SELECT COUNT(*) AS v FROM wallet_transactions`);
    const st0 = await num(`SELECT COUNT(*) AS v FROM settlements`);
    const fe0 = await num(`SELECT COUNT(*) AS v FROM financial_entitlements`);
    const tid = await createOrgTournament(ORG_A, {
      sponsors: [{ name: 'Cash Co', support_type: 'cash', amount: 500 }],
    });
    const { tournamentFinancesService } = await import('../../financial/application/tournament-finances.service.js');
    await tournamentFinancesService.forOrganisation(ORG_A, tid);
    expect(await num(`SELECT COUNT(*) AS v FROM ledger_entries`)).toBe(l0);
    expect(await num(`SELECT COUNT(*) AS v FROM general_ledger`)).toBe(gl0);
    expect(await num(`SELECT COUNT(*) AS v FROM wallet_transactions`)).toBe(wl0);
    expect(await num(`SELECT COUNT(*) AS v FROM settlements`)).toBe(st0);
    expect(await num(`SELECT COUNT(*) AS v FROM financial_entitlements`)).toBe(fe0);
  });

  it('organisation finance aggregate returns INDEPENDENT per-currency buckets (no mixed sums)', async () => {
    const tidA = await createOrgTournamentWithFixture(ORG_A, 100);
    const [reg] = await pool.execute<RowData>(
      `INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status) VALUES (?, ?, 'paid', 'registered')`, [tidA, WINNER],
    );
    const regId = Number((reg as any).insertId);
    regIds.push(regId);
    await paidAndPosted(regId, 100, 'card');

    // Force a second tournament's currency to AED (fixture-level; the service
    // reads the persisted tournament currency and must NOT mix it with EGP).
    const tidB = await createOrgTournamentWithFixture(ORG_A, 100);
    await pool.execute(`UPDATE tournaments SET currency_code = 'AED' WHERE id = ?`, [tidB]);

    const { tournamentFinancesService } = await import('../../financial/application/tournament-finances.service.js');
    const agg = await tournamentFinancesService.aggregateForOrganisation(ORG_A);
    expect(agg.organisationId).toBe(ORG_A);
    expect(agg.totalTournaments).toBe(2);
    expect(Object.keys(agg.currencies).sort()).toEqual(['AED', 'EGP']);
    // EGP bucket carries the EGP-registered revenue (100 gross − 10 commission = net 90).
    expect(agg.currencies.EGP.revenue).toBe(100);
    expect(agg.currencies.EGP.net).toBe(90);
    expect(agg.currencies.AED.revenue).toBe(0);   // AED tournament never posted → 0, still its own bucket.
  });

  it('reports tournamentOverview is ledger-backed and reconciles (no synthetic commission)', async () => {
    const tid = await createOrgTournamentWithFixture(ORG_A, 300);
    const [reg] = await pool.execute<RowData>(
      `INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status) VALUES (?, ?, 'paid', 'registered')`, [tid, WINNER],
    );
    const regId = Number((reg as any).insertId);
    regIds.push(regId);
    await paidAndPosted(regId, 300, 'card');

    const { reportsService } = await import('../../reports/application/reports.service.js');
    const overview = await reportsService.tournamentOverview({});
    expect(overview).not.toHaveProperty('total_entry_fees');
    expect(overview).not.toHaveProperty('estimated_commission');
    expect(overview.currencies).toBeTruthy();
    // Our posted org book revenue appears in the EGP bucket and reconciles.
    const { tournamentFinancesService } = await import('../../financial/application/tournament-finances.service.js');
    const report = await tournamentFinancesService.forOrganisation(ORG_A, tid);
    expect((overview as any).currencies.EGP.revenue).toBeGreaterThanOrEqual(report.revenue.total);
  });
});