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
 * G11.18 C1 — competitive isolation of prize awarding:
 *   Singles 1st = 20,000 and Teams 1st = 50,000 resolve to THEIR OWN prizes;
 *   the same player winning both competitions receives BOTH awards;
 *   hasAward() is competition-scoped (an award in A never blocks B);
 *   cross-competition prize lookup is isolated; G11.15 fail-closed preserved.
 */

const ORG = 2740001;
const CREATOR = 2740009;
const U = { a: 2740011, b: 2740012, c: 2740013, d: 2740014 };
const SPORT = 2740101;

let pool: mysql.Pool;
let fmt = 0;
let ruleSet = 0;
const tournamentIds: number[] = [];
const compIds: number[] = [];

const exec = (sql: string, params: any[] = []) => pool.execute(sql, params);
const insertId = async (sql: string, params: any[] = []) => {
  const [r] = await exec(sql, params);
  return Number((r as any).insertId);
};
const val = async (sql: string, params: any[] = []) => {
  const [r] = await exec<RowData>(sql, params);
  return Number((r as any)[0]?.id);
};

async function mkUser(id: number) {
  await exec(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status, birth_date)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'C1 U', 'male', 'active', '1995-05-05')`,
    [id, `021${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, `c1-${id}@t.com`],
  );
  await exec(`INSERT IGNORE INTO player_profiles (user_id) VALUES (?)`, [id]);
  await exec(`INSERT IGNORE INTO user_wallets (user_id, balance, currency_code) VALUES (?, 0, 'EGP')`, [id]);
}

async function seedBase() {
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  await pool.execute(`INSERT IGNORE INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG}, UUID(), ?, 1, 'C1 Org', 'c1-org', 1)`, [(ot as any[])[0].id]);
  await pool.execute(`INSERT IGNORE INTO sports (id, name, slug, is_active, show_in_marketplace, sort_order) VALUES (${SPORT}, 'C1 Sport', 'c1-sport', 1, 1, 0)`);
  const [s] = await pool.execute<RowData>(`INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active) VALUES (?, 'c1-singles', 'Singles', 'singles', 1, NULL, 1, 1)`, [SPORT]);
  fmt = Number((s as any).insertId);
  const [rs] = await pool.execute<RowData>(`INSERT INTO sport_rule_sets (format_id, version, name, rules) VALUES (?, 1, 'C1 Rules', ?)`, [fmt, JSON.stringify({ scoring: 'sets' })]);
  ruleSet = Number((rs as any).insertId);
  for (const u of Object.values(U)) await mkUser(u);
  await mkUser(CREATOR);
}

async function createCompletedTournament(): Promise<{ tid: number; compA: number; compB: number }> {
  const [res] = await exec<RowData>(
    `INSERT INTO tournaments (public_id, creator_id, organisation_id, bracket_type_id, format, match_format_id, sport_id, name,
       max_participants, min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type, commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, 1, 'knockout', ?, ?, 'C1 Cup', 32, 2, 0, 0, 'EGP', 'FIXED', 'community', 0, 'completed', 1, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
    [CREATOR, ORG, fmt, SPORT],
  );
  const tid = Number((res as any).insertId);
  tournamentIds.push(tid);
  const addComp = async (type: 'singles' | 'team', suffix: string, isDefault: number): Promise<number> =>
    insertId(`INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, match_format_id, currency_code, is_default) VALUES (UUID(), ?, ?, '${suffix}', ?, 'EGP', ?)`,
      [tid, type, fmt, isDefault]);
  const compA = await addComp('singles', 'Singles', 1);
  const compB = await addComp('team', 'Teams', 0);
  compIds.push(compA, compB);
  return { tid, compA, compB };
}

/** Registration (confirmed/paid) + individual participant in a competition. */
async function registerParticipant(tid: number, compId: number, user: number): Promise<number> {
  const reg = await insertId(`INSERT INTO tournament_registrations (tournament_id, competition_id, player_id, payment_status, status) VALUES (?, ?, ?, 'paid', 'confirmed')`, [tid, compId, user]);
  const part = await insertId(`INSERT INTO tournament_participants (tournament_id, competition_id, registration_id, participant_type, status, member_user_ids) VALUES (?, ?, ?, 'individual', 'active', JSON_ARRAY(?))`, [tid, compId, reg, user]);
  return reg;
}

async function cashPrize(tid: number, compId: number, placement: number, amount: number): Promise<void> {
  await exec(
    `INSERT INTO tournament_prizes (tournament_id, competition_id, placement, prize_type, description, amount, currency_code, display_order)
     VALUES (?, ?, ?, 'cash', 'Prize', ?, 'EGP', 0)`, [tid, compId, placement, amount]);
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 6 });
  const { createPool, closePool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
  await pool.execute(`DELETE FROM tournament_participant_members WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_placements WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_prizes WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_prize_awards WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
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
  await pool.execute(`DELETE FROM tournament_placements WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_prizes WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_prize_awards WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_competitions WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${idList})`);
  await pool.execute(`DELETE FROM sport_formats WHERE id = ${fmt}`);
  await pool.execute(`DELETE FROM sport_rule_sets WHERE id = ${ruleSet}`);
  await pool.execute(`DELETE FROM sports WHERE id = ${SPORT}`);
  await pool.execute(`DELETE FROM player_profiles WHERE user_id IN (${CREATOR}, ${U.a}, ${U.b}, ${U.c}, ${U.d})`);
  await pool.execute(`DELETE FROM user_wallets WHERE user_id IN (${CREATOR}, ${U.a}, ${U.b}, ${U.c}, ${U.d})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${CREATOR}, ${U.a}, ${U.b}, ${U.c}, ${U.d})`);
  await pool.execute(`DELETE FROM organisations WHERE id = ${ORG}`);
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
  tournamentIds.length = 0;
}, 60000);

beforeEach(() => { vi.clearAllMocks(); });

describe('G11.18 C1 — prize awarding competition isolation', () => {
  it('Singles 1st=20,000 and Teams 1st=50,000 each bind their OWN prize by competition', async () => {
    const { tid, compA, compB } = await createCompletedTournament();
    await registerParticipant(tid, compA, U.a);
    await registerParticipant(tid, compB, U.b);
    const partA = await val(`SELECT id FROM tournament_participants WHERE tournament_id = ? AND competition_id = ? LIMIT 1`, [tid, compA]);
    const partB = await val(`SELECT id FROM tournament_participants WHERE tournament_id = ? AND competition_id = ? LIMIT 1`, [tid, compB]);
    await cashPrize(tid, compA, 1, 20000);
    await cashPrize(tid, compB, 1, 50000);
    await exec(`INSERT INTO tournament_placements (tournament_id, competition_id, placement, participant_id, user_id, source) VALUES (?, ?, 1, ?, ?, 'bracket')`, [tid, compA, partA, U.a]);
    await exec(`INSERT INTO tournament_placements (tournament_id, competition_id, placement, participant_id, user_id, source) VALUES (?, ?, 1, ?, ?, 'bracket')`, [tid, compB, partB, U.b]);

    const { tournamentPrizeAwardService } = await import('../application/tournament-prize-award.service.js');
    const { tournamentPrizeAwardRepository } = await import('../infrastructure/repositories/tournament-prize-award.repository.js');
    const created = await tournamentPrizeAwardService.bindAwardsForBracket(tid, null);
    expect(created.length).toBe(2);

    const awardA = created.find((a) => Number((a as any).competition_id) === compA)!;
    const awardB = created.find((a) => Number((a as any).competition_id) === compB)!;
    expect(Number(awardA.amount)).toBe(20000);
    expect(Number(awardB.amount)).toBe(50000);
    expect(Number((awardA as any).winner_user_id)).toBe(U.a);
    expect(Number((awardB as any).winner_user_id)).toBe(U.b);

    // hasAward is competition-scoped: an award in A never blocks B.
    expect(await tournamentPrizeAwardRepository.hasAward(tid, compA, 1, U.a)).toBe(true);
    expect(await tournamentPrizeAwardRepository.hasAward(tid, compB, 1, U.a)).toBe(false);
    expect(await tournamentPrizeAwardRepository.hasAward(tid, compB, 1, U.b)).toBe(true);
  });

  it('the SAME user winning Singles AND Teams receives BOTH awards independently', async () => {
    const { tid, compA, compB } = await createCompletedTournament();
    await registerParticipant(tid, compA, U.c);
    await registerParticipant(tid, compB, U.c);
    const partA = await val(`SELECT id FROM tournament_participants WHERE tournament_id = ? AND competition_id = ? LIMIT 1`, [tid, compA]);
    const partB = await val(`SELECT id FROM tournament_participants WHERE tournament_id = ? AND competition_id = ? LIMIT 1`, [tid, compB]);
    await cashPrize(tid, compA, 1, 20000);
    await cashPrize(tid, compB, 1, 50000);
    await exec(`INSERT INTO tournament_placements (tournament_id, competition_id, placement, participant_id, user_id, source) VALUES (?, ?, 1, ?, ?, 'bracket')`, [tid, compA, partA, U.c]);
    await exec(`INSERT INTO tournament_placements (tournament_id, competition_id, placement, participant_id, user_id, source) VALUES (?, ?, 1, ?, ?, 'bracket')`, [tid, compB, partB, U.c]);

    const { tournamentPrizeAwardService } = await import('../application/tournament-prize-award.service.js');
    const { tournamentPrizeAwardRepository } = await import('../infrastructure/repositories/tournament-prize-award.repository.js');
    const created = await tournamentPrizeAwardService.bindAwardsForBracket(tid, null);
    expect(created.length).toBe(2);
    const amounts = created.map((a) => Number(a.amount)).sort((x, y) => x - y);
    expect(amounts).toEqual([20000, 50000]);
    // both awards for the same user exist independently per competition
    expect(await tournamentPrizeAwardRepository.hasAward(tid, compA, 1, U.c)).toBe(true);
    expect(await tournamentPrizeAwardRepository.hasAward(tid, compB, 1, U.c)).toBe(true);
  });

  it('single-competition tournament binds exactly one award (legacy behavior preserved)', async () => {
    const { tid, compA } = await createCompletedTournament();
    await registerParticipant(tid, compA, U.d);
    const partA = await val(`SELECT id FROM tournament_participants WHERE tournament_id = ? AND competition_id = ? LIMIT 1`, [tid, compA]);
    await cashPrize(tid, compA, 1, 20000);
    await exec(`INSERT INTO tournament_placements (tournament_id, competition_id, placement, participant_id, user_id, source) VALUES (?, ?, 1, ?, ?, 'bracket')`, [tid, compA, partA, U.d]);
    const { tournamentPrizeAwardService } = await import('../application/tournament-prize-award.service.js');
    const created = await tournamentPrizeAwardService.bindAwardsForBracket(tid, null);
    expect(created.length).toBe(1);
    expect(Number(created[0].amount)).toBe(20000);
  });
});
