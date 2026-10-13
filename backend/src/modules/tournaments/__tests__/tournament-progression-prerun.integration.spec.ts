import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * Pre-run lifecycle progression — REAL DB + REAL production handler.
 *
 * Locks the progression rollback fix end-to-end against the shared LOCAL test
 * database (127.0.0.1:3307 / courtzon_v3 — never production):
 *
 *   A two-player knockout FINAL whose approved result is processed while the
 *   tournament is still `registration_open` must:
 *     • terminalize its bracket slot (progression_state='completed',
 *       winner_participant_id set, final_position=1) and COMMIT it;
 *     • NOT auto-complete the tournament (status stays `registration_open`);
 *     • create ZERO tournament_placements / tournament_prize_awards rows;
 *     • write NO `TOURNAMENT.AUTO_COMPLETED` audit row;
 *     • be idempotent on redelivery (no duplicate effects).
 *
 * The handler is invoked through the EXACT production entry point
 * (`handleProgressionEvent`), not a re-implementation.
 */
const ORG = 2810101;
const CREATOR = 2810102;
const P1 = 2810111;
const P2 = 2810112;

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
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'Prerun User', 'male', 'active', NULL)`,
    [id, `019${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, `prerun-${id}@test.com`],
  );
}

async function seedOrg() {
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  await pool.execute(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
     VALUES (?, UUID(), ?, 1, 'Prerun Org', 'prerun-org', 1)`,
    [ORG, Number((ot as any[])[0].id)],
  );
}

async function seedSports() {
  const [sp] = await pool.execute<RowData>(
    `INSERT INTO sports (name, slug, is_active, show_in_marketplace, sort_order) VALUES ('Prerun Sport', 'prerun-sport', 1, 1, 0)`,
  );
  sportId = Number((sp as any).insertId);
  const [ff] = await pool.execute<RowData>(
    `INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active)
     VALUES (?, 'prerun-singles', 'Prerun Singles', 'singles', 1, NULL, 1, 1)`, [sportId],
  );
  fmtId = Number((ff as any).insertId);
  const [rr] = await pool.execute<RowData>(
    `INSERT INTO sport_rule_sets (format_id, name, version, is_active, rules, standings_rules)
     VALUES (?, 'Prerun Rules', 1, 1, ?, ?)`,
    [fmtId, JSON.stringify(RULES), JSON.stringify(STANDINGS)],
  );
  ruleSetId = Number((rr as any).insertId);
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

interface PrerunFinal {
  tournamentId: number;
  competitionId: number;
  tournamentMatchId: number;
  sharedMatchId: number;
  resultId: number;
  participant1Id: number;
  participant2Id: number;
}

/**
 * Isolated two-player knockout FINAL, tournament left in `registration_open`,
 * a completed shared match + an APPROVED result whose winner is the home side.
 */
async function seedPrerunFinal(): Promise<PrerunFinal> {
  const [t] = await pool.execute<RowData>(
    `INSERT INTO tournaments
       (public_id, creator_id, organisation_id, bracket_type_id, format, rule_set_id, sport_id, name, max_participants,
        min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type,
        commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, 1, 'knockout', ?, ?, 'Prerun Final Cup', 4, 2, 0, 0, 'EGP', 'FREE', 'community',
        0, 'registration_open', 0, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
    [CREATOR, ORG, ruleSetId, sportId],
  );
  const tournamentId = Number((t as any).insertId);

  const [c] = await pool.execute<RowData>(
    `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, currency_code, is_default)
     VALUES (UUID(), ?, 'singles', 'Singles A', 'EGP', 1)`, [tournamentId],
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
  const participant1Id = await mkParticipant(P1);
  const participant2Id = await mkParticipant(P2);

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
     VALUES (?, ?, ?, 1, 'Final', 1, 0, ?, ?, ?, ?, 1, 0, 'completed', 'pending', ?)`,
    [
      tournamentId, competitionId, sharedMatchId,
      participant1Id, participant2Id, P1, P2,
      JSON.stringify({ is_bracket: true, is_final: 1, target_round: null, target_bracket_position: null, target_side: 'player1' }),
    ],
  );
  const tournamentMatchId = Number((tm as any).insertId);

  const [r] = await pool.execute<RowData>(
    `INSERT INTO match_result_records
       (match_id, sport_id, format_id, rule_set_id, rules_snapshot, match_type, played_at, tournament_id,
        participant_payload, raw_result, final_result, outcome, submission_status, submitted_by, accepted_by, accepted_at)
     VALUES (?, ?, ?, ?, ?, 'tournament', NOW(), ?, ?, ?, ?, 'completed', 'approved', ?, ?, NOW())`,
    [
      sharedMatchId, sportId, fmtId, ruleSetId, JSON.stringify(RULES), tournamentId,
      JSON.stringify({ participants: [P1, P2] }),
      JSON.stringify({ score: { sets: [{ home: 6, away: 3 }, { home: 6, away: 3 }] } }),
      JSON.stringify({ winner: 'home', scoreSummary: '2-0 (6-3, 6-3)' }),
      CREATOR, CREATOR,
    ],
  );
  const resultId = Number((r as any).insertId);

  await pool.execute(
    `INSERT INTO match_result_participants (result_id, match_id, user_id, team_index, side, outcome)
     VALUES (?, ?, ?, 0, 'home', 'win'), (?, ?, ?, 1, 'away', 'loss')`,
    [resultId, sharedMatchId, P1, resultId, sharedMatchId, P2],
  );

  return { tournamentId, competitionId, tournamentMatchId, sharedMatchId, resultId, participant1Id, participant2Id };
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  await cleanupFixtures();
  await seedOrg();
  await seedSports();
  for (const id of [CREATOR, P1, P2]) await mkUser(id);
}, 120000);

afterAll(async () => {
  await cleanupFixtures();
  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
  await pool.execute(`DELETE FROM sport_rule_sets WHERE id = ?`, [ruleSetId]);
  await pool.execute(`DELETE FROM sport_formats WHERE id = ?`, [fmtId]);
  await pool.execute(`DELETE FROM sports WHERE id = ?`, [sportId]);
  await pool.execute(`DELETE FROM users WHERE id IN (${CREATOR}, ${P1}, ${P2})`);
  await pool.execute(`DELETE FROM organisations WHERE id = ?`, [ORG]);
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 120000);

beforeEach(async () => { await cleanupFixtures(); });
afterEach(async () => { await cleanupFixtures(); });

describe('Tournament progression — pre-run final (real handler, real DB)', () => {
  it('registration_open: terminalizes the final slot, does NOT auto-complete, and creates no placements/prizes/audit', async () => {
    const f = await seedPrerunFinal();
    const { handleProgressionEvent } = await import('../application/tournament-progression.listener.js');

    await handleProgressionEvent({ eventName: 'match:result-approved', payload: { matchId: f.sharedMatchId, resultId: f.resultId } } as any);

    const [slot] = await q<any>('SELECT progression_state, status, winner_id, winner_participant_id, loser_participant_id, final_position FROM tournament_matches WHERE id = ?', [f.tournamentMatchId]);
    expect(slot.progression_state).toBe('completed');
    expect(slot.status).toBe('completed');
    expect(Number(slot.winner_id)).toBe(P1);
    expect(Number(slot.winner_participant_id)).toBe(f.participant1Id);
    expect(Number(slot.loser_participant_id)).toBe(f.participant2Id);
    expect(Number(slot.final_position)).toBe(1);

    const [t] = await q<any>('SELECT status FROM tournaments WHERE id = ?', [f.tournamentId]);
    expect(t.status).toBe('registration_open');

    const [placements] = await q<any>('SELECT COUNT(*) AS c FROM tournament_placements WHERE tournament_id = ?', [f.tournamentId]);
    expect(Number(placements.c)).toBe(0);
    const [awards] = await q<any>('SELECT COUNT(*) AS c FROM tournament_prize_awards WHERE tournament_id = ?', [f.tournamentId]);
    expect(Number(awards.c)).toBe(0);
    const [audit] = await q<any>(`SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'TOURNAMENT.AUTO_COMPLETED' AND entity_type = 'tournament' AND entity_id = ?`, [f.tournamentId]);
    expect(Number(audit.c)).toBe(0);
  });

  it('redelivery of the same approved-result event is idempotent (no duplicate effects)', async () => {
    const f = await seedPrerunFinal();
    const { handleProgressionEvent } = await import('../application/tournament-progression.listener.js');
    const envelope = { eventName: 'match:result-approved', payload: { matchId: f.sharedMatchId, resultId: f.resultId } } as any;

    await handleProgressionEvent(envelope);
    const before = await q<any>('SELECT id, progression_state, status, winner_id, winner_participant_id, final_position FROM tournament_matches WHERE tournament_id = ? ORDER BY id', [f.tournamentId]);

    await handleProgressionEvent(envelope);
    const after = await q<any>('SELECT id, progression_state, status, winner_id, winner_participant_id, final_position FROM tournament_matches WHERE tournament_id = ? ORDER BY id', [f.tournamentId]);

    // Exactly one match row, unchanged by the redelivery.
    expect(after).toHaveLength(1);
    expect(after).toEqual(before);
    expect(after[0].progression_state).toBe('completed');

    const [placements] = await q<any>('SELECT COUNT(*) AS c FROM tournament_placements WHERE tournament_id = ?', [f.tournamentId]);
    expect(Number(placements.c)).toBe(0);
    const [awards] = await q<any>('SELECT COUNT(*) AS c FROM tournament_prize_awards WHERE tournament_id = ?', [f.tournamentId]);
    expect(Number(awards.c)).toBe(0);
    const [audit] = await q<any>(`SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'TOURNAMENT.AUTO_COMPLETED' AND entity_type = 'tournament' AND entity_id = ?`, [f.tournamentId]);
    expect(Number(audit.c)).toBe(0);
    const [t] = await q<any>('SELECT status FROM tournaments WHERE id = ?', [f.tournamentId]);
    expect(t.status).toBe('registration_open');
  });
});
