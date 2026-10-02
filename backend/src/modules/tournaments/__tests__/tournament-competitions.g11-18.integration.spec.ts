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
 * G11.18 Phase 1 — Tournament Competition Categories foundation.
 *
 * NON-FINANCIAL verification against the real (migrated) schema:
 *  1-5  default-competition backfill & trigger scoping;
 *  6-9  competition-scoped uniqueness (registrations + active memberships);
 *  10-11 independent placements and cash prizes per competition;
 *  12-13 cross-tournament / cross-organisation competitionId fails closed;
 *  14  G11.15 default-competition behavior remains unchanged (one cash prize
 *      per placement, one placement value per competition, award uniqueness);
 *  15  zero financial mutations from the Phase 1 flows.
 */

const ORG = 2790001;
const ORG2 = 2790002;
const CREATOR = 2790009;
const P = { u1: 2790011, u2: 2790012, u3: 2790013, u4: 2790014 };
const SPORT = 2790101;

let pool: mysql.Pool;
let sportFormatSingles = 0;
let sportFormatTeam = 0;
let ruleSetSingles = 0;
const tournamentIds: number[] = [];
const compIds: number[] = [];
const keptCompetitionIds: number[] = [];

const exec = (sql: string, params: any[] = []) => pool.execute(sql, params);

async function mkUser(id: number) {
  await exec(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status, birth_date)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'G11.18 U', 'male', 'active', '1995-05-05')`,
    [id, `021${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, `g1118-${id}@test.com`],
  );
}

async function seedBase() {
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  await pool.execute(`INSERT IGNORE INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG}, UUID(), ?, 1, 'G11.18 Org', 'g1118-org', 1)`, [otId]);
  await pool.execute(`INSERT IGNORE INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG2}, UUID(), ?, 1, 'G11.18 Org B', 'g1118-orgb', 1)`, [otId]);
  await pool.execute(`INSERT IGNORE INTO sports (id, name, slug, is_active, show_in_marketplace, sort_order) VALUES (${SPORT}, 'G1118 Sport', 'g1118-sport', 1, 1, 0)`);
  const [s1] = await pool.execute<RowData>(`INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active) VALUES (?, 'g1118-singles', 'Singles', 'singles', 1, NULL, 1, 1)`, [SPORT]);
  sportFormatSingles = Number((s1 as any).insertId);
  const [s2] = await pool.execute<RowData>(`INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active) VALUES (?, 'g1118-team', 'Team', 'team', 3, 3, 0, 1)`, [SPORT]);
  sportFormatTeam = Number((s2 as any).insertId);
  const [rs1] = await pool.execute<RowData>(`INSERT INTO sport_rule_sets (format_id, version, name, rules) VALUES (?, 1, 'G1118 Rules', ?)`, [sportFormatSingles, JSON.stringify({ scoring: 'sets', termination: 'best_of_3' })]);
  ruleSetSingles = Number((rs1 as any).insertId);
  for (const u of Object.values(P)) await mkUser(u);
  await mkUser(CREATOR);
}

/** Tournament + default competition + one extra competition for multi-category tests. */
async function createTournamentWithCompetitions(org = ORG, status = 'registration_open'): Promise<{ tid: number; def: number; extra: number }> {
  const [res] = await exec<RowData>(
    `INSERT INTO tournaments (public_id, creator_id, organisation_id, bracket_type_id, format, match_format_id, sport_id, name,
       max_participants, min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type, commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, 1, 'knockout', ?, ?, 'G11.18 Cup', 16, 2, 0, 0, 'EGP', 'FREE', 'community', 0, ?, 1, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
    [CREATOR, org, sportFormatSingles, SPORT, status],
  );
  const tid = Number((res as any).insertId);
  tournamentIds.push(tid);
  // default competition (the way the app creates it today)
  const [d] = await exec<RowData>(
    `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, match_format_id, currency_code, is_default)
     VALUES (UUID(), ?, 'singles', 'Default', ?, 'EGP', 1)`, [tid, sportFormatSingles]);
  const def = Number((d as any).insertId);
  compIds.push(def);
  keptCompetitionIds.push(def);
  // a second competition (Doubles/Teams) for the multi-category tests
  const [x] = await exec<RowData>(
    `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, match_format_id, currency_code, is_default)
     VALUES (UUID(), ?, 'team', 'Teams', ?, 'EGP', 0)`, [tid, sportFormatTeam]);
  const extra = Number((x as any).insertId);
  compIds.push(extra);
  keptCompetitionIds.push(extra);
  return { tid, def, extra };
}

async function registerInCompetition(tid: number, compId: number, playerId: number): Promise<number> {
  const [res] = await exec<RowData>(
    `INSERT INTO tournament_registrations (tournament_id, competition_id, player_id, payment_status, status)
     VALUES (?, ?, ?, 'unpaid', 'registered')`, [tid, compId, playerId]);
  return Number((res as any).insertId);
}

async function participantInCompetition(tid: number, compId: number, regId: number, type: string, memberUserId: number): Promise<number> {
  const [res] = await exec<RowData>(
    `INSERT INTO tournament_participants (tournament_id, competition_id, registration_id, participant_type, status, member_user_ids)
     VALUES (?, ?, ?, ?, 'active', JSON_ARRAY(?))`, [tid, compId, regId, type, memberUserId]);
  return Number((res as any).insertId);
}

async function memberOf(tid: number, participantId: number, userId: number): Promise<void> {
  await exec(
    `INSERT INTO tournament_participant_members (tournament_id, participant_id, user_id, member_order, status, active_tournament_id)
     VALUES (?, ?, ?, 0, 'active', ?)`, [tid, participantId, userId, tid]);
}

async function financialCount(tid: number) {
  const [a] = await exec<RowData>('SELECT COUNT(*) c FROM tournament_prize_awards WHERE tournament_id = ?', [tid]);
  const [l] = await exec<RowData>('SELECT COUNT(*) c FROM ledger_entries WHERE source_type = ? AND source_id IN (SELECT id FROM tournament_prize_awards WHERE tournament_id = ?)', ['tournament', tid]);
  return { awards: Number((a as any[])[0].c), ledger: Number((l as any[])[0].c) };
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 6 });
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  await seedBase();
}, 60000);

afterAll(async () => {
  if (!pool) return;
  const idList = tournamentIds.length ? tournamentIds.join(',') : '0';
  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
  await pool.execute(`DELETE FROM tournament_prize_awards WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_prizes WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_placements WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_participant_members WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_competitions WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${idList})`);
  await pool.execute(`DELETE FROM sport_formats WHERE id IN (?, ?)`, [sportFormatSingles, sportFormatTeam]);
  await pool.execute(`DELETE FROM sport_rule_sets WHERE id = ${ruleSetSingles}`);
  await pool.execute(`DELETE FROM sports WHERE id = ${SPORT}`);
  await pool.execute(`DELETE FROM player_profiles WHERE user_id IN (${CREATOR}, ${P.u1}, ${P.u2}, ${P.u3}, ${P.u4})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${CREATOR}, ${P.u1}, ${P.u2}, ${P.u3}, ${P.u4})`);
  await pool.execute(`DELETE FROM organisations WHERE id IN (${ORG}, ${ORG2})`);
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
  tournamentIds.length = 0;
  keptCompetitionIds.length = 0;
}, 60000);

beforeEach(() => { vi.clearAllMocks(); });

describe('G11.18 competition categories foundation', () => {
  it('1-5. every tournament has exactly ONE default competition and legacy rows point to it (trigger scoping)', async () => {
    const { tid, def, extra } = await createTournamentWithCompetitions();
    // exactly one default per tournament
    const [defaults] = await exec<RowData>('SELECT COUNT(*) c FROM tournament_competitions WHERE tournament_id = ? AND is_default = 1', [tid]);
    expect(Number((defaults as any[])[0].c)).toBe(1);
    // an explicitly scoped row is respected
    const regA = await registerInCompetition(tid, def, P.u1);
    const [r] = await exec<RowData>('SELECT competition_id FROM tournament_registrations WHERE id = ?', [regA]);
    expect(Number(r[0].competition_id)).toBe(def);

    // legacy writer WITHOUT competition_id → auto-scoped to the DEFAULT competition
    const [r2] = await exec<RowData>(`INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status) VALUES (?, ?, 'unpaid', 'registered')`, [tid, P.u2]);
    const autoReg = Number((r2 as any).insertId);
    const [autoRegRow] = await exec<RowData>('SELECT competition_id FROM tournament_registrations WHERE id = ?', [autoReg]);
    expect(Number(autoRegRow[0].competition_id)).toBe(def);

    const [p2] = await exec<RowData>(`INSERT INTO tournament_participants (tournament_id, registration_id, participant_type, status, member_user_ids) VALUES (?, ?, 'individual', 'active', JSON_ARRAY(?))`, [tid, autoReg, P.u2]);
    const autoPart = Number((p2 as any).insertId);
    const [autoPartRow] = await exec<RowData>('SELECT competition_id FROM tournament_participants WHERE id = ?', [autoPart]);
    expect(Number(autoPartRow[0].competition_id)).toBe(def);

    const [pr] = await exec<RowData>(`INSERT INTO tournament_prizes (tournament_id, placement, prize_type, description, amount, currency_code, display_order) VALUES (?, 1, 'cash', 'P1', 100, 'EGP', 0)`, [tid]);
    const autoPrize = Number((pr as any).insertId);
    const [autoPrizeRow] = await exec<RowData>('SELECT competition_id FROM tournament_prizes WHERE id = ?', [autoPrize]);
    expect(Number(autoPrizeRow[0].competition_id)).toBe(def);

    const [pl] = await exec<RowData>(`INSERT INTO tournament_placements (tournament_id, placement, participant_id, user_id, source) VALUES (?, 1, ?, ?, 'bracket')`, [tid, autoPart, P.u2]);
    const autoPlacement = Number((pl as any).insertId);
    const [autoPlacementRow] = await exec<RowData>('SELECT competition_id FROM tournament_placements WHERE id = ?', [autoPlacement]);
    expect(Number(autoPlacementRow[0].competition_id)).toBe(def);
    void extra;
    void keptCompetitionIds;
  });

  it('6-7. same player CAN register in two competitions; NOT twice in the same competition', async () => {
    const { tid, def, extra } = await createTournamentWithCompetitions();
    const regA = await registerInCompetition(tid, def, P.u1);
    const regB = await registerInCompetition(tid, extra, P.u1); // different competition → OK
    expect(regB).toBeGreaterThan(0);
    expect(regA).toBeGreaterThan(0);
    // duplicate within the SAME competition → uk_player_competition violation
    await expect(exec(
      `INSERT INTO tournament_registrations (tournament_id, competition_id, player_id, payment_status, status) VALUES (?, ?, ?, 'unpaid', 'registered')`,
      [tid, def, P.u1],
    )).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });

  it('6-7. the tournament service automatically creates the default competition on create', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');
    const ruleSetId = ruleSetSingles;
    const created = await tournamentService.create({
      organisation_id: ORG,
      name: 'G11.18 Live Hook',
      bracket_type_id: 1,
      sport_id: SPORT,
      match_format_id: sportFormatSingles,
      rule_set_id: ruleSetId,
      max_participants: 16,
      min_participants: 2,
      entry_fee: 500,
      currency_code: 'EGP',
      price_type: 'FIXED',
      start_date: '2026-12-01',
      end_date: '2026-12-31',
      registration_opens: '2026-11-01',
      registration_closes: '2026-11-30',
      status: 'draft',
      is_public: 1,
    }, CREATOR);
    const tid = Number(created.id);
    if (!tournamentIds.includes(tid)) tournamentIds.push(tid);
    const [comps] = await exec<RowData>('SELECT id, competition_type, entry_fee, currency_code, is_default FROM tournament_competitions WHERE tournament_id = ?', [tid]);
    expect(comps.length).toBe(1);
    expect(comps[0].competition_type).toBe('singles');
    expect(Number(comps[0].entry_fee)).toBe(500);
    expect(comps[0].currency_code).toBe('EGP');
    expect(Number(comps[0].is_default)).toBe(1);
  });

  it('8-9. same player CANNOT hold two active memberships in one competition; CAN across competitions', async () => {
    const { tid, def, extra } = await createTournamentWithCompetitions();
    const regA1 = await registerInCompetition(tid, def, P.u1);
    const partA1 = await participantInCompetition(tid, def, regA1, 'individual', P.u1);
    await memberOf(tid, partA1, P.u1);
    // second participant IN THE SAME competition for the same user → uk_active_user_competition violation
    const regA2 = await registerInCompetition(tid, def, P.u2);
    const partA2 = await participantInCompetition(tid, def, regA2, 'individual', P.u2);
    await expect(memberOf(tid, partA2, P.u1)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    // SAME user in a DIFFERENT competition → allowed
    const regB = await registerInCompetition(tid, extra, P.u1);
    const partB = await participantInCompetition(tid, extra, regB, 'team', P.u1);
    await memberOf(tid, partB, P.u1); // OK
  });

  it('10. the same placement value can exist independently in different competitions', async () => {
    const { tid, def, extra } = await createTournamentWithCompetitions();
    const regA = await registerInCompetition(tid, def, P.u1);
    const partA = await participantInCompetition(tid, def, regA, 'individual', P.u1);
    const regB = await registerInCompetition(tid, extra, P.u2);
    const partB = await participantInCompetition(tid, extra, regB, 'team', P.u2);
    await exec(`INSERT INTO tournament_placements (tournament_id, competition_id, placement, participant_id, user_id, source) VALUES (?, ?, 1, ?, ?, 'bracket')`, [tid, def, partA, P.u1]);
    await exec(`INSERT INTO tournament_placements (tournament_id, competition_id, placement, participant_id, user_id, source) VALUES (?, ?, 1, ?, ?, 'bracket')`, [tid, extra, partB, P.u2]); // same placement, other competition → OK
    // duplicate placement value within one competition → uk_tp_tournament_competition_placement
    await expect(exec(
      `INSERT INTO tournament_placements (tournament_id, competition_id, placement, participant_id, user_id, source) VALUES (?, ?, 1, ?, ?, 'bracket')`,
      [tid, def, partA, P.u1],
    )).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });

  it('11. the same cash placement can exist independently in different competitions', async () => {
    const { tid, def, extra } = await createTournamentWithCompetitions();
    await exec(`INSERT INTO tournament_prizes (tournament_id, competition_id, placement, prize_type, description, amount, currency_code, display_order) VALUES (?, ?, 1, 'cash', 'Singles 1st', 20000, 'EGP', 0)`, [tid, def]);
    await exec(`INSERT INTO tournament_prizes (tournament_id, competition_id, placement, prize_type, description, amount, currency_code, display_order) VALUES (?, ?, 1, 'cash', 'Teams 1st', 50000, 'EGP', 0)`, [tid, extra]); // same cash placement, other competition → OK
    // duplicate CASH prize for the same placement in the SAME competition → uk_tprize_cash_competition_placement
    await expect(exec(
      `INSERT INTO tournament_prizes (tournament_id, competition_id, placement, prize_type, description, amount, currency_code, display_order) VALUES (?, ?, 1, 'cash', 'dup', 999, 'EGP', 0)`,
      [tid, def],
    )).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });

  it('12. cross-tournament competitionId fails closed', async () => {
    const a = await createTournamentWithCompetitions();
    const b = await createTournamentWithCompetitions();
    const { competitionService } = await import('../application/competition.service.js');
    await expect(competitionService.resolveCompetition(a.tid, b.def)).rejects.toMatchObject({ statusCode: 404 });
    await expect(competitionService.resolveCompetition(a.tid, b.extra)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('13. cross-organisation competitionId fails closed', async () => {
    const a = await createTournamentWithCompetitions(ORG);
    const { competitionService } = await import('../application/competition.service.js');
    // Org B asks for a competition of Org A's tournament → NotFound (no existence leak)
    await expect(competitionService.resolveCompetition(a.tid, a.def, { organisationId: ORG2 })).rejects.toMatchObject({ statusCode: 404 });
    // The OWNING org resolves it fine
    const ok = await competitionService.resolveCompetition(a.tid, a.def, { organisationId: ORG });
    expect(Number(ok.tournament_id)).toBe(a.tid);
    expect(ok.is_default).toBe(1);
  });

  it('14. G11.15 default-competition behavior remains unchanged', async () => {
    const { tid, def } = await createTournamentWithCompetitions(ORG, 'completed');
    // one cash prize per placement (default competition only) — pre-187 uniqueness preserved
    await exec(`INSERT INTO tournament_prizes (tournament_id, competition_id, placement, prize_type, description, amount, currency_code, display_order) VALUES (?, ?, 1, 'cash', '1st', 20000, 'EGP', 0)`, [tid, def]);
    await exec(`INSERT INTO tournament_prizes (tournament_id, competition_id, placement, prize_type, description, amount, currency_code, display_order) VALUES (?, ?, 1, 'trophy', 'Non-cash', NULL, NULL, 0)`, [tid, def]); // non-cash may repeat
    const regW = await registerInCompetition(tid, def, P.u1);
    const partW = await participantInCompetition(tid, def, regW, 'individual', P.u1);
    await exec(`INSERT INTO tournament_placements (tournament_id, competition_id, placement, participant_id, user_id, source) VALUES (?, ?, 1, ?, ?, 'bracket')`, [tid, def, partW, P.u1]);
    // the award uniqueness is competition-scoped and still allows one winner per placement
    await exec(`INSERT INTO tournament_prize_awards (public_id, tournament_id, competition_id, prize_id, placement, registration_id, winner_user_id, amount, currency_code, bind_source)
                VALUES (UUID(), ?, ?, (SELECT id FROM tournament_prizes WHERE tournament_id = ? AND prize_type = 'cash' AND placement = 1 LIMIT 1), 1, ?, ?, 20000, 'EGP', 'bracket')`,
      [tid, def, tid, regW, P.u1]);
    await expect(exec(
      `INSERT INTO tournament_prize_awards (public_id, tournament_id, competition_id, prize_id, placement, registration_id, winner_user_id, amount, currency_code, bind_source)
       VALUES (UUID(), ?, ?, (SELECT id FROM tournament_prizes WHERE tournament_id = ? AND prize_type = 'cash' AND placement = 1 LIMIT 1), 1, ?, ?, 20000, 'EGP', 'bracket')`,
      [tid, def, tid, regW, P.u1],
    )).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' }); // same winner+placement+competition cannot be awarded twice
  });

  it('15. the Phase 1 flows create ZERO financial rows', async () => {
    const { tid, def, extra } = await createTournamentWithCompetitions();
    const regA = await registerInCompetition(tid, def, P.u1);
    const partA = await participantInCompetition(tid, def, regA, 'individual', P.u1);
    await memberOf(tid, partA, P.u1);
    const regB = await registerInCompetition(tid, extra, P.u2);
    const partB = await participantInCompetition(tid, extra, regB, 'team', P.u2);
    await memberOf(tid, partB, P.u2);
    expect(await financialCount(tid)).toEqual({ awards: 0, ledger: 0 });
    expect(true).toBe(true);
  });
});