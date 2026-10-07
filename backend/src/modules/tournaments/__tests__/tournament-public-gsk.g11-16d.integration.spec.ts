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
 * Step 4D — Public GSK read-model contract (NON-FINANCIAL, additive).
 *
 * Proves, against the real schema with isolated data:
 *  1. public group standings rows expose `group_id`;
 *  2. public bracket rows expose `stage_id`;
 *  3. public group matches expose `group_id`;
 *  4. public knockout matches expose the knockout `stage_id` and NO `group_id`;
 *  5. public `groups[]` exposes the minimal { id, name } representation;
 *  6. public `stages[]` exposes progression + a SAFE GSK config subset only;
 *  7. no private / payment / admin / organizer-only data leaks;
 *  8. a plain (non-GSK) public tournament keeps its exact previous response
 *     shape — no `groups`/`stages` keys are invented.
 */

const ORG = 2680101;
const ACTOR = 2680109;
const U1 = 2680111;
const U2 = 2680112;

let pool: mysql.Pool;
const tournamentIds: number[] = [];

const exec = (sql: string, params: any[] = []) => pool.execute(sql, params);

async function createTournament(name: string, opts: { format?: string; isPublic?: number; status?: string }): Promise<{ tid: number; compId: number }> {
  const [res] = await exec<RowData>(
    `INSERT INTO tournaments
       (public_id, creator_id, organisation_id, bracket_type_id, format, name, max_participants,
        min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type,
        commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, 1, ?, ?, 8, 2, 0, 0, 'EGP', 'FREE', 'community', 0, ?, ?, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
    [ACTOR, ORG, opts.format ?? 'knockout', name, opts.status ?? 'registration_open', opts.isPublic ?? 1],
  );
  const tid = Number((res as any).insertId);
  tournamentIds.push(tid);
  const [cres] = await exec<RowData>(
    `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, currency_code, is_default)
     VALUES (UUID(), ?, 'singles', 'Default', 'EGP', 1)`, [tid]);
  return { tid, compId: Number((cres as any).insertId) };
}

async function mkUser(id: number) {
  await exec(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'G11.16D User', 'male', 'active')`,
    [id, `021${String(id).slice(-8)}`, `+21${String(id).slice(-8)}`, `g1116d-${id}@test.com`],
  );
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 4 });
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG}, UUID(), ?, 1, 'G11.16D Org', 'g1116d-org', 1)`, [otId]);
  for (const u of [ACTOR, U1, U2]) await mkUser(u);
}, 60000);

afterAll(async () => {
  if (!pool) return;
  const idList = tournamentIds.length ? tournamentIds.join(',') : '0';
  await pool.execute(`SET FOREIGN_KEY_CHECKS = 0`);
  await pool.execute(`DELETE FROM tournament_standings WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_matches WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE ts FROM tournament_stages ts WHERE ts.tournament_id IN (${idList})`);
  await pool.execute(`DELETE tgm FROM tournament_group_members tgm JOIN tournament_groups tg ON tg.id = tgm.group_id WHERE tg.tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_groups WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_competitions WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${idList})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${ACTOR}, ${U1}, ${U2})`);
  await pool.execute(`DELETE FROM organisations WHERE id = ${ORG}`);
  await pool.execute(`SET FOREIGN_KEY_CHECKS = 1`);
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 60000);

beforeEach(() => { vi.restoreAllMocks(); });

describe('G11.16D public GSK read-model', () => {
  it('exposes group_id / stage_id / groups / safe stage config without leaks', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');
    const { tid, compId } = await createTournament('GSK Public Cup', { format: 'group_stage_knockout' });

    // Stages — group stage carries the full GSK config (with organizer-only
    // flags that must NOT be projected); knockout stage carries only knockout.
    const gsConfig = {
      format: 'group_stage_knockout',
      groupStage: { groupCount: 2, participantsPerGroup: 4, format: 'round_robin', qualification: { topPerGroup: 2, bestThirdPlaces: 0, ordering: 'rank' } },
      knockout: { startingRound: 'round_of_16', seeding: 'automatic', separateGroupWinners: true, preventSameGroupRematch: true, allowByes: false, playInRounds: 0 },
    };
    const [gsRes] = await exec<RowData>(
      `INSERT INTO tournament_stages (tournament_id, competition_id, stage_order, name, progression_format, advance_count, status, config)
       VALUES (?, ?, 1, 'Group Stage', 'round_robin', 2, 'active', ?)`,
      [tid, compId, JSON.stringify(gsConfig)]);
    const groupStageId = Number((gsRes as any).insertId);
    const [koRes] = await exec<RowData>(
      `INSERT INTO tournament_stages (tournament_id, competition_id, stage_order, name, progression_format, advance_count, status, config)
       VALUES (?, ?, 2, 'Knockout', 'knockout', 1, 'pending', ?)`,
      [tid, compId, JSON.stringify({ knockout: { startingRound: 'semifinals', seeding: 'automatic', allowByes: true } })]);
    const knockoutStageId = Number((koRes as any).insertId);

    // Groups A / B.
    const [gA] = await exec<RowData>(`INSERT INTO tournament_groups (tournament_id, competition_id, name, size, advance_count) VALUES (?, ?, 'A', 2, 2)`, [tid, compId]);
    const [gB] = await exec<RowData>(`INSERT INTO tournament_groups (tournament_id, competition_id, name, size, advance_count) VALUES (?, ?, 'B', 2, 2)`, [tid, compId]);
    const groupAId = Number((gA as any).insertId);
    const groupBId = Number((gB as any).insertId);

    // Registrations + participants.
    const [r1] = await exec<RowData>(`INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status) VALUES (?, ?, 'paid', 'confirmed')`, [tid, U1]);
    const [r2] = await exec<RowData>(`INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status) VALUES (?, ?, 'paid', 'confirmed')`, [tid, U2]);
    const reg1 = Number((r1 as any).insertId);
    const reg2 = Number((r2 as any).insertId);
    const [p1] = await exec<RowData>(`INSERT INTO tournament_participants (tournament_id, registration_id, participant_type, status, member_user_ids) VALUES (?, ?, 'individual', 'active', ?)`, [tid, reg1, JSON.stringify([U1])]);
    const [p2] = await exec<RowData>(`INSERT INTO tournament_participants (tournament_id, registration_id, participant_type, status, member_user_ids) VALUES (?, ?, 'individual', 'active', ?)`, [tid, reg2, JSON.stringify([U2])]);
    const part1 = Number((p1 as any).insertId);
    const part2 = Number((p2 as any).insertId);

    await exec(`INSERT INTO tournament_group_members (group_id, registration_id, seed) VALUES (?, ?, 1)`, [groupAId, reg1]);
    await exec(`INSERT INTO tournament_group_members (group_id, registration_id, seed) VALUES (?, ?, 2)`, [groupBId, reg2]);

    // Group-stage match (has group_id + group stage_id) + knockout match (stage only, no group).
    await exec(
      `INSERT INTO tournament_matches (tournament_id, stage_id, group_id, round, round_name, match_number, bracket_position, participant1_id, participant2_id, player1_id, player2_id, status, progression_state)
       VALUES (?, ?, ?, 1, 'Round 1', 1, 0, ?, ?, ?, ?, 'scheduled', 'pending')`,
      [tid, groupStageId, groupAId, part1, part2, U1, U2]);
    await exec(
      `INSERT INTO tournament_matches (tournament_id, stage_id, group_id, round, round_name, match_number, bracket_position, participant1_id, participant2_id, player1_id, player2_id, status, progression_state)
       VALUES (?, ?, NULL, 1, 'Semi-final', 1, 0, ?, ?, ?, ?, 'scheduled', 'pending')`,
      [tid, knockoutStageId, part1, part2, U1, U2]);

    // Standings — one per group.
    await exec(
      `INSERT INTO tournament_standings (tournament_id, group_id, registration_id, wins, losses, draws, points, games_won, games_lost, sets_won, sets_lost, rank_position)
       VALUES (?, ?, ?, 1, 0, 0, 3, 6, 3, 2, 1, 1)`, [tid, groupAId, reg1]);
    await exec(
      `INSERT INTO tournament_standings (tournament_id, group_id, registration_id, wins, losses, draws, points, games_won, games_lost, sets_won, sets_lost, rank_position)
       VALUES (?, ?, ?, 0, 1, 0, 0, 3, 6, 1, 2, 2)`, [tid, groupBId, reg2]);

    const d = await tournamentService.getPublicTournament(tid) as any;

    // 1 & 3. standings expose group_id
    expect(Array.isArray(d.standings)).toBe(true);
    expect(d.standings.length).toBe(2);
    const groupIds = d.standings.map((s: any) => s.group_id).sort();
    expect(groupIds).toEqual([groupAId, groupBId].sort());

    // 2 & 3. bracket group match exposes stage_id + group_id
    const groupMatch = d.bracket.find((m: any) => m.group_id != null);
    expect(groupMatch).toBeTruthy();
    expect(groupMatch.stage_id).toBe(groupStageId);
    expect(groupMatch.group_id).toBe(groupAId);

    // 4. knockout match exposes knockout stage_id and NO group_id
    const koMatch = d.bracket.find((m: any) => m.stage_id === knockoutStageId);
    expect(koMatch).toBeTruthy();
    expect(koMatch.group_id).toBeNull();

    // 5. groups[] minimal representation
    expect(Array.isArray(d.groups)).toBe(true);
    expect(d.groups.map((g: any) => g.name).sort()).toEqual(['A', 'B']);
    for (const g of d.groups) {
      expect(Object.keys(g).sort()).toEqual(['id', 'name']);
    }

    // 6. stages[] progression + SAFE config subset only
    expect(Array.isArray(d.stages)).toBe(true);
    const gsStage = d.stages.find((s: any) => s.progression_format === 'round_robin');
    const koStage = d.stages.find((s: any) => s.progression_format === 'knockout');
    expect(gsStage.config.groupStage.groupCount).toBe(2);
    expect(gsStage.config.groupStage.participantsPerGroup).toBe(4);
    expect(gsStage.config.groupStage.qualification).toEqual({ topPerGroup: 2, bestThirdPlaces: 0, ordering: 'rank' });
    expect(koStage.config.knockout.startingRound).toBe('semifinals');
    const stagesJson = JSON.stringify(d.stages);
    for (const forbidden of ['seeding', 'separateGroupWinners', 'preventSameGroupRematch', 'allowByes', 'playInRounds', 'rule_set_id', 'match_format_id']) {
      expect(stagesJson.includes(forbidden), `stage config leaked: ${forbidden}`).toBe(false);
    }

    // 7. no financial/private/admin leakage
    const dJson = JSON.stringify(d);
    for (const key of ['entry_fee', 'registration_fee', 'currency_code', 'commission_rate', 'creator_id', 'prizes', 'sponsors', 'registration_payment_methods', 'branch_id', 'organisation_id', 'deleted_at']) {
      expect(Object.prototype.hasOwnProperty.call(d, key), `tournament leaked: ${key}`).toBe(false);
    }
    for (const key of ['match_id', 'participant1_id', 'participant2_id', 'player1_id', 'player2_id', 'winner_id', 'referee_id', 'resource_id']) {
      for (const m of d.bracket) expect(Object.prototype.hasOwnProperty.call(m, key), `bracket leaked: ${key}`).toBe(false);
    }
    for (const key of ['registration_id', 'player_id', 'user_id']) {
      for (const s of d.standings) expect(Object.prototype.hasOwnProperty.call(s, key), `standings leaked: ${key}`).toBe(false);
    }
    // No raw member/user ids anywhere.
    expect(dJson).not.toContain(String(U1));
    expect(dJson).not.toContain(String(U2));
  });

  it('non-GSK public tournaments keep the previous shape (no groups/stages invented)', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');
    const { tid } = await createTournament('Plain Knockout Cup', { format: 'knockout' });
    const [r1] = await exec<RowData>(`INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status) VALUES (?, ?, 'paid', 'confirmed')`, [tid, U1]);
    const reg1 = Number((r1 as any).insertId);
    const [p1] = await exec<RowData>(`INSERT INTO tournament_participants (tournament_id, registration_id, participant_type, status, member_user_ids) VALUES (?, ?, 'individual', 'active', ?)`, [tid, reg1, JSON.stringify([U1])]);
    const part1 = Number((p1 as any).insertId);
    await exec(
      `INSERT INTO tournament_matches (tournament_id, round, round_name, match_number, bracket_position, participant1_id, player1_id, status, progression_state)
       VALUES (?, 1, 'Final', 1, 0, ?, ?, 'scheduled', 'pending')`, [tid, part1, U1]);

    const d = await tournamentService.getPublicTournament(tid) as any;
    expect(d.format).toBe('knockout');
    expect(Array.isArray(d.bracket)).toBe(true);
    // No stage/group data was seeded → the keys are not invented.
    expect(Object.prototype.hasOwnProperty.call(d, 'groups')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(d, 'stages')).toBe(false);
    // Bracket rows still carry the additive (nullable) discriminators.
    expect(d.bracket[0].stage_id).toBeNull();
    expect(d.bracket[0].group_id).toBeNull();
  });
});
