import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3011';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { ensureOpenPlatformAccountingPeriod, dropCurrentPlatformAccountingPeriods } from './prize-period-fixture.js';
type RowData = RowDataPacket[];

/**
 * G11.15 — Placement-based prize payout (placements 1/2/3).
 *
 * tournament_placements is the AUTHORITATIVE payout identity. Verifies:
 *   placement 1 + 2 auto-bind; placement 3 auto-binds ONLY when an
 *   authoritative placement=3 row exists; missing/ambiguous placement → no
 *   payment; duplicate completion → one award per placement; manual grant
 *   placement-integrity (wrong player / missing placement rejected); withdrawn/
 *   disqualified/waiting/refunded registrations rejected; team-identity
 *   mismatch fails closed; placement-2/3 refund/clawback; wallet/entitlement/
 *   GL idempotency; and that rejected paths create ZERO wallet/entitlement/
 *   ledger rows (zero-GL dry-run semantics).
 */

const ORG = 2670001;
const ACTOR = 2670029;
const W1 = 2670021;
const W2 = 2670022;
const W3 = 2670023;
const WRONG = 2670024;
const M1 = 2670025;
const M2 = 2670026;
const PLAN = 2670090;

let pool: mysql.Pool;
const tournamentIds: number[] = [];
const regIds: number[] = [];
const prizeIds: number[] = [];
const awardIds: number[] = [];

const exec = (sql: string, params: any[] = []) => pool.execute(sql, params);

async function mkUser(id: number) {
  await pool.execute(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'G11.15 User', 'male', 'active')`,
    [id, `019${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, `g1115-${id}@test.com`],
  );
  await pool.execute(
    `INSERT IGNORE INTO user_wallets (user_id, balance, reserved_balance, currency_code, is_locked, version)
     VALUES (?, 0, 0, 'EGP', 0, 1)`, [id],
  );
}

async function createTournament(status = 'completed'): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournaments
       (public_id, creator_id, organisation_id, bracket_type_id, format, name, max_participants,
        min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type,
        commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, 1, 'knockout', 'G11.15 Bracket', 8, 2, 0, 0, 'EGP', 'FREE', 'community',
        0, ?, 1, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
    [ACTOR, ORG, status],
  );
  const tid = Number((res as any).insertId);
  tournamentIds.push(tid);
  await pool.execute(
    `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, currency_code, is_default)
     VALUES (UUID(), ?, 'singles', 'Default', 'EGP', 1)`, [tid]);
  return tid;
}

async function createRegistration(tid: number, userId: number, status = 'confirmed', payment = 'paid'): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status)
     VALUES (?, ?, ?, ?)`, [tid, userId, payment, status]);
  const rid = Number((res as any).insertId);
  regIds.push(rid);
  return rid;
}

async function createParticipant(tid: number, regId: number | null, type: string, memberUserIds: number[]): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournament_participants (tournament_id, registration_id, participant_type, status, member_user_ids)
     VALUES (?, ?, ?, 'active', ?)`, [tid, regId, type, JSON.stringify(memberUserIds)]);
  return Number((res as any).insertId);
}

/** Seed one authoritative placement (individual participant helper). */
async function addPlacement(tid: number, placement: number, participantId: number, userId: number) {
  await pool.execute<RowData>(
    `INSERT INTO tournament_placements (tournament_id, placement, participant_id, user_id, source, resolved_at)
     VALUES (?, ?, ?, ?, 'bracket', NOW())`, [tid, placement, participantId, userId]);
}

/** Seed an individual placed participant + registration + placement row in one step. */
async function placeIndividual(tid: number, placement: number, userId: number, status = 'confirmed', payment = 'paid') {
  const reg = await createRegistration(tid, userId, status, payment);
  const pid = await createParticipant(tid, reg, 'individual', [userId]);
  await addPlacement(tid, placement, pid, userId);
  return { reg, pid };
}

async function createPrize(tid: number, placement: number | null, prizeType: string, amount: number | null): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournament_prizes (tournament_id, placement, prize_type, description, amount, currency_code, display_order)
     VALUES (?, ?, ?, 'Prize', ?, 'EGP', 0)`, [tid, placement, prizeType, amount]);
  const pid = Number((res as any).insertId);
  prizeIds.push(pid);
  return pid;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(probe: () => Promise<T>, isReady: (value: T) => boolean, what: string, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let v = await probe();
  while (!isReady(v)) {
    if (Date.now() >= deadline) throw new Error(`Timeout waiting for: ${what} — last ${JSON.stringify(v)}`);
    await sleep(100);
    v = await probe();
  }
  return v;
}

async function awardRows(tid: number): Promise<any[]> {
  return (await pool.execute<RowData>('SELECT * FROM tournament_prize_awards WHERE tournament_id = ? ORDER BY placement', [tid]))[0] as any[];
}
async function walletTxn(tid: number, type: string): Promise<any[]> {
  return (await pool.execute<RowData>(
    `SELECT wt.* FROM wallet_transactions wt JOIN tournament_prize_awards a ON a.id = wt.reference_id
     WHERE a.tournament_id = ? AND wt.reference_type = ? ORDER BY wt.id`, [tid, type]))[0] as any[];
}
async function entitlementsForAwards(tid: number): Promise<any[]> {
  return (await pool.execute<RowData>(
    `SELECT fe.* FROM financial_entitlements fe JOIN tournament_prize_awards a ON a.id = fe.source_id
     WHERE a.tournament_id = ? AND fe.entitlement_type = 'ORGANIZATION_ADJUSTMENT' ORDER BY fe.id`, [tid]))[0] as any[];
}
async function ledgerForAwards(tid: number): Promise<any[]> {
  return (await pool.execute<RowData>(
    `SELECT le.* FROM ledger_entries le JOIN tournament_prize_awards a ON a.id = le.source_id
     WHERE a.tournament_id = ? AND le.source_type = 'tournament' ORDER BY le.id`, [tid]))[0] as any[];
}
async function countRows(tid: number): Promise<{ awards: number; wallet: number; entitlements: number; ledger: number }> {
  const [a] = await pool.execute<RowData>('SELECT COUNT(*) c FROM tournament_prize_awards WHERE tournament_id = ?', [tid]);
  const [w] = await pool.execute<RowData>(
    `SELECT COUNT(*) c FROM wallet_transactions wt JOIN tournament_prize_awards a ON a.id = wt.reference_id WHERE a.tournament_id = ?`, [tid]);
  const [e] = await pool.execute<RowData>(
    `SELECT COUNT(*) c FROM financial_entitlements fe JOIN tournament_prize_awards a ON a.id = fe.source_id WHERE a.tournament_id = ?`, [tid]);
  const [l] = await pool.execute<RowData>(
    `SELECT COUNT(*) c FROM ledger_entries le JOIN tournament_prize_awards a ON a.id = le.source_id WHERE a.tournament_id = ?`, [tid]);
  return { awards: Number((a as any[])[0].c), wallet: Number((w as any[])[0].c), entitlements: Number((e as any[])[0].c), ledger: Number((l as any[])[0].c) };
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });
  await ensureOpenPlatformAccountingPeriod(pool as any);
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  const { registerAccountingEventListeners } = await import('../../financial/application/accounting-event.listener.js');
  registerAccountingEventListeners();
  const { registerTournamentPrizeListeners } = await import('../application/tournament-prize-award.listener.js');
  registerTournamentPrizeListeners();
  await seedBase();
}, 120000);

afterAll(async () => {
  await cleanup();
  await dropCurrentPlatformAccountingPeriods(pool as any);
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 120000);

async function seedBase() {
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG}, UUID(), ?, 1, 'G11.15 Org', 'g1115-org', 1)`, [otId]);
  await pool.execute(`INSERT INTO subscription_plans (id, plan_name, price_monthly, is_active, is_internal, sort_order) VALUES (?, 'G11.15 Plan', 0, 1, 1, 0)`, [PLAN]);
  await pool.execute(`INSERT INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES (?, 'tournament', 'percentage', ?)`, [PLAN, 10]);
  await pool.execute(
    `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, start_date, end_date, subscription_status, auto_renew)
     VALUES (?, ?, 'monthly', '2020-01-01', '2099-01-01', 'active', 0)`, [ORG, PLAN]);
  for (const id of [ACTOR, W1, W2, W3, WRONG, M1, M2]) await mkUser(id);
  const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
  await accountingEngineService.provisionOrganisationMarketplaceAccounts(ORG);
}

beforeEach(async () => {
  await cleanup();
  await seedBase();
});
afterEach(() => vi.clearAllMocks());

async function cleanup() {
  if (!pool) return;
  const idList = tournamentIds.length ? tournamentIds.join(',') : '0';
  const pidList = prizeIds.length ? prizeIds.join(',') : '0';
  const regList = regIds.length ? regIds.join(',') : '0';
  await pool.execute(`SET FOREIGN_KEY_CHECKS = 0`);
  await pool.execute(`DELETE FROM financial_entitlements WHERE organisation_id = ${ORG}`);
  await pool.execute(`DELETE FROM tournament_prize_awards WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM user_wallets WHERE user_id IN (${ACTOR}, ${W1}, ${W2}, ${W3}, ${WRONG}, ${M1}, ${M2}))`);
  await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ${ORG}`);
  await pool.execute(`DELETE FROM tournament_placements WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE tournament_id IN (${idList}) OR id IN (${regList})`);
  await pool.execute(`DELETE FROM tournament_prizes WHERE tournament_id IN (${idList}) OR id IN (${pidList})`);
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ${ORG} OR account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id = ${ORG})`);
  await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id = ${ORG})`);
  await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id = ${ORG}`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${idList})`);
  await pool.execute(`DELETE FROM user_wallets WHERE user_id IN (${ACTOR}, ${W1}, ${W2}, ${W3}, ${WRONG}, ${M1}, ${M2})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${ACTOR}, ${W1}, ${W2}, ${W3}, ${WRONG}, ${M1}, ${M2})`);
  await pool.execute(`DELETE FROM organisation_subscriptions WHERE organisation_id = ${ORG}`);
  await pool.execute(`DELETE FROM subscription_plan_rates WHERE plan_id = ${PLAN}`);
  await pool.execute(`DELETE FROM subscription_plans WHERE id = ${PLAN}`);
  await pool.execute(`DELETE FROM organisations WHERE id = ${ORG}`);
  await pool.execute(`SET FOREIGN_KEY_CHECKS = 1`);
  tournamentIds.length = 0; regIds.length = 0; prizeIds.length = 0; awardIds.length = 0;
}

describe('G11.15 placement-based prize payout', () => {
  it('1. placements bind placement 1 + 2 automatically; missing placement 3 → not paid', async () => {
    const tid = await createTournament();
    await placeIndividual(tid, 1, W1);
    await placeIndividual(tid, 2, W2);
    await createPrize(tid, 1, 'cash', 500);
    await createPrize(tid, 2, 'cash', 250);
    await createPrize(tid, 3, 'cash', 100); // configured but NO placement-3 row

    const { tournamentPrizeAwardService } = await import('../application/tournament-prize-award.service.js');
    const awards = await tournamentPrizeAwardService.bindAwardsForBracket(tid, W1);
    await waitFor(() => countRows(tid), (c) => c.awards === 2, 'two awards');
    expect(awards.map((a: any) => a.placement).sort()).toEqual([1, 2]);
    const rows = await awardRows(tid);
    expect(rows.map((a: any) => a.placement).sort()).toEqual([1, 2]);
    expect(rows.find((a: any) => a.placement === 3)).toBeUndefined();
  });

  it('2. placement 3 auto-binds ONLY when an authoritative placement=3 row exists', async () => {
    const tid = await createTournament();
    await placeIndividual(tid, 1, W1);
    await placeIndividual(tid, 2, W2);
    await placeIndividual(tid, 3, W3);
    await createPrize(tid, 1, 'cash', 500);
    await createPrize(tid, 2, 'cash', 250);
    await createPrize(tid, 3, 'cash', 100);

    const { tournamentPrizeAwardService } = await import('../application/tournament-prize-award.service.js');
    await tournamentPrizeAwardService.bindAwardsForBracket(tid, W1);
    await waitFor(() => countRows(tid), (c) => c.awards === 3, 'three awards');
    const rows = await awardRows(tid);
    expect(rows.map((a: any) => a.placement).sort()).toEqual([1, 2, 3]);
    const p3 = rows.find((a: any) => a.placement === 3);
    expect(p3.winner_user_id).toBe(W3);
  });

  it('3. missing placement 2 → placement 2 is NOT paid', async () => {
    const tid = await createTournament();
    await placeIndividual(tid, 1, W1);
    await createPrize(tid, 1, 'cash', 500);
    await createPrize(tid, 2, 'cash', 250);

    const { tournamentPrizeAwardService } = await import('../application/tournament-prize-award.service.js');
    await tournamentPrizeAwardService.bindAwardsForBracket(tid, W1);
    await waitFor(() => countRows(tid), (c) => c.awards === 1, 'one award');
    const rows = await awardRows(tid);
    expect(rows.map((a: any) => a.placement)).toEqual([1]);
  });

  it('4. champion fallback when placements table empty → only placement 1 (2/3 never paid, no guess)', async () => {
    const tid = await createTournament();
    const reg = await createRegistration(tid, W1);
    await createParticipant(tid, reg, 'individual', [W1]);
    await createPrize(tid, 1, 'cash', 500);
    await createPrize(tid, 2, 'cash', 250);
    await createPrize(tid, 3, 'cash', 100);

    const { tournamentPrizeAwardService } = await import('../application/tournament-prize-award.service.js');
    const awards = await tournamentPrizeAwardService.bindAwardsForBracket(tid, W1);
    await waitFor(() => countRows(tid), (c) => c.awards === 1, 'one award');
    expect(awards.map((a: any) => a.placement)).toEqual([1]);
  });

  it('5. duplicate completion / duplicate bind → exactly ONE award per placement', async () => {
    const tid = await createTournament();
    await placeIndividual(tid, 1, W1);
    await placeIndividual(tid, 2, W2);
    await createPrize(tid, 1, 'cash', 500);
    await createPrize(tid, 2, 'cash', 250);

    const { tournamentPrizeAwardService } = await import('../application/tournament-prize-award.service.js');
    await tournamentPrizeAwardService.bindAwardsForBracket(tid, W1);
    await tournamentPrizeAwardService.bindAwardsForBracket(tid, W1);
    await waitFor(() => countRows(tid), (c) => c.awards === 2 && c.wallet === 2 && c.entitlements === 2, 'idempotent second bind');
    const rows = await awardRows(tid);
    expect(rows).toHaveLength(2);
    // Wait for the tournament-scoped prize ledger (2 awards × 4 lines) directly.
    await waitFor(async () => (await ledgerForAwards(tid)).length, (n) => n >= 8, 'tournament prize ledger (2 awards × 4 lines)');
    // Exactly one wallet credit + one adjustment per award.
    const w = await walletTxn(tid, 'tournament_prize');
    expect(w).toHaveLength(2);
    const e = await entitlementsForAwards(tid);
    expect(e).toHaveLength(2);
    const ledgerRowsA = await ledgerForAwards(tid);
    const byEvent = new Map<string, number>();
    for (const l of ledgerRowsA as any[]) byEvent.set(l.event_type, (byEvent.get(l.event_type) ?? 0) + 1);
    // 2 awards → the CourtZon-book and org-book events each post 2 lines/award.
    expect(byEvent.get('tournament_org_prize_award')).toBe(4);
    expect(byEvent.get('tournament_org_prize_award_book')).toBe(4);
  });

  it('6. manual grant: wrong player rejected (placement integrity)', async () => {
    const tid = await createTournament();
    await placeIndividual(tid, 2, W2);
    await createPrize(tid, 2, 'cash', 250);
    const { tournamentPrizeAwardService } = await import('../application/tournament-prize-award.service.js');
    const pid = Number(((await pool.execute<RowData>('SELECT id FROM tournament_prizes WHERE tournament_id=?', [tid]))[0] as any[])[0].id);
    await expect(
      tournamentPrizeAwardService.manualGrant(tid, { prizeId: pid, winnerUserId: WRONG, createdBy: ACTOR }),
    ).rejects.toMatchObject({ code: 'TOURNAMENT_PLACEMENT_MISMATCH' });
  });

  it('7. manual grant: missing authoritative placement rejected', async () => {
    const tid = await createTournament();
    await placeIndividual(tid, 1, W1);
    await createPrize(tid, 3, 'cash', 100); // prize for placement 3, but no placement-3 row
    const { tournamentPrizeAwardService } = await import('../application/tournament-prize-award.service.js');
    const pid = Number(((await pool.execute<RowData>('SELECT id FROM tournament_prizes WHERE tournament_id=?', [tid]))[0] as any[])[0].id);
    await expect(
      tournamentPrizeAwardService.manualGrant(tid, { prizeId: pid, winnerUserId: W1, createdBy: ACTOR }),
    ).rejects.toMatchObject({ code: 'TOURNAMENT_PLACEMENT_MISSING' });
  });

  for (const [label, status, payment] of [
    ['8. withdrawn registration', 'withdrawn', 'paid'],
    ['9. disqualified registration', 'disqualified', 'paid'],
    ['10. waiting registration', 'waiting', 'paid'],
    ['11. refunded payment', 'confirmed', 'refunded'],
  ] as const) {
    it(`${label} → placement not auto-paid; manual grant rejected`, async () => {
      const tid = await createTournament();
      await placeIndividual(tid, 1, W1);
      await placeIndividual(tid, 2, W2, status, payment);
      await createPrize(tid, 1, 'cash', 500);
      await createPrize(tid, 2, 'cash', 250);

      const { tournamentPrizeAwardService } = await import('../application/tournament-prize-award.service.js');
      await tournamentPrizeAwardService.bindAwardsForBracket(tid, W1);
      await waitFor(() => countRows(tid), (c) => c.awards === 1, 'only placement 1 paid');
      const rows = await awardRows(tid);
      expect(rows.map((a: any) => a.placement)).toEqual([1]);

      const pid = Number((await pool.execute<RowData>('SELECT id FROM tournament_prizes WHERE tournament_id=? AND placement=2', [tid]))[0][0].id);
      await expect(
        tournamentPrizeAwardService.manualGrant(tid, { prizeId: pid, winnerUserId: W2, createdBy: ACTOR }),
      ).rejects.toMatchObject({ code: 'TOURNAMENT_REGISTRATION_NOT_ELIGIBLE' });
    });
  }

  it('12. placement 2/3 refund/clawback (FULL-ONLY, existing refundAward)', async () => {
    const tid = await createTournament();
    await placeIndividual(tid, 1, W1);
    await placeIndividual(tid, 2, W2);
    await createPrize(tid, 1, 'cash', 500);
    await createPrize(tid, 2, 'cash', 250);

    const { tournamentPrizeAwardService } = await import('../application/tournament-prize-award.service.js');
    await tournamentPrizeAwardService.bindAwardsForBracket(tid, W1);
    await waitFor(() => countRows(tid), (c) => c.awards === 2, 'two awards');
    const rows = await awardRows(tid);
    const p2 = rows.find((a: any) => a.placement === 2);
    const refunded = await tournamentPrizeAwardService.refundAward(p2.id, ACTOR, 'G11.15 test clawback');
    expect(refunded.status).toBe('refunded');
    await waitFor(() => walletTxn(tid, 'tournament_prize_refund'), (w) => w.length === 1, 'refund wallet txn');
    // Org adjustment for the refunded award is CANCELLED.
    const ents = await entitlementsForAwards(tid);
    const cancelled = ents.filter((e: any) => Number(e.source_id) === Number(p2.id));
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].status).toBe('CANCELLED');
    // Accounting reversal posted for the refunded award (async listener drained).
    await waitFor(
      async () => (await ledgerForAwards(tid)).filter((x: any) => x.event_type === 'tournament_org_prize_refund' || x.event_type === 'tournament_org_prize_refund_book').length,
      (n) => n >= 2, 'refund ledger postings',
    );
    const l = await ledgerForAwards(tid);
    expect(l.some((x: any) => x.event_type === 'tournament_org_prize_refund' || x.event_type === 'tournament_org_prize_refund_book')).toBe(true);
  });

  it('13. wallet/entitlement/GL idempotency holds per placement (verified in #5) — sanity: single credit per award', async () => {
    const tid = await createTournament();
    await placeIndividual(tid, 1, W1);
    await placeIndividual(tid, 2, W2);
    await createPrize(tid, 1, 'cash', 500);
    await createPrize(tid, 2, 'cash', 250);
    const { tournamentPrizeAwardService } = await import('../application/tournament-prize-award.service.js');
    await tournamentPrizeAwardService.bindAwardsForBracket(tid, W1);
    await waitFor(() => countRows(tid), (c) => c.awards === 2, 'two awards');
    const w = await walletTxn(tid, 'tournament_prize');
    expect(new Set(w.map((x: any) => x.reference_id)).size).toBe(2); // one credit per award
  });

  it('14. team identity mismatch fails closed (payee with no provable eligible registration)', async () => {
    const tid = await createTournament();
    await placeIndividual(tid, 1, W1);
    // Pair participant: primary member M2 is placed, but only M1 holds a
    // registration (registrant/captain = M1). M2 has NO registration → the
    // mapping cannot be proven → placement 2 is NOT paid.
    const regM1 = await createRegistration(tid, M1);
    const pairPid = await createParticipant(tid, regM1, 'pair', [M1, M2]);
    await addPlacement(tid, 2, pairPid, M2);
    await createPrize(tid, 1, 'cash', 500);
    await createPrize(tid, 2, 'cash', 250);
    const { tournamentPrizeAwardService } = await import('../application/tournament-prize-award.service.js');
    await tournamentPrizeAwardService.bindAwardsForBracket(tid, W1);
    await waitFor(() => countRows(tid), (c) => c.awards === 1, 'only placement 1 paid; team placement refused');
  });

  it('15. rejected paths create ZERO wallet/entitlement/ledger (zero-GL dry-run semantics)', async () => {
    const tid = await createTournament();
    await placeIndividual(tid, 2, W2, 'withdrawn', 'paid');
    await createPrize(tid, 2, 'cash', 250);
    const { tournamentPrizeAwardService } = await import('../application/tournament-prize-award.service.js');
    await tournamentPrizeAwardService.bindAwardsForBracket(tid, W2);
    const c = await countRows(tid);
    expect(c).toEqual({ awards: 0, wallet: 0, entitlements: 0, ledger: 0 });
  });

  it('16. service rejects duplicate CASH prize per placement (API validation, TOURNAMENT_INVALID_PRIZE)', async () => {
    const tid = await createTournament();
    const { tournamentService } = await import('../application/tournament.service.js');
    await expect(
      tournamentService.update(tid, {
        prizes: [
          { placement: 2, prize_type: 'cash', amount: 100, currency_code: 'EGP' },
          { placement: 2, prize_type: 'cash', amount: 200, currency_code: 'EGP' },
        ],
      } as any),
    ).rejects.toMatchObject({ code: 'TOURNAMENT_INVALID_PRIZE' });
    const [pr] = await pool.execute<RowData>('SELECT COUNT(*) c FROM tournament_prizes WHERE tournament_id = ?', [tid]);
    expect(Number((pr as any[])[0].c)).toBe(0); // nothing persisted
  });
});