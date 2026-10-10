import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * Phase 1 — repository-level wiring of `recalculateStandings` against the REAL
 * schema (shared local Docker MySQL, 127.0.0.1:3307/courtzon_v3, self-cleaning
 * fixtures matching the established integration pattern).
 *
 * Locks the Q2 fix: `recalculateStandings` must hand `resolveStandingsTiebreakers`
 * ONLY the `.tiebreakers` array extracted from `sport_rule_sets.standings_rules`
 * (the driver returns the JSON column as a parsed object on this stack, and a
 * JSON string on others — both shapes are covered), never the whole record.
 *
 *   • tournament-level rule set config ranks by the configured tie-breaker order;
 *   • per-match frozen snapshots (agreeing) are the fallback when the tournament
 *     has no rule set;
 *   • mixed per-match tie-breaker snapshots FAIL CLOSED (no arbitrary subset);
 *   • mixed scoring structures (sets vs goals) among contributing approved
 *     results FAIL CLOSED (games/sets/goals share the game columns — never mix).
 */
const ORG = 2780101;
const CREATOR = 2780102;
const P1 = 2780111;
const P2 = 2780112;
const P3 = 2780113;

const RS_A_STANDINGS = {
  points: { win: 3, draw: 1, loss: 0 },
  tiebreakers: [
    { field: 'points', direction: 'desc' },
    { field: 'games_difference', direction: 'desc' },
    { field: 'games_won', direction: 'desc' },
  ],
};
const RS_A_RULES = { score_structure: 'sets', best_of: 3, sets_to_win: 2, first_to: 6, margin: 2, tiebreak_at: 6, tiebreak_first_to: 7, draw_allowed: false };

const RS_B_STANDINGS = {
  points: { win: 3, draw: 1, loss: 0 },
  tiebreakers: [
    { field: 'points', direction: 'desc' },
    { field: 'games_won', direction: 'desc' },
    { field: 'games_difference', direction: 'desc' },
  ],
};
const RS_B_RULES = { ...RS_A_RULES };

const RS_G_STANDINGS = {
  points: { win: 3, draw: 1, loss: 0 },
  tiebreakers: [{ field: 'points', direction: 'desc' }],
};
const RS_G_RULES = { score_structure: 'goals', win_by: 1, draw_allowed: true };

let pool: mysql.Pool;
let orgTypeId = 0;
let sportId = 0;
let fmtId = 0;
let rsAId = 0;
let rsBId = 0;
let rsGId = 0;
const tournamentsToDelete: number[] = [];
const regsToDelete: number[] = [];
const participantsToDelete: number[] = [];
const matchesToDelete: number[] = [];
const tmToDelete: number[] = [];
const resultsToDelete: number[] = [];
const competitionsToDelete: number[] = [];

const q = async <T = RowData>(sql: string, params: any[] = []): Promise<T> => {
  const [rows] = await pool.execute(sql, params);
  return rows as unknown as T;
};

async function mkUser(id: number) {
  await pool.execute(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status, language_id)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'P1 User', 'male', 'active', NULL)`,
    [id, `018${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, `p1-standings-${id}@test.com`],
  );
}

async function seedOrg() {
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  orgTypeId = Number((ot as any[])[0].id);
  await pool.execute(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
     VALUES (?, UUID(), ?, 1, 'P1 Standings Org', 'p1-standings-org', 1)`,
    [ORG, orgTypeId],
  );
}

async function seedSportsAndRuleSets() {
  const [sp] = await pool.execute<RowData>(
    `INSERT INTO sports (name, slug, is_active, show_in_marketplace, sort_order) VALUES ('P1 Standings Sport', 'p1-standings-sport', 1, 1, 0)`,
  );
  sportId = Number((sp as any).insertId);
  const [ff] = await pool.execute<RowData>(
    `INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active)
     VALUES (?, 'p1-standings-singles', 'P1 Standings Singles', 'singles', 1, NULL, 1, 1)`, [sportId],
  );
  fmtId = Number((ff as any).insertId);
  const mkRuleSet = async (name: string, version: number, rules: any, standings: any): Promise<number> => {
    const [rr] = await pool.execute<RowData>(
      `INSERT INTO sport_rule_sets (format_id, name, version, is_active, rules, standings_rules)
       VALUES (?, ?, ?, 1, ?, ?)`,
      [fmtId, name, version, JSON.stringify(rules), JSON.stringify(standings)],
    );
    return Number((rr as any).insertId);
  };
  // Sport rule sets are unique per (format_id, version) — use distinct versions.
  rsAId = await mkRuleSet('P1 RS A', 1, RS_A_RULES, RS_A_STANDINGS);
  rsBId = await mkRuleSet('P1 RS B', 2, RS_B_RULES, RS_B_STANDINGS);
  rsGId = await mkRuleSet('P1 RS G', 3, RS_G_RULES, RS_G_STANDINGS);
}

async function createTournament(ruleSetId: number | null): Promise<{ tid: number; cid: number }> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournaments
       (public_id, creator_id, organisation_id, bracket_type_id, format, rule_set_id, name, max_participants,
        min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type,
        commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, 1, 'round_robin', ?, 'P1 Standings', 4, 2, 0, 0, 'EGP', 'FREE', 'community',
        0, 'running', 1, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
    [CREATOR, ORG, ruleSetId],
  );
  const tid = Number((res as any).insertId);
  tournamentsToDelete.push(tid);
  const [cr] = await pool.execute<RowData>(
    `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, currency_code, is_default)
     VALUES (UUID(), ?, 'singles', 'Default', 'EGP', 1)`, [tid],
  );
  const cid = Number((cr as any).insertId);
  competitionsToDelete.push(cid);
  return { tid, cid };
}

async function createRegistration(tid: number, cid: number, player: number): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournament_registrations (tournament_id, competition_id, player_id, payment_status, status)
     VALUES (?, ?, ?, 'paid', 'confirmed')`, [tid, cid, player],
  );
  const rid = Number((res as any).insertId);
  regsToDelete.push(rid);
  // The recalc translates standings keys (user ids) → registration ids via
  // tournament_participant_members, so the full participant/member chain is
  // required for the FK to hold on the persisted standings rows.
  const [pp] = await pool.execute<RowData>(
    `INSERT INTO tournament_participants (tournament_id, competition_id, registration_id, participant_type, status, member_user_ids)
     VALUES (?, ?, ?, 'individual', 'active', ?)`, [tid, cid, rid, JSON.stringify([player])],
  );
  const pid = Number((pp as any).insertId);
  participantsToDelete.push(pid);
  await pool.execute(
    `INSERT INTO tournament_participant_members (tournament_id, participant_id, user_id, member_order, status)
     VALUES (?, ?, ?, 0, 'active')`, [tid, pid, player],
  );
  return rid;
}

interface ResultMatchArgs {
  tournamentId: number;
  competitionId: number;
  p1: number; // user id
  p2: number; // user id
  winner: number | null; // user id (null → draw)
  ruleSetId: number;
  snapshot: any;
  rawScore: any;
  finalWinner: 'home' | 'away' | 'draw';
}

async function createResultMatch(args: ResultMatchArgs) {
  const [mr] = await pool.execute<RowData>(
    `INSERT INTO matches (type, sport_id, tournament_id, format_id) VALUES ('public', ?, ?, ?)`,
    [sportId, args.tournamentId, fmtId],
  );
  const matchId = Number((mr as any).insertId);
  matchesToDelete.push(matchId);
  const [tm] = await pool.execute<RowData>(
    `INSERT INTO tournament_matches (tournament_id, competition_id, match_id, round, match_number, player1_id, player2_id, winner_id, status)
     VALUES (?, ?, ?, 1, 1, ?, ?, ?, 'completed')`,
    [args.tournamentId, args.competitionId, matchId, args.p1, args.p2, args.winner],
  );
  tmToDelete.push(Number((tm as any).insertId));
  const [rr] = await pool.execute<RowData>(
    `INSERT INTO match_result_records
       (match_id, sport_id, format_id, rule_set_id, rules_snapshot, match_type, played_at, tournament_id,
        participant_payload, raw_result, final_result, outcome, submission_status)
     VALUES (?, ?, ?, ?, ?, 'tournament', NOW(), ?, ?, ?, ?, 'completed', 'approved')`,
    [
      matchId, sportId, fmtId, args.ruleSetId,
      JSON.stringify(args.snapshot),
      args.tournamentId,
      JSON.stringify({ participants: [args.p1, args.p2] }),
      JSON.stringify({ score: args.rawScore }),
      JSON.stringify({ winner: args.finalWinner }),
    ],
  );
  resultsToDelete.push(Number((rr as any).insertId));
}

const SETS_RULES_SNAPSHOT = { score_structure: 'sets', best_of: 3, sets_to_win: 2, first_to: 6, margin: 2 };

/** Phase-1 mini round-robin (user ids): A beats B 6-4 6-4, B beats C 6-1 6-1,
 *  C beats A 6-2 6-2. points all 3; games: A 16/20 (-4), B 20/14 (+6), C 14/16 (-2). */
async function createPhase1RoundRobin(tid: number, cid: number, uA: number, uB: number, uC: number, ruleSetId: number) {
  await createResultMatch({ tournamentId: tid, competitionId: cid, p1: uA, p2: uB, winner: uA, ruleSetId, snapshot: SETS_RULES_SNAPSHOT, rawScore: { sets: [{ home: 6, away: 4 }, { home: 6, away: 4 }] }, finalWinner: 'home' });
  await createResultMatch({ tournamentId: tid, competitionId: cid, p1: uB, p2: uC, winner: uB, ruleSetId, snapshot: SETS_RULES_SNAPSHOT, rawScore: { sets: [{ home: 6, away: 1 }, { home: 6, away: 1 }] }, finalWinner: 'home' });
  await createResultMatch({ tournamentId: tid, competitionId: cid, p1: uC, p2: uA, winner: uC, ruleSetId, snapshot: SETS_RULES_SNAPSHOT, rawScore: { sets: [{ home: 6, away: 2 }, { home: 6, away: 2 }] }, finalWinner: 'home' });
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });
  await cleanupFixtures(); // idempotent: wipe any half-seeded state from a previous interrupted run
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  await seedOrg();
  await seedSportsAndRuleSets();
  for (const id of [CREATOR, P1, P2, P3]) await mkUser(id);
}, 120000);

async function cleanupFixtures() {
  if (!pool) return;
  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
  const [bt] = await pool.execute<RowData>('SELECT id FROM tournaments WHERE organisation_id = ?', [ORG]);
  const tl = (bt as any[]).length ? (bt as any[]).map((r: any) => r.id).join(',') : '0';
  await pool.execute(`DELETE FROM tournament_standings WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM match_result_records WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM tournament_matches WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM tournament_participant_members WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM tournament_placements WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM tournament_competitions WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM matches WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM tournaments WHERE organisation_id = ?`, [ORG]);
  await pool.execute(
    `DELETE FROM sport_rule_sets WHERE format_id IN (SELECT id FROM sport_formats WHERE sport_id IN (SELECT id FROM sports WHERE slug = 'p1-standings-sport'))`,
  );
  await pool.execute(`DELETE FROM sport_formats WHERE sport_id IN (SELECT id FROM sports WHERE slug = 'p1-standings-sport')`);
  await pool.execute(`DELETE FROM sports WHERE slug = 'p1-standings-sport'`);
  await pool.execute(`DELETE FROM users WHERE id IN (${CREATOR}, ${P1}, ${P2}, ${P3})`);
  await pool.execute(`DELETE FROM organisations WHERE id = ?`, [ORG]);
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
  tournamentsToDelete.length = 0; regsToDelete.length = 0; participantsToDelete.length = 0; matchesToDelete.length = 0;
  tmToDelete.length = 0; resultsToDelete.length = 0; competitionsToDelete.length = 0;
}

afterAll(async () => {
  if (!pool) return;
  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
  const tl = tournamentsToDelete.length ? tournamentsToDelete.join(',') : '0';
  const rl = regsToDelete.length ? regsToDelete.join(',') : '0';
  const ml = matchesToDelete.length ? matchesToDelete.join(',') : '0';
  const tml = tmToDelete.length ? tmToDelete.join(',') : '0';
  const rrL = resultsToDelete.length ? resultsToDelete.join(',') : '0';
  const cl = competitionsToDelete.length ? competitionsToDelete.join(',') : '0';
  await pool.execute(`DELETE FROM tournament_standings WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM match_result_records WHERE tournament_id IN (${tl}) OR id IN (${rrL})`);
  await pool.execute(`DELETE FROM tournament_matches WHERE tournament_id IN (${tl}) OR id IN (${tml})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE tournament_id IN (${tl}) OR id IN (${rl})`);
  await pool.execute(`DELETE FROM tournament_participant_members WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM tournament_placements WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM tournament_competitions WHERE tournament_id IN (${tl}) OR id IN (${cl})`);
  await pool.execute(`DELETE FROM matches WHERE tournament_id IN (${tl}) OR id IN (${ml})`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${tl})`);
  await pool.execute(`DELETE FROM sport_rule_sets WHERE id IN (${rsAId}, ${rsBId}, ${rsGId})`);
  await pool.execute(`DELETE FROM sport_formats WHERE id = ${fmtId}`);
  await pool.execute(`DELETE FROM sports WHERE id = ${sportId}`);
  await pool.execute(`DELETE FROM users WHERE id IN (${CREATOR}, ${P1}, ${P2}, ${P3})`);
  await pool.execute(`DELETE FROM organisations WHERE id = ${ORG}`);
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 120000);

describe('recalculateStandings — Phase 1 standings_rules wiring (real schema)', () => {
  // Standings rows persist registration ids; the matches reference user ids, so
  // assert the ordering through the registration → user join.
  const standingsByUser = async (tid: number) => {
    const rows = await q<Array<Record<string, any>>>(
      `SELECT tr.player_id AS user_id, ts.points, ts.games_won, ts.games_lost, ts.sets_won, ts.sets_lost,
              ts.wins, ts.losses, ts.rank_position
       FROM tournament_standings ts
       JOIN tournament_registrations tr ON tr.id = ts.registration_id
       WHERE ts.tournament_id = ? ORDER BY ts.rank_position`,
      [tid],
    );
    return rows.map((r) => ({ ...r, user_id: Number(r.user_id), points: Number(r.points) }));
  };

  it('ranks by the tournament rule set standings_rules.tiebreakers (real JSON column values)', async () => {
    const { tid, cid } = await createTournament(rsAId);
    await createRegistration(tid, cid, P1);
    await createRegistration(tid, cid, P2);
    await createRegistration(tid, cid, P3);
    await createPhase1RoundRobin(tid, cid, P1, P2, P3, rsAId);

    const { tournamentRepository } = await import('../infrastructure/repositories/tournament.repository.js');
    await tournamentRepository.recalculateStandings(tid);

    const standings = await standingsByUser(tid);
    // points all 3; RS-A tie-breaks: games_difference +6 (B) > -2 (C) > -4 (A)
    expect(standings.map((s) => s.user_id)).toEqual([P2, P3, P1]);
    expect(standings[0]).toMatchObject({ rank_position: 1, user_id: P2 });
    expect(standings[1]).toMatchObject({ rank_position: 2, user_id: P3 });
    expect(standings[2]).toMatchObject({ rank_position: 3, user_id: P1 });
    for (const s of standings) expect(s.points).toBe(3);
    expect(standings.find((s) => s.user_id === P1)).toMatchObject({ games_won: 16, games_lost: 20, sets_won: 2, sets_lost: 2, wins: 1, losses: 1 });
    expect(standings.find((s) => s.user_id === P2)).toMatchObject({ games_won: 20, games_lost: 14, sets_won: 2, sets_lost: 2, wins: 1, losses: 1 });
    expect(standings.find((s) => s.user_id === P3)).toMatchObject({ games_won: 14, games_lost: 16, sets_won: 2, sets_lost: 2, wins: 1, losses: 1 });
  });

  it('falls back to per-match frozen snapshots (all agreeing) when the tournament has no rule set', async () => {
    const { tid, cid } = await createTournament(null);
    await createRegistration(tid, cid, P1);
    await createRegistration(tid, cid, P2);
    await createRegistration(tid, cid, P3);
    await createPhase1RoundRobin(tid, cid, P1, P2, P3, rsAId); // all results reference RS-A → snapshots agree

    const { tournamentRepository } = await import('../infrastructure/repositories/tournament.repository.js');
    await tournamentRepository.recalculateStandings(tid);

    const standings = await standingsByUser(tid);
    expect(standings.map((s) => s.user_id)).toEqual([P2, P3, P1]);
    expect(standings.find((s) => s.user_id === P2)).toMatchObject({ games_won: 20, games_lost: 14 });
    expect(standings.find((s) => s.user_id === P3)).toMatchObject({ games_won: 14, games_lost: 16 });
    expect(standings.find((s) => s.user_id === P1)).toMatchObject({ games_won: 16, games_lost: 20 });
  });

  it('fails closed on mixed per-match tie-breaker snapshots when the tournament rule set is unavailable', async () => {
    const { tid, cid } = await createTournament(null);
    await createRegistration(tid, cid, P1);
    await createRegistration(tid, cid, P2);
    await createRegistration(tid, cid, P3);
    // A beats B (RS-A), B beats C (RS-A), C beats A (RS-B) → snapshots disagree.
    await createResultMatch({ tournamentId: tid, competitionId: cid, p1: P1, p2: P2, winner: P1, ruleSetId: rsAId, snapshot: SETS_RULES_SNAPSHOT, rawScore: { sets: [{ home: 6, away: 4 }, { home: 6, away: 4 }] }, finalWinner: 'home' });
    await createResultMatch({ tournamentId: tid, competitionId: cid, p1: P2, p2: P3, winner: P2, ruleSetId: rsAId, snapshot: SETS_RULES_SNAPSHOT, rawScore: { sets: [{ home: 6, away: 1 }, { home: 6, away: 1 }] }, finalWinner: 'home' });
    await createResultMatch({ tournamentId: tid, competitionId: cid, p1: P3, p2: P1, winner: P3, ruleSetId: rsBId, snapshot: SETS_RULES_SNAPSHOT, rawScore: { sets: [{ home: 6, away: 2 }, { home: 6, away: 2 }] }, finalWinner: 'home' });

    const { tournamentRepository } = await import('../infrastructure/repositories/tournament.repository.js');
    await expect(tournamentRepository.recalculateStandings(tid)).rejects.toThrow(
      /Mixed standings tie-breaker configuration in tournament \d+/,
    );
  });

  it('fails closed on mixed scoring structures (sets vs goals) among contributing approved results', async () => {
    const { tid, cid } = await createTournament(rsAId); // tournament-level structure is 'sets' (RS-A)
    await createRegistration(tid, cid, P1);
    await createRegistration(tid, cid, P2);
    await createRegistration(tid, cid, P3);
    await createResultMatch({ tournamentId: tid, competitionId: cid, p1: P1, p2: P2, winner: P1, ruleSetId: rsAId, snapshot: SETS_RULES_SNAPSHOT, rawScore: { sets: [{ home: 6, away: 4 }, { home: 6, away: 4 }] }, finalWinner: 'home' });
    await createResultMatch({ tournamentId: tid, competitionId: cid, p1: P2, p2: P3, winner: P2, ruleSetId: rsAId, snapshot: SETS_RULES_SNAPSHOT, rawScore: { sets: [{ home: 6, away: 1 }, { home: 6, away: 1 }] }, finalWinner: 'home' });
    // Third result is a GOALS structure (RS-G) — mixing games and goals in one ranking.
    await createResultMatch({ tournamentId: tid, competitionId: cid, p1: P3, p2: P1, winner: P3, ruleSetId: rsGId, snapshot: { score_structure: 'goals' }, rawScore: { homeGoals: 2, awayGoals: 1 }, finalWinner: 'home' });

    const { tournamentRepository } = await import('../infrastructure/repositories/tournament.repository.js');
    await expect(tournamentRepository.recalculateStandings(tid)).rejects.toThrow(
      /Mixed scoring structures in tournament \d+.*'sets' and 'goals'/,
    );
  });
});