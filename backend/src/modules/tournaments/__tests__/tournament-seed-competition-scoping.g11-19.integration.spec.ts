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
 * G11.19 — COMPETITION-SCOPED SEED NAMESPACE.
 *   A. seed #1 in Competition A AND seed #1 in Competition B are both valid;
 *   B. a duplicate seed #1 WITHIN one competition fails;
 *   C. cross-competition seed numbers never conflict;
 *   D. a participant is only ever seeded in its OWN competition;
 *   E. cross-tournament seed operations fail closed (IDOR);
 *   F. single-competition behavior is unchanged.
 */

const ORG = 2720001;
const CREATOR = 2720009;
const SUSERS = [2720011, 2720012, 2720013, 2720014, 2720015, 2720016, 2720017, 2720018];
const SPORT = 2720101;

let pool: mysql.Pool;
let fmt = 0;
let ruleSet = 0;
const tournamentIds: number[] = [];

const exec = (sql: string, params: any[] = []) => pool.execute(sql, params);
const insertId = async (sql: string, params: any[] = []) => {
  const [r] = await exec(sql, params);
  return Number((r as any).insertId);
};

async function mkUser(id: number) {
  await exec(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status, birth_date)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'G19 U', 'male', 'active', '1995-05-05')`,
    [id, `021${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, `g19-${id}@t.com`],
  );
  await exec(`INSERT IGNORE INTO player_profiles (user_id) VALUES (?)`, [id]);
}

async function seedBase() {
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  await pool.execute(`INSERT IGNORE INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG}, UUID(), ?, 1, 'G19 Org', 'g19-org', 1)`, [(ot as any[])[0].id]);
  await pool.execute(`INSERT IGNORE INTO sports (id, name, slug, is_active, show_in_marketplace, sort_order) VALUES (${SPORT}, 'G19 Sport', 'g19-sport', 1, 1, 0)`);
  const [s] = await pool.execute<RowData>(`INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active) VALUES (?, 'g19-singles', 'Singles', 'singles', 1, NULL, 1, 1)`, [SPORT]);
  fmt = Number((s as any).insertId);
  const [rs] = await pool.execute<RowData>(`INSERT INTO sport_rule_sets (format_id, version, name, rules) VALUES (?, 1, 'G19 Rules', ?)`, [fmt, JSON.stringify({ scoring: 'sets' })]);
  ruleSet = Number((rs as any).insertId);
  for (const u of SUSERS) await mkUser(u);
  await mkUser(CREATOR);
}

async function createTournament(withTeamComp = true): Promise<{ tid: number; compA: number; compB: number | null }> {
  const [res] = await exec<RowData>(
    `INSERT INTO tournaments (public_id, creator_id, organisation_id, bracket_type_id, format, match_format_id, rule_set_id, sport_id, name,
       max_participants, min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type, commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, 1, 'knockout', ?, ?, ?, 'G19 Cup', 64, 2, 0, 0, 'EGP', 'FIXED', 'community', 0, 'registration_open', 1, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
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

async function addParticipants(tid: number, compId: number, users: number[]): Promise<number[]> {
  const pids: number[] = [];
  for (const u of users) {
    const reg = await insertId(`INSERT INTO tournament_registrations (tournament_id, competition_id, player_id, payment_status, status) VALUES (?, ?, ?, 'paid', 'confirmed')`, [tid, compId, u]);
    const pid = await insertId(`INSERT INTO tournament_participants (tournament_id, competition_id, registration_id, participant_type, status, member_user_ids) VALUES (?, ?, ?, 'individual', 'active', JSON_ARRAY(?))`, [tid, compId, reg, u]);
    pids.push(pid);
  }
  return pids;
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 6 });
  const { createPool, closePool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
  await pool.execute(`DELETE FROM tournament_participant_members WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_seeds WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
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
  await pool.execute(`DELETE FROM tournament_seeds WHERE tournament_id IN (${idList})`);
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

describe('G11.19 — competition-scoped seed namespace', () => {
  it('A/C. seed #1 in Competition A and seed #1 in Competition B are BOTH valid', async () => {
    const { tid, compA, compB } = await createTournament(true);
    await addParticipants(tid, compA, SUSERS.slice(0, 4));
    await addParticipants(tid, compB!, SUSERS.slice(4, 8));
    const { participantDrawService } = await import('../application/participant-draw.service.js');
    const pA = Number(((await exec('SELECT id FROM tournament_participants WHERE tournament_id = ? AND competition_id = ? LIMIT 1', [tid, compA]))[0] as any[])[0].id);
    const pB = Number(((await exec('SELECT id FROM tournament_participants WHERE tournament_id = ? AND competition_id = ? LIMIT 1', [tid, compB]))[0] as any[])[0].id);
    const sA = await participantDrawService.assignSeed(tid, pA, { seedNumber: 1, source: 'manual' }, CREATOR);
    const sB = await participantDrawService.assignSeed(tid, pB, { seedNumber: 1, source: 'manual' }, CREATOR);
    expect(Number(sA.competition_id)).toBe(compA);
    expect(Number(sB.competition_id)).toBe(compB);
    const [rows] = await exec('SELECT competition_id, seed_number FROM tournament_seeds WHERE tournament_id = ? ORDER BY id', [tid]);
    expect(rows.map((r) => [Number(r.competition_id), Number(r.seed_number)])).toEqual([
      [compA, 1], [compB, 1],
    ]);
  });

  it('B. a duplicate seed number WITHIN one competition fails', async () => {
    const { tid, compA } = await createTournament(false);
    const pids = await addParticipants(tid, compA, SUSERS.slice(0, 4));
    const { participantDrawService } = await import('../application/participant-draw.service.js');
    await participantDrawService.assignSeed(tid, pids[0], { seedNumber: 1, source: 'manual' }, CREATOR);
    await expect(participantDrawService.assignSeed(tid, pids[1], { seedNumber: 1, source: 'manual' }, CREATOR))
      .rejects.toMatchObject({ code: 'TOURNAMENT_SEED_DUPLICATE' });
  });

  it('D. a participant is only ever seeded in its OWN competition (authoritative derivation)', async () => {
    const { tid, compA } = await createTournament(false);
    const pids = await addParticipants(tid, compA, SUSERS.slice(0, 4));
    const { participantDrawService } = await import('../application/participant-draw.service.js');
    await participantDrawService.assignSeed(tid, pids[0], { seedNumber: 3, source: 'manual' }, CREATOR);
    const [row] = await exec('SELECT competition_id FROM tournament_seeds WHERE participant_id = ?', [pids[0]]);
    expect(Number((row[0] as any).competition_id)).toBe(compA);
  });

  it('E. cross-tournament seed operation fails closed (IDOR)', async () => {
    const a = await createTournament(false);
    const b = await createTournament(false);
    await addParticipants(a.tid, a.compA, SUSERS.slice(0, 4));
    const { participantDrawService } = await import('../application/participant-draw.service.js');
    // A participant belonging to tournament A cannot be seeded inside tournament B.
    const pA = Number(((await exec('SELECT id FROM tournament_participants WHERE tournament_id = ? LIMIT 1', [a.tid]))[0] as any[])[0].id);
    await expect(participantDrawService.assignSeed(b.tid, pA, { seedNumber: 1, source: 'manual' }, CREATOR)).rejects.toThrow();
  });

  it('F. single-competition behavior is unchanged', async () => {
    const { tid, compA } = await createTournament(false);
    const pids = await addParticipants(tid, compA, SUSERS.slice(0, 4));
    const { participantDrawService } = await import('../application/participant-draw.service.js');
    const s1 = await participantDrawService.assignSeed(tid, pids[0], { seedNumber: 1, source: 'manual' }, CREATOR);
    const s2 = await participantDrawService.assignSeed(tid, pids[1], { seedNumber: 2, source: 'manual' }, CREATOR);
    expect(Number(s1.seed_number)).toBe(1);
    expect(Number(s2.seed_number)).toBe(2);
    await expect(participantDrawService.assignSeed(tid, pids[2], { seedNumber: 1, source: 'manual' }, CREATOR))
      .rejects.toMatchObject({ code: 'TOURNAMENT_SEED_DUPLICATE' });
  });
});