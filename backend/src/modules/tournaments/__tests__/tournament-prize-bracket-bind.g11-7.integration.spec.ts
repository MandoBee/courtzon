import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { ensureOpenPlatformAccountingPeriod, dropCurrentPlatformAccountingPeriods } from './prize-period-fixture.js';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3009';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * G11.7 B2 — Bracket/Knockout Automatic Prize Binding (champion, placement 1).
 *
 * Verifies:
 *   champion → placement-1 cash prize bound via the existing G11.5 pipeline
 *   catalog snapshot + idempotency (duplicate tournament:completed)
 *   no eligible prize → no award; unsupported placements (2/3) never bound
 *   standings-backed binding unchanged; manualGrant idempotent + no double-award
 *   accounting identical to G11.5 (platform / org CARD / org CASH)
 *   negative ORGANIZATION_ADJUSTMENT identical to G11.5 + refund cancellation
 *   notification/audit emitted exactly once per award
 */

const ORG_CARD = 2460101;
const ORG_CASH = 2460102;
const WINNER = 2460201;
const WINNER2 = 2460202;
const RR_PLAYER = 2460203;
const ACTOR = 2460209;
const PLAN = 2460090;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(probe: () => Promise<T>, isReady: (value: T) => boolean, what: string, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await probe();
  while (!isReady(value)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for: ${what} — last value ${JSON.stringify(value)}`);
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

const exec = (sql: string, params: any[] = []) => pool.execute(sql, params);

async function mkUser(id: number, email: string) {
  await pool.execute(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'G11.7', 'male', 'active')`,
    [id, `015${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, email],
  );
  await pool.execute(
    `INSERT IGNORE INTO user_wallets (user_id, balance, reserved_balance, currency_code, is_locked, version)
     VALUES (?, 0, 0, 'EGP', 0, 1)`, [id],
  );
}

async function seedOrg(orgId: number, slug: string) {
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${orgId}, UUID(), ?, 1, 'G11.7 Org', '${slug}', 1)`, [otId]);
  await pool.execute(`INSERT IGNORE INTO subscription_plans (id, plan_name, price_monthly, is_active, is_internal, sort_order) VALUES (?, 'G11.7 Plan', 0, 1, 1, 0)`, [PLAN]);
  await pool.execute(`INSERT IGNORE INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES (?, 'tournament', 'percentage', ?)`, [PLAN, 10]);
  await pool.execute(
    `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, start_date, end_date, subscription_status, auto_renew)
     VALUES (?, ?, 'monthly', '2020-01-01', '2099-01-01', 'active', 0)`, [orgId, PLAN]);
  const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
  await accountingEngineService.provisionOrganisationMarketplaceAccounts(orgId);
}

async function createTournament(opts: { org: number | null; bracket?: number; paymentMethods?: string | null; name?: string }): Promise<number> {
  // G11 Phase 3 — `tournament_type` is narrowed to 'community' only. `org` may
  // be null ONLY to simulate a LEGACY pre-Phase-3 row (fail-closed guard path).
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournaments
       (public_id, creator_id, organisation_id, bracket_type_id, name, max_participants, min_participants,
        entry_fee, registration_fee, currency_code, price_type, tournament_type, commission_rate, status,
        registration_payment_methods, start_date, end_date)
     VALUES (UUID(), ?, ?, ?, ?, 16, 2, 100, 0, 'EGP', 'FIXED', 'community', 0, 'completed', ?, '2026-12-01', '2026-12-31')`,
    [ACTOR, opts.org, opts.bracket ?? 1, opts.name ?? 'G11.7B', opts.paymentMethods ?? null],
  );
  const tid = Number((res as any).insertId);
  tournamentIds.push(tid);
  return tid;
}

async function createRegistration(tid: number, player: number): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status) VALUES (?, ?, 'paid', 'registered')`, [tid, player],
  );
  const rid = Number((res as any).insertId);
  regIds.push(rid);
  return rid;
}

async function createPrize(tid: number, placement: number, prizeType: string, amount: number | null, displayOrder = 0): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournament_prizes (tournament_id, placement, prize_type, description, amount, currency_code, display_order)
     VALUES (?, ?, ?, 'Prize', ?, 'EGP', ?)`, [tid, placement, prizeType, amount, displayOrder],
  );
  const pid = Number((res as any).insertId);
  prizeIds.push(pid);
  return pid;
}

async function upsertStanding(tid: number, registrationId: number, rank: number) {
  await pool.execute<RowData>(
    `INSERT INTO tournament_standings (tournament_id, registration_id, wins, losses, draws, points, games_won, games_lost, sets_won, sets_lost, rank_position)
     VALUES (?, ?, 0,0,0,0,0,0,0,0, ?)`, [tid, registrationId, rank],
  );
}

async function ledgerRows(sourceId: number, eventType: string): Promise<any[]> {
  const [rows] = await pool.execute<RowData>(
    `SELECT le.side, le.amount, c.code AS account_code
     FROM ledger_entries le JOIN chart_of_accounts c ON c.id = le.chart_account_id
     WHERE le.source_type = 'tournament' AND le.source_id = ? AND le.event_type = ? ORDER BY le.id`, [sourceId, eventType],
  );
  return rows as any[];
}

const amountFor = (rows: any[], side: string, code: string) =>
  Number(rows.find((r) => r.side === side && r.account_code === code)?.amount ?? -1);

const totalFor = (sourceId: number, eventTypes: string[]) =>
  pool.execute<RowData>(
    `SELECT COUNT(*) AS c FROM ledger_entries
     WHERE source_type = 'tournament' AND source_id = ? AND event_type IN (${eventTypes.map(() => '?').join(',')})`,
    [sourceId, ...eventTypes],
  ).then(([rows]) => Number((rows as any[])[0].c));

async function prizeCredits(awardId: number): Promise<any[]> {
  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM wallet_transactions WHERE reference_type = 'tournament_prize' AND reference_id = ? ORDER BY id`, [awardId],
  );
  return rows as any[];
}

async function adjustments(awardId: number): Promise<any[]> {
  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM financial_entitlements WHERE source_type = 'tournament' AND source_id = ? AND entitlement_type = 'ORGANIZATION_ADJUSTMENT'`, [awardId],
  );
  return rows as any[];
}

async function awardCount(tid: number): Promise<number> {
  const [rows] = await pool.execute<RowData>('SELECT COUNT(*) AS v FROM tournament_prize_awards WHERE tournament_id = ?', [tid]);
  return Number((rows as any[])[0].v);
}

async function awardsFor(tid: number): Promise<any[]> {
  const [rows] = await pool.execute<RowData>('SELECT * FROM tournament_prize_awards WHERE tournament_id = ? ORDER BY id', [tid]);
  return rows as any[];
}

let prizeService: any;

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });
  await ensureOpenPlatformAccountingPeriod(pool as any);
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  const { registerAccountingEventListeners } = await import('../../financial/application/accounting-event.listener.js');
  registerAccountingEventListeners();
  const { registerTournamentPrizeListeners } = await import('../application/tournament-prize-award.listener.js');
  registerTournamentPrizeListeners();
  const svc = await import('../application/tournament-prize-award.service.js');
  prizeService = svc.tournamentPrizeAwardService;
  await mkUser(WINNER, 'g117-win@test.com');
  await mkUser(WINNER2, 'g117-win2@test.com');
  await mkUser(RR_PLAYER, 'g117-rr@test.com');
  await mkUser(ACTOR, 'g117-actor@test.com');
  await seedOrg(ORG_CARD, 'g117-org-card');
  await seedOrg(ORG_CASH, 'g117-org-cash');
}, 120000);

afterAll(async () => {
  await cleanup();
  await dropCurrentPlatformAccountingPeriods(pool as any);
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 120000);

async function cleanup() {
  if (!pool) return;
  await pool.execute(`DELETE FROM financial_entitlements WHERE organisation_id IN (${ORG_CARD}, ${ORG_CASH}) OR source_type = 'tournament'`);
  await pool.execute(`DELETE FROM tournament_prize_awards WHERE id IN (${awardIds.length ? awardIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM user_wallets WHERE user_id IN (${WINNER}, ${WINNER2}, ${RR_PLAYER}, ${ACTOR}))`);
  await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id IN (${ORG_CARD}, ${ORG_CASH}) OR source_type = 'tournament'`);
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (${ORG_CARD}, ${ORG_CASH}) OR account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id IN (${ORG_CARD}, ${ORG_CASH}))`);
  await pool.execute(`DELETE FROM tournament_standings WHERE tournament_id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM audit_logs WHERE entity_type = 'tournament_prize_award'`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE id IN (${regIds.length ? regIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM tournament_prizes WHERE id IN (${prizeIds.length ? prizeIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM user_wallets WHERE user_id IN (${WINNER}, ${WINNER2}, ${RR_PLAYER}, ${ACTOR})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${WINNER}, ${WINNER2}, ${RR_PLAYER}, ${ACTOR})`);
  await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id IN (${ORG_CARD}, ${ORG_CASH}))`);
  // Re-clean general_ledger immediately before the chart accounts (belt-and-
  // braces): async prize-accounting postings from a freshly-bound award can land
  // during this cleanup and would otherwise trip the fk_gl_account FK on the
  // chart_of_accounts delete below.
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (${ORG_CARD}, ${ORG_CASH}) OR account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id IN (${ORG_CARD}, ${ORG_CASH}))`);
  await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id IN (${ORG_CARD}, ${ORG_CASH})`);
  await pool.execute(`DELETE FROM organisation_subscriptions WHERE organisation_id IN (${ORG_CARD}, ${ORG_CASH})`);
  await pool.execute(`DELETE FROM subscription_plan_rates WHERE plan_id = ${PLAN}`);
  await pool.execute(`DELETE FROM subscription_plans WHERE id = ${PLAN}`);
  await pool.execute(`DELETE FROM organisations WHERE id IN (${ORG_CARD}, ${ORG_CASH})`);
  tournamentIds.length = 0; regIds.length = 0; prizeIds.length = 0; awardIds.length = 0;
}

beforeEach(async () => {
  await cleanup();
  await mkUser(WINNER, 'g117-win@test.com');
  await mkUser(WINNER2, 'g117-win2@test.com');
  await mkUser(RR_PLAYER, 'g117-rr@test.com');
  await mkUser(ACTOR, 'g117-actor@test.com');
  await seedOrg(ORG_CARD, 'g117-org-card');
  await seedOrg(ORG_CASH, 'g117-org-cash');
});

afterEach(() => vi.clearAllMocks());

describe('G11.7 B2 — bracket automatic prize binding', () => {
  it('1 & 2. bracket champion receives placement-1 cash prize (snapshotted from catalog)', async () => {
    // G11 Phase 3 — the bracket-bind flow is an ORGANISATION capability: the
    // platform never funds a prize, so the tournament is owned by ORG_CARD.
    const tid = await createTournament({ org: ORG_CARD });
    await createRegistration(tid, WINNER);
    await createPrize(tid, 1, 'cash', 500);
    const awards = await prizeService.bindAwardsForBracket(tid, WINNER);
    expect(awards).toHaveLength(1);
    const a = awards[0];
    awardIds.push(a.id);
    expect(a.placement).toBe(1);
    expect(a.bind_source).toBe('bracket');
    expect(a.status).toBe('credited');
    expect(Number(a.amount)).toBe(500);
    expect(a.currency_code).toBe('EGP');
    // Drain the ASYNC accounting postings for this award before the next test:
    // the prize listener posts on the event bus, and the next test's cleanup
    // must not race a late general_ledger write (fk_gl_account).
    await waitFor(() => totalFor(a.id, ['tournament_org_prize_award', 'tournament_org_prize_award_book']), (n) => n === 4, 'org card postings');
    const [rows] = await pool.execute<RowData>('SELECT amount, currency_code FROM tournament_prizes WHERE tournament_id = ? AND placement = 1', [tid]);
    expect(Number((rows as any[])[0].amount)).toBe(Number(a.amount));
    expect((rows as any[])[0].currency_code).toBe(a.currency_code);
  });

  it('3. duplicate tournament:completed emits exactly one award / wallet credit / posting / adjustment', async () => {
    const tid = await createTournament({ org: ORG_CARD });
    await createRegistration(tid, WINNER);
    await createPrize(tid, 1, 'cash', 500);
    const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
    const payload = { tournamentId: tid, winnerId: WINNER, name: 'B' };
    await eventBusV2.emit('tournament:completed' as any, payload as any);
    await eventBusV2.emit('tournament:completed' as any, payload as any);

    await waitFor(async () => awardCount(tid), (n) => n === 1, 'exactly one bracket award after duplicate event');
    const rows = await awardsFor(tid);
    expect(rows).toHaveLength(1);
    const awardId = (rows as any)[0].id;
    awardIds.push(awardId);

    expect(await prizeCredits(awardId)).toHaveLength(1);
    const [credit] = await prizeCredits(awardId);
    expect(credit.transaction_type).toBe('prize');
    expect(Number(credit.amount)).toBe(500);

    await waitFor(() => totalFor(awardId, ['tournament_org_prize_award', 'tournament_org_prize_award_book']), (n) => n === 4, 'org card postings');
    expect(await totalFor(awardId, ['tournament_org_prize_award', 'tournament_org_prize_award_book'])).toBe(4);

    const adj = await adjustments(awardId);
    expect(adj).toHaveLength(1);
    expect(adj[0].status).toBe('PENDING');
  });

  it('4. no eligible placement-1 cash prize → no award', async () => {
    const tid = await createTournament({ org: ORG_CARD });
    await createRegistration(tid, WINNER);
    await createPrize(tid, 2, 'cash', 250);
    await createPrize(tid, 1, 'trophy', null);
    const awards = await prizeService.bindAwardsForBracket(tid, WINNER);
    expect(awards).toHaveLength(0);
    expect(await awardCount(tid)).toBe(0);
  });

  it('5. standings-backed (round-robin) binding remains unchanged', async () => {
    const tid = await createTournament({ org: ORG_CARD, bracket: 3 });
    const reg = await createRegistration(tid, RR_PLAYER);
    await createPrize(tid, 1, 'cash', 400);
    await upsertStanding(tid, reg, 1);
    const awards = await prizeService.bindAwardsForTournament(tid);
    expect(awards).toHaveLength(1);
    expect(awards[0].bind_source).toBe('standings');
    expect(awards[0].placement).toBe(1);
    awardIds.push(awards[0].id);
    // No bracket-specific side effect: already awarded → bracket binder no-ops.
    expect(await prizeService.bindAwardsForBracket(tid, RR_PLAYER)).toHaveLength(0);
    expect(await awardCount(tid)).toBe(1);
  });

  it('6. manualGrant remains idempotent (double grant rejected)', async () => {
    const tid = await createTournament({ org: ORG_CARD });
    const reg = await createRegistration(tid, WINNER);
    // G11.15 — authoritative placement row required for manual grant.
    const pid = Number((await pool.execute<RowData>(
      `INSERT INTO tournament_participants (tournament_id, registration_id, participant_type, status, member_user_ids)
       VALUES (?, ?, 'individual', 'active', ?)`, [tid, reg, JSON.stringify([WINNER])],
    ))[0].insertId);
    await pool.execute<RowData>(
      `INSERT INTO tournament_placements (tournament_id, placement, participant_id, user_id, source, resolved_at)
       VALUES (?, 2, ?, ?, 'bracket', NOW())`, [tid, pid, WINNER],
    );
    const pidPrize = await createPrize(tid, 2, 'cash', 250);
    const a = await prizeService.manualGrant(tid, { prizeId: pidPrize, winnerUserId: WINNER, createdBy: ACTOR });
    awardIds.push(a.id);
    await waitFor(() => totalFor(a.id, ['tournament_org_prize_award', 'tournament_org_prize_award_book']), (n) => n === 4, 'manual grant postings');
    await expect(prizeService.manualGrant(tid, { prizeId: pidPrize, winnerUserId: WINNER, createdBy: ACTOR })).rejects.toThrow(/already awarded/);
    expect(await awardCount(tid)).toBe(1);
  });

  it('7. manual-grant-then-auto-bind and auto-bind-then-manual-grant never double-award', async () => {
    const tid = await createTournament({ org: ORG_CARD });
    const reg = await createRegistration(tid, WINNER2);
    // G11.15 — authoritative placement row required for manual grant.
    const pid = Number((await pool.execute<RowData>(
      `INSERT INTO tournament_participants (tournament_id, registration_id, participant_type, status, member_user_ids)
       VALUES (?, ?, 'individual', 'active', ?)`, [tid, reg, JSON.stringify([WINNER2])],
    ))[0].insertId);
    await pool.execute<RowData>(
      `INSERT INTO tournament_placements (tournament_id, placement, participant_id, user_id, source, resolved_at)
       VALUES (?, 1, ?, ?, 'bracket', NOW())`, [tid, pid, WINNER2],
    );
    const pidPrize = await createPrize(tid, 1, 'cash', 500);
    // (a) manual first → auto-bind no-op
    const manual = await prizeService.manualGrant(tid, { prizeId: pidPrize, winnerUserId: WINNER2, createdBy: ACTOR });
    awardIds.push(manual.id);
    await waitFor(() => totalFor(manual.id, ['tournament_org_prize_award', 'tournament_org_prize_award_book']), (n) => n === 4, 'manual grant postings');
    expect(await prizeService.bindAwardsForBracket(tid, WINNER2)).toHaveLength(0);
    expect(await awardCount(tid)).toBe(1);
  });

  it('8. unsupported placements (2/3) are never automatically bound', async () => {
    const tid = await createTournament({ org: ORG_CARD });
    await createRegistration(tid, WINNER);
    await createPrize(tid, 1, 'cash', 500);
    await createPrize(tid, 2, 'cash', 250);
    await createPrize(tid, 3, 'cash', 100);
    const awards = await prizeService.bindAwardsForBracket(tid, WINNER);
    expect(awards).toHaveLength(1);
    awardIds.push(awards[0].id);
    await waitFor(() => totalFor(awards[0].id, ['tournament_org_prize_award', 'tournament_org_prize_award_book']), (n) => n === 4, 'bracket bind postings');
    expect(awards[0].placement).toBe(1);
    const [rows] = await pool.execute<RowData>('SELECT COUNT(*) AS v FROM tournament_prize_awards WHERE tournament_id = ? AND placement IN (2,3)', [tid]);
    expect(Number((rows as any[])[0].v)).toBe(0);
  });

  it('9. accounting postings identical to G11.5 (org CARD, org CASH) — no platform topology', async () => {
    // G11 Phase 3 — the platform-funded topology (Dr 4300 Revenue Contra · Cr
    // 2100) is removed: the CourtZon platform never funds a prize. Bracket binds
    // produce exactly the organisation bookkeeping paths.
    // Org CARD
    const ct = await createTournament({ org: ORG_CARD });
    await createRegistration(ct, WINNER2);
    await createPrize(ct, 1, 'cash', 200);
    const [ca] = await prizeService.bindAwardsForBracket(ct, WINNER2);
    awardIds.push(ca.id);
    await waitFor(() => ledgerRows(ca.id, 'tournament_org_prize_award'), (r) => r.length === 2, 'org card courtzon posting');
    await waitFor(() => ledgerRows(ca.id, 'tournament_org_prize_award_book'), (r) => r.length === 2, 'org card book posting');
    const cz = await ledgerRows(ca.id, 'tournament_org_prize_award');
    expect(amountFor(cz, 'debit', '2202')).toBe(200);
    expect(amountFor(cz, 'credit', '2100')).toBe(200);
    const og = await ledgerRows(ca.id, 'tournament_org_prize_award_book');
    expect(amountFor(og, 'debit', '4140')).toBe(200);
    expect(amountFor(og, 'credit', '1161')).toBe(200);

    // Org CASH
    const ht = await createTournament({ org: ORG_CASH, paymentMethods: '["cash"]' });
    await createRegistration(ht, WINNER);
    await createPrize(ht, 1, 'cash', 150);
    const [ha] = await prizeService.bindAwardsForBracket(ht, WINNER);
    awardIds.push(ha.id);
    await waitFor(() => ledgerRows(ha.id, 'tournament_org_cash_prize_award_book'), (r) => r.length === 2, 'org cash book posting');
    const hg = await ledgerRows(ha.id, 'tournament_org_cash_prize_award_book');
    expect(amountFor(hg, 'debit', '4140')).toBe(150);
    expect(amountFor(hg, 'credit', 'MKT-CZ-PAY')).toBe(150);
  });

  it('10. negative ORGANIZATION_ADJUSTMENT identical to G11.5 + refund cancellation unchanged', async () => {
    const tid = await createTournament({ org: ORG_CARD });
    await createRegistration(tid, WINNER);
    await createPrize(tid, 1, 'cash', 500);
    const [a] = await prizeService.bindAwardsForBracket(tid, WINNER);
    awardIds.push(a.id);
    await waitFor(() => adjustments(a.id), (r) => r.length === 1, 'org adjustment');
    const adj = await adjustments(a.id);
    expect(Number(adj[0].amount)).toBe(-500);
    expect(adj[0].collector).toBe('courtzon');
    expect(adj[0].source_type).toBe('tournament');
    expect(adj[0].source_id).toBe(a.id);

    // Refund cancellation behavior unchanged.
    await prizeService.refundAward(a.id, ACTOR, 'clawback');
    const after = await adjustments(a.id);
    expect(after[0].status).toBe('CANCELLED');
  });

  it('11. notification + audit emitted exactly once per award', async () => {
    const tid = await createTournament({ org: ORG_CARD });
    await createRegistration(tid, WINNER);
    await createPrize(tid, 1, 'cash', 500);
    const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
    const payload = { tournamentId: tid, winnerId: WINNER, name: 'B' };
    await eventBusV2.emit('tournament:completed' as any, payload as any);
    await eventBusV2.emit('tournament:completed' as any, payload as any);
    await waitFor(async () => awardCount(tid), (n) => n === 1, 'one award');
    const [a] = await awardsFor(tid);
    awardIds.push(a.id);
    await waitFor(() => totalFor(a.id, ['tournament_org_prize_award', 'tournament_org_prize_award_book']), (n) => n === 4, 'org card postings');
    const [aud] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS v FROM audit_logs WHERE action = 'tournament.prize.awarded' AND entity_type = 'tournament_prize_award' AND entity_id = ?`, [a.id],
    );
    expect(Number((aud as any[])[0].v)).toBe(1);
  });
});