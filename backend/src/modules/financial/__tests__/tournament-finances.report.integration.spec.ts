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
 * Phase 2 — READ-ONLY Tournament Finances / P&L.
 * Authoritative sources: paid payment_transactions (registration revenue),
 * tournament_sponsors cash (record-only), tournament_prize_awards credited
 * amounts (cash prize expense). IN-KIND = 0. No mutations. Org-scoped.
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

const num = async (sql: string, params: any[] = []) => {
  const [rows] = await pool.execute<RowData>(sql, params);
  return Number((rows as any[])[0]?.v ?? 0);
};

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
  await pool.execute(
    `INSERT INTO payment_transactions
       (user_id, reference_type, reference_id, payment_method, gateway_reference, amount, currency, payment_status, paid_at, trace_id)
     VALUES (?, 'tournament', ?, ?, CONCAT('fin-', UUID()), ?, ?, 'paid', NOW(), UUID())`,
    [userId, regId, method, amount, currency],
  );
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

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  const { registerAccountingEventListeners } = await import('../../financial/application/accounting-event.listener.js');
  registerAccountingEventListeners();
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

describe('Phase 2 — tournament finances (read-only)', () => {
  it('computes registration revenue + sponsor cash − cash prize expense = net', async () => {
    const tid = await createOrgTournamentWithFixture(ORG_A);
    // The prize binder only binds completed tournaments — finish it first.
    await completeTournament(tid);
    const [reg] = await pool.execute<RowData>(
      `INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status) VALUES (?, ?, 'paid', 'registered')`, [tid, WINNER],
    );
    const regId = Number((reg as any).insertId);
    regIds.push(regId);
    await addPaidPayment(regId, 300);

    // Sponsor cash 500 + in-kind sponsor (0)
    await svc.update(tid, {
      sponsors: [
        { name: 'Cash Co', support_type: 'cash', amount: 500 },
        { name: 'Gift Co', support_type: 'inkind', description: 'Gifts' },
      ],
    });

    // Cash prize 500 (org-funded) via the real prize pipeline
    await pool.execute(
      `INSERT INTO tournament_prizes (tournament_id, placement, prize_type, description, amount, currency_code, display_order) VALUES (?, 1, 'cash', 'Prize', 500, 'EGP', 0)`, [tid],
    );
    await pool.execute(
      `INSERT INTO tournament_standings (tournament_id, registration_id, rank_position) VALUES (?, ?, 1)`, [tid, regId],
    );
    const { tournamentPrizeAwardService } = await import('../../tournaments/application/tournament-prize-award.service.js');
    const awards = await tournamentPrizeAwardService.bindAwardsForTournament(tid);
    expect(awards).toHaveLength(1);

    const { tournamentFinancesService } = await import('../../financial/application/tournament-finances.service.js');
    const report = await tournamentFinancesService.forOrganisation(ORG_A, tid);
    expect(report.revenue.registration).toBe(300);
    expect(report.revenue.sponsorCash).toBe(500);
    expect(report.revenue.total).toBe(800);
    expect(report.expenses.cashPrizes).toBe(500);
    expect(report.expenses.total).toBe(500);
    expect(report.net).toBe(300);
    expect(report.counts.inKindSponsors).toBe(1);
    expect(report.excluded.courtRental).toBe(true);
  });

  it('IN-KIND sponsors/prizes contribute zero monetary value', async () => {
    const tid = await createOrgTournament(ORG_A, {
      prizes: [{ placement: 1, prize_type: 'trophy', description: 'Cup' }],
      sponsors: [{ name: 'Gift Co', support_type: 'inkind', description: 'Gifts' }],
    });
    const { tournamentFinancesService } = await import('../../financial/application/tournament-finances.service.js');
    const report = await tournamentFinancesService.forOrganisation(ORG_A, tid);
    expect(report.revenue.registration).toBe(0);
    expect(report.revenue.sponsorCash).toBe(0);
    expect(report.expenses.cashPrizes).toBe(0);
    expect(report.net).toBe(0);
    expect(report.counts.inKindSponsors).toBe(1);
    expect(report.counts.inKindPrizes).toBe(1);
  });

  it('multiple registrations sum once (no double counting)', async () => {
    const tid = await createOrgTournamentWithFixture(ORG_A);
    const [reg1] = await pool.execute<RowData>(
      `INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status) VALUES (?, ?, 'paid', 'registered')`, [tid, WINNER],
    );
    regIds.push(Number((reg1 as any).insertId));
    await addPaidPayment(Number((reg1 as any).insertId), 150, WINNER);
    const [reg2] = await pool.execute<RowData>(
      `INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status) VALUES (?, ?, 'paid', 'registered')`, [tid, WINNER2],
    );
    regIds.push(Number((reg2 as any).insertId));
    await addPaidPayment(Number((reg2 as any).insertId), 150, WINNER2);
    const { tournamentFinancesService } = await import('../../financial/application/tournament-finances.service.js');
    const report = await tournamentFinancesService.forOrganisation(ORG_A, tid);
    expect(report.revenue.registration).toBe(300);
    expect(report.counts.paidRegistrations).toBe(2);
  });

  it('organization isolation: cannot read another org\u2019s tournament finances', async () => {
    const tidA = await createOrgTournament(ORG_A);
    const { tournamentFinancesService } = await import('../../financial/application/tournament-finances.service.js');
    // ORG_B cannot read ORG_A's tournament
    await expect(tournamentFinancesService.forOrganisation(ORG_B, tidA)).rejects.toThrow();
  });

  it('platform (org-less)/non-existent tournaments are rejected in org-facing calls', async () => {
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
});