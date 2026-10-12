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
 * Phase 3 — per-player event limits (multi-event registration caps).
 *
 * Fixtures are LOCAL test data only (self-cleaned); the limit is enforced by
 * the SHARED registration service paths: tournamentService.register (Singles),
 * participantMemberService.createPairParticipant (Doubles/Mixed) and the
 * waitlist-promotion path — all inside the tournament-row lock.
 *
 * Regression note: these integration files share the local dev MySQL/Redis with
 * the running application; this spec performs registrations in fee-FREE
 * tournaments so no payment:succeeded event is emitted (no event interference).
 */

const ORG = 2792001;
const CREATOR = 2792009;
const P = { u1: 2792011, u2: 2792012, u3: 2792013, u4: 2792014 };
const SPORT = 2792101;

let pool: mysql.Pool;
let fmtSingles = 0;
let fmtDoubles = 0;
let fmtTeam = 0;
let ruleSetSingles = 0;
let ruleSetDoubles = 0;
let ruleSetTeam = 0;
const tournamentIds: number[] = [];
const compIds: number[] = [];

const exec = (sql: string, params: any[] = []) => pool.execute(sql, params);

async function mkUser(id: number) {
  await exec(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status, birth_date)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'G11.19 U', 'male', 'active', '1995-05-05')`,
    [id, `022${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, `g1119-${id}@test.com`],
  );
  // Pairs require an ACTIVE player profile (eligibility evaluation gate).
  await exec(`INSERT IGNORE INTO player_profiles (user_id) VALUES (?)`, [id]);
}

async function seedBase() {
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  await pool.execute(`INSERT IGNORE INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG}, UUID(), ?, 1, 'G11.19 Org', 'g1119-org', 1)`, [otId]);
  await pool.execute(`INSERT IGNORE INTO sports (id, name, slug, is_active, show_in_marketplace, sort_order) VALUES (${SPORT}, 'G1119 Sport', 'g1119-sport', 1, 1, 0)`);
  const [s1] = await pool.execute<RowData>(`INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, is_default, is_active) VALUES (?, 'g1119-singles', 'Singles', 'singles', 1, 1, 1)`, [SPORT]);
  fmtSingles = Number((s1 as any).insertId);
  const [d1] = await pool.execute<RowData>(`INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, is_default, is_active) VALUES (?, 'g1119-doubles', 'Doubles', 'doubles', 2, 0, 1)`, [SPORT]);
  fmtDoubles = Number((d1 as any).insertId);
  const [r1] = await pool.execute<RowData>(`INSERT INTO sport_rule_sets (format_id, version, name, rules) VALUES (?, 1, 'Singles Rules', ?)`, [fmtSingles, JSON.stringify({ scoring: 'sets', best_of: 3 })]);
  ruleSetSingles = Number((r1 as any).insertId);
  const [r2] = await pool.execute<RowData>(`INSERT INTO sport_rule_sets (format_id, version, name, rules) VALUES (?, 1, 'Doubles Rules', ?)`, [fmtDoubles, JSON.stringify({ scoring: 'sets', best_of: 3 })]);
  ruleSetDoubles = Number((r2 as any).insertId);
  // Team format used by the member-add coverage (roster 3: 2..3 active members).
  const [tm] = await pool.execute<RowData>(`INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active) VALUES (?, 'g1119-team', 'Team', 'team', 2, 3, 0, 1)`, [SPORT]);
  fmtTeam = Number((tm as any).insertId);
  const [r3] = await pool.execute<RowData>(`INSERT INTO sport_rule_sets (format_id, version, name, rules) VALUES (?, 1, 'Team Rules', ?)`, [fmtTeam, JSON.stringify({ scoring: 'sets', best_of: 3 })]);
  ruleSetTeam = Number((r3 as any).insertId);
  for (const u of Object.values(P)) await mkUser(u);
  await mkUser(CREATOR);
}

/** Tournament (fee 0, registration_open) with a default Singles competition. */
async function createTournamentBase(): Promise<number> {
  const [res] = await exec<RowData>(
    `INSERT INTO tournaments (public_id, creator_id, organisation_id, bracket_type_id, format, match_format_id, sport_id, name,
       max_participants, min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type, commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, 1, 'knockout', ?, ?, 'G11.19 Cup', 64, 2, 0, 0, 'EGP', 'FREE', 'community', 0, 'registration_open', 1, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
    [CREATOR, ORG, fmtSingles, SPORT],
  );
  const tid = Number((res as any).insertId);
  tournamentIds.push(tid);
  const [d] = await exec<RowData>(
    `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, match_format_id, currency_code, is_default)
     VALUES (UUID(), ?, 'singles', 'Singles', ?, 'EGP', 1)`, [tid, fmtSingles]);
  compIds.push(Number((d as any).insertId));
  return tid;
}

async function addCompetition(tid: number, type: 'singles' | 'doubles' | 'team', name: string, overrides: Record<string, unknown> = {}): Promise<number> {
  const fmt = type === 'team' ? fmtTeam : (type === 'doubles' ? fmtDoubles : fmtSingles);
  const [d] = await exec<RowData>(
    `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, match_format_id, currency_code, max_participants, waitlist_enabled, is_default)
     VALUES (UUID(), ?, ?, ?, ?, 'EGP', ?, ?, 0)`,
    [tid, type, name, fmt, overrides.max_participants ?? null, overrides.waitlist_enabled ?? 0],
  );
  const id = Number((d as any).insertId);
  compIds.push(id);
  return id;
}

async function setLimit(tid: number, limit: number | null) {
  await exec(`UPDATE tournaments SET max_events_per_player = ? WHERE id = ?`, [limit, tid]);
}

async function register(tid: number, userId: number, compId: number): Promise<number> {
  const { tournamentService } = await import('../application/tournament.service.js');
  const reg = await tournamentService.register(tid, userId, undefined, undefined, { competitionId: compId });
  return Number(reg.id);
}

async function createPair(tid: number, compId: number, members: number[]): Promise<number> {
  const { participantMemberService } = await import('../application/participant-member.service.js');
  const p = await participantMemberService.createPairParticipant(tid, { memberUserIds: members, competitionId: compId }, CREATOR);
  return Number((p as any).registration_id ?? p.id);
}

async function registrationStatus(tid: number, userId: number, compId: number): Promise<string | null> {
  const [rows] = await exec<RowData>(
    `SELECT r.status FROM tournament_registrations r
     WHERE r.tournament_id = ? AND r.competition_id = ? AND r.player_id = ? LIMIT 1`, [tid, compId, userId]);
  return rows.length ? String((rows as any[])[0].status) : null;
}

async function activeCount(tid: number, userId: number): Promise<number> {
  const { tournamentRepository } = await import('../infrastructure/repositories/tournament.repository.js');
  return tournamentRepository.countActiveEventRegistrationsForPlayer(tid, userId);
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 6 });
  await exec('DELETE FROM tournaments WHERE creator_id = ?', [CREATOR]);
  await seedBase();
}, 60000);

afterAll(async () => {
  if (!pool) return;
  const ids = tournamentIds.length ? tournamentIds.join(',') : '0';
  await exec('SET FOREIGN_KEY_CHECKS = 0');
  await exec(`DELETE FROM tournament_participant_members WHERE tournament_id IN (${ids})`);
  await exec(`DELETE FROM tournament_participants WHERE tournament_id IN (${ids})`);
  await exec(`DELETE FROM tournament_registrations WHERE tournament_id IN (${ids})`);
  await exec(`DELETE FROM tournament_competitions WHERE tournament_id IN (${ids})`);
  await exec(`DELETE FROM tournaments WHERE id IN (${ids})`);
  if (fmtSingles) await exec(`DELETE FROM sport_rule_sets WHERE id IN (?, ?, ?)`, [ruleSetSingles, ruleSetDoubles, ruleSetTeam]);
  await exec(`DELETE FROM sport_formats WHERE id IN (?, ?, ?)`, [fmtSingles, fmtDoubles, fmtTeam]);
  await exec(`DELETE FROM sports WHERE id = ${SPORT}`);
  await exec(`DELETE FROM users WHERE id IN (${CREATOR}, ${Object.values(P).join(',')})`);
  await exec(`DELETE FROM organisations WHERE id = ${ORG}`);
  await exec('SET FOREIGN_KEY_CHECKS = 1');
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
  tournamentIds.length = 0; compIds.length = 0;
}, 60000);

beforeEach(() => { vi.clearAllMocks(); });

describe('Phase 3 — multi-event limits (max_events_per_player)', () => {
  it('1. NULL/unlimited permits multiple eligible events', async () => {
    const tid = await createTournamentBase();
    const a = await addCompetition(tid, 'singles', 'Singles B');
    const r1 = await register(tid, P.u1, (await tournamentCompetitionId(tid, 'Singles')));
    const r2 = await register(tid, P.u1, a);
    expect(r1).toBeGreaterThan(0);
    expect(r2).toBeGreaterThan(0);
    expect(await activeCount(tid, P.u1)).toBe(2);
  });

  it('2. limit=1 blocks the second event with 409 TOURNAMENT_EVENTS_PER_PLAYER_LIMIT', async () => {
    const tid = await createTournamentBase();
    const a = await addCompetition(tid, 'singles', 'Singles B');
    await setLimit(tid, 1);
    const r1 = await register(tid, P.u1, (await tournamentCompetitionId(tid, 'Singles')));
    expect(r1).toBeGreaterThan(0);
    await expect(tournamentServiceRegister(tid, P.u1, a)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'CONFLICT',
      code: 'TOURNAMENT_EVENTS_PER_PLAYER_LIMIT',
      message: expect.stringContaining('1'),
    });
  });

  it('3. limit=2 permits 2 events and rejects the 3rd', async () => {
    const tid = await createTournamentBase();
    const a = await addCompetition(tid, 'singles', 'Singles B');
    const b = await addCompetition(tid, 'singles', 'Singles C');
    await setLimit(tid, 2);
    const r1 = await register(tid, P.u1, (await tournamentCompetitionId(tid, 'Singles')));
    const r2 = await register(tid, P.u1, a);
    expect(r1).toBeGreaterThan(0); expect(r2).toBeGreaterThan(0);
    await expect(tournamentServiceRegister(tid, P.u1, b)).rejects.toMatchObject({ code: 'TOURNAMENT_EVENTS_PER_PLAYER_LIMIT' });
  });

  it('4. Singles then Doubles; each pair member counted individually and the pair fails atomically', async () => {
    const tid = await createTournamentBase();
    await setLimit(tid, 1);
    const singlesId = await tournamentCompetitionId(tid, 'Singles');
    const dbl = await addCompetition(tid, 'doubles', 'Doubles');
    await register(tid, P.u1, singlesId);
    // u1 is at the limit → the whole pair (u1,u2) is rejected atomically.
    await expect(createPair(tid, dbl, [P.u1, P.u2])).rejects.toMatchObject({ code: 'TOURNAMENT_EVENTS_PER_PLAYER_LIMIT' });
    // No partial registration / participant rows were written for the pair.
    const [tx] = await exec<RowData>(`SELECT COUNT(*) c FROM tournament_registrations WHERE tournament_id = ? AND competition_id = ?`, [tid, dbl]);
    expect(Number((tx as any[])[0].c)).toBe(0);
    // A pair with two fresh players is still allowed (different players independent).
    await createPair(tid, dbl, [P.u3, P.u4]);
    expect(await activeCount(tid, P.u3)).toBe(1);
    expect(await activeCount(tid, P.u4)).toBe(1);
  });

  it('5. Mixed/Doubles counts each individual: a pair member at the limit fails their own Singles', async () => {
    const tid = await createTournamentBase();
    await setLimit(tid, 1);
    const dbl = await addCompetition(tid, 'doubles', 'Doubles');
    const singlesC = await addCompetition(tid, 'singles', 'Singles C');
    await createPair(tid, dbl, [P.u3, P.u4]);
    // u4 is now at the limit via the doubles entry → blocked from a Singles event.
    await expect(tournamentServiceRegister(tid, P.u4, singlesC)).rejects.toMatchObject({ code: 'TOURNAMENT_EVENTS_PER_PLAYER_LIMIT' });
    // u3, also a member, is blocked too.
    await expect(tournamentServiceRegister(tid, P.u3, singlesC)).rejects.toMatchObject({ code: 'TOURNAMENT_EVENTS_PER_PLAYER_LIMIT' });
  });

  it('6. allowances are independent across players and tournaments', async () => {
    const t1 = await createTournamentBase();
    const t2 = await createTournamentBase();
    await setLimit(t1, 1);
    const a1 = await addCompetition(t1, 'singles', 'Singles B');
    const b2 = await addCompetition(t2, 'singles', 'Singles B');
    await register(t1, P.u1, (await tournamentCompetitionId(t1, 'Singles')));
    await expect(tournamentServiceRegister(t1, P.u1, a1)).rejects.toMatchObject({ code: 'TOURNAMENT_EVENTS_PER_PLAYER_LIMIT' });
    // Same player in ANOTHER tournament is unlimited there.
    expect(await register(t2, P.u1, (await tournamentCompetitionId(t2, 'Singles')))).toBeGreaterThan(0);
    expect(await register(t2, P.u1, b2)).toBeGreaterThan(0);
  });

  it('7. duplicate registration keeps the existing 409 contract', async () => {
    const tid = await createTournamentBase();
    await setLimit(tid, 5);
    const singlesId = await tournamentCompetitionId(tid, 'Singles');
    await register(tid, P.u1, singlesId);
    await expect(tournamentServiceRegister(tid, P.u1, singlesId)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'CONFLICT',
      code: 'TOURNAMENT_REGISTRATION_EXISTS',
      message: 'Already registered in this competition',
    });
  });

  it('8. a successful pre-start cancellation releases the allowance', async () => {
    const tid = await createTournamentBase();
    await setLimit(tid, 1);
    const singlesId = await tournamentCompetitionId(tid, 'Singles');
    const a = await addCompetition(tid, 'singles', 'Singles B');
    const regId = await register(tid, P.u1, singlesId);
    const participantId = await participantIdFor(tid, regId);
    await withdraw(tid, participantId, CREATOR);
    expect(await registrationStatus(tid, P.u1, singlesId)).toBe('withdrawn');
    // allowance released → can enter another competition.
    expect(await register(tid, P.u1, a)).toBeGreaterThan(0);
  });

  it('9. a failed cancellation does not release the allowance', async () => {
    const tid = await createTournamentBase();
    await setLimit(tid, 1);
    const singlesId = await tournamentCompetitionId(tid, 'Singles');
    const a = await addCompetition(tid, 'singles', 'Singles B');
    await register(tid, P.u1, singlesId);
    const regId = (await registrationIdByPlayer(tid, singlesId, P.u1))!;
    const partId = await participantIdFor(tid, regId);
    // A failed cancellation attempt (the participant is NOT active) throws and
    // changes NOTHING — the allowance is NOT released.
    await exec(`UPDATE tournament_participants SET status = 'waiting' WHERE id = ?`, [partId]);
    await expect(withdraw(tid, partId, CREATOR)).rejects.toMatchObject({ code: 'TOURNAMENT_INVALID_TRANSITION' });
    await expect(tournamentServiceRegister(tid, P.u1, a)).rejects.toMatchObject({ code: 'TOURNAMENT_EVENTS_PER_PLAYER_LIMIT' });
    // Restore active state and perform the REAL pre-start cancellation → now the
    // allowance is released and a re-entry works.
    await exec(`UPDATE tournament_participants SET status = 'active' WHERE id = ?`, [partId]);
    await withdraw(tid, partId, CREATOR);
    expect(await registrationStatus(tid, P.u1, singlesId)).toBe('withdrawn');
    expect(await register(tid, P.u1, a)).toBeGreaterThan(0);
  });

  it('10. waiting-list entries do NOT consume allowance', async () => {
    const tid = await createTournamentBase();
    await setLimit(tid, 1);
    const singlesId = await tournamentCompetitionId(tid, 'Singles');
    const slow = await addCompetition(tid, 'singles', 'Slow', { max_participants: 1, waitlist_enabled: 1 });
    const spare = await addCompetition(tid, 'singles', 'Spare');
    await register(tid, P.u1, singlesId);
    // Seat the slow competition with a CONFIRMED registration so it is full.
    await register(tid, P.u2, slow);
    await exec(`UPDATE tournament_registrations SET status = 'confirmed' WHERE tournament_id = ? AND competition_id = ? AND player_id = ?`, [tid, slow, P.u2]);
    // u1 is at the limit (1 active) → allowed into the WAITLIST (no consumption).
    const waitReg = await register(tid, P.u1, slow);
    const waitStatus = await registrationStatus(tid, P.u1, slow);
    expect(waitStatus).toBe('waiting');
    expect(waitReg).toBeGreaterThan(0);
    // Still rejected for a further ACTIVE event.
    await expect(tournamentServiceRegister(tid, P.u1, spare)).rejects.toMatchObject({ code: 'TOURNAMENT_EVENTS_PER_PLAYER_LIMIT' });
  });

  it('11. post-start withdrawal retains the allowance while the registration stays confirmed', async () => {
    const tid = await createTournamentBase();
    await setLimit(tid, 1);
    const singlesId = await tournamentCompetitionId(tid, 'Singles');
    const a = await addCompetition(tid, 'singles', 'Singles B');
    await register(tid, P.u1, singlesId);
    // Simulate the post-start state: participant withdrawn_after_start while the
    // registration remains confirmed (real `withdrawParticipant` keeps it so).
    const regId = await registrationIdByPlayer(tid, singlesId, P.u1);
    const partId = await participantIdFor(tid, regId!);
    await exec(`UPDATE tournament_participants SET status = 'withdrawn_after_start' WHERE id = ?`, [partId]);
    await exec(`UPDATE tournament_registrations SET status = 'confirmed' WHERE id = ?`, [regId]);
    // Allowance is retained → the player is still blocked from a new event.
    await expect(tournamentServiceRegister(tid, P.u1, a)).rejects.toMatchObject({ code: 'TOURNAMENT_EVENTS_PER_PLAYER_LIMIT' });
  });

  it('12. concurrent registrations cannot exceed the limit (single serialization point)', async () => {
    const tid = await createTournamentBase();
    await setLimit(tid, 1);
    const singlesId = await tournamentCompetitionId(tid, 'Singles');
    const a = await addCompetition(tid, 'singles', 'Singles B');
    const outcomes = await Promise.allSettled([
      tournamentServiceRegister(tid, P.u2, singlesId),
      tournamentServiceRegister(tid, P.u2, a),
    ]);
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[];
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    const err = rejected[0].reason as any;
    expect(err).toMatchObject({ code: 'TOURNAMENT_EVENTS_PER_PLAYER_LIMIT' });
    expect(await activeCount(tid, P.u2)).toBe(1);
  });

  it('13. retries are idempotent and never double-count', async () => {
    const tid = await createTournamentBase();
    await setLimit(tid, 1);
    const singlesId = await tournamentCompetitionId(tid, 'Singles');
    await register(tid, P.u3, singlesId);
    await expect(tournamentServiceRegister(tid, P.u3, singlesId)).rejects.toMatchObject({ code: 'TOURNAMENT_REGISTRATION_EXISTS' });
    expect(await activeCount(tid, P.u3)).toBe(1);
  });

  it('14. lowering the limit never deletes or cancels existing registrations', async () => {
    const tid = await createTournamentBase();
    const singlesId = await tournamentCompetitionId(tid, 'Singles');
    const a = await addCompetition(tid, 'singles', 'Singles B');
    const c = await addCompetition(tid, 'singles', 'Singles C');
    // Unlimited → two active registrations.
    await register(tid, P.u4, singlesId);
    await register(tid, P.u4, a);
    await setLimit(tid, 1);
    // Existing two remain; the player is now blocked from a third.
    expect(await activeCount(tid, P.u4)).toBe(2);
    await expect(tournamentServiceRegister(tid, P.u4, c)).rejects.toMatchObject({ code: 'TOURNAMENT_EVENTS_PER_PLAYER_LIMIT' });
  });

  it('15. a waitlisted registration is NOT promoted when the head player has reached the limit', async () => {
    const tid = await createTournamentBase();
    await setLimit(tid, 1);
    const singlesId = await tournamentCompetitionId(tid, 'Singles');
    const slow = await addCompetition(tid, 'singles', 'Slow', { max_participants: 1, waitlist_enabled: 1 });
    // u1 consumes the only allowance (Singles).
    await register(tid, P.u1, singlesId);
    // Seat the slow competition with a CONFIRMED registration so it is full.
    await register(tid, P.u2, slow);
    await exec(`UPDATE tournament_registrations SET status = 'confirmed' WHERE tournament_id = ? AND competition_id = ? AND player_id = ?`, [tid, slow, P.u2]);
    // u1 joins the waitlist (head) — the limit does NOT block WAITING entries.
    const waitReg = await register(tid, P.u1, slow);
    expect(waitReg).toBeGreaterThan(0);
    expect(await registrationStatus(tid, P.u1, slow)).toBe('waiting');
    // Free a slot (pre-start withdrawal of the seated player) then promote the head.
    const seatRegId = (await registrationIdByPlayer(tid, slow, P.u2))!;
    await withdraw(tid, await participantIdFor(tid, seatRegId), CREATOR);
    await expect(promote(tid, CREATOR, slow)).rejects.toMatchObject({ code: 'TOURNAMENT_EVENTS_PER_PLAYER_LIMIT' });
    // NOTHING changed: u1 stays waiting (registration + participant), the
    // waiting_order is intact, the slot stays empty and the allowance is intact.
    expect(await registrationStatus(tid, P.u1, slow)).toBe('waiting');
    const waitPartId = await participantIdFor(tid, waitReg);
    const [wps] = await exec<RowData>('SELECT status, waiting_order FROM tournament_participants WHERE id = ?', [waitPartId]);
    expect(String((wps as any[])[0].status)).toBe('waiting');
    expect((wps as any[])[0].waiting_order).not.toBeNull();
    expect(await activeCount(tid, P.u1)).toBe(1);
    const [ac] = await exec<RowData>('SELECT COUNT(*) c FROM tournament_participants WHERE tournament_id = ? AND competition_id = ? AND status = ?', [tid, slow, 'active']);
    expect(Number((ac as any[])[0].c)).toBe(0);
  });

  it('16. an eligible waitlisted player below the limit is promoted and counted', async () => {
    const tid = await createTournamentBase();
    await setLimit(tid, 2);
    const singlesId = await tournamentCompetitionId(tid, 'Singles');
    const slow = await addCompetition(tid, 'singles', 'Slow', { max_participants: 1, waitlist_enabled: 1 });
    const spare = await addCompetition(tid, 'singles', 'Spare');
    // u3 holds 1 active (Singles) → one allowance left (< limit 2).
    await register(tid, P.u3, singlesId);
    // Seat the slow competition with a CONFIRMED registration so it is full.
    await register(tid, P.u4, slow);
    await exec(`UPDATE tournament_registrations SET status = 'confirmed' WHERE tournament_id = ? AND competition_id = ? AND player_id = ?`, [tid, slow, P.u4]);
    const waitReg = await register(tid, P.u3, slow);
    expect(await registrationStatus(tid, P.u3, slow)).toBe('waiting');
    // Free the slot and promote the head (u3 is still under the limit).
    const seatRegId = (await registrationIdByPlayer(tid, slow, P.u4))!;
    await withdraw(tid, await participantIdFor(tid, seatRegId), CREATOR);
    const promoted = await promote(tid, CREATOR, slow);
    expect(promoted).toBeTruthy();
    // Promotion completed: registered + ACTIVE participant, waiting_order cleared.
    expect(await registrationStatus(tid, P.u3, slow)).toBe('registered');
    const [pp] = await exec<RowData>('SELECT status, waiting_order FROM tournament_participants WHERE id = ?', [await participantIdFor(tid, waitReg)]);
    expect(String((pp as any[])[0].status)).toBe('active');
    expect((pp as any[])[0].waiting_order).toBeNull();
    expect(await activeCount(tid, P.u3)).toBe(2);
    // Now at exactly the limit → a further ACTIVE event is rejected.
    await expect(tournamentServiceRegister(tid, P.u3, spare)).rejects.toMatchObject({ code: 'TOURNAMENT_EVENTS_PER_PLAYER_LIMIT' });
  });

  it('17. adding a member who has reached the limit is rejected atomically; a valid add still succeeds', async () => {
    const tid = await createTournamentBase();
    await setLimit(tid, 1);
    const singlesId = await tournamentCompetitionId(tid, 'Singles');
    const teamComp = await addCompetition(tid, 'team', 'Team');
    // u1 consumes the only allowance (Singles) → at the limit.
    await register(tid, P.u1, singlesId);
    // A 2/3 team (members u2, u3 — both under the limit) is created cleanly.
    const { participantMemberService } = await import('../application/participant-member.service.js');
    const team = await participantMemberService.createTeamParticipant(tid, { memberUserIds: [P.u2, P.u3], competitionId: teamComp }, CREATOR);
    const teamPartId = Number((team as any).id);
    expect(teamPartId).toBeGreaterThan(0);
    expect(await memberCount(teamPartId)).toBe(2);
    expect(await activeCount(tid, P.u3)).toBe(1);
    // Adding u1 (at the limit) → rejected cleanly with NO partial member changes.
    await expect(participantMemberService.addParticipantMember(tid, teamPartId, P.u1, CREATOR)).rejects.toMatchObject({ code: 'TOURNAMENT_EVENTS_PER_PLAYER_LIMIT' });
    expect(await memberCount(teamPartId)).toBe(2);
    const [u1row] = await exec<RowData>('SELECT COUNT(*) c FROM tournament_participant_members WHERE participant_id = ? AND user_id = ?', [teamPartId, P.u1]);
    expect(Number((u1row as any[])[0].c)).toBe(0);
    // u4 (under the limit) can still be added successfully → roster fills to 3.
    const members = await participantMemberService.addParticipantMember(tid, teamPartId, P.u4, CREATOR);
    expect(members.some((m) => Number(m.user_id) === P.u4)).toBe(true);
    expect(await memberCount(teamPartId)).toBe(3);
    expect(await activeCount(tid, P.u4)).toBe(1);
  });
});

// Local helpers (service calls routed through the authoritative entry point).
async function tournamentCompetitionId(tid: number, name: string): Promise<number> {
  const [rows] = await exec<RowData>('SELECT id FROM tournament_competitions WHERE tournament_id = ? AND name = ? LIMIT 1', [tid, name]);
  return Number((rows as any[])[0].id);
}

function tournamentServiceRegister(tid: number, userId: number, compId: number) {
  return import('../application/tournament.service.js').then((m) =>
    m.tournamentService.register(tid, userId, undefined, undefined, { competitionId: compId }));
}

async function registrationIdByPlayer(tid: number, compId: number, userId: number): Promise<number | null> {
  const [rows] = await exec<RowData>('SELECT id FROM tournament_registrations WHERE tournament_id = ? AND competition_id = ? AND player_id = ? LIMIT 1', [tid, compId, userId]);
  return rows.length ? Number((rows as any[])[0].id) : null;
}

async function participantIdFor(tid: number, registrationId: number): Promise<number> {
  const [rows] = await exec<RowData>('SELECT id FROM tournament_participants WHERE tournament_id = ? AND registration_id = ? LIMIT 1', [tid, registrationId]);
  return Number((rows as any[])[0].id);
}

async function withdraw(tid: number, participantId: number, actorId: number) {
  const { participantDrawService } = await import('../application/participant-draw.service.js');
  return participantDrawService.withdrawParticipant(tid, participantId, actorId, 'phase3-test');
}

/** Promote the FIFO waitlist head of ONE competition via the REAL service. */
async function promote(tid: number, actorId: number, compId: number) {
  const { participantDrawService } = await import('../application/participant-draw.service.js');
  return participantDrawService.promoteNextWaitlisted(tid, actorId, undefined, compId);
}

/** Active member count of a pair/team participant. */
async function memberCount(participantId: number): Promise<number> {
  const [rows] = await exec<RowData>('SELECT COUNT(*) c FROM tournament_participant_members WHERE participant_id = ?', [participantId]);
  return Number((rows as any[])[0].c);
}