import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * Phase 1 — DOUBLES MATCH ROSTERS (real DB rows).
 *
 * Proves that the SHARED Match created during Group-Stage generation and the
 * initial GSK Knockout generation persists EVERY active member of BOTH sides in
 * `match_participants`:
 *   - doubles (participant_type='pair') → 4 rows (2 home team_index=0, 2 away team_index=1)
 *   - singles (participant_type='individual') → 2 rows (1 per side)
 *
 * Uses the established integration fixture pattern (persistent local test DB
 * 127.0.0.1:3307/courtzon_v3). No production data, no migrations.
 */

const ORG = 2760001;
const CREATOR = 2760009;
const DUSERS = Array.from({ length: 16 }, (_, i) => 2760011 + i); // 8 doubles pairs
const SUSERS = Array.from({ length: 4 }, (_, i) => 2760031 + i);  // 4 singles players
const SPORT = 2760101;

const GSK_CONFIG = {
  format: 'group_stage_knockout',
  groupStage: { groupCount: 2, participantsPerGroup: 4, format: 'round_robin', qualification: { topPerGroup: 2, bestThirdPlaces: 0, ordering: 'rank' } },
  knockout: { startingRound: 'semifinals', seeding: 'automatic', separateGroupWinners: false, preventSameGroupRematch: false, allowByes: false, playInRounds: 0 },
} as const;

let pool: mysql.Pool;
let doublesFmt = 0;
let doublesRule = 0;
let singlesFmt = 0;
let singlesRule = 0;
const tournamentIds: number[] = [];

const exec = (sql: string, params: any[] = []) => pool.execute<any>(sql, params);

async function mkUser(id: number, tag: string) {
  await exec(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status, birth_date)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', ?, 'male', 'active', '1995-05-05')`,
    [id, `056${String(id).slice(-8)}`, `+20${String(id).slice(-9)}`, `dbl-${tag}-${id}@t.local`, `Dbl ${tag} ${id}`],
  );
  await exec(`INSERT IGNORE INTO player_profiles (user_id) VALUES (?)`, [id]);
}

async function createTournament(name: string, competitionType: 'doubles' | 'singles', fmtId: number, ruleId: number, config: unknown = GSK_CONFIG): Promise<{ tid: number; compId: number; stageId: number }> {
  const [res] = await exec<any>(
    `INSERT INTO tournaments (public_id, creator_id, organisation_id, bracket_type_id, format, match_format_id, rule_set_id, sport_id, name,
       max_participants, min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type, commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, 1, 'group_stage_knockout', ?, ?, ?, ?, 16, 2, 0, 0, 'EGP', 'FIXED', 'community', 0, 'registration_closed', 1, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
    [CREATOR, ORG, fmtId, ruleId, SPORT, name],
  );
  const tid = Number((res as any).insertId);
  tournamentIds.push(tid);
  const [c] = await exec<any>(
    `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, match_format_id, currency_code, is_default) VALUES (UUID(), ?, ?, ?, ?, 'EGP', 1)`,
    [tid, competitionType, competitionType === 'doubles' ? 'Doubles' : 'Singles', fmtId],
  );
  const compId = Number((c as any).insertId);
  const [s] = await exec<any>(
    `INSERT INTO tournament_stages (tournament_id, competition_id, stage_order, name, progression_format, match_format_id, rule_set_id, advance_count, status, config)
     VALUES (?, ?, 1, 'Group Stage', 'round_robin', ?, ?, 2, 'pending', ?)`,
    [tid, compId, fmtId, ruleId, JSON.stringify(config)],
  );
  const stageId = Number((s as any).insertId);
  return { tid, compId, stageId };
}

async function addPairParticipants(tid: number, compId: number, users: number[]) {
  for (let i = 0; i < users.length; i += 2) {
    const a = users[i]; const b = users[i + 1];
    const [reg] = await exec<any>(
      `INSERT INTO tournament_registrations (tournament_id, competition_id, player_id, payment_status, status) VALUES (?, ?, ?, 'paid', 'confirmed')`,
      [tid, compId, a],
    );
    const [pp] = await exec<any>(
      `INSERT INTO tournament_participants (tournament_id, competition_id, registration_id, participant_type, status, member_user_ids) VALUES (?, ?, ?, 'pair', 'active', JSON_ARRAY(?, ?))`,
      [tid, compId, Number(reg.insertId), a, b],
    );
    const pid = Number(pp.insertId);
    await exec(`INSERT INTO tournament_participant_members (tournament_id, participant_id, user_id, member_order, status) VALUES (?, ?, ?, 0, 'active')`, [tid, pid, a]);
    await exec(`INSERT INTO tournament_participant_members (tournament_id, participant_id, user_id, member_order, status) VALUES (?, ?, ?, 1, 'active')`, [tid, pid, b]);
  }
}

async function addSingleParticipants(tid: number, compId: number, users: number[]) {
  for (const u of users) {
    const [reg] = await exec<any>(
      `INSERT INTO tournament_registrations (tournament_id, competition_id, player_id, payment_status, status) VALUES (?, ?, ?, 'paid', 'confirmed')`,
      [tid, compId, u],
    );
    const [pp] = await exec<any>(
      `INSERT INTO tournament_participants (tournament_id, competition_id, registration_id, participant_type, status, member_user_ids) VALUES (?, ?, ?, 'individual', 'active', JSON_ARRAY(?))`,
      [tid, compId, Number(reg.insertId), u],
    );
    const pid = Number(pp.insertId);
    await exec(`INSERT INTO tournament_participant_members (tournament_id, participant_id, user_id, member_order, status) VALUES (?, ?, ?, 0, 'active')`, [tid, pid, u]);
  }
}

/** Insert TEAM-type participants (participant_type='team'). `activePerTeam` seeds a
 *  "forming" team with fewer ACTIVE members than it lists (F1 regression). */
async function addTeamParticipants(tid: number, compId: number, teams: number[][], activePerTeam?: (i: number) => number) {
  for (let i = 0; i < teams.length; i++) {
    const members = teams[i];
    const [reg] = await exec<any>(
      `INSERT INTO tournament_registrations (tournament_id, competition_id, player_id, payment_status, status) VALUES (?, ?, ?, 'paid', 'confirmed')`,
      [tid, compId, members[0]],
    );
    const [pp] = await exec<any>(
      `INSERT INTO tournament_participants (tournament_id, competition_id, registration_id, participant_type, status, member_user_ids) VALUES (?, ?, ?, 'team', 'active', ?)`,
      [tid, compId, Number(reg.insertId), JSON.stringify(members)],
    );
    const pid = Number(pp.insertId);
    const active = activePerTeam ? activePerTeam(i) : members.length;
    for (let k = 0; k < members.length; k++) {
      await exec(
        `INSERT INTO tournament_participant_members (tournament_id, participant_id, user_id, member_order, status) VALUES (?, ?, ?, ?, ?)`,
        [tid, pid, members[k], k, k < active ? 'active' : 'left'],
      );
    }
  }
}

/** Seed one standup standings row per group member (rank 1..n) so qualification succeeds. */
async function seedStandings(tid: number) {
  const [members] = await exec<RowData>(
    `SELECT gm.group_id, gm.registration_id FROM tournament_group_members gm
     JOIN tournament_groups g ON g.id = gm.group_id WHERE g.tournament_id = ? ORDER BY gm.group_id, gm.seed`,
    [tid],
  );
  const byGroup = new Map<number, any[]>();
  for (const m of members as any[]) {
    const gid = Number(m.group_id);
    if (!byGroup.has(gid)) byGroup.set(gid, []);
    byGroup.get(gid)!.push(m);
  }
  for (const [gid, list] of byGroup) {
    for (let i = 0; i < list.length; i++) {
      await exec(
        `INSERT INTO tournament_standings (tournament_id, group_id, registration_id, points, wins, losses, draws, games_won, games_lost, sets_won, sets_lost, rank_position)
         VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, ?)`,
        [tid, gid, Number(list[i].registration_id), (list.length - i) * 3, i + 1],
      );
    }
  }
}

/** Assert the shared Match behind every resolved tournament match has the exact roster shape. */
async function assertSharedMatchRoster(matchId: number, expectedPerSide: number) {
  const [parts] = await exec<any>(`SELECT side, team_index, user_id FROM match_participants WHERE match_id = ?`, [matchId]);
  expect(parts.length).toBe(expectedPerSide * 2);
  const home = (parts as any[]).filter((p) => p.side === 'home');
  const away = (parts as any[]).filter((p) => p.side === 'away');
  expect(home.length).toBe(expectedPerSide);
  expect(away.length).toBe(expectedPerSide);
  for (const p of home) expect(Number(p.team_index)).toBe(0);
  for (const p of away) expect(Number(p.team_index)).toBe(1);
  return (parts as any[]).map((p) => Number(p.user_id));
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 6 });
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });

  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
  await exec(`DELETE FROM tournaments WHERE organisation_id = ${ORG} OR creator_id = ${CREATOR}`);
  await exec(`DELETE FROM organisations WHERE id = ${ORG}`);
  await exec(`DELETE FROM users WHERE id IN (${[CREATOR, ...DUSERS, ...SUSERS].join(',')})`);
  await exec(`DELETE FROM sport_formats WHERE sport_id = ${SPORT}`);
  await exec(`DELETE FROM sports WHERE id = ${SPORT}`);
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');

  const [ot] = await exec<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const orgTypeId = Number((ot as any)[0].id);
  await mkUser(CREATOR, 'owner');
  for (const u of DUSERS) await mkUser(u, 'd');
  for (const u of SUSERS) await mkUser(u, 's');
  await exec(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (?, UUID(), ?, ?, 'P1 Dbl Org', 'p1-dbl-org', 1)`,
    [ORG, orgTypeId, CREATOR],
  );

  await exec(`INSERT INTO sports (id, name, slug, is_active, show_in_marketplace, sort_order) VALUES (${SPORT}, 'P1 Dbl Sport', 'p1-dbl-sport', 1, 1, 0)`);
  const [df] = await exec<any>(
    `INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active) VALUES (?, 'p1-doubles', 'P1 Doubles', 'doubles', 2, 2, 1, 1)`,
    [SPORT],
  );
  doublesFmt = Number(df.insertId);
  const [dr] = await exec<any>(
    `INSERT INTO sport_rule_sets (format_id, name, version, is_active, rules) VALUES (?, 'P1 Doubles Rules', 1, 1, ?)`,
    [doublesFmt, JSON.stringify({ scoring: 'sets', sets_to_win: 2 })],
  );
  doublesRule = Number(dr.insertId);
  const [sf] = await exec<any>(
    `INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active) VALUES (?, 'p1-singles', 'P1 Singles', 'singles', 1, NULL, 0, 1)`,
    [SPORT],
  );
  singlesFmt = Number(sf.insertId);
  const [sr] = await exec<any>(
    `INSERT INTO sport_rule_sets (format_id, name, version, is_active, rules) VALUES (?, 'P1 Singles Rules', 1, 1, ?)`,
    [singlesFmt, JSON.stringify({ scoring: 'sets', sets_to_win: 2 })],
  );
  singlesRule = Number(sr.insertId);
}, 120000);

afterAll(async () => {
  if (!pool) return;
  const idList = tournamentIds.length ? tournamentIds.join(',') : '0';
  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
  await exec(`DELETE FROM match_participants WHERE match_id IN (SELECT id FROM matches WHERE tournament_id IN (${idList}))`);
  await exec(`DELETE FROM matches WHERE tournament_id IN (${idList})`);
  await exec(`DELETE FROM tournament_standings WHERE tournament_id IN (${idList})`);
  await exec(`DELETE FROM tournament_group_members WHERE group_id IN (SELECT id FROM tournament_groups WHERE tournament_id IN (${idList}))`);
  await exec(`DELETE FROM tournament_groups WHERE tournament_id IN (${idList})`);
  await exec(`DELETE FROM tournament_matches WHERE tournament_id IN (${idList})`);
  await exec(`DELETE FROM tournament_participant_members WHERE tournament_id IN (${idList})`);
  await exec(`DELETE FROM tournament_participants WHERE tournament_id IN (${idList})`);
  await exec(`DELETE FROM tournament_registrations WHERE tournament_id IN (${idList})`);
  await exec(`DELETE FROM tournament_stages WHERE tournament_id IN (${idList})`);
  await exec(`DELETE FROM tournament_competitions WHERE tournament_id IN (${idList})`);
  await exec(`DELETE FROM tournaments WHERE id IN (${idList})`);
  await exec(`DELETE FROM sport_rule_sets WHERE id IN (${[doublesRule, singlesRule].join(',')})`);
  await exec(`DELETE FROM sport_formats WHERE id IN (${[doublesFmt, singlesFmt].join(',')})`);
  await exec(`DELETE FROM sports WHERE id = ${SPORT}`);
  await exec(`DELETE FROM player_profiles WHERE user_id IN (${[CREATOR, ...DUSERS, ...SUSERS].join(',')})`);
  await exec(`DELETE FROM users WHERE id IN (${[CREATOR, ...DUSERS, ...SUSERS].join(',')})`);
  await exec(`DELETE FROM organisations WHERE id = ${ORG}`);
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
  tournamentIds.length = 0;
}, 120000);

describe('Phase 1 — doubles match rosters (real match_participants rows)', () => {
  it('doubles group stage: each match persists 4 match_participants (2 home team_index=0, 2 away team_index=1)', async () => {
    const { tid, compId, stageId } = await createTournament('P1 Doubles Group', 'doubles', doublesFmt, doublesRule);
    await addPairParticipants(tid, compId, DUSERS);

    const { groupStageService } = await import('../application/group-stage.service.js');
    const res = await groupStageService.generateGroupStage(tid, stageId, CREATOR, compId);
    expect(res.groups).toBe(2);
    expect(res.matches).toBe(12);

    const [matchRows] = await exec<RowData>(
      `SELECT id, match_id, player1_id, player2_id FROM tournament_matches WHERE tournament_id = ? AND match_id IS NOT NULL`,
      [tid],
    );
    expect((matchRows as any[]).length).toBe(12);
    for (const m of matchRows as any[]) {
      const userIds = await assertSharedMatchRoster(Number(m.match_id), 2);
      expect(userIds).toContain(Number(m.player1_id));
      expect(userIds).toContain(Number(m.player2_id));
    }
  });

  it('doubles initial GSK knockout: each semifinal persists 4 match_participants (2 per side)', async () => {
    const { tid, compId, stageId } = await createTournament('P1 Doubles KO', 'doubles', doublesFmt, doublesRule);
    await addPairParticipants(tid, compId, DUSERS);

    const { groupStageService } = await import('../application/group-stage.service.js');
    await groupStageService.generateGroupStage(tid, stageId, CREATOR, compId);

    // Complete the group stage and seed standings so qualification succeeds.
    await exec(`UPDATE tournament_matches SET progression_state='completed' WHERE stage_id = ?`, [stageId]);
    await seedStandings(tid);

    const { knockoutTransitionService } = await import('../application/knockout-transition.service.js');
    await knockoutTransitionService.introduceKnockoutStage(tid, stageId, CREATOR, compId);

    const [koStage] = await exec<RowData>(`SELECT id FROM tournament_stages WHERE tournament_id = ? AND progression_format = 'knockout'`, [tid]);
    const koStageId = Number((koStage as any)[0]?.id);
    expect(koStageId).toBeGreaterThan(0);

    const [koMatches] = await exec<RowData>(
      `SELECT id, match_id, player1_id, player2_id FROM tournament_matches WHERE tournament_id = ? AND stage_id = ? AND match_id IS NOT NULL`,
      [tid, koStageId],
    );
    expect((koMatches as any[]).length).toBe(2); // two semifinals carry resolved doubles pairs
    for (const m of koMatches as any[]) {
      const userIds = await assertSharedMatchRoster(Number(m.match_id), 2);
      expect(userIds).toContain(Number(m.player1_id));
      expect(userIds).toContain(Number(m.player2_id));
    }
  });

  it('singles group stage regression: each match persists exactly 2 rows (1 per side)', async () => {
    const singlesConfig = { ...GSK_CONFIG, groupStage: { ...GSK_CONFIG.groupStage, groupCount: 1 } };
    const { tid, compId, stageId } = await createTournament('P1 Singles Group', 'singles', singlesFmt, singlesRule, singlesConfig);
    await addSingleParticipants(tid, compId, SUSERS);

    const { groupStageService } = await import('../application/group-stage.service.js');
    const res = await groupStageService.generateGroupStage(tid, stageId, CREATOR, compId);
    expect(res.groups).toBe(1);
    expect(res.matches).toBe(6);

    const [matchRows] = await exec<RowData>(
      `SELECT id, match_id FROM tournament_matches WHERE tournament_id = ? AND match_id IS NOT NULL`,
      [tid],
    );
    expect((matchRows as any[]).length).toBe(6);
    for (const m of matchRows as any[]) {
      await assertSharedMatchRoster(Number(m.match_id), 1);
    }
  });

  it('F1 regression: an INCOMPLETE team cannot enter the group stage', async () => {
    const { tid, compId, stageId } = await createTournament('P1 F1 Group Guard', 'doubles', doublesFmt, doublesRule);
    const complete = Array.from({ length: 7 }, (_, i) => [DUSERS[i * 2], DUSERS[i * 2 + 1]]);
    // 8th team is "forming": it lists a partner but has only the captain active.
    await addTeamParticipants(tid, compId, [...complete, [DUSERS[14]]]);

    const { groupStageService } = await import('../application/group-stage.service.js');
    await expect(groupStageService.generateGroupStage(tid, stageId, CREATOR, compId)).rejects.toMatchObject({
      code: 'TOURNAMENT_PARTICIPANT_MEMBER_COUNT_INVALID',
    });
    const [rows] = await exec<RowData>(`SELECT COUNT(*) c FROM tournament_matches WHERE tournament_id = ?`, [tid]);
    expect(Number((rows as any[])[0].c)).toBe(0);
  });

  it('F1 regression: COMPLETE teams still generate the group stage (behaviour preserved)', async () => {
    const { tid, compId, stageId } = await createTournament('P1 F1 Group Ok', 'doubles', doublesFmt, doublesRule);
    await addTeamParticipants(tid, compId, Array.from({ length: 8 }, (_, i) => [DUSERS[i * 2], DUSERS[i * 2 + 1]]));

    const { groupStageService } = await import('../application/group-stage.service.js');
    const res = await groupStageService.generateGroupStage(tid, stageId, CREATOR, compId);
    expect(res.groups).toBe(2);
    expect(res.matches).toBe(12);

    const [matchRows] = await exec<RowData>(
      `SELECT id, match_id FROM tournament_matches WHERE tournament_id = ? AND match_id IS NOT NULL`,
      [tid],
    );
    expect((matchRows as any[]).length).toBe(12);
    for (const m of matchRows as any[]) await assertSharedMatchRoster(Number(m.match_id), 2);
  });

  it('F1 regression: an INCOMPLETE (qualified) team cannot enter the knockout stage', async () => {
    const { tid, compId, stageId } = await createTournament('P1 F1 KO Guard', 'doubles', doublesFmt, doublesRule);
    await addTeamParticipants(tid, compId, Array.from({ length: 8 }, (_, i) => [DUSERS[i * 2], DUSERS[i * 2 + 1]]));

    const { groupStageService } = await import('../application/group-stage.service.js');
    await groupStageService.generateGroupStage(tid, stageId, CREATOR, compId);
    await exec(`UPDATE tournament_matches SET progression_state='completed' WHERE stage_id = ?`, [stageId]);
    await seedStandings(tid);

    // Make a QUALIFIED (group rank 1) team incomplete by deactivating its 2nd member.
    const [rank1] = await exec<RowData>(
      `SELECT tp.id FROM tournament_standings s
         JOIN tournament_participants tp ON tp.registration_id = s.registration_id AND tp.tournament_id = s.tournament_id
        WHERE s.tournament_id = ? AND s.rank_position = 1 LIMIT 1`,
      [tid],
    );
    const victim = Number((rank1 as any[])[0].id);
    await exec(
      `UPDATE tournament_participant_members SET status='left' WHERE tournament_id = ? AND participant_id = ? AND member_order = 1`,
      [tid, victim],
    );

    const { knockoutTransitionService } = await import('../application/knockout-transition.service.js');
    await expect(knockoutTransitionService.introduceKnockoutStage(tid, stageId, CREATOR, compId)).rejects.toMatchObject({
      code: 'TOURNAMENT_PARTICIPANT_MEMBER_COUNT_INVALID',
    });
  });
});
