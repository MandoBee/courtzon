import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * Multi-competition completion + placement capture — REAL DB + REAL handler.
 *
 * Locks the fix: a tournament with TWO independent knockout competitions must
 * NOT auto-complete while a sibling competition still has an unresolved final,
 * and once BOTH finals are resolved the tournament completes with
 * COMPETITION-SPECIFIC placements (explicit `competition_id`, never relying on
 * the tournament's default competition — here neither competition is default).
 *
 * Uses the shared LOCAL test database only (127.0.0.1:3307 / courtzon_v3).
 */
const ORG = 2820101;
const CREATOR = 2820102;
const A1 = 2820111; const A2 = 2820112; // competition A players
const B1 = 2820113; const B2 = 2820114; // competition B players

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
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'MC User', 'male', 'active', NULL)`,
    [id, `021${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, `mc-${id}@test.com`],
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
  compA: number; compB: number;
  slotA: number; slotB: number;
  resultA: number; resultB: number;
  pa1: number; pa2: number; pb1: number; pb2: number;
}

async function seedMultiCompetition(): Promise<Fixture> {
  const [t] = await pool.execute<RowData>(
    `INSERT INTO tournaments
       (public_id, creator_id, organisation_id, bracket_type_id, format, rule_set_id, sport_id, name, max_participants,
        min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type,
        commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, 1, 'knockout', ?, ?, 'Multi-Comp Cup', 8, 2, 0, 0, 'EGP', 'FREE', 'community',
        0, 'running', 0, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
    [CREATOR, ORG, ruleSetId, sportId],
  );
  const tournamentId = Number((t as any).insertId);

  const mkCompetition = async (name: string): Promise<number> => {
    const [c] = await pool.execute<RowData>(
      `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, currency_code, is_default)
       VALUES (UUID(), ?, 'singles', ?, 'EGP', 0)`, [tournamentId, name],
    );
    return Number((c as any).insertId);
  };
  const compA = await mkCompetition('Singles A');
  const compB = await mkCompetition('Singles B');

  const mkParticipant = async (competitionId: number, player: number): Promise<number> => {
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
  const pa1 = await mkParticipant(compA, A1);
  const pa2 = await mkParticipant(compA, A2);
  const pb1 = await mkParticipant(compB, B1);
  const pb2 = await mkParticipant(compB, B2);

  const mkFinal = async (competitionId: number, p1: number, p2: number, u1: number, u2: number): Promise<{ slotId: number; resultId: number }> => {
    const [m] = await pool.execute<RowData>(
      `INSERT INTO matches (type, sport_id, tournament_id, format_id) VALUES ('public', ?, ?, ?)`,
      [sportId, tournamentId, fmtId],
    );
    const sharedMatchId = Number((m as any).insertId);
    const [tm] = await pool.execute<RowData>(
      `INSERT INTO tournament_matches
         (tournament_id, competition_id, match_id, round, round_name, match_number, bracket_position,
          participant1_id, participant2_id, player1_id, player2_id, is_final, bracket_depth,
          status, progression_state, progression_meta)
       VALUES (?, ?, ?, 1, 'Final', 1, 0, ?, ?, ?, ?, 1, 0, 'in_progress', 'pending', ?)`,
      [tournamentId, competitionId, sharedMatchId, p1, p2, u1, u2,
        JSON.stringify({ is_bracket: true, is_final: 1, target_round: null, target_bracket_position: null, target_side: 'player1' })],
    );
    const slotId = Number((tm as any).insertId);
    const [r] = await pool.execute<RowData>(
      `INSERT INTO match_result_records
         (match_id, sport_id, format_id, rule_set_id, rules_snapshot, match_type, played_at, tournament_id,
          participant_payload, raw_result, final_result, outcome, submission_status, submitted_by, accepted_by, accepted_at)
       VALUES (?, ?, ?, ?, ?, 'tournament', NOW(), ?, ?, ?, ?, 'completed', 'approved', ?, ?, NOW())`,
      [sharedMatchId, sportId, fmtId, ruleSetId, JSON.stringify(RULES), tournamentId,
        JSON.stringify({ participants: [u1, u2] }),
        JSON.stringify({ score: { sets: [{ home: 6, away: 3 }, { home: 6, away: 3 }] } }),
        JSON.stringify({ winner: 'home', scoreSummary: '2-0 (6-3, 6-3)' }),
        CREATOR, CREATOR],
    );
    const resultId = Number((r as any).insertId);
    await pool.execute(
      `INSERT INTO match_result_participants (result_id, match_id, user_id, team_index, side, outcome)
       VALUES (?, ?, ?, 0, 'home', 'win'), (?, ?, ?, 1, 'away', 'loss')`,
      [resultId, sharedMatchId, u1, resultId, sharedMatchId, u2],
    );
    return { slotId, resultId };
  };

  const a = await mkFinal(compA, pa1, pa2, A1, A2);
  const b = await mkFinal(compB, pb1, pb2, B1, B2);

  return {
    tournamentId, compA, compB,
    slotA: a.slotId, slotB: b.slotId,
    resultA: a.resultId, resultB: b.resultId,
    pa1, pa2, pb1, pb2,
  };
}

async function progress(sharedMatchId: number, resultId: number) {
  const { handleProgressionEvent } = await import('../application/tournament-progression.listener.js');
  await handleProgressionEvent({ eventName: 'match:result-approved', payload: { matchId: sharedMatchId, resultId } } as any);
}

async function sharedMatchOf(slotId: number): Promise<number> {
  const [row] = await q<any>('SELECT match_id FROM tournament_matches WHERE id = ?', [slotId]);
  return Number(row.match_id);
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  await cleanupFixtures();
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  await pool.execute(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
     VALUES (?, UUID(), ?, 1, 'MC Org', 'mc-org', 1)`, [ORG, Number((ot as any[])[0].id)],
  );
  const [sp] = await pool.execute<RowData>(
    `INSERT INTO sports (name, slug, is_active, show_in_marketplace, sort_order) VALUES ('MC Sport', 'mc-sport', 1, 1, 0)`,
  );
  sportId = Number((sp as any).insertId);
  const [ff] = await pool.execute<RowData>(
    `INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active)
     VALUES (?, 'mc-singles', 'MC Singles', 'singles', 1, NULL, 1, 1)`, [sportId],
  );
  fmtId = Number((ff as any).insertId);
  const [rr] = await pool.execute<RowData>(
    `INSERT INTO sport_rule_sets (format_id, name, version, is_active, rules, standings_rules)
     VALUES (?, 'MC Rules', 1, 1, ?, ?)`, [fmtId, JSON.stringify(RULES), JSON.stringify(STANDINGS)],
  );
  ruleSetId = Number((rr as any).insertId);
  for (const id of [CREATOR, A1, A2, B1, B2]) await mkUser(id);
}, 120000);

afterAll(async () => {
  await cleanupFixtures();
  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
  await pool.execute('DELETE FROM sport_rule_sets WHERE id = ?', [ruleSetId]);
  await pool.execute('DELETE FROM sport_formats WHERE id = ?', [fmtId]);
  await pool.execute('DELETE FROM sports WHERE id = ?', [sportId]);
  await pool.execute(`DELETE FROM users WHERE id IN (${CREATOR}, ${A1}, ${A2}, ${B1}, ${B2})`);
  await pool.execute('DELETE FROM organisations WHERE id = ?', [ORG]);
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 120000);

beforeEach(async () => { await cleanupFixtures(); });
afterEach(async () => { await cleanupFixtures(); });

describe('Multi-competition tournament completion + placements (real handler, real DB)', () => {
  it('stays running after competition A completes while competition B is unresolved', async () => {
    const f = await seedMultiCompetition();

    await progress(await sharedMatchOf(f.slotA), f.resultA);

    const [slotA] = await q<any>('SELECT status, progression_state, winner_participant_id, final_position FROM tournament_matches WHERE id = ?', [f.slotA]);
    expect(slotA.progression_state).toBe('completed');
    expect(Number(slotA.winner_participant_id)).toBe(f.pa1);
    expect(Number(slotA.final_position)).toBe(1);

    const [t] = await q<any>('SELECT status FROM tournaments WHERE id = ?', [f.tournamentId]);
    expect(t.status).toBe('running');

    const [placements] = await q<any>('SELECT COUNT(*) AS c FROM tournament_placements WHERE tournament_id = ?', [f.tournamentId]);
    expect(Number(placements.c)).toBe(0);
    const [audit] = await q<any>(`SELECT COUNT(*) AS c FROM audit_logs WHERE action='TOURNAMENT.AUTO_COMPLETED' AND entity_type='tournament' AND entity_id = ?`, [f.tournamentId]);
    expect(Number(audit.c)).toBe(0);
  });

  it('completes with competition-specific placements once BOTH competitions finish', async () => {
    const f = await seedMultiCompetition();

    await progress(await sharedMatchOf(f.slotA), f.resultA);
    await progress(await sharedMatchOf(f.slotB), f.resultB);

    const [t] = await q<any>('SELECT status FROM tournaments WHERE id = ?', [f.tournamentId]);
    expect(t.status).toBe('completed');

    const [slotB] = await q<any>('SELECT progression_state, winner_participant_id, final_position FROM tournament_matches WHERE id = ?', [f.slotB]);
    expect(slotB.progression_state).toBe('completed');
    expect(Number(slotB.winner_participant_id)).toBe(f.pb1);
    expect(Number(slotB.final_position)).toBe(1);

    const rows = await q<any>('SELECT competition_id, placement, participant_id, user_id FROM tournament_placements WHERE tournament_id = ? ORDER BY competition_id, placement', [f.tournamentId]);
    expect(rows).toHaveLength(4);
    expect(rows.map((r: any) => [Number(r.competition_id), Number(r.placement), Number(r.participant_id), Number(r.user_id)])).toEqual([
      [f.compA, 1, f.pa1, A1],
      [f.compA, 2, f.pa2, A2],
      [f.compB, 1, f.pb1, B1],
      [f.compB, 2, f.pb2, B2],
    ]);

    const [audit] = await q<any>(`SELECT COUNT(*) AS c FROM audit_logs WHERE action='TOURNAMENT.AUTO_COMPLETED' AND entity_type='tournament' AND entity_id = ?`, [f.tournamentId]);
    expect(Number(audit.c)).toBe(1);
  });

  it('is idempotent — re-processing an approved result adds no duplicate completion/placement effects', async () => {
    const f = await seedMultiCompetition();
    await progress(await sharedMatchOf(f.slotA), f.resultA);
    await progress(await sharedMatchOf(f.slotB), f.resultB);
    const before = await q<any>('SELECT competition_id, placement, participant_id, user_id FROM tournament_placements WHERE tournament_id = ? ORDER BY competition_id, placement', [f.tournamentId]);

    // Re-deliver competition B's approved result — the slot is already terminal.
    await progress(await sharedMatchOf(f.slotB), f.resultB);

    const after = await q<any>('SELECT competition_id, placement, participant_id, user_id FROM tournament_placements WHERE tournament_id = ? ORDER BY competition_id, placement', [f.tournamentId]);
    expect(after).toEqual(before);
    expect(after).toHaveLength(4);
    const [audit] = await q<any>(`SELECT COUNT(*) AS c FROM audit_logs WHERE action='TOURNAMENT.AUTO_COMPLETED' AND entity_type='tournament' AND entity_id = ?`, [f.tournamentId]);
    expect(Number(audit.c)).toBe(1);
  });
});
