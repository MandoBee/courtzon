import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * GSK-3C (Phase 2) — third-place playoff END-TO-END against the REAL DB + REAL
 * progression handler.
 *
 * A 4-player knockout bracket (two semifinals + final + dedicated third-place
 * match) is seeded exactly as the GSK transition service would persist it
 * (`is_third_place: true` + `loser_target_*` provenance on the semifinals), then
 * driven purely through the approved-result progression path:
 *
 *   • each semifinal winner is routed to the FINAL and each loser to the
 *     THIRD-PLACE match (correct per-side wiring);
 *   • the tournament does NOT complete while the third-place match is unresolved;
 *   • only once the third-place match is played are placements 1 / 2 / 3 captured,
 *     with placement 3 taken from the third-place WINNER;
 *   • re-delivering approved results is fully idempotent (no duplicate routing,
 *     matches or placements).
 *
 * Uses the shared LOCAL test database only (127.0.0.1:3307 / courtzon_v3).
 */
const ORG = 2830100;
const CREATOR = 2830102;
const U1 = 2830111; const U2 = 2830112; const U3 = 2830113; const U4 = 2830114;

const RULES = { score_structure: 'sets', best_of: 3, sets_to_win: 2, first_to: 6, margin: 2 };
const STANDINGS = { points: { win: 3, draw: 1, loss: 0 }, tiebreakers: [{ field: 'points', direction: 'desc' }] };

let pool: mysql.Pool;
let sportId = 0;
let fmtId = 0;
let ruleSetId = 0;

const q = async <T = RowData>(sql: string, params: any[] = []): Promise<T> => {
  const [rows] = await pool.execute(sql, params);
  return rows as unknown as T;
};

async function mkUser(id: number) {
  await pool.execute(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status, language_id)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'TP User', 'male', 'active', NULL)`,
    [id, `0${id}`, `+2010${id}`, `tp${id}@test.local`],
  );
}

async function cleanupFixtures() {
  if (!pool) return;
  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
  const [bt] = await pool.execute<RowData>('SELECT id FROM tournaments WHERE organisation_id = ?', [ORG]);
  const tl = (bt as any[]).length ? (bt as any[]).map((r: any) => r.id).join(',') : '0';
  await pool.execute(`DELETE FROM tournament_prize_awards WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM tournament_placements WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM audit_logs WHERE entity_type = 'tournament' AND action = 'TOURNAMENT.AUTO_COMPLETED' AND entity_id IN (${tl})`);
  await pool.execute(`DELETE FROM match_result_participants WHERE match_id IN (SELECT match_id FROM tournament_matches WHERE tournament_id IN (${tl}))`);
  await pool.execute(`DELETE FROM match_result_records WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM tournament_matches WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM matches WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM tournament_participant_members WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM tournament_competitions WHERE tournament_id IN (${tl})`);
  await pool.execute(`DELETE FROM tournaments WHERE organisation_id = ?`, [ORG]);
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
}

interface Fixture {
  tournamentId: number;
  competitionId: number;
  semiA: number; semiB: number; finalSlot: number; thirdSlot: number;
  semiAResult: number; semiBResult: number;
  pa1: number; pa2: number; pa3: number; pa4: number;
}

/** Create a shared Match (when players are supplied) + a tournament_matches slot. */
async function mkSlot(
  competitionId: number,
  round: number,
  roundName: string,
  matchNumber: number,
  bracketPosition: number,
  p1: number | null,
  p2: number | null,
  u1: number | null,
  u2: number | null,
  meta: Record<string, unknown>,
  status: string,
): Promise<{ slotId: number; sharedMatchId: number | null }> {
  let sharedMatchId: number | null = null;
  if (u1 != null && u2 != null) {
    const [m] = await pool.execute<RowData>(
      `INSERT INTO matches (type, sport_id, tournament_id, format_id) VALUES ('public', ?, ?, ?)`,
      [sportId, tournamentId, fmtId],
    );
    sharedMatchId = Number((m as any).insertId);
  }
  const [tm] = await pool.execute<RowData>(
    `INSERT INTO tournament_matches
       (tournament_id, competition_id, match_id, round, round_name, match_number, bracket_position,
        participant1_id, participant2_id, player1_id, player2_id, is_final, bracket_depth,
        status, progression_state, progression_meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tournamentId, competitionId, sharedMatchId, round, roundName, matchNumber, bracketPosition,
      p1, p2, u1, u2, meta.is_final === 1 ? 1 : 0, (meta.bracket_depth as number) ?? 0,
      status, 'pending', JSON.stringify(meta)],
  );
  return { slotId: Number((tm as any).insertId), sharedMatchId };
}

let tournamentId = 0;

/** Attach an APPROVED home-win result to an already-created shared Match. */
async function approveHomeWin(sharedMatchId: number, homeUser: number, awayUser: number): Promise<number> {
  const [r] = await pool.execute<RowData>(
    `INSERT INTO match_result_records
       (match_id, sport_id, format_id, rule_set_id, rules_snapshot, match_type, played_at, tournament_id,
        participant_payload, raw_result, final_result, outcome, submission_status, submitted_by, accepted_by, accepted_at)
     VALUES (?, ?, ?, ?, ?, 'tournament', NOW(), ?, ?, ?, ?, 'completed', 'approved', ?, ?, NOW())`,
    [sharedMatchId, sportId, fmtId, ruleSetId, JSON.stringify(RULES), tournamentId,
      JSON.stringify({ participants: [homeUser, awayUser] }),
      JSON.stringify({ score: { sets: [{ home: 6, away: 3 }, { home: 6, away: 3 }] } }),
      JSON.stringify({ winner: 'home', scoreSummary: '2-0 (6-3, 6-3)' }),
      CREATOR, CREATOR],
  );
  const resultId = Number((r as any).insertId);
  await pool.execute(
    `INSERT INTO match_result_participants (result_id, match_id, user_id, team_index, side, outcome)
     VALUES (?, ?, ?, 0, 'home', 'win'), (?, ?, ?, 1, 'away', 'loss')`,
    [resultId, sharedMatchId, homeUser, resultId, sharedMatchId, awayUser],
  );
  return resultId;
}

async function seedThirdPlaceBracket(): Promise<Fixture> {
  tournamentId = 0;
  const [t] = await pool.execute<RowData>(
    `INSERT INTO tournaments
       (public_id, creator_id, organisation_id, bracket_type_id, format, rule_set_id, sport_id, name, max_participants,
        min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type,
        commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, 1, 'knockout', ?, ?, 'Third Place Cup', 8, 4, 0, 0, 'EGP', 'FREE', 'community',
        0, 'running', 0, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
    [CREATOR, ORG, ruleSetId, sportId],
  );
  tournamentId = Number((t as any).insertId);

  const [c] = await pool.execute<RowData>(
    `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, currency_code, is_default)
     VALUES (UUID(), ?, 'singles', 'Singles', 'EGP', 1)`, [tournamentId],
  );
  const competitionId = Number((c as any).insertId);

  const mkParticipant = async (player: number): Promise<number> => {
    const [reg] = await pool.execute<RowData>(
      `INSERT INTO tournament_registrations (tournament_id, competition_id, player_id, payment_status, status)
       VALUES (?, ?, ?, 'paid', 'confirmed')`, [tournamentId, competitionId, player],
    );
    const [pp] = await pool.execute<RowData>(
      `INSERT INTO tournament_participants (tournament_id, competition_id, registration_id, participant_type, status, member_user_ids)
       VALUES (?, ?, ?, 'individual', 'active', ?)`,
      [tournamentId, competitionId, Number((reg as any).insertId), JSON.stringify([player])],
    );
    const pid = Number((pp as any).insertId);
    await pool.execute(
      `INSERT INTO tournament_participant_members (tournament_id, participant_id, user_id, member_order, status)
       VALUES (?, ?, ?, 0, 'active')`, [tournamentId, pid, player],
    );
    return pid;
  };
  const pa1 = await mkParticipant(U1);
  const pa2 = await mkParticipant(U2);
  const pa3 = await mkParticipant(U3);
  const pa4 = await mkParticipant(U4);

  // Semifinals (round 1) route winners to the final (round 2, position 0) and
  // losers to the dedicated third-place match (round 2, position 1).
  const sA = await mkSlot(
    competitionId, 1, 'Semi-final', 1, 0, pa1, pa2, U1, U2, {
      is_bracket: true, is_final: 0, bracket_depth: 1,
      target_round: 2, target_bracket_position: 0, target_side: 'player1',
      loser_target_round: 2, loser_target_bracket_position: 1, loser_target_side: 'player1',
    }, 'in_progress',
  );
  const sB = await mkSlot(
    competitionId, 1, 'Semi-final', 2, 1, pa3, pa4, U3, U4, {
      is_bracket: true, is_final: 0, bracket_depth: 1,
      target_round: 2, target_bracket_position: 0, target_side: 'player2',
      loser_target_round: 2, loser_target_bracket_position: 1, loser_target_side: 'player2',
    }, 'in_progress',
  );
  // Approved home-win results for both semifinals (u1>u2, u3>u4).
  const semiAResult = await approveHomeWin(sA.sharedMatchId as number, U1, U2);
  const semiBResult = await approveHomeWin(sB.sharedMatchId as number, U3, U4);
  // Final — seeded empty, scheduled (awaiting the two semifinal winners).
  const fin = await mkSlot(
    competitionId, 2, 'Final', 3, 0, null, null, null, null, {
      is_bracket: true, is_final: 1, bracket_depth: 0, target_round: null, target_bracket_position: null, target_side: 'player1',
    }, 'scheduled',
  );
  // Dedicated third-place match — seeded empty, scheduled, flagged is_third_place.
  const third = await mkSlot(
    competitionId, 2, 'Third-place', 4, 1, null, null, null, null, {
      is_bracket: true, is_final: 0, bracket_depth: 1, is_third_place: true, target_round: null, target_bracket_position: null, target_side: 'player1',
    }, 'scheduled',
  );

  return {
    tournamentId,
    competitionId,
    semiA: sA.slotId, semiB: sB.slotId, finalSlot: fin.slotId, thirdSlot: third.slotId,
    semiAResult, semiBResult,
    pa1, pa2, pa3, pa4,
  };
}

async function progress(sharedMatchId: number, resultId: number) {
  const { handleProgressionEvent } = await import('../application/tournament-progression.listener.js');
  await handleProgressionEvent({ eventName: 'match:result-approved', payload: { matchId: sharedMatchId, resultId } } as any);
}

async function sharedMatchOf(slotId: number): Promise<number | null> {
  const [row] = await q<any>('SELECT match_id FROM tournament_matches WHERE id = ?', [slotId]);
  return row?.match_id == null ? null : Number(row.match_id);
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  await cleanupFixtures();
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  await pool.execute(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
     VALUES (?, UUID(), ?, 1, 'TP Org', 'tp-org', 1)`, [ORG, Number((ot as any[])[0].id)],
  );
  const [sp] = await pool.execute<RowData>(
    `INSERT INTO sports (name, slug, is_active, show_in_marketplace, sort_order) VALUES ('TP Sport', 'tp-sport', 1, 1, 0)`,
  );
  sportId = Number((sp as any).insertId);
  const [ff] = await pool.execute<RowData>(
    `INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active)
     VALUES (?, 'tp-singles', 'TP Singles', 'singles', 1, NULL, 1, 1)`, [sportId],
  );
  fmtId = Number((ff as any).insertId);
  const [rr] = await pool.execute<RowData>(
    `INSERT INTO sport_rule_sets (format_id, name, version, is_active, rules, standings_rules)
     VALUES (?, 'TP Rules', 1, 1, ?, ?)`, [fmtId, JSON.stringify(RULES), JSON.stringify(STANDINGS)],
  );
  ruleSetId = Number((rr as any).insertId);
  for (const id of [CREATOR, U1, U2, U3, U4]) await mkUser(id);
}, 120000);

afterAll(async () => {
  await cleanupFixtures();
  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
  await pool.execute('DELETE FROM sport_rule_sets WHERE id = ?', [ruleSetId]);
  await pool.execute('DELETE FROM sport_formats WHERE id = ?', [fmtId]);
  await pool.execute('DELETE FROM sports WHERE id = ?', [sportId]);
  await pool.execute(`DELETE FROM users WHERE id IN (${CREATOR}, ${U1}, ${U2}, ${U3}, ${U4})`);
  await pool.execute('DELETE FROM organisations WHERE id = ?', [ORG]);
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 120000);

beforeEach(async () => { await cleanupFixtures(); });
afterEach(async () => { await cleanupFixtures(); });

describe('GSK-3C third-place playoff (real handler, real DB)', () => {
  it('routes both semifinal losers to the third-place match and does NOT complete while it is unresolved', async () => {
    const f = await seedThirdPlaceBracket();

    await progress(await sharedMatchOf(f.semiA) as number, f.semiAResult);
    await progress(await sharedMatchOf(f.semiB) as number, f.semiBResult);

    // Final seated with both semifinal WINNERS.
    const [fin] = await q<any>('SELECT participant1_id, participant2_id, match_id FROM tournament_matches WHERE id = ?', [f.finalSlot]);
    expect(Number(fin.participant1_id)).toBe(f.pa1);
    expect(Number(fin.participant2_id)).toBe(f.pa3);
    expect(fin.match_id).not.toBeNull();

    // Third-place seated with both semifinal LOSERS, per side (upper→player1, lower→player2).
    const [third] = await q<any>('SELECT participant1_id, participant2_id, match_id FROM tournament_matches WHERE id = ?', [f.thirdSlot]);
    expect(Number(third.participant1_id)).toBe(f.pa2);
    expect(Number(third.participant2_id)).toBe(f.pa4);
    expect(third.match_id).not.toBeNull();

    const [t] = await q<any>('SELECT status FROM tournaments WHERE id = ?', [f.tournamentId]);
    expect(t.status).toBe('running');
  });

  it('blocks completion after the final until the third-place match is resolved, then captures placements 1/2/3', async () => {
    const f = await seedThirdPlaceBracket();
    await progress(await sharedMatchOf(f.semiA) as number, f.semiAResult);
    await progress(await sharedMatchOf(f.semiB) as number, f.semiBResult);

    // Play the FINAL — pa1 (home) beats pa3 (away).
    const finalShared = await sharedMatchOf(f.finalSlot) as number;
    const finalResult = await approveHomeWin(finalShared, U1, U3);
    await progress(finalShared, finalResult);

    const [finalSlot] = await q<any>('SELECT progression_state, winner_participant_id, final_position FROM tournament_matches WHERE id = ?', [f.finalSlot]);
    expect(finalSlot.progression_state).toBe('completed');
    expect(Number(finalSlot.winner_participant_id)).toBe(f.pa1);
    expect(Number(finalSlot.final_position)).toBe(1);

    // Tournament must STAY running — the third-place match is still required.
    const [tAfterFinal] = await q<any>('SELECT status FROM tournaments WHERE id = ?', [f.tournamentId]);
    expect(tAfterFinal.status).toBe('running');
    const [pcAfterFinal] = await q<any>('SELECT COUNT(*) AS c FROM tournament_placements WHERE tournament_id = ?', [f.tournamentId]);
    expect(Number(pcAfterFinal.c)).toBe(0);

    // Play the THIRD-PLACE match — pa2 (home) beats pa4 (away) → placement 3 = pa2.
    const thirdShared = await sharedMatchOf(f.thirdSlot) as number;
    const thirdResult = await approveHomeWin(thirdShared, U2, U4);
    await progress(thirdShared, thirdResult);

    const [thirdSlot] = await q<any>('SELECT progression_state, winner_participant_id, final_position FROM tournament_matches WHERE id = ?', [f.thirdSlot]);
    expect(thirdSlot.progression_state).toBe('completed');
    expect(Number(thirdSlot.winner_participant_id)).toBe(f.pa2);
    // The third-place slot is NOT the championship final → final_position 3.
    expect(Number(thirdSlot.final_position)).toBe(3);

    const [tDone] = await q<any>('SELECT status FROM tournaments WHERE id = ?', [f.tournamentId]);
    expect(tDone.status).toBe('completed');

    const rows = await q<any>(
      'SELECT placement, participant_id, user_id FROM tournament_placements WHERE tournament_id = ? ORDER BY placement',
      [f.tournamentId],
    );
    expect(rows.map((r: any) => [Number(r.placement), Number(r.participant_id), Number(r.user_id)])).toEqual([
      [1, f.pa1, U1],
      [2, f.pa3, U3],
      [3, f.pa2, U2],
    ]);
  });

  it('is idempotent — re-processing approved results adds no duplicate routing, matches or placements', async () => {
    const f = await seedThirdPlaceBracket();
    await progress(await sharedMatchOf(f.semiA) as number, f.semiAResult);
    await progress(await sharedMatchOf(f.semiB) as number, f.semiBResult);

    const finalShared = await sharedMatchOf(f.finalSlot) as number;
    const finalResult = await approveHomeWin(finalShared, U1, U3);
    await progress(finalShared, finalResult);
    const thirdShared = await sharedMatchOf(f.thirdSlot) as number;
    const thirdResult = await approveHomeWin(thirdShared, U2, U4);
    await progress(thirdShared, thirdResult);

    const [matchesBefore] = await q<any>('SELECT COUNT(*) AS c FROM matches WHERE tournament_id = ?', [f.tournamentId]);
    const placementsBefore = await q<any>('SELECT placement, participant_id, user_id FROM tournament_placements WHERE tournament_id = ? ORDER BY placement', [f.tournamentId]);

    // Re-deliver every approved result — all slots are already terminal.
    await progress(await sharedMatchOf(f.semiA) as number, f.semiAResult);
    await progress(await sharedMatchOf(f.semiB) as number, f.semiBResult);
    await progress(finalShared, finalResult);
    await progress(thirdShared, thirdResult);

    const [matchesAfter] = await q<any>('SELECT COUNT(*) AS c FROM matches WHERE tournament_id = ?', [f.tournamentId]);
    const placementsAfter = await q<any>('SELECT placement, participant_id, user_id FROM tournament_placements WHERE tournament_id = ? ORDER BY placement', [f.tournamentId]);
    expect(Number(matchesAfter.c)).toBe(Number(matchesBefore.c));
    expect(placementsAfter).toEqual(placementsBefore);
    expect(placementsAfter).toHaveLength(3);

    // Third-place side is not re-seated and shared matches are not duplicated.
    const [third] = await q<any>('SELECT participant1_id, participant2_id FROM tournament_matches WHERE id = ?', [f.thirdSlot]);
    expect(Number(third.participant1_id)).toBe(f.pa2);
    expect(Number(third.participant2_id)).toBe(f.pa4);

    const [audit] = await q<any>(`SELECT COUNT(*) AS c FROM audit_logs WHERE action='TOURNAMENT.AUTO_COMPLETED' AND entity_type='tournament' AND entity_id = ?`, [f.tournamentId]);
    expect(Number(audit.c)).toBe(1);
  });

  it('fails closed — a dedicated third-place slot that is never resolved yields NO placement 3', async () => {
    const f = await seedThirdPlaceBracket();
    await progress(await sharedMatchOf(f.semiA) as number, f.semiAResult);
    await progress(await sharedMatchOf(f.semiB) as number, f.semiBResult);

    // Play only the final; the third-place match stays scheduled.
    const finalShared = await sharedMatchOf(f.finalSlot) as number;
    const finalResult = await approveHomeWin(finalShared, U1, U3);
    await progress(finalShared, finalResult);

    // Operator cannot force completion: the required third-place match is unresolved.
    const { tournamentService } = await import('../application/tournament.service.js');
    await expect(tournamentService.complete(f.tournamentId)).rejects.toThrow();

    const [t] = await q<any>('SELECT status FROM tournaments WHERE id = ?', [f.tournamentId]);
    expect(t.status).toBe('running');
    const placements = await q<any>('SELECT placement FROM tournament_placements WHERE tournament_id = ?', [f.tournamentId]);
    expect(placements).toHaveLength(0);
  });
});
