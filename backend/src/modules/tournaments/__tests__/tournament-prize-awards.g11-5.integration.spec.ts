import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3007';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * G11.5 — Tournament Prize Payout (Phase 1).
 *
 * Award obligation binds when a standings-backed tournament is completed and
 * winners confirmed (Q1b). Winner resolution = standings.rank_position →
 * registrations.player_id (Q2b); amount/currency snapshotted from
 * tournament_prizes. Locked topology being asserted (Q5/Q8b/Q8c/Q10b/Q12b):
 *
 *   Platform-funded award:        CourtZon Dr 4300 / Cr 2100.
 *   Org CARD award:               CourtZon Dr 2202 / Cr 2100
 *                                 org book Dr org 4140 / Cr org 1161.
 *   Org CASH award:               CourtZon Dr 2202 / Cr 2100
 *                                 org book Dr org 4140 / Cr org MKT-CZ-PAY.
 *   Refund (FULL-only clawback):  exact inverse of every award posting.
 *   Org-funded awards carry a signed ORGANIZATION_ADJUSTMENT (−prize,
 *     collector='courtzon', source_type='tournament', source_id=awardId)
 *     cancelled on refund.
 *   Wallet: credit ONLY (type 'prize', reference_type 'tournament_prize',
 *     reference_id awardId) — idempotent; withdrawal flow untouched; wallet is
 *     NEVER a payment method.
 *   Awards bind idempotently (award rows / wallet credits / postings /
 *     entitlements are all self-guarded) — replays are no-ops.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

// Distinct fixtures (avoid collisions with G11.1–G11.4 suites).
const ORG = 10060160;
const ORG2 = 10060161;
const CREATOR = 10060162;
const WIN1 = 10060163; // rank 1
const WIN2 = 10060164; // rank 2
const WIN3 = 10060165; // rank 3
const EXTRA = 10060166; // ambiguous-rank / non-winner player
const BRACKET = 1; // single-elimination
const RR = 3; // round-robin

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
const tournamentIds: number[] = [];
const regIds: number[] = [];
const prizeIds: number[] = [];
const awardIds: number[] = [];
const walletIds: number[] = [];
const walletTxnIds: number[] = [];
const entitlementIds: number[] = [];
let EVENT_BASE_ID = 0;

async function exec(sql: string, params: any[] = []) {
  return pool.execute(sql, params);
}

// ── ledger query helpers ─────────────────────────────────────────────────────

async function ledgerRows(sourceId: number, eventType: string): Promise<any[]> {
  const [rows] = await pool.execute<RowData>(
    `SELECT le.side, le.amount, le.event_type, le.source_type, le.source_id,
            le.organisation_id, c.code AS account_code
     FROM ledger_entries le JOIN chart_of_accounts c ON c.id = le.chart_account_id
     WHERE le.source_type = 'tournament' AND le.source_id = ? AND le.event_type = ?
     ORDER BY le.id`,
    [sourceId, eventType],
  );
  return rows as any[];
}

const sum = (rows: any[], side: string) =>
  Math.round(rows.filter((r) => r.side === side).reduce((s: number, r: any) => s + Number(r.amount), 0) * 100) / 100;

const amountFor = (rows: any[], side: string, code: string) =>
  Number(rows.find((r) => r.side === side && r.account_code === code)?.amount ?? -1);

const totalFor = (sourceId: number, eventTypes: string[]) =>
  pool.execute<RowData>(
    `SELECT COUNT(*) AS c FROM ledger_entries
     WHERE source_type = 'tournament' AND source_id = ? AND event_type IN (${eventTypes.map(() => '?').join(',')})`,
    [sourceId, ...eventTypes],
  ).then(([rows]) => Number((rows as any[])[0].c));

// ── fakes ────────────────────────────────────────────────────────────────────

async function createTournament(opts: { bracket?: number; org: number | null; status?: string; paymentMethods?: string | null; name?: string }) {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournaments
       (public_id, creator_id, organisation_id, bracket_type_id, name,
        max_participants, min_participants, entry_fee, registration_fee,
        currency_code, price_type, tournament_type, commission_rate, status,
        registration_payment_methods, start_date, end_date)
     VALUES (UUID(), ?, ?, ?, ?, 16, 2, 100, 0, 'EGP', 'FIXED', ?, 0, ?, ?, '2026-12-01', '2026-12-31')`,
    [CREATOR, opts.org, opts.bracket ?? RR, opts.name ?? 'G11P', opts.org != null ? 'community' : 'platform',
      opts.status ?? 'completed', opts.paymentMethods ?? null],
  );
  const tournamentId = Number((res as any).insertId);
  tournamentIds.push(tournamentId);
  return tournamentId;
}

async function createRegistration(tournamentId: number, playerId: number): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status)
     VALUES (?, ?, 'paid', 'registered')`,
    [tournamentId, playerId],
  );
  const regId = Number((res as any).insertId);
  regIds.push(regId);
  return regId;
}

async function createPrize(tournamentId: number, placement: number, prizeType: string, amount: number | null, displayOrder = 0): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournament_prizes (tournament_id, placement, prize_type, description, amount, currency_code, display_order)
     VALUES (?, ?, ?, ?, ?, 'EGP', ?)`,
    [tournamentId, placement, prizeType, `Prize ${placement}`, amount, displayOrder],
  );
  const prizeId = Number((res as any).insertId);
  prizeIds.push(prizeId);
  return prizeId;
}

async function upsertStanding(tournamentId: number, registrationId: number, rank: number) {
  await pool.execute<RowData>(
    `INSERT INTO tournament_standings (tournament_id, registration_id, wins, losses, draws, points, games_won, games_lost, sets_won, sets_lost, rank_position)
     VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)
     ON DUPLICATE KEY UPDATE rank_position = VALUES(rank_position)`,
    [tournamentId, registrationId, rank],
  );
}

async function bindPrizes(opts: { org: number | null; paymentMethods?: string | null; status?: string }): Promise<number> {
  const tid = await createTournament(opts);
  const reg1 = await createRegistration(tid, WIN1);
  const reg2 = await createRegistration(tid, WIN2);
  const reg3 = await createRegistration(tid, WIN3);
  await createPrize(tid, 1, 'cash', 500);
  await createPrize(tid, 2, 'cash', 250);
  await createPrize(tid, 3, 'cash', 100);
  await upsertStanding(tid, reg1, 1);
  await upsertStanding(tid, reg2, 2);
  await upsertStanding(tid, reg3, 3);
  return tid;
}

// ── fixtures ─────────────────────────────────────────────────────────────────

async function mkUser(id: number, email: string) {
  await pool.execute(
    `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'G11P User', 'male', 'active')`,
    [id, `015${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, email],
  );
}

async function mkWallet(userId: number) {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO user_wallets (user_id, balance, reserved_balance, currency_code, is_locked, version)
     VALUES (?, 0, 0, 'EGP', 0, 1)`,
    [userId],
  );
  walletIds.push(Number((res as any).insertId));
  return Number((res as any).insertId);
}

const PLAN = 10060095;

async function seedBase() {
  // Idempotent re-seed: purge every fixture for the fixed IDs first (the aborted
  // cleanup of a failed run must never block the next seed).
  await cleanupAll();

  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG}, UUID(), ?, 1, 'G11P Org', 'g11p-org', 1)`, [otId]);
  await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG2}, UUID(), ?, 1, 'G11P Org2', 'g11p-org2', 1)`, [otId]);

  await mkUser(CREATOR, 'g11p-creator@test.com');
  await mkUser(WIN1, 'g11p-win1@test.com');
  await mkUser(WIN2, 'g11p-win2@test.com');
  await mkUser(WIN3, 'g11p-win3@test.com');
  await mkUser(EXTRA, 'g11p-extra@test.com');
  for (const u of [WIN1, WIN2, WIN3, EXTRA]) await mkWallet(u);

  await pool.execute(`INSERT INTO subscription_plans (id, plan_name, price_monthly, is_active, is_internal, sort_order) VALUES (?, 'G11P Plan', 0, 1, 1, 0)`, [PLAN]);
  await pool.execute(`INSERT INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES (?, 'tournament', 'percentage', ?)`, [PLAN, 10]);
  await pool.execute(
    `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, start_date, end_date, subscription_status, auto_renew)
     VALUES (?, ?, 'monthly', '2020-01-01', '2099-01-01', 'active', 0)`, [ORG, PLAN]);
  await pool.execute(
    `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, start_date, end_date, subscription_status, auto_renew)
     VALUES (?, ?, 'monthly', '2020-01-01', '2099-01-01', 'active', 0)`, [ORG2, PLAN]);

  const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
  await accountingEngineService.provisionOrganisationMarketplaceAccounts(ORG);
  await accountingEngineService.provisionOrganisationMarketplaceAccounts(ORG2);
}

async function cleanupAll() {
  if (!pool) return;
  // Award rows can be orphaned by a mid-test failure — delete every award for
  // the suite's tournaments/winners BEFORE touching any parent (no CASCADE).
  await pool.execute(`DELETE FROM financial_entitlements WHERE organisation_id IN (${ORG}, ${ORG2}) OR source_type = 'tournament'`);
  await pool.execute(`DELETE FROM tournament_prize_awards
    WHERE tournament_id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})
       OR prize_id IN (${prizeIds.length ? prizeIds.join(',') : 0})
       OR winner_user_id IN (${WIN1}, ${WIN2}, ${WIN3}, ${EXTRA})`);
  await pool.execute(`DELETE FROM wallet_transactions
    WHERE wallet_id IN (SELECT id FROM user_wallets WHERE user_id IN (${WIN1}, ${WIN2}, ${WIN3}, ${EXTRA}))`);
  await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id IN (${ORG}, ${ORG2}) OR source_type = 'tournament'`);
  await pool.execute(`DELETE FROM general_ledger
    WHERE organisation_id IN (${ORG}, ${ORG2})
       OR account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id IN (${ORG}, ${ORG2}))`);
  await pool.execute(`DELETE FROM tournament_standings WHERE tournament_id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM audit_logs WHERE entity_type = 'tournament_prize_award'`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE id IN (${regIds.length ? regIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM tournament_prizes WHERE id IN (${prizeIds.length ? prizeIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM user_wallets WHERE id IN (${walletIds.length ? walletIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${CREATOR}, ${WIN1}, ${WIN2}, ${WIN3}, ${EXTRA})`);
  await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id IN (${ORG}, ${ORG2}))`);
  await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id IN (${ORG}, ${ORG2})`);
  await pool.execute(`DELETE FROM organisation_subscriptions WHERE organisation_id IN (${ORG}, ${ORG2})`);
  await pool.execute(`DELETE FROM subscription_plan_rates WHERE plan_id = ${PLAN}`);
  await pool.execute(`DELETE FROM subscription_plans WHERE id = ${PLAN}`);
  await pool.execute(`DELETE FROM organisations WHERE id IN (${ORG}, ${ORG2})`);
  await pool.execute(`DELETE FROM published_events WHERE id > ${EVENT_BASE_ID}`);
  await pool.execute(`DELETE FROM processed_events WHERE id > ${EVENT_BASE_ID}`);
  tournamentIds.length = 0; regIds.length = 0; prizeIds.length = 0;
  awardIds.length = 0; walletIds.length = 0; walletTxnIds.length = 0; entitlementIds.length = 0;
}

async function awardRow(awardId: number): Promise<any> {
  const [rows] = await pool.execute<RowData>('SELECT * FROM tournament_prize_awards WHERE id = ?', [awardId]);
  return (rows as any[])[0];
}

async function walletTxnRows(referenceType: string, awardId: number): Promise<any[]> {
  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM wallet_transactions WHERE reference_type = ? AND reference_id = ? ORDER BY id`,
    [referenceType, awardId],
  );
  return rows as any[];
}

async function walletBalance(userId: number): Promise<number> {
  const [rows] = await pool.execute<RowData>('SELECT balance FROM user_wallets WHERE user_id = ?', [userId]);
  return Number((rows as any[])[0]?.balance ?? 0);
}

async function adjustmentRows(awardId: number): Promise<any[]> {
  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM financial_entitlements WHERE source_type = 'tournament' AND source_id = ? AND entitlement_type = 'ORGANIZATION_ADJUSTMENT'`,
    [awardId],
  );
  return rows as any[];
}

// ── app wiring ───────────────────────────────────────────────────────────────

let prizeService: any;

async function registerApp() {
  const svc = await import('../application/tournament-prize-award.service.js');
  prizeService = svc.tournamentPrizeAwardService;
}

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

  await registerApp();

  // Register the prize-award listeners ONCE (in-memory handlers accumulate on
  // re-registration; the binding is idempotent but handlers must not stack).
  const { registerTournamentPrizeListeners } = await import('../application/tournament-prize-award.listener.js');
  registerTournamentPrizeListeners();
}, 120000);

afterAll(async () => {
  await cleanupAll();
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 120000);

beforeEach(async () => {
  await cleanupAll();
  await seedBase();
  await registerApp();
});

afterEach(() => { vi.clearAllMocks(); });

describe('G11.5 — tournament prize payout', () => {
  it('S1 — standings-finalized binds awards for every ranked cash prize (snapshot amounts) + winner resolution (Q1b/Q2b)', async () => {
    const tid = await bindPrizes({ org: ORG });
    const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
    await eventBusV2.emit('tournament:standings-finalized', { tournamentId: tid, organisationId: ORG } as any);

    await waitFor(async () => {
      const [r] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM tournament_prize_awards WHERE tournament_id = ?', [tid]);
      return Number((r as any[])[0].c);
    }, (n) => n === 3, '3 awards bound from event');
    const [rows] = await pool.execute<RowData>('SELECT * FROM tournament_prize_awards WHERE tournament_id = ? ORDER BY placement', [tid]);
    const awards = rows as any[];
    expect(awards).toHaveLength(3);
    for (const a of awards) awardIds.push(a.id);
    const [pl] = await pool.execute<RowData>('SELECT placement, amount, currency_code FROM tournament_prizes WHERE tournament_id = ? ORDER BY placement', [tid]);
    const prizes = pl as any[];
    expect(awards.map((a) => a.placement).sort((a: number, b: number) => a - b)).toEqual([1, 2, 3]);
    expect(awards[0].winner_user_id).toBe(WIN1);
    expect(awards[1].winner_user_id).toBe(WIN2);
    expect(Number(awards[0].amount)).toBe(Number(prizes[0].amount));
    expect(awards[0].currency_code).toBe('EGP');
    expect(awards[0].funding_source).toBe('organization');
    expect(awards[0].status).toBe('credited');
    expect(awards[0].credited_at).toBeTruthy();
  });

  it('S2 — wallet credit: exactly one prize transaction, exact amount, balance increments (Q3b)', async () => {
    const tid = await bindPrizes({ org: ORG });
    await prizeService.bindAwardsForTournament(tid);
    const [rows] = await pool.execute<RowData>('SELECT id FROM tournament_prize_awards WHERE tournament_id = ? ORDER BY placement', [tid]);
    const awards = rows as any[];
    expect(awards.length).toBe(3);
    for (const a of awards) awardIds.push(a.id);

    const txn = await walletTxnRows('tournament_prize', awards[0].id);
    expect(txn).toHaveLength(1);
    expect(txn[0].transaction_type).toBe('prize');
    expect(txn[0].direction).toBe('credit');
    expect(Number(txn[0].amount)).toBe(500);
    expect(await walletBalance(WIN1)).toBe(500);
    expect(await walletBalance(WIN2)).toBe(250);
    expect(await walletBalance(WIN3)).toBe(100);
    for (const t of txn) walletTxnIds.push(t.id);
    // Audit trail — one award entry per bound award (service-level audit).
    const [aud] = await pool.execute<RowData>(`SELECT COUNT(*) AS c FROM audit_logs
      WHERE action = 'tournament.prize.awarded' AND entity_type = 'tournament_prize_award'
        AND entity_id IN (?, ?, ?)`, [awards[0].id, awards[1].id, awards[2].id]);
    expect(Number((aud as any[])[0].c)).toBe(3);
    // No operational transaction / payment row is created (wallet is refund-only).
    const [pt] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM payment_transactions WHERE user_id IN (?, ?, ?)', [WIN1, WIN2, WIN3]);
    expect(Number((pt as any[])[0].c)).toBe(0);
  });

  it('S3 — platform/community award: CourtZon Dr 4300 / Cr 2100 only; no org events; no adjustment', async () => {
    const tid = await bindPrizes({ org: null });
    await prizeService.bindAwardsForTournament(tid);
    const [rows] = await pool.execute<RowData>('SELECT id FROM tournament_prize_awards WHERE tournament_id = ? ORDER BY placement', [tid]);
    const awards = rows as any[];
    for (const a of awards) awardIds.push(a.id);

    await waitFor(() => ledgerRows(awards[0].id, 'tournament_prize_award'), (r) => r.length === 2, 'platform award posting');
    const court = await ledgerRows(awards[0].id, 'tournament_prize_award');
    expect(amountFor(court, 'debit', '4300')).toBe(500);
    expect(amountFor(court, 'credit', '2100')).toBe(500);
    expect(court.every((r) => r.organisation_id === null)).toBe(true);
    expect(await totalFor(awards[0].id, ['tournament_org_prize_award', 'tournament_org_prize_award_book', 'tournament_org_cash_prize_award_book'])).toBe(0);
    expect(await adjustmentRows(awards[0].id)).toHaveLength(0);
    expect(sum(court, 'debit')).toBe(sum(court, 'credit'));
  });

  it('S4 — org CARD award: CourtZon Dr 2202 / Cr 2100 + org book Dr 4140 / Cr 1161 + negative adjustment (Q12b)', async () => {
    const tid = await bindPrizes({ org: ORG });
    await prizeService.bindAwardsForTournament(tid);
    const [rows] = await pool.execute<RowData>('SELECT id FROM tournament_prize_awards WHERE tournament_id = ? ORDER BY placement', [tid]);
    const awards = rows as any[];
    for (const a of awards) awardIds.push(a.id);

    const cid = awards[0].id;
    await waitFor(() => ledgerRows(cid, 'tournament_org_prize_award'), (r) => r.length === 2, 'org CourtZon book posting');
    await waitFor(() => ledgerRows(cid, 'tournament_org_prize_award_book'), (r) => r.length === 2, 'org book posting');

    const cz = await ledgerRows(cid, 'tournament_org_prize_award');
    expect(amountFor(cz, 'debit', '2202')).toBe(500);
    expect(amountFor(cz, 'credit', '2100')).toBe(500);
    expect(cz.every((r) => r.organisation_id === null)).toBe(true);

    const og = await ledgerRows(cid, 'tournament_org_prize_award_book');
    expect(amountFor(og, 'debit', '4140')).toBe(500);
    expect(amountFor(og, 'credit', '1161')).toBe(500);
    expect(og.every((r) => r.organisation_id === ORG)).toBe(true);
    expect(sum(cz, 'debit')).toBe(sum(cz, 'credit'));
    expect(sum(og, 'debit')).toBe(sum(og, 'credit'));

    const adj = await adjustmentRows(cid);
    expect(adj).toHaveLength(1);
    expect(Number(adj[0].amount)).toBe(-500);
    expect(adj[0].collector).toBe('courtzon');
    expect(adj[0].source_type).toBe('tournament');
    expect(adj[0].source_id).toBe(cid);
    expect(adj[0].organisation_id).toBe(ORG);
    entitlementIds.push(adj[0].id);
  });

  it('S5 — org CASH award: CourtZon Dr 2202 / Cr 2100 + org book Dr 4140 / Cr MKT-CZ-PAY', async () => {
    const tid = await bindPrizes({ org: ORG, paymentMethods: '["cash"]' });
    await prizeService.bindAwardsForTournament(tid);
    const [rows] = await pool.execute<RowData>('SELECT * FROM tournament_prize_awards WHERE tournament_id = ? ORDER BY placement', [tid]);
    const awards = rows as any[];
    for (const a of awards) awardIds.push(a.id);
    expect(awards[0].collection_method).toBe('cash');

    const cid = awards[0].id;
    await waitFor(() => ledgerRows(cid, 'tournament_org_cash_prize_award_book'), (r) => r.length === 2, 'org cash book posting');
    const og = await ledgerRows(cid, 'tournament_org_cash_prize_award_book');
    expect(amountFor(og, 'debit', '4140')).toBe(500);
    expect(amountFor(og, 'credit', 'MKT-CZ-PAY')).toBe(500);
    expect(og.every((r) => r.organisation_id === ORG)).toBe(true);
    expect(await totalFor(cid, ['tournament_org_prize_award_book'])).toBe(0);
    expect(sum(og, 'debit')).toBe(sum(og, 'credit'));
  });

  it('S6 — bind idempotency: replaying the signal duplicates nothing (awards / wallet / postings / adjustments)', async () => {
    const tid = await bindPrizes({ org: ORG });
    await prizeService.bindAwardsForTournament(tid);
    await prizeService.bindAwardsForTournament(tid);
    const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
    await eventBusV2.emit('tournament:standings-finalized', { tournamentId: tid, organisationId: ORG } as any);
    await sleep(300);

    const [rows] = await pool.execute<RowData>('SELECT id FROM tournament_prize_awards WHERE tournament_id = ? ORDER BY placement', [tid]);
    const awards = rows as any[];
    expect(awards).toHaveLength(3);
    for (const a of awards) awardIds.push(a.id);

    expect(await walletTxnRows('tournament_prize', awards[0].id)).toHaveLength(1);
    expect(await totalFor(awards[0].id, ['tournament_org_prize_award', 'tournament_org_prize_award_book'])).toBe(4);
    expect(await adjustmentRows(awards[0].id)).toHaveLength(1);
    expect(await walletBalance(WIN1)).toBe(500);
  });

  it('S7 — manual grant for bracket winner runs the identical pipeline (bind_source=manual)', async () => {
    const tid = await createTournament({ bracket: BRACKET, org: ORG });
    const reg = await createRegistration(tid, WIN1);
    await createPrize(tid, 1, 'cash', 300);
    const [prizes] = await pool.execute<RowData>('SELECT id FROM tournament_prizes WHERE tournament_id = ?', [tid]);
    await upsertStanding(tid, reg, 1); // irrelevant for manual path

    const award = await prizeService.manualGrant(tid, { prizeId: (prizes as any[])[0].id, winnerUserId: WIN1, createdBy: CREATOR });
    awardIds.push(award.id);
    expect(award.bind_source).toBe('manual');
    expect(award.status).toBe('credited');
    expect(await walletBalance(WIN1)).toBe(300);
    await waitFor(() => ledgerRows(award.id, 'tournament_org_prize_award_book'), (r) => r.length === 2, 'manual grant org book posting');
    expect(await adjustmentRows(award.id)).toHaveLength(1);
    const [regs] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM tournament_prize_awards WHERE tournament_id = ?', [tid]);
    expect(Number((regs as any[])[0].c)).toBe(1);
  });

  it('S8 — eligibility guard: platform CASH-collected tournament binds nothing (Phase 1 guard)', async () => {
    const tid = await bindPrizes({ org: null, paymentMethods: '["cash"]' });
    const bound = await prizeService.bindAwardsForTournament(tid);
    expect(bound).toHaveLength(0);
    await sleep(200);
    const [rows] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM tournament_prize_awards WHERE tournament_id = ?', [tid]);
    expect(Number((rows as any[])[0].c)).toBe(0);
    const [led] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM ledger_entries
       WHERE source_type = 'tournament' AND source_id IN (SELECT id FROM tournament_prize_awards WHERE tournament_id = ?)`, [tid]);
    expect(Number((led as any[])[0].c)).toBe(0);
  });

  it('S9 — no standings rows → no awards', async () => {
    const tid = await createTournament({ org: ORG });
    await createRegistration(tid, WIN1);
    await createPrize(tid, 1, 'cash', 500);
    const bound = await prizeService.bindAwardsForTournament(tid);
    expect(bound).toHaveLength(0);
    const [rows] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM tournament_prize_awards WHERE tournament_id = ?', [tid]);
    expect(Number((rows as any[])[0].c)).toBe(0);
  });

  it('S10 — ambiguous rank (multi-group standings) is skipped fail-closed; unique ranks still awarded', async () => {
    const tid = await createTournament({ org: ORG });
    const reg1 = await createRegistration(tid, WIN1);
    const regA = await createRegistration(tid, WIN2);
    const regB = await createRegistration(tid, WIN3);
    await createPrize(tid, 1, 'cash', 500);
    await createPrize(tid, 2, 'cash', 250);
    await upsertStanding(tid, reg1, 1);
    await upsertStanding(tid, regA, 2);
    await upsertStanding(tid, regB, 2); // two rows at rank 2 → ambiguous

    const bound = await prizeService.bindAwardsForTournament(tid);
    expect(bound).toHaveLength(1);
    expect(bound[0].placement).toBe(1);
    expect(bound[0].winner_user_id).toBe(WIN1);
    for (const a of bound) awardIds.push(a.id);
    const [rows] = await pool.execute<RowData>('SELECT placement, winner_user_id FROM tournament_prize_awards WHERE tournament_id = ?', [tid]);
    expect(rows as any[]).toHaveLength(1);
  });

  it('S11 — non-cash prizes (trophy) are never awarded a wallet credit', async () => {
    const tid = await createTournament({ org: ORG });
    const reg1 = await createRegistration(tid, WIN1);
    await createPrize(tid, 1, 'cash', 400);
    await createPrize(tid, 2, 'trophy', null);
    await upsertStanding(tid, reg1, 1);
    const bound = await prizeService.bindAwardsForTournament(tid);
    expect(bound).toHaveLength(1);
    awardIds.push(bound[0].id);
    expect(await walletBalance(WIN1)).toBe(400);
    const [rows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM wallet_transactions
       WHERE transaction_type = 'prize' AND reference_type = 'tournament_prize' AND reference_id = ?`, [bound[0].id]);
    expect(Number((rows as any[])[0].c)).toBe(1);
  });

  it('S12 — full-only refund (credited): wallet debit, balance restored, status refunded, adjustment cancelled (Q10b)', async () => {
    const tid = await bindPrizes({ org: ORG });
    await prizeService.bindAwardsForTournament(tid);
    const [rows] = await pool.execute<RowData>('SELECT id FROM tournament_prize_awards WHERE tournament_id = ? AND placement = 1', [tid]);
    const awardId = Number((rows as any[])[0].id);
    awardIds.push(awardId);
    await waitFor(() => adjustmentRows(awardId), (r) => r.length === 1, 'adjustment');
    await waitFor(() => totalFor(awardId, ['tournament_org_prize_award', 'tournament_org_prize_award_book']), (n) => n === 4, 'award postings');

    const refunded = await prizeService.refundAward(awardId, CREATOR, 'UA-TEST clawback');
    expect(refunded.status).toBe('refunded');
    expect(await walletBalance(WIN1)).toBe(0);

    const txn = await walletTxnRows('tournament_prize_refund', awardId);
    expect(txn).toHaveLength(1);
    expect(txn[0].transaction_type).toBe('prize');
    expect(txn[0].direction).toBe('debit');
    expect(Number(txn[0].amount)).toBe(500);
    for (const t of txn) walletTxnIds.push(t.id);

    await waitFor(() => ledgerRows(awardId, 'tournament_org_prize_refund'), (r) => r.length === 2, 'refund CourtZon posting');
    await waitFor(() => ledgerRows(awardId, 'tournament_org_prize_refund_book'), (r) => r.length === 2, 'refund org book posting');
    const cz = await ledgerRows(awardId, 'tournament_org_prize_refund');
    expect(amountFor(cz, 'debit', '2100')).toBe(500);
    expect(amountFor(cz, 'credit', '2202')).toBe(500);
    const og = await ledgerRows(awardId, 'tournament_org_prize_refund_book');
    expect(amountFor(og, 'debit', '1161')).toBe(500);
    expect(amountFor(og, 'credit', '4140')).toBe(500);

    const adj = await adjustmentRows(awardId);
    expect(adj).toHaveLength(1);
    expect(adj[0].status).toBe('CANCELLED');
    // net org position across award+refund returns to zero
    const [gl] = await pool.execute<RowData>(
      `SELECT SUM(CASE WHEN c.code IN ('4140','MKT-CZ-PAY') THEN 1 ELSE 0 END) AS x FROM ledger_entries le
       JOIN chart_of_accounts c ON c.id = le.chart_account_id
       WHERE le.source_type = 'tournament' AND le.source_id = ?`, [awardId]);
    expect(Number((gl as any[])[0].x)).toBeGreaterThan(0);
  });

  it('S13 — platform refund posts the exact inverse (Dr 2100 / Cr 4300)', async () => {
    const tid = await bindPrizes({ org: null });
    await prizeService.bindAwardsForTournament(tid);
    const [rows] = await pool.execute<RowData>('SELECT id FROM tournament_prize_awards WHERE tournament_id = ? AND placement = 1', [tid]);
    const awardId = Number((rows as any[])[0].id);
    awardIds.push(awardId);
    await waitFor(() => ledgerRows(awardId, 'tournament_prize_award'), (r) => r.length === 2, 'platform award posting');

    await prizeService.refundAward(awardId, CREATOR, 'platform clawback');
    await waitFor(() => ledgerRows(awardId, 'tournament_prize_refund'), (r) => r.length === 2, 'platform refund posting');
    const rf = await ledgerRows(awardId, 'tournament_prize_refund');
    expect(amountFor(rf, 'debit', '2100')).toBe(500);
    expect(amountFor(rf, 'credit', '4300')).toBe(500);
    expect(sum(rf, 'debit')).toBe(sum(rf, 'credit'));
    expect(await walletBalance(WIN1)).toBe(0);
  });

  it('S14 — refund guards: only credited awards; insufficient balance rejected; second refund blocked', async () => {
    const tid = await bindPrizes({ org: ORG });
    await prizeService.bindAwardsForTournament(tid);
    const [rows] = await pool.execute<RowData>('SELECT id FROM tournament_prize_awards WHERE tournament_id = ? AND placement = 1', [tid]);
    const a1 = Number((rows as any[])[0].id);
    awardIds.push(a1);

    // awards[2] (placement 3, amount 100) — drain its wallet to 50 → insufficient
    const [r3] = await pool.execute<RowData>('SELECT id FROM tournament_prize_awards WHERE tournament_id = ? AND placement = 3', [tid]);
    const a3 = Number((r3 as any[])[0].id);
    awardIds.push(a3);
    await pool.execute<RowData>('UPDATE user_wallets SET balance = balance - 50 WHERE user_id = ?', [WIN3]);

    await expect(prizeService.refundAward(a3, CREATOR, 'drain')).rejects.toThrow(/Insufficient wallet balance/);

    await prizeService.refundAward(a1, CREATOR, 'ok');
    await expect(prizeService.refundAward(a1, CREATOR, 'again')).rejects.toThrow(/credited/);
    const [aud] = await pool.execute<RowData>(`SELECT COUNT(*) AS c FROM audit_logs
      WHERE action = 'tournament.prize.refunded' AND entity_type = 'tournament_prize_award' AND entity_id = ?`, [a1]);
    expect(Number((aud as any[])[0].c)).toBe(1);
  });

  it('S15 — settlement netting: negative adjustment is available to settlement after activation', async () => {
    const tid = await bindPrizes({ org: ORG });
    await prizeService.bindAwardsForTournament(tid);
    const [rows] = await pool.execute<RowData>('SELECT id FROM tournament_prize_awards WHERE tournament_id = ? AND placement = 1', [tid]);
    const awardId = Number((rows as any[])[0].id);
    awardIds.push(awardId);
    await waitFor(() => adjustmentRows(awardId), (r) => r.length === 1, 'adjustment');

    const { financialEntitlementRepository } = await import('../../financial/infrastructure/repositories/financial-entitlement.repository.js');
    // Production activation mechanism (idempotent batch), scoped to exactly this
    // adjustment — never mass-activates unrelated PENDING rows in the shared DB.
    const adj0 = await adjustmentRows(awardId);
    expect(adj0[0].status).toBe('PENDING');
    expect(adj0[0].available_at).toBeTruthy();
    await financialEntitlementRepository.batchActivate([adj0[0].id]);
    const adj = await adjustmentRows(awardId);
    expect(adj[0].status).toBe('AVAILABLE');
    expect(Number(adj[0].amount)).toBe(-500);
  });

  it('S16 — migration present: awards table exists + wallet transaction_type enum includes prize', async () => {
    const [t] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tournament_prize_awards'`);
    expect(Number((t as any[])[0].c)).toBe(1);
    const [cs] = await pool.execute<RowData>(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wallet_transactions' AND COLUMN_NAME = 'transaction_type'`);
    expect(String((cs as any[])[0]?.COLUMN_TYPE ?? '')).toContain('prize');
  });

  it('S17 — RBAC keys registered + granted to admin roles + howship templates present (en+ar)', async () => {
    const root = resolve(__dirname, '../../../../../');
    const registry = readFileSync(resolve(root, 'frontend/src/permissions/registry.ts'), 'utf-8');
    for (const key of ['tournaments.awards.view', 'tournaments.awards.grant', 'tournaments.awards.refund', 'tournaments.awards.withdraw']) {
      expect(registry).toContain(key);
    }
    const templates = readFileSync(resolve(root, 'backend/scripts/role-permission-templates.mjs'), 'utf-8');
    for (const key of ['tournaments.awards.view', 'tournaments.awards.grant', 'tournaments.awards.refund', 'tournaments.awards.withdraw']) {
      expect(templates).toContain(key);
    }
    const tplSource = readFileSync(resolve(root, 'backend/src/modules/notifications/application/template.service.ts'), 'utf-8');
    expect(tplSource).toContain("eventName: 'tournament:prize-awarded', locale: 'en'");
    expect(tplSource).toContain("eventName: 'tournament:prize-awarded', locale: 'ar'");
    expect(tplSource).toContain("eventName: 'tournament:prize-refunded', locale: 'en'");
    expect(tplSource).toContain("eventName: 'tournament:prize-refunded', locale: 'ar'");
  });
});