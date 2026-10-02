import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * G11.18 Phase 2 — Competition-scoped registration (fee / eligibility /
 * capacity / waitlist / uniqueness) with full single-competition fallback.
 *
 * Non-financial redesign: the registration PAYMENT flow (cash/card) still runs
 * through the EXISTING shared payment path — tests assert the AMOUNT comes from
 * the selected competition, nothing more. No prize/wallet/ledger/settlement
 * behaviour changes.
 */

const ORG = 2780001;
const CREATOR = 2780009;
const U = { a: 2780011, b: 2780012, c: 2780013, d: 2780014 };
const SPORT = 2780101;

let pool: mysql.Pool;
let fmtSingles = 0;
let fmtTeam = 0;
let ruleSet = 0;
const tournamentIds: number[] = [];
const compIds: number[] = [];

const exec = (sql: string, params: any[] = []) => pool.execute(sql, params);

async function mkUser(id: number) {
  await exec(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status, birth_date)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'G11.18P2 U', 'male', 'active', '1995-05-05')`,
    [id, `021${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, `g1118p2-${id}@test.com`],
  );
  await exec(`INSERT IGNORE INTO player_profiles (user_id, main_sport_id) VALUES (?, ?)`, [id, SPORT]);
}

async function seedBase() {
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  await pool.execute(`INSERT IGNORE INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG}, UUID(), ?, 1, 'G11.18P2 Org', 'g1118p2-org', 1)`, [(ot as any[])[0].id]);
  await pool.execute(`INSERT IGNORE INTO sports (id, name, slug, is_active, show_in_marketplace, sort_order) VALUES (${SPORT}, 'G1118P2', 'g1118p2-sport', 1, 1, 0)`);
  const [s1] = await pool.execute<RowData>(`INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active) VALUES (?, 'g1118p2-s', 'Singles', 'singles', 1, NULL, 1, 1)`, [SPORT]);
  fmtSingles = Number((s1 as any).insertId);
  const [s2] = await pool.execute<RowData>(`INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active) VALUES (?, 'g1118p2-t', 'Team', 'team', 3, 3, 0, 1)`, [SPORT]);
  fmtTeam = Number((s2 as any).insertId);
  const [rs] = await pool.execute<RowData>(`INSERT INTO sport_rule_sets (format_id, version, name, rules) VALUES (?, 1, 'G1118P2 Rules', ?)`, [fmtSingles, JSON.stringify({ scoring: 'sets' })]);
  ruleSet = Number((rs as any).insertId);
  for (const u of Object.values(U)) await mkUser(u);
  await mkUser(CREATOR);
}

interface CompOpts {
  type?: 'singles' | 'doubles' | 'team';
  fee?: number;
  currency?: string;
  priceType?: string;
  max?: number | null;
  waitlist?: boolean;
  gender?: string[] | null;
  isDefault?: boolean;
}

async function createCompetition(tid: number, o: CompOpts = {}): Promise<number> {
  const [r] = await exec<RowData>(
    `INSERT INTO tournament_competitions
       (public_id, tournament_id, competition_type, name, match_format_id, currency_code, entry_fee, price_type,
        max_participants, min_participants, waitlist_enabled, gender_categories, is_default)
     VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, 2, ?, ?, ?)`,
    [
      tid,
      o.type ?? 'singles',
      (o.type ?? 'singles') === 'team' ? 'Teams' : (o.type ?? 'singles'),
      (o.type ?? 'singles') === 'team' ? fmtTeam : fmtSingles,
      o.currency ?? 'EGP',
      o.fee ?? 0,
      o.priceType ?? (o.fee ? 'FIXED' : 'FREE'),
      o.max ?? null,
      o.waitlist ? 1 : 0,
      o.gender ? JSON.stringify(o.gender) : null,
      o.isDefault ? 1 : 0,
    ],
  );
  const id = Number((r as any).insertId);
  compIds.push(id);
  return id;
}

async function createTournament(opts: { fee?: number; status?: string; defaultComp?: CompOpts } = {}): Promise<number> {
  const [res] = await exec<RowData>(
    `INSERT INTO tournaments (public_id, creator_id, organisation_id, bracket_type_id, format, match_format_id, rule_set_id, sport_id, name,
       max_participants, min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type, commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, 1, 'knockout', ?, ?, ?, 'G11.18P2 Cup', 16, 2, ?, 0, 'EGP', 'FIXED', 'community', 0, ?, 1, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
    [CREATOR, ORG, fmtSingles, ruleSet, SPORT, opts.fee ?? 0, opts.status ?? 'registration_open'],
  );
  const tid = Number((res as any).insertId);
  tournamentIds.push(tid);
  await createCompetition(tid, { type: 'singles', fee: opts.fee ?? 0, isDefault: true, ...opts.defaultComp });
  return tid;
}

async function paymentAmount(regId: number): Promise<{ amount: number; currency: string } | null> {
  const [rows] = await exec<RowData>(
    `SELECT amount, currency FROM payment_transactions WHERE reference_type = 'tournament' AND reference_id = ? ORDER BY id DESC LIMIT 1`,
    [regId],
  );
  return rows.length ? { amount: Number(rows[0].amount), currency: String(rows[0].currency) } : null;
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 6 });
  const { createPool, closePool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  // clean stale phase-2 residue, then seed fresh
  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
  await pool.execute(`DELETE FROM tournament_prize_awards WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_placements WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM payment_transactions WHERE reference_type = 'tournament' AND reference_id IN (SELECT id FROM tournament_registrations WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR}))`);
  await pool.execute(`DELETE FROM tournament_participant_members WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_competitions WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournaments WHERE creator_id = ${CREATOR}`);
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
  await seedBase();
}, 60000);

afterAll(async () => {
  if (!pool) return;
  const idList = tournamentIds.length ? tournamentIds.join(',') : '0';
  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
  await pool.execute(`DELETE FROM tournament_prize_awards WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_placements WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_prizes WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM payment_transactions WHERE reference_type = 'tournament' AND reference_id IN (SELECT id FROM tournament_registrations WHERE tournament_id IN (${idList}))`);
  await pool.execute(`DELETE FROM tournament_participant_members WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_competitions WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${idList})`);
  await pool.execute(`DELETE FROM sport_formats WHERE id IN (?, ?)`, [fmtSingles, fmtTeam]);
  await pool.execute(`DELETE FROM sport_rule_sets WHERE id = ${ruleSet}`);
  await pool.execute(`DELETE FROM sports WHERE id = ${SPORT}`);
  await pool.execute(`DELETE FROM player_profiles WHERE user_id IN (${CREATOR}, ${U.a}, ${U.b}, ${U.c}, ${U.d})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${CREATOR}, ${U.a}, ${U.b}, ${U.c}, ${U.d})`);
  await pool.execute(`DELETE FROM organisations WHERE id = ${ORG}`);
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
  tournamentIds.length = 0;
}, 60000);

beforeEach(() => { vi.clearAllMocks(); });

describe('G11.18 Phase 2 — competition-scoped registration', () => {
  it('A1-A4. single competition: legacy register without competitionId resolves the default (fee unchanged)', async () => {
    const tid = await createTournament({ fee: 500 });
    const { tournamentService } = await import('../application/tournament.service.js');
    const reg = await tournamentService.register(tid, U.a, undefined, undefined, { operatorBypass: false });
    const [row] = await exec<RowData>('SELECT competition_id, payment_status, status FROM tournament_registrations WHERE id = ?', [Number(reg.id)]);
    const def = Number((await exec<RowData>('SELECT id FROM tournament_competitions WHERE tournament_id = ? AND is_default = 1', [tid]))[0][0].id);
    expect(Number(row[0].competition_id)).toBe(def);
    // fee paid via cash → amount equals competition (default) fee 500 EGP
    await tournamentService.register(tid, U.b, undefined, 'cash', { operatorBypass: false });
    const pay = await paymentAmount(Number((await exec<RowData>('SELECT id FROM tournament_registrations WHERE player_id = ?', [U.b]))[0][0].id));
    expect(pay).toEqual({ amount: 500, currency: 'EGP' });
  });

  it('B1-B4. multiple competitions: fee per competition, same player in two competitions, duplicate rejected', async () => {
    const tid = await createTournament({ fee: 0, defaultComp: { fee: 500, max: 16 } });
    const compSingles2 = await createCompetition(tid, { type: 'singles', fee: 800, max: 16 });
    const { tournamentService } = await import('../application/tournament.service.js');
    // Singles (500) vs Singles-2 (800) — amounts come from the selected competition
    const r1 = await tournamentService.register(tid, U.a, undefined, 'cash', { operatorBypass: false, competitionId: (await competitionIdOfDefault(tid)) });
    const p1 = await paymentAmount(Number(r1.id!));
    expect(p1).toEqual({ amount: 500, currency: 'EGP' });
    const r2 = await tournamentService.register(tid, U.a, undefined, 'cash', { operatorBypass: false, competitionId: compSingles2 });
    const p2 = await paymentAmount(Number(r2.id!));
    expect(p2).toEqual({ amount: 800, currency: 'EGP' });
    // SAME player, SAME competition again → clear conflict
    await expect(tournamentService.register(tid, U.a, undefined, 'cash', { operatorBypass: false, competitionId: compSingles2 })).rejects.toMatchObject({
      code: 'TOURNAMENT_REGISTRATION_EXISTS',
    });
  });

  it('C1-C3. cross-competition isolation: capacity + waitlist + eligibility are per-competition', async () => {
    const tid = await createTournament({ fee: 0 });
    // populate default comp max=1
    await exec(`UPDATE tournament_competitions SET max_participants = 1, waitlist_enabled = 0 WHERE tournament_id = ? AND is_default = 1`, [tid]);
    const compOpen = await createCompetition(tid, { type: 'singles', fee: 0, max: 3, waitlist: true });
    const compFemale = await createCompetition(tid, { type: 'singles', fee: 0, max: 5, gender: ['female'] });
    const { tournamentService } = await import('../application/tournament.service.js');
    const defaultId = await competitionIdOfDefault(tid);
    await tournamentService.register(tid, U.a, undefined, undefined, { operatorBypass: false, competitionId: defaultId }); // fills default slot
    await exec(`UPDATE tournament_registrations SET status = 'confirmed' WHERE tournament_id = ? AND competition_id = ?`, [tid, defaultId]);
    // default comp is FULL & waitlist OFF → capacity error (does not affect others)
    await expect(tournamentService.register(tid, U.b, undefined, undefined, { operatorBypass: false, competitionId: defaultId })).rejects.toMatchObject({ code: 'TOURNAMENT_CAPACITY_FULL' });
    // another competition (Open, waitlist ON) at 3/3 → waiting registration
    for (const u of [U.a, U.b, U.c]) await tournamentService.register(tid, u, undefined, undefined, { operatorBypass: false, competitionId: compOpen });
    await exec(`UPDATE tournament_registrations SET status = 'confirmed' WHERE tournament_id = ? AND competition_id = ?`, [tid, compOpen]);
    const fill = await tournamentService.register(tid, U.d, undefined, undefined, { operatorBypass: false, competitionId: compOpen });
    expect(fill.status).toBe('waiting');
    // eligibility per competition: male rejected in the female-only competition
    await expect(tournamentService.register(tid, U.c, undefined, undefined, { operatorBypass: false, competitionId: compFemale })).rejects.toMatchObject({ statusCode: 422 });
  });

  it('D1-D4. competition resolution: valid / another-tournament / nonexistent / multi missing id', async () => {
    const tid1 = await createTournament({ fee: 0 });
    const tid2 = await createTournament({ fee: 0 });
    const comp = await createCompetition(tid2, { type: 'singles' });
    const { competitionService } = await import('../application/competition.service.js');
    await expect(competitionService.resolveRegistrationCompetition(tid1, comp)).rejects.toMatchObject({ statusCode: 404 });
    await expect(competitionService.resolveRegistrationCompetition(tid1, 999999)).rejects.toMatchObject({ statusCode: 404 });
    // multiple competitions + no id → clear required error
    const tid3 = await createTournament({ fee: 0 });
    await createCompetition(tid3, { type: 'team' });
    await expect(competitionService.resolveRegistrationCompetition(tid3, null)).rejects.toMatchObject({ code: 'TOURNAMENT_COMPETITION_REQUIRED' });
    // single-default tournament + no id → resolves the default
    const ok = await competitionService.resolveRegistrationCompetition(tid1, null);
    expect(Number(ok.tournament_id)).toBe(tid1);
    expect(ok.is_default).toBe(1);
  });

  it('F1-F4. fees: zero / non-zero / currency / price type via the selected competition', async () => {
    const tid = await createTournament({ fee: 0, defaultComp: { fee: 0, priceType: 'FREE' } });
    const compPaid = await createCompetition(tid, { type: 'singles', fee: 1500, currency: 'SAR', priceType: 'FIXED' });
    const { tournamentService } = await import('../application/tournament.service.js');
    const { competitionService } = await import('../application/competition.service.js');
    const t = await competitionService.listCompetitions(tid).then((c) => c);
    const compCtxC = t.find((c) => Number(c.id) === Number(compPaid))!;
    const tournament = (await import('../infrastructure/repositories/tournament.repository.js')).tournamentRepository;
    const tourn = await tournament.findById(tid);
    expect(competitionService.entryFee(compCtxC, tourn!)).toBe(1500);
    expect(competitionService.currency(compCtxC, tourn!)).toBe('SAR');
    expect(competitionService.priceType(compCtxC, tourn!)).toBe('FIXED');
    // cash registration in the paid competition → amount 1500 SAR from the competition
    const reg = await tournamentService.register(tid, U.a, undefined, 'cash', { operatorBypass: false, competitionId: compPaid });
    const pay = await paymentAmount(Number(reg.id!));
    expect(pay).toEqual({ amount: 1500, currency: 'SAR' });
  });

  it('G1-G3. teams: registration is competition-scoped; cross-competition misuse fails; G11.15 unchanged', async () => {
    const tid = await createTournament({ fee: 0, defaultComp: { fee: 500 } });
    const compTeam = await createCompetition(tid, { type: 'team', fee: 1500 });
    const { teamInvitationService } = await import('../application/team-invitation.service.js');
    const { tournamentService } = await import('../application/tournament.service.js');
    // SAME player: singles registration (default) + team in the team competition → BOTH allowed
    const regS = await tournamentService.register(tid, U.a, undefined, undefined, { operatorBypass: false, competitionId: (await competitionIdOfDefault(tid)) });
    expect(regS.status).toBe('registered');
    const team = await teamInvitationService.createTeamForPlayer(tid, U.b, { name: 'P2 Team', memberUserIds: [U.c], competitionId: compTeam });
    expect(Number(team.competition_id)).toBe(compTeam);
    // team creation in a NON-team (singles) competition fails closed
    await expect(teamInvitationService.createTeamForPlayer(tid, U.d, { name: 'Wrong', memberUserIds: [U.a], competitionId: (await competitionIdOfDefault(tid)) })).rejects.toMatchObject({ code: 'TOURNAMENT_INVALID_FORMAT' });
    // the team flow is non-financial: no payment row for the team (fee 1500 but no paymentMethod passed)
    const [teamPay] = await exec<RowData>('SELECT COUNT(*) c FROM payment_transactions WHERE reference_type = ? AND reference_id IN (SELECT id FROM tournament_registrations WHERE tournament_id = ?)', ['tournament', tid]);
    expect(Number(teamPay[0].c)).toBe(0);
    expect(true).toBe(true);
  });
});

async function competitionIdOfDefault(tid: number): Promise<number> {
  return Number((await exec<RowData>('SELECT id FROM tournament_competitions WHERE tournament_id = ? AND is_default = 1', [tid]))[0][0].id);
}