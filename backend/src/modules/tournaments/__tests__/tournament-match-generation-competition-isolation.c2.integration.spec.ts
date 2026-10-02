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
 * G11.18 C2 — match generation is COMPETITION-scoped:
 *   a tournament-wide generation enumerates EVERY current locked draw (one per
 *   competition) — Singles and Teams never share participants or numbering.
 */

const ORG = 2730001;
const CREATOR = 2730009;
const SUSERS = [2730011, 2730012, 2730013, 2730014, 2730015, 2730016, 2730017, 2730018];
const SPORT = 2730101;

let pool: mysql.Pool;
let fmt = 0;
let ruleSet = 0;
const tournamentIds: number[] = [];

const exec = (sql: string, params: any[] = []) => pool.execute(sql, params);

async function mkUser(id: number) {
  await exec(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status, birth_date)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'C2 U', 'male', 'active', '1995-05-05')`,
    [id, `021${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, `c2-${id}@t.com`],
  );
  await exec(`INSERT IGNORE INTO player_profiles (user_id) VALUES (?)`, [id]);
}

async function seedBase() {
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  await pool.execute(`INSERT IGNORE INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG}, UUID(), ?, 1, 'C2 Org', 'c2-org', 1)`, [(ot as any[])[0].id]);
  await pool.execute(`INSERT IGNORE INTO sports (id, name, slug, is_active, show_in_marketplace, sort_order) VALUES (${SPORT}, 'C2 Sport', 'c2-sport', 1, 1, 0)`);
  const [s] = await pool.execute<RowData>(`INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active) VALUES (?, 'c2-singles', 'Singles', 'singles', 1, NULL, 1, 1)`, [SPORT]);
  fmt = Number((s as any).insertId);
  const [rs] = await pool.execute<RowData>(`INSERT INTO sport_rule_sets (format_id, version, name, rules) VALUES (?, 1, 'C2 Rules', ?)`, [fmt, JSON.stringify({ scoring: 'sets' })]);
  ruleSet = Number((rs as any).insertId);
  for (const u of SUSERS) await mkUser(u);
  await mkUser(CREATOR);
}

async function createTournament(withTeamComp = true): Promise<{ tid: number; compA: number; compB: number | null }> {
  const [res] = await exec<RowData>(
    `INSERT INTO tournaments (public_id, creator_id, organisation_id, bracket_type_id, format, match_format_id, rule_set_id, sport_id, name,
       max_participants, min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type, commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, 1, 'knockout', ?, ?, ?, 'C2 Cup', 64, 2, 0, 0, 'EGP', 'FIXED', 'community', 0, 'registration_open', 1, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
    [CREATOR, ORG, fmt, ruleSet, SPORT],
  );
  const tid = Number((res as any).insertId);
  tournamentIds.push(tid);
  const [cA] = await exec<RowData>(`INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, match_format_id, currency_code, is_default) VALUES (UUID(), ?, 'singles', 'Singles', ?, 'EGP', 1)`, [tid, fmt]);
  const compA = Number((cA as any).insertId);
  let compB: number | null = null;
  if (withTeamComp) {
    const [cB] = await exec<RowData>(`INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, match_format_id, currency_code, is_default) VALUES (UUID(), ?, 'team', 'Teams', ?, 'EGP', 0)`, [tid, fmt]);
    compB = Number((cB as any).insertId);
  }
  return { tid, compA, compB };
}

async function addFourParticipants(tid: number, compId: number, users: number[]) {
  for (const u of users) {
    const [regR] = await exec<RowData>(
      `INSERT INTO tournament_registrations (tournament_id, competition_id, player_id, payment_status, status) VALUES (?, ?, ?, 'paid', 'confirmed')`, [tid, compId, u]);
    const reg = Number((regR as any).insertId);
    await exec(
      `INSERT INTO tournament_participants (tournament_id, competition_id, registration_id, participant_type, status, member_user_ids) VALUES (?, ?, ?, 'individual', 'active', JSON_ARRAY(?))`,
      [tid, compId, reg, u]);
  }
}

async function lockDraw(tid: number, compId: number, actor: number): Promise<number> {
  const { participantDrawService } = await import('../application/participant-draw.service.js');
  const draw = await participantDrawService.generateDraw(tid, actor, 12345 + compId, compId);
  await participantDrawService.approveDraw(tid, actor, compId);
  await participantDrawService.lockDraw(tid, actor, compId);
  return Number(draw.id);
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 6 });
  const { createPool, closePool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
  await pool.execute(`DELETE FROM tournament_participant_members WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_draw_entries WHERE draw_id IN (SELECT id FROM tournament_draws WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR}))`);
  await pool.execute(`DELETE FROM tournament_draws WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_matches WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_competitions WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournaments WHERE creator_id = ${CREATOR}`);
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
  await seedBase();
}, 60000);

afterAll(async () => {
  if (!pool) return;
  const idList = tournamentIds.length ? tournamentIds.join(',') : '0';
  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
  await pool.execute(`DELETE FROM tournament_participant_members WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_draw_entries WHERE draw_id IN (SELECT id FROM tournament_draws WHERE tournament_id IN (${idList}))`);
  await pool.execute(`DELETE FROM tournament_draws WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_matches WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_competitions WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${idList})`);
  await pool.execute(`DELETE FROM sport_formats WHERE id = ${fmt}`);
  await pool.execute(`DELETE FROM sport_rule_sets WHERE id = ${ruleSet}`);
  await pool.execute(`DELETE FROM sports WHERE id = ${SPORT}`);
  await pool.execute(`DELETE FROM player_profiles WHERE user_id IN (${SUSERS.join(',')}, ${CREATOR})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${SUSERS.join(',')}, ${CREATOR})`);
  await pool.execute(`DELETE FROM organisations WHERE id = ${ORG}`);
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
  tournamentIds.length = 0;
}, 60000);

beforeEach(() => { vi.clearAllMocks(); });

describe('G11.18 C2 — competition-scoped match generation', () => {
  it('Singles + Teams generate independent locked draws; tournament-wide generation covers BOTH with isolated numbering', async () => {
    const { tid, compA, compB } = await createTournament(true);
    await addFourParticipants(tid, compA, SUSERS.slice(0, 4));
    await addFourParticipants(tid, compB!, SUSERS.slice(4, 8));
    await lockDraw(tid, compA, CREATOR);
    await lockDraw(tid, compB!, CREATOR);

    const { matchScheduleService } = await import('../application/match-schedule.service.js');
    const result = await matchScheduleService.generateMatchesFromLockedDraw(tid, CREATOR);
    expect(result.draws).toBe(2);

    const [rows] = await exec<RowData>('SELECT competition_id, match_number, participant1_id, participant2_id FROM tournament_matches WHERE tournament_id = ? ORDER BY competition_id, match_number', [tid]);
    expect(rows.length).toBeGreaterThan(0);
    const compARows = rows.filter((r) => Number(r.competition_id) === compA);
    const compBRows = rows.filter((r) => Number(r.competition_id) === compB);
    expect(compARows.length).toBeGreaterThan(0);
    expect(compBRows.length).toBeGreaterThan(0);

    // Per-competition numbering is independent: each starts at 1.
    const numbersA = compARows.map((r) => Number(r.match_number)).sort((x, y) => x - y);
    const numbersB = compBRows.map((r) => Number(r.match_number)).sort((x, y) => x - y);
    expect(numbersA[0]).toBe(1);
    expect(numbersB[0]).toBe(1);

    // Participant sets never mix: matches contain only their competition's participants.
    const partAids = new Set(((await exec<RowData>('SELECT id FROM tournament_participants WHERE tournament_id = ? AND competition_id = ?', [tid, compA]))[0] as any[]).map((x: any) => Number(x.id)));
    const partBids = new Set(((await exec<RowData>('SELECT id FROM tournament_participants WHERE tournament_id = ? AND competition_id = ?', [tid, compB]))[0] as any[]).map((x: any) => Number(x.id)));
    for (const r of compARows) {
      if (r.participant1_id == null) continue;
      expect(partAids.has(Number(r.participant1_id))).toBe(true);
      expect(partBids.has(Number(r.participant1_id))).toBe(false);
    }
    for (const r of compBRows) {
      if (r.participant1_id == null) continue;
      expect(partBids.has(Number(r.participant1_id))).toBe(true);
      expect(partAids.has(Number(r.participant1_id))).toBe(false);
    }
  });

  it('a competition WITHOUT a locked draw never consumes another competition\'s draw; single-competition tournaments still generate', async () => {
    // Two-competition tournament, but only Singles' draw is locked.
    const { tid, compA, compB } = await createTournament(true);
    await addFourParticipants(tid, compA, SUSERS.slice(0, 4));
    await addFourParticipants(tid, compB!, SUSERS.slice(4, 8));
    await lockDraw(tid, compA, CREATOR);

    const { matchScheduleService } = await import('../application/match-schedule.service.js');
    const result = await matchScheduleService.generateMatchesFromLockedDraw(tid, CREATOR, { competitionId: compA });
    expect(result.draws).toBe(1);
    const [rowsA] = await exec<RowData>('SELECT competition_id FROM tournament_matches WHERE tournament_id = ?', [tid]);
    expect(rowsA.every((r) => Number(r.competition_id) === compA)).toBe(true);

    // Single-competition tournament: default-only draw generates normally.
    const { tid: sTid, compA: sComp } = await createTournament(false);
    await addFourParticipants(sTid, sComp, SUSERS.slice(0, 4));
    await lockDraw(sTid, sComp, CREATOR);
    const single = await matchScheduleService.generateMatchesFromLockedDraw(sTid, CREATOR);
    expect(single.draws).toBe(1);
    expect(single.generated).toBeGreaterThan(0);
  });
});