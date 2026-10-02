import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3010';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * G11.14 — tournament outcome integrity against the REAL schema:
 *  • the DB now accepts 'disqualified' / 'forfeit' / 'no_show' (migration 184)
 *    — the mocked-repository blind spot cannot recur;
 *  • `updateMatchStatus` rejects values outside the ENUM with a 409;
 *  • operator completion resolves knockout placements WITHOUT manual assertion
 *    (fail-closed resolver), produces ZERO prize awards, ZERO tournament GL
 *    entries and ZERO tournament financial entitlements;
 *  • an ambiguous bracket resolves NO placement.
 */

const ORG = 2660100;
const CREATOR = 2660200;
const P1 = 2660211;
const P2 = 2660212;
const P3 = 2660213;
const P4 = 2660214;
const P5 = 2660215;
const P6 = 2660216;
const P7 = 2660217;
const P8 = 2660218;

let pool: mysql.Pool;
const tournamentIds: number[] = [];
const participantIds: number[] = [];
const regIds: number[] = [];
const matchIds: number[] = [];

const exec = (sql: string, params: any[] = []) => pool.execute(sql, params);

async function mkUser(id: number) {
  await pool.execute(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status, language_id)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'G11.14 User', 'male', 'active', NULL)`,
    [id, `018${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, `g1114-${id}@test.com`],
  );
}

async function seedOrg() {
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  await pool.execute(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
     VALUES (${ORG}, UUID(), ?, 1, 'G11.14 Org', 'g1114-${ORG}', 1)`, [otId]);
}

async function createTournament(status = 'running'): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournaments
       (public_id, creator_id, organisation_id, bracket_type_id, format, name, max_participants,
        min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type,
        commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, 1, 'knockout', 'G11.14 Bracket', 8, 2, 0, 0, 'EGP', 'FREE', 'community',
        0, ?, 1, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
    [CREATOR, ORG, status],
  );
  const tid = Number((res as any).insertId);
  tournamentIds.push(tid);
  await pool.execute(
    `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, currency_code, is_default)
     VALUES (UUID(), ?, 'singles', 'Default', 'EGP', 1)`, [tid]);
  return tid;
}

async function createRegistration(tid: number, player: number): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status)
     VALUES (?, ?, 'paid', 'confirmed')`, [tid, player]);
  const rid = Number((res as any).insertId);
  regIds.push(rid);
  return rid;
}

async function createParticipant(tid: number, regId: number, userId: number): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournament_participants (tournament_id, registration_id, participant_type, status, member_user_ids)
     VALUES (?, ?, 'individual', 'active', ?)`, [tid, regId, JSON.stringify([userId])]);
  const pid = Number((res as any).insertId);
  participantIds.push(pid);
  return pid;
}

/** Build a completed 8-player bracket (mirrors the engine's terminal state). */
async function buildCompletedBracket(tid: number, parts: Array<{ participantId: number; userId: number }>): Promise<void> {
  const s = async (round: number, bp: number, w: { participantId: number; userId: number }, l: { participantId: number; userId: number } | null, targetR: number | null, targetBp: number | null) => {
    const [res] = await pool.execute<RowData>(
      `INSERT INTO tournament_matches
         (tournament_id, match_id, round, match_number, bracket_position, participant1_id, participant2_id,
          player1_id, player2_id, winner_id, winner_participant_id, loser_participant_id, is_final, bracket_depth,
          status, progression_state, progression_meta)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', 'completed', ?)`,
      [tid, round, bp, bp, w.participantId, l?.participantId ?? null, w.userId, l?.userId ?? null,
        w.userId, w.participantId, l?.participantId ?? null,
        Number(targetR == null) ? 1 : 0, targetR == null ? 0 : 3 - round,
        JSON.stringify({ is_bracket: true, target_round: targetR, target_bracket_position: targetBp, target_side: bp % 2 === 0 ? 'player1' : 'player2' })],
    );
    matchIds.push(Number((res as any).insertId));
  };
  const [A, B, C, D, E, F2, G2, H] = parts;
  // Round 1 → winners advance (A,B,C,D win)
  await s(1, 0, A, B, 2, 0);
  await s(1, 1, C, D, 2, 1);
  await s(1, 2, E, F2, 2, 0);
  await s(1, 3, G2, H, 2, 1);
  // Round 2 (semi-finals) → A, E advance
  await s(2, 0, A, C, 3, 0);
  await s(2, 1, E, G2, 3, 0);
  // Final → champion A, runner-up E
  await s(3, 0, A, E, null, null);
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  await seedOrg();
  for (const id of [CREATOR, P1, P2, P3, P4, P5, P6, P7, P8]) await mkUser(id);
}, 120000);

afterAll(async () => {
  await cleanup();
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 120000);

async function cleanup() {
  if (!pool) return;
  await pool.execute(`SET FOREIGN_KEY_CHECKS = 0`);
  const idList = tournamentIds.length ? tournamentIds.join(',') : '0';
  const pidList = participantIds.length ? participantIds.join(',') : '0';
  const regList = regIds.length ? regIds.join(',') : '0';
  const midList = matchIds.length ? matchIds.join(',') : '0';
  await pool.execute(`DELETE FROM tournament_placements WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_matches WHERE tournament_id IN (${idList}) OR id IN (${midList})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE tournament_id IN (${idList}) OR id IN (${regList})`);
  await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (${idList}) OR id IN (${pidList})`);
  await pool.execute(`DELETE FROM tournament_prize_awards WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM ledger_entries WHERE source_type = 'tournament' AND (source_id IN (${idList}) OR source_id IN (${regList}))`);
  await pool.execute(`DELETE FROM financial_entitlements WHERE source_type = 'tournament' AND (source_id IN (${idList}) OR source_id IN (${regList}))`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${idList})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${CREATOR}, ${P1}, ${P2}, ${P3}, ${P4}, ${P5}, ${P6}, ${P7}, ${P8})`);
  await pool.execute(`DELETE FROM organisations WHERE id = ${ORG}`);
  await pool.execute(`SET FOREIGN_KEY_CHECKS = 1`);
  tournamentIds.length = 0; participantIds.length = 0; regIds.length = 0; matchIds.length = 0;
}

beforeEach(async () => { await cleanup(); await seedOrg(); for (const id of [CREATOR, P1, P2, P3, P4, P5, P6, P7, P8]) await mkUser(id); });
afterEach(() => vi.clearAllMocks());

describe('G11.14 outcome integrity (real schema)', () => {
  it('ENUM: participant status accepts disqualified; match status accepts forfeit/no_show; invalid rejected (409)', async () => {
    const tid = await createTournament('registration_open');
    const regId = await createRegistration(tid, P1);
    const pid = await createParticipant(tid, regId, P1);
    const { participantDrawRepository } = await import('../infrastructure/repositories/participant-draw.repository.js');
    await participantDrawRepository.updateParticipantStatus(pid, 'disqualified');
    const [pr] = await pool.execute<RowData>('SELECT status FROM tournament_participants WHERE id = ?', [pid]);
    expect((pr as any[])[0].status).toBe('disqualified');
    await participantDrawRepository.updateParticipantStatus(pid, 'active');

    const [mid] = await pool.execute<RowData>(
      `INSERT INTO tournament_matches (tournament_id, round, match_number, bracket_position, participant1_id, participant2_id, status, progression_state, progression_meta)
       VALUES (?, 1, 1, 0, ?, NULL, 'scheduled', 'pending', '{"is_bracket":true}')`, [tid, pid]);
    const matchId = Number((mid as any).insertId);
    matchIds.push(matchId);
    const { tournamentRepository } = await import('../infrastructure/repositories/tournament.repository.js');
    await tournamentRepository.updateMatchStatus(matchId, 'forfeit');
    await tournamentRepository.updateMatchStatus(matchId, 'no_show');
    const [mr] = await pool.execute<RowData>('SELECT status FROM tournament_matches WHERE id = ?', [matchId]);
    expect((mr as any[])[0].status).toBe('no_show');
    await expect(tournamentRepository.updateMatchStatus(matchId, 'bogus')).rejects.toMatchObject({
      errorCode: 'CONFLICT', code: 'TOURNAMENT_INVALID_STATUS',
    });
  });

  it('operator completion resolves placements from the bracket (no assertion), zero prize/GL/entitlement', async () => {
    const tid = await createTournament('running');
    const parts: Array<{ participantId: number; userId: number }> = [];
    for (const u of [P1, P2, P3, P4, P5, P6, P7, P8]) {
      const r = await createRegistration(tid, u);
      parts.push({ userId: u, participantId: await createParticipant(tid, r, u) });
    }
    await buildCompletedBracket(tid, parts);

    const { tournamentService } = await import('../application/tournament.service.js');
    const completed = await tournamentService.complete(tid);
    expect(completed.status).toBe('completed');

    const [pl] = await pool.execute<RowData>('SELECT placement, participant_id, user_id, source FROM tournament_placements WHERE tournament_id = ? ORDER BY placement', [tid]);
    const placements = pl as any[];
    expect(placements).toHaveLength(2);
    expect(placements[0]).toMatchObject({ placement: 1, participant_id: parts[0].participantId, user_id: P1, source: 'bracket' });
    expect(placements[1]).toMatchObject({ placement: 2, participant_id: parts[4].participantId, user_id: P5, source: 'bracket' });

    const [awards] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM tournament_prize_awards WHERE tournament_id = ?', [tid]);
    expect(Number((awards as any[])[0].c)).toBe(0);
    const [led] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type = \'tournament\' AND source_id = ?', [tid]);
    expect(Number((led as any[])[0].c)).toBe(0);
    const [ents] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM financial_entitlements WHERE source_type = \'tournament\' AND source_id = ?', [tid]);
    expect(Number((ents as any[])[0].c)).toBe(0);
  });

  it('ambiguous bracket (two terminal slots) resolves NO placement (fail closed)', async () => {
    const tid = await createTournament('running');
    const reg1 = await createRegistration(tid, P1);
    const reg2 = await createRegistration(tid, P2);
    const p1 = await createParticipant(tid, reg1, P1);
    const p2 = await createParticipant(tid, reg2, P2);
    // Two "final" slots — structurally ambiguous.
    for (const winner of [[p1, p2], [p2, p1]]) {
      await pool.execute<RowData>(
        `INSERT INTO tournament_matches
           (tournament_id, round, match_number, bracket_position, participant1_id, participant2_id,
            player1_id, player2_id, winner_id, winner_participant_id, is_final, status, progression_state, progression_meta)
         VALUES (?, 2, 1, ?, ?, ?, ?, ?, ?, ?, 1, 'completed', 'completed', '{"is_bracket":true,"target_round":null,"target_bracket_position":null}')`,
        [tid, winner[0] === p1 ? 0 : 1, p1, p2, P1, P2, winner[0], winner[0], winner[1]],
      );
    }
    const { tournamentService } = await import('../application/tournament.service.js');
    await tournamentService.complete(tid);
    const [pl] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM tournament_placements WHERE tournament_id = ?', [tid]);
    expect(Number((pl as any[])[0].c)).toBe(0);
  });
});