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
 * Phase 4 Step 2 — INDEPENDENT COMPETITION GENERATION.
 *
 * `tournamentService.create` accepts an optional `competitions` seed array: one
 * competition per eligible gender × age/level group, created atomically WITH the
 * tournament INSTEAD of the legacy broad default. This spec proves:
 *   1. legacy create (no seeds) still produces exactly ONE default competition;
 *   2. seeded create produces N group competitions and NO default;
 *   3. per-competition eligibility isolates registrations (gender + age/level);
 *   4. draws/matches are isolated per competition;
 *   5. retries create independent tournaments with NO duplicate competitions
 *      inside a single tournament.
 */

const ORG = 2740001;
const CREATOR = 2740009;
const SPORT = 2740101;
// Step 2A — a second sport whose DEFAULT format is DOUBLES (inheritance proof).
const SPORT2 = 2740102;

// Users: gender + birth year (Tournament Age = 2026 − birthYear).
const M14 = 2740011; // male, born 2012 → age 14 (U14+U16 eligible)
const M16 = 2740012; // male, born 2010 → age 16 (U16 only)
const F14 = 2740013; // female, born 2012 → age 14
const F16 = 2740014; // female, born 2010 → age 16
const LV = 2740015;  // male, born 2016 → age 10, level 2 (professional)
// Second eligible player per group (draws require ≥2 participants).
const M14B = 2740016; // male, born 2012
const M16B = 2740017; // male, born 2010
const F14B = 2740018; // female, born 2012
const F16B = 2740019; // female, born 2010
const ALL = [M14, M16, F14, F16, LV, M14B, M16B, F14B, F16B, CREATOR];

const U14 = 1;
const U16 = 2;
const LEVEL_2 = 2;

let pool: mysql.Pool;
let fmt = 0;
let ruleSet = 0;
let fmtDoubles = 0;
let ruleSetDoubles = 0;
const tournamentIds: number[] = [];

const exec = (sql: string, params: any[] = []) => pool.execute(sql, params);

async function mkUser(id: number, gender: 'male' | 'female', birthYear: number, levelId: number | null = null) {
  await exec(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status, birth_date)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'P4 U', ?, 'active', ?)`,
    [id, `020${String(id).slice(-7)}`, `+20${String(id).slice(-7)}`, `p4-${id}@t.com`, gender, `${birthYear}-05-05`],
  );
  await exec(`INSERT IGNORE INTO player_profiles (user_id, main_level_id) VALUES (?, ?)`, [id, levelId]);
}

async function seedBase() {
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  await pool.execute(`INSERT IGNORE INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG}, UUID(), ?, 1, 'P4 Org', 'p4-org', 1)`, [(ot as any[])[0].id]);
  await pool.execute(`INSERT IGNORE INTO sports (id, name, slug, is_active, show_in_marketplace, sort_order) VALUES (${SPORT}, 'P4 Sport', 'p4-sport', 1, 1, 0)`);
  const [s] = await pool.execute<RowData>(`INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, is_default, is_active) VALUES (?, 'p4-singles', 'Singles', 'singles', 1, 1, 1)`, [SPORT]);
  fmt = Number((s as any).insertId);
  const [rs] = await pool.execute<RowData>(`INSERT INTO sport_rule_sets (format_id, version, name, rules) VALUES (?, 1, 'P4 Rules', ?)`, [fmt, JSON.stringify({ scoring: 'sets', best_of: 3 })]);
  ruleSet = Number((rs as any).insertId);
  // Doubles-default sport (Step 2A — competition-type inheritance proof).
  await pool.execute(`INSERT IGNORE INTO sports (id, name, slug, is_active, show_in_marketplace, sort_order) VALUES (${SPORT2}, 'P4 Doubles Sport', 'p4-dbl', 1, 1, 0)`);
  const [d] = await pool.execute<RowData>(`INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, is_default, is_active) VALUES (?, 'p4-doubles', 'Doubles', 'doubles', 2, 1, 1)`, [SPORT2]);
  fmtDoubles = Number((d as any).insertId);
  const [r2] = await pool.execute<RowData>(`INSERT INTO sport_rule_sets (format_id, version, name, rules) VALUES (?, 1, 'P4 Doubles Rules', ?)`, [fmtDoubles, JSON.stringify({ scoring: 'sets', best_of: 3 })]);
  ruleSetDoubles = Number((r2 as any).insertId);
  await mkUser(M14, 'male', 2012);
  await mkUser(M16, 'male', 2010);
  await mkUser(F14, 'female', 2012);
  await mkUser(F16, 'female', 2010);
  await mkUser(LV, 'male', 2016, LEVEL_2);
  await mkUser(M14B, 'male', 2012);
  await mkUser(M16B, 'male', 2010);
  await mkUser(F14B, 'female', 2012);
  await mkUser(F16B, 'female', 2010);
  await mkUser(CREATOR, 'male', 1990);
}

function createPayload(competitions?: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    organisation_id: ORG,
    bracket_type_id: 1,
    format: 'knockout',
    sport_id: SPORT,
    match_format_id: fmt,
    rule_set_id: ruleSet,
    name: 'P4 Independent Cup',
    max_participants: 64,
    min_participants: 2,
    entry_fee: 0,
    registration_fee: 0,
    currency_code: 'EGP',
    price_type: 'FREE',
    start_date: '2026-12-01',
    end_date: '2026-12-31',
    registration_opens: '2026-11-01',
    registration_closes: '2026-11-30',
    age_mode: 'categories',
    age_category_ids: [U14, U16],
    gender_categories: ['male', 'female'],
    level_ids: [],
    ...(competitions ? { competitions } : {}),
  };
}

/** Male U14 / Male U16 / Female U14 / Female U16 — one competition per group. */
function groupSeeds(): Array<Record<string, unknown>> {
  const seed = (gender: 'male' | 'female', ageId: number) => ({
    competition_type: 'singles',
    name: `${gender === 'male' ? 'Male' : 'Female'} ${ageId === U14 ? 'U14' : 'U16'}`,
    age_mode: 'categories',
    age_category_ids: [ageId],
    gender_categories: [gender],
    level_ids: [],
  });
  return [seed('male', U14), seed('male', U16), seed('female', U14), seed('female', U16)];
}

async function createTournamentWith(payload: Record<string, unknown>): Promise<number> {
  const { tournamentService } = await import('../application/tournament.service.js');
  const t = await tournamentService.create(payload as any, CREATOR);
  const tid = Number(t.id);
  tournamentIds.push(tid);
  // Draft has no registration — open it so the service `register` path runs.
  await exec(`UPDATE tournaments SET status = 'registration_open' WHERE id = ?`, [tid]);
  return tid;
}

async function countTournaments(): Promise<number> {
  const [rows] = await exec<RowData>('SELECT COUNT(*) c FROM tournaments WHERE creator_id = ?', [CREATOR]);
  return Number((rows as any[])[0].c);
}

async function competitionsOf(tid: number): Promise<Array<Record<string, any>>> {
  const [rows] = await exec<RowData>('SELECT id, name, competition_type, age_mode, age_category_ids, gender_categories, level_ids, is_default FROM tournament_competitions WHERE tournament_id = ? ORDER BY id', [tid]);
  // mysql2 auto-parses JSON columns to JS arrays/values; accept either form.
  const unjson = (v: any): any[] => (typeof v === 'string' ? JSON.parse(v) : (v ?? []));
  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    competition_type: String(r.competition_type),
    age_mode: r.age_mode != null ? String(r.age_mode) : null,
    age_category_ids: unjson(r.age_category_ids),
    gender_categories: unjson(r.gender_categories),
    level_ids: unjson(r.level_ids),
    is_default: Number(r.is_default),
  }));
}

async function register(tid: number, userId: number, compId: number) {
  const { tournamentService } = await import('../application/tournament.service.js');
  return tournamentService.register(tid, userId, undefined, undefined, { competitionId: compId });
}

async function lockDraw(tid: number, compId: number, actor: number): Promise<number> {
  const { participantDrawService } = await import('../application/participant-draw.service.js');
  const draw = await participantDrawService.generateDraw(tid, actor, 22345 + compId, compId);
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
  await pool.execute(`DELETE FROM sport_rule_sets WHERE id IN (${ruleSet}, ${ruleSetDoubles})`);
  await pool.execute(`DELETE FROM sport_formats WHERE id IN (${fmt}, ${fmtDoubles})`);
  await pool.execute(`DELETE FROM sports WHERE id IN (${SPORT}, ${SPORT2})`);
  await pool.execute(`DELETE FROM player_profiles WHERE user_id IN (${ALL.join(',')})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${ALL.join(',')})`);
  await pool.execute(`DELETE FROM organisations WHERE id = ${ORG}`);
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
  tournamentIds.length = 0;
}, 60000);

beforeEach(() => { vi.clearAllMocks(); });

describe('Phase 4 Step 2 — independent competition generation', () => {
  it('1. legacy create (no seeds) keeps the single default competition', async () => {
    const tid = await createTournamentWith(createPayload());
    const comps = await competitionsOf(tid);
    expect(comps.length).toBe(1);
    expect(comps[0].is_default).toBe(1);
    // The default mirrors the tournament's (broad) eligibility.
    expect(comps[0].gender_categories).toEqual(['male', 'female']);
  });

  it('2. seeded create produces one competition per group and NO default competition', async () => {
    const tid = await createTournamentWith(createPayload(groupSeeds()));
    const comps = await competitionsOf(tid);
    expect(comps.length).toBe(4);
    expect(comps.some((c) => c.is_default === 1)).toBe(false);

    const find = (gender: string, ageId: number) =>
      comps.find((c) => c.gender_categories[0] === gender && c.age_category_ids[0] === ageId)!;
    expect(find('male', U14).name).toBe('Male U14');
    expect(find('male', U16).name).toBe('Male U16');
    expect(find('female', U14).name).toBe('Female U14');
    for (const c of comps) {
      expect(c.competition_type).toBe('singles');
      expect(c.age_mode).toBe('categories');
      expect(c.gender_categories.length).toBe(1);
      expect(c.age_category_ids.length).toBe(1);
      expect(c.level_ids).toEqual([]);
    }
  });

  it('3. per-competition eligibility isolates registrations by gender and age', async () => {
    const tid = await createTournamentWith(createPayload(groupSeeds()));
    const comps = await competitionsOf(tid);
    const byName = Object.fromEntries(comps.map((c) => [c.name, c.id]));

    // A 16-year-old male is eligible in Male U16 …
    await register(tid, M16, byName['Male U16']);
    await expect(register(tid, M16, byName['Male U14'])).rejects.toMatchObject({ errorCode: 'AGE_NOT_ELIGIBLE' });
    // … and never in a female competition.
    await expect(register(tid, M16, byName['Female U16'])).rejects.toMatchObject({ errorCode: 'GENDER_NOT_ELIGIBLE' });

    // A 14-year-old female is eligible in Female U14, never in male groups.
    await register(tid, F14, byName['Female U14']);
    await expect(register(tid, F14, byName['Male U14'])).rejects.toMatchObject({ errorCode: 'GENDER_NOT_ELIGIBLE' });
  });

  it('4. each group competition owns an independent draw and isolated matches', async () => {
    const tid = await createTournamentWith(createPayload(groupSeeds()));
    const comps = await competitionsOf(tid);
    const byName = Object.fromEntries(comps.map((c) => [c.name, c.id]));

    // Two eligible registrations per group (draws require ≥2 participants).
    await register(tid, M14, byName['Male U14']);
    await register(tid, M14B, byName['Male U14']);
    await register(tid, M16, byName['Male U16']);
    await register(tid, M16B, byName['Male U16']);
    await register(tid, F14, byName['Female U14']);
    await register(tid, F14B, byName['Female U14']);
    await register(tid, F16, byName['Female U16']);
    await register(tid, F16B, byName['Female U16']);

    // Draw isolation: per-competition attempts are independent (each starts at 1).
    for (const c of comps) await lockDraw(tid, c.id, CREATOR);
    const [drawRows] = await exec<RowData>('SELECT competition_id, attempt_number FROM tournament_draws WHERE tournament_id = ? ORDER BY competition_id, attempt_number', [tid]);
    const attempts = (drawRows as any[]).map((r) => ({ comp: Number(r.competition_id), attempt: Number(r.attempt_number) }));
    const byComp = new Map<number, number[]>();
    for (const a of attempts) {
      const list = byComp.get(a.comp) ?? [];
      list.push(a.attempt);
      byComp.set(a.comp, list);
    }
    expect(byComp.size).toBe(4);
    for (const list of byComp.values()) expect(list[0]).toBe(1);

    // Generate MATCHES from ONE competition's locked draw → only that group's participants.
    const { matchScheduleService } = await import('../application/match-schedule.service.js');
    const targetCompId = byName['Male U14'];
    const result = await matchScheduleService.generateMatchesFromLockedDraw(tid, CREATOR, { competitionId: targetCompId });
    expect(result.draws).toBe(1);
    const [matchRows] = await exec<RowData>(
      'SELECT competition_id FROM tournament_matches WHERE tournament_id = ? AND competition_id = ?', [tid, targetCompId]);
    expect((matchRows as any[]).length).toBeGreaterThan(0);
    // No matches exist in OTHER competitions yet.
    const others = comps.filter((c) => c.id !== targetCompId);
    for (const c of others) {
      const [othersRows] = await exec<RowData>('SELECT COUNT(*) c FROM tournament_matches WHERE tournament_id = ? AND competition_id = ?', [tid, c.id]);
      expect(Number((othersRows as any[])[0].c)).toBe(0);
    }
  });

  it('5. retries create separate tournaments — competition sets never duplicate inside one tournament', async () => {
    const t1 = await createTournamentWith(createPayload(groupSeeds()));
    const t2 = await createTournamentWith(createPayload(groupSeeds()));
    expect(t2).not.toBe(t1);
    const c1 = await competitionsOf(t1);
    const c2 = await competitionsOf(t2);
    expect(c1.length).toBe(4);
    expect(c2.length).toBe(4);
    const ids1 = new Set(c1.map((c) => c.id));
    const ids2 = new Set(c2.map((c) => c.id));
    // No competition id is shared between the two tournaments; per-tournament keys unique.
    expect([...ids1].every((id) => !ids2.has(id))).toBe(true);
    expect(new Set(c1.map((c) => `${c.name}:${c.gender_categories[0]}:${c.age_category_ids[0]}`)).size).toBe(4);
  });

  it('6. professional (level) competitions: gender × level, open age, no invented tier', async () => {
    const payload = {
      ...createPayload(),
      age_mode: 'open',
      age_category_ids: [],
      level_ids: [LEVEL_2],
      competitions: [
        { competition_type: 'singles', name: 'Male Level 2', age_mode: 'open', age_category_ids: [], gender_categories: ['male'], level_ids: [LEVEL_2] },
        { competition_type: 'singles', name: 'Female Level 2', age_mode: 'open', age_category_ids: [], gender_categories: ['female'], level_ids: [LEVEL_2] },
      ],
    };
    const tid = await createTournamentWith(payload);
    const comps = await competitionsOf(tid);
    expect(comps.length).toBe(2);
    expect(comps.some((c) => c.is_default === 1)).toBe(false);
    const male = comps.find((c) => c.name === 'Male Level 2')!;
    expect(male.gender_categories).toEqual(['male']);
    expect(male.age_mode).toBe('open');
    expect(male.level_ids).toEqual([LEVEL_2]);
    // LV has level 2 → eligible; F14 has no level (main_level_id null) → rejected.
    await register(tid, LV, male.id);
    const [fEmale] = await exec<RowData>('SELECT id FROM tournament_competitions WHERE tournament_id = ? AND name = ?', [tid, 'Female Level 2']);
    await expect(register(tid, F14, Number((fEmale as any[])[0].id))).rejects.toMatchObject({ errorCode: 'MISSING_PLAYER_LEVEL' });
    await expect(register(tid, LV, Number((fEmale as any[])[0].id))).rejects.toMatchObject({ errorCode: 'GENDER_NOT_ELIGIBLE' });
  });

  it('7. Step 2A — seeds WITHOUT competition_type inherit the backend resolved default format; explicit seeds still win', async () => {
    const payload = {
      ...createPayload(),
      // A sport whose DEFAULT format is DOUBLES.
      sport_id: SPORT2,
      match_format_id: fmtDoubles,
      rule_set_id: ruleSetDoubles,
      competitions: [
        { name: 'Inherited Mixed', age_mode: 'categories', age_category_ids: [U14], gender_categories: ['mixed'], level_ids: [] },
        { competition_type: 'singles', name: 'Explicit Singles', age_mode: 'categories', age_category_ids: [U14], gender_categories: ['male'], level_ids: [] },
      ],
    };
    const tid = await createTournamentWith(payload);
    const comps = await competitionsOf(tid);
    expect(comps.length).toBe(2);
    const inherited = comps.find((c) => c.name === 'Inherited Mixed')!;
    const explicit = comps.find((c) => c.name === 'Explicit Singles')!;
    expect(inherited.competition_type).toBe('doubles'); // inherited from the resolved doubles default
    expect(explicit.competition_type).toBe('singles');  // explicit override respected
  });

  it('8. Step 2B — a REQUESTED split with no competitions FAILS with 422 BEFORE any insert (no unsafe default fallback)', async () => {
    const before = await countTournaments();
    await expect(createTournamentWith({
      ...createPayload(),
      generate_competitions: true,
      competitions: [],
    })).rejects.toMatchObject({
      statusCode: 422,
      errorCode: 'TOURNAMENT_COMPETITION_REQUIRED',
    });
    // Nothing was written — a broad default was never silently created.
    expect(await countTournaments()).toBe(before);

    // The flag does NOT disturb a valid, fully-configured split creation.
    const tid = await createTournamentWith({ ...createPayload(groupSeeds()), generate_competitions: true });
    const comps = await competitionsOf(tid);
    expect(comps.length).toBe(4);
    expect(comps.some((c) => c.is_default === 1)).toBe(false);
  });

  it('9. Step 3B — progression is competition-scoped: identical-geometry tournaments reach their OWN finals', async () => {
    // Two same-size competitions (4 players each → round 1 + final) with IDENTICAL
    // bracket coordinates. Before the fix, findBracketSlot(round, position) was
    // unscoped and the female winner would seat into (or be lost against) the
    // male final.
    const payload = {
      ...createPayload(),
      age_mode: 'open',
      age_category_ids: [],
      gender_categories: ['male', 'female'],
      competitions: [
        { competition_type: 'singles', name: 'Male Open', age_mode: 'open', age_category_ids: [], gender_categories: ['male'], level_ids: [] },
        { competition_type: 'singles', name: 'Female Open', age_mode: 'open', age_category_ids: [], gender_categories: ['female'], level_ids: [] },
      ],
    };
    const tid = await createTournamentWith(payload);
    const comps = await competitionsOf(tid);
    const maleComp = comps.find((c) => c.name === 'Male Open')!.id;
    const femaleComp = comps.find((c) => c.name === 'Female Open')!.id;
    for (const u of [M14, M16, LV, M14B]) await register(tid, u, maleComp);
    for (const u of [F14, F16, F14B, F16B]) await register(tid, u, femaleComp);
    // Step 3C — result progression resolves winners through each participant's
    // ACTIVE member roster. Registration ITSELF must have materialized it; this
    // test deliberately performs NO fixture backfill to prove the production path
    // is self-sufficient.
    const [partRows] = await exec<RowData>('SELECT id FROM tournament_participants WHERE tournament_id = ?', [tid]);
    const [memberCounts] = await exec<RowData>(
      "SELECT participant_id, COUNT(*) c FROM tournament_participant_members WHERE tournament_id = ? AND status = 'active' GROUP BY participant_id", [tid]);
    const memberCountByParticipant = new Map<number, number>((memberCounts as any[]).map((r) => [Number(r.participant_id), Number(r.c)]));
    expect((partRows as any[]).length).toBe(8);
    for (const p of (partRows as any[])) {
      expect(memberCountByParticipant.get(Number(p.id))).toBe(1);
    }
    await lockDraw(tid, maleComp, CREATOR);
    await lockDraw(tid, femaleComp, CREATOR);
    const { matchScheduleService } = await import('../application/match-schedule.service.js');
    await matchScheduleService.generateMatchesFromLockedDraw(tid, CREATOR);

    const [maleFinalRows] = await exec<RowData>('SELECT * FROM tournament_matches WHERE tournament_id = ? AND competition_id = ? AND is_final = 1', [tid, maleComp]);
    const [femaleFinalRows] = await exec<RowData>('SELECT * FROM tournament_matches WHERE tournament_id = ? AND competition_id = ? AND is_final = 1', [tid, femaleComp]);
    expect((maleFinalRows as any[]).length).toBe(1);
    expect((femaleFinalRows as any[]).length).toBe(1);
    const maleFinal = (maleFinalRows as any[])[0];
    const femaleFinal = (femaleFinalRows as any[])[0];
    // Identical geometry — same (round, bracket_position).
    expect(Number(maleFinal.round)).toBe(Number(femaleFinal.round));
    expect(Number(maleFinal.bracket_position)).toBe(Number(femaleFinal.bracket_position));

    // Repository scope: identical coordinates resolve to DIFFERENT rows per comp.
    const { tournamentRepository } = await import('../infrastructure/repositories/tournament.repository.js');
    const slotMale = await tournamentRepository.findBracketSlot(tid, maleComp, Number(maleFinal.round), Number(maleFinal.bracket_position));
    const slotFemale = await tournamentRepository.findBracketSlot(tid, femaleComp, Number(maleFinal.round), Number(maleFinal.bracket_position));
    expect(Number(slotMale!.competition_id)).toBe(maleComp);
    expect(Number(slotFemale!.competition_id)).toBe(femaleComp);
    expect(Number(slotMale!.id)).not.toBe(Number(slotFemale!.id));

    // Drive progression through the REAL engine; only the result-participants
    // READ is stubbed (deterministic winner/loser) — every write is real.
    const { matchResultRepository } = await import('../../match-result/infrastructure/match-result.repository.js');
    const { tournamentService } = await import('../application/tournament.service.js');
    const resultPair = (sharedMatchId: number, winUserId: number, loseUserId: number) => [
      { id: 1, resultId: 1, matchId: sharedMatchId, userId: winUserId, teamIndex: 0, side: 'home', outcome: 'win', matchEvidence: 100, evidenceCounted: true, ratingSnapshotPercent: null, ratingBefore: null, ratingAfter: null },
      { id: 2, resultId: 1, matchId: sharedMatchId, userId: loseUserId, teamIndex: 0, side: 'away', outcome: 'loss', matchEvidence: 0, evidenceCounted: true, ratingSnapshotPercent: null, ratingBefore: null, ratingAfter: null },
    ] as any;
    const progressAllRoundOne = async (compId: number, firstResultId: number) => {
      const [rows] = await exec<RowData>(
        'SELECT * FROM tournament_matches WHERE tournament_id = ? AND competition_id = ? AND round = 1 AND participant1_id IS NOT NULL AND participant2_id IS NOT NULL ORDER BY id', [tid, compId]);
      let resultId = firstResultId;
      for (const m of (rows as any[])) {
        expect(Number(m.match_id)).toBeGreaterThan(0);
        const spy = vi.spyOn(matchResultRepository, 'getParticipants')
          .mockResolvedValue(resultPair(Number(m.match_id), Number(m.player1_id), Number(m.player2_id)));
        await tournamentService.progressFromApprovedResult({ matchId: Number(m.match_id), resultId });
        spy.mockRestore();
        resultId += 1;
      }
    };

    // Male competition progresses (BOTH semifinals) into ITS own final.
    await progressAllRoundOne(maleComp, 100);
    const [maleFinalAfter] = await exec<RowData>('SELECT * FROM tournament_matches WHERE id = ?', [Number(slotMale!.id)]);
    const [femaleFinalAfter] = await exec<RowData>('SELECT * FROM tournament_matches WHERE id = ?', [Number(slotFemale!.id)]);
    expect((maleFinalAfter as any[])[0].participant1_id).not.toBeNull();
    expect((maleFinalAfter as any[])[0].participant2_id).not.toBeNull();
    // Female competition was NOT contaminated by male progression.
    expect((femaleFinalAfter as any[])[0].participant1_id).toBeNull();
    expect((femaleFinalAfter as any[])[0].participant2_id).toBeNull();

    // Female competition progresses INDEPENDENTLY to its own final.
    await progressAllRoundOne(femaleComp, 200);
    const [femaleFinalAfter2] = await exec<RowData>('SELECT * FROM tournament_matches WHERE id = ?', [Number(slotFemale!.id)]);
    const [maleFinalAfter2] = await exec<RowData>('SELECT * FROM tournament_matches WHERE id = ?', [Number(slotMale!.id)]);
    expect((femaleFinalAfter2 as any[])[0].participant1_id).not.toBeNull();
    expect((femaleFinalAfter2 as any[])[0].participant2_id).not.toBeNull();
    // Male final was NOT mutated by the female progression.
    expect(Number((maleFinalAfter2 as any[])[0].participant1_id)).toBe(Number((maleFinalAfter as any[])[0].participant1_id));
    expect(Number((maleFinalAfter2 as any[])[0].participant2_id)).toBe(Number((maleFinalAfter as any[])[0].participant2_id));
  });

  it('10. Step 3B — redrawing competition A never touches competition B draw', async () => {
    const payload = {
      ...createPayload(),
      age_mode: 'open',
      age_category_ids: [],
      gender_categories: ['male', 'female'],
      competitions: [
        { competition_type: 'singles', name: 'Male R', age_mode: 'open', age_category_ids: [], gender_categories: ['male'], level_ids: [] },
        { competition_type: 'singles', name: 'Female R', age_mode: 'open', age_category_ids: [], gender_categories: ['female'], level_ids: [] },
      ],
    };
    const tid = await createTournamentWith(payload);
    const comps = await competitionsOf(tid);
    const maleComp = comps.find((c) => c.name === 'Male R')!.id;
    const femaleComp = comps.find((c) => c.name === 'Female R')!.id;
    await register(tid, M14, maleComp);
    await register(tid, M14B, maleComp);
    await register(tid, F14, femaleComp);
    await register(tid, F14B, femaleComp);

    const { participantDrawService } = await import('../application/participant-draw.service.js');
    await participantDrawService.generateDraw(tid, CREATOR, 111, maleComp);
    await participantDrawService.generateDraw(tid, CREATOR, 222, femaleComp);
    const [femaleBefore] = await exec<RowData>(
      'SELECT de.participant_id, de.position FROM tournament_draw_entries de JOIN tournament_draws d ON d.id = de.draw_id WHERE d.tournament_id = ? AND d.competition_id = ? AND d.is_current = 1 ORDER BY de.position', [tid, femaleComp]);

    // Redraw MALE competition (attempt 2) — female draw must remain identical.
    await participantDrawService.generateDraw(tid, CREATOR, 333, maleComp);
    const [maleDraws] = await exec<RowData>('SELECT attempt_number, is_current FROM tournament_draws WHERE tournament_id = ? AND competition_id = ? ORDER BY attempt_number', [tid, maleComp]);
    const [femaleAfter] = await exec<RowData>(
      'SELECT de.participant_id, de.position FROM tournament_draw_entries de JOIN tournament_draws d ON d.id = de.draw_id WHERE d.tournament_id = ? AND d.competition_id = ? AND d.is_current = 1 ORDER BY de.position', [tid, femaleComp]);
    expect((maleDraws as any[]).map((r) => Number(r.attempt_number))).toEqual([1, 2]);
    expect((maleDraws as any[]).find((r) => Number(r.is_current) === 1)!.attempt_number).toBe(2);
    expect((femaleAfter as any[]).map((r) => [Number(r.participant_id), Number(r.position)]))
      .toEqual((femaleBefore as any[]).map((r) => [Number(r.participant_id), Number(r.position)]));
  });

  it('11. Step 3B — an injected draw-entry failure rolls back the ENTIRE attempt', async () => {
    const tid = await createTournamentWith(createPayload([
      { competition_type: 'singles', name: 'Male A', age_mode: 'categories', age_category_ids: [U14], gender_categories: ['male'], level_ids: [] },
    ]));
    const comps = await competitionsOf(tid);
    const compId = comps[0].id;
    await register(tid, M14, compId);
    await register(tid, M14B, compId);
    const { participantDrawService } = await import('../application/participant-draw.service.js');
    const { participantDrawRepository } = await import('../infrastructure/repositories/participant-draw.repository.js');
    await participantDrawService.generateDraw(tid, CREATOR, 555, compId); // attempt 1 (current)

    const spy = vi.spyOn(participantDrawRepository, 'createDrawEntry')
      .mockImplementationOnce(() => { throw new Error('injected entry failure'); });
    await expect(participantDrawService.generateDraw(tid, CREATOR, 999, compId)).rejects.toThrow('injected entry failure');
    spy.mockRestore();

    // Rollback: attempt 1 still current, NO attempt-2 draw, entries untouched.
    const [draws] = await exec<RowData>('SELECT attempt_number, is_current FROM tournament_draws WHERE tournament_id = ? AND competition_id = ? ORDER BY attempt_number', [tid, compId]);
    const [entries] = await exec<RowData>(
      'SELECT COUNT(*) c FROM tournament_draw_entries de JOIN tournament_draws d ON d.id = de.draw_id WHERE d.tournament_id = ? AND d.competition_id = ?', [tid, compId]);
    expect((draws as any[]).map((r) => Number(r.attempt_number))).toEqual([1]);
    expect((draws as any[])[0].is_current).toBe(1);
    expect(Number((entries as any[])[0].c)).toBe(2);
  });

  it('12. Step 3C — individual registration materializes exactly one member row; sync is idempotent (no duplicates)', async () => {
    const tid = await createTournamentWith(createPayload([
      { competition_type: 'singles', name: 'Male Idem', age_mode: 'open', age_category_ids: [], gender_categories: ['male'], level_ids: [] },
    ]));
    const compId = (await competitionsOf(tid))[0].id;
    await register(tid, M14, compId);
    await register(tid, M16, compId);

    // Registration ITSELF created one ACTIVE member row per participant — the
    // authoritative roster progression reads (never the member_user_ids cache).
    const [rows] = await exec<RowData>(
      "SELECT p.id AS participant_id, m.user_id, m.status FROM tournament_participants p JOIN tournament_participant_members m ON m.participant_id = p.id WHERE p.tournament_id = ? ORDER BY p.id", [tid]);
    expect((rows as any[]).length).toBe(2);
    expect(new Set((rows as any[]).map((r) => Number(r.user_id)))).toEqual(new Set([M14, M16]));
    for (const r of (rows as any[])) expect(r.status).toBe('active');

    // Repeated materialization must not duplicate membership.
    const { participantDrawService } = await import('../application/participant-draw.service.js');
    await participantDrawService.syncParticipants(tid);
    await participantDrawService.syncParticipants(tid);
    const [dupes] = await exec<RowData>(
      "SELECT participant_id, user_id, COUNT(*) c FROM tournament_participant_members WHERE tournament_id = ? GROUP BY participant_id, user_id HAVING c > 1", [tid]);
    expect((dupes as any[]).length).toBe(0);
    const [total] = await exec<RowData>(
      "SELECT COUNT(*) c FROM tournament_participant_members WHERE tournament_id = ? AND status = 'active'", [tid]);
    expect(Number((total as any[])[0].c)).toBe(2);
  });

  it('13. Step 3C — a real individual registration progresses through result approval with NO fixture backfill', async () => {
    const tid = await createTournamentWith(createPayload([
      { competition_type: 'singles', name: 'Male Solo', age_mode: 'open', age_category_ids: [], gender_categories: ['male'], level_ids: [] },
    ]));
    const compId = (await competitionsOf(tid))[0].id;
    const players = [M14, M16, LV, M14B];
    for (const u of players) await register(tid, u, compId);

    // The authoritative roster exists because registration created it.
    const [memberRows] = await exec<RowData>(
      "SELECT user_id FROM tournament_participant_members WHERE tournament_id = ? AND status = 'active'", [tid]);
    expect((memberRows as any[]).length).toBe(4);
    expect(new Set((memberRows as any[]).map((r) => Number(r.user_id)))).toEqual(new Set(players));

    await lockDraw(tid, compId, CREATOR);
    const { matchScheduleService } = await import('../application/match-schedule.service.js');
    await matchScheduleService.generateMatchesFromLockedDraw(tid, CREATOR, { competitionId: compId });

    const [finalRows] = await exec<RowData>('SELECT * FROM tournament_matches WHERE tournament_id = ? AND competition_id = ? AND is_final = 1', [tid, compId]);
    expect((finalRows as any[]).length).toBe(1);
    const finalId = Number((finalRows as any[])[0].id);

    const { matchResultRepository } = await import('../../match-result/infrastructure/match-result.repository.js');
    const { tournamentService } = await import('../application/tournament.service.js');
    const [round1] = await exec<RowData>(
      'SELECT * FROM tournament_matches WHERE tournament_id = ? AND competition_id = ? AND round = 1 AND participant1_id IS NOT NULL AND participant2_id IS NOT NULL ORDER BY id', [tid, compId]);
    expect((round1 as any[]).length).toBe(2);

    // Drive the REAL progression engine. Only the result-participants READ is
    // stubbed (deterministic winner/loser); every write — including winner
    // resolution through the member roster — is real.
    const winners: number[] = [];
    let resultId = 500;
    for (const m of (round1 as any[])) {
      winners.push(Number(m.participant1_id));
      const spy = vi.spyOn(matchResultRepository, 'getParticipants').mockResolvedValue([
        { id: 1, resultId, matchId: Number(m.match_id), userId: Number(m.player1_id), teamIndex: 0, side: 'home', outcome: 'win', matchEvidence: 100, evidenceCounted: true, ratingSnapshotPercent: null, ratingBefore: null, ratingAfter: null },
        { id: 2, resultId, matchId: Number(m.match_id), userId: Number(m.player2_id), teamIndex: 0, side: 'away', outcome: 'loss', matchEvidence: 0, evidenceCounted: true, ratingSnapshotPercent: null, ratingBefore: null, ratingAfter: null },
      ] as any);
      await tournamentService.progressFromApprovedResult({ matchId: Number(m.match_id), resultId });
      spy.mockRestore();
      resultId += 1;
    }

    // Both round-1 winners were resolved and seated into the final purely from the
    // registration-created roster.
    const [finalAfter] = await exec<RowData>('SELECT participant1_id, participant2_id FROM tournament_matches WHERE id = ?', [finalId]);
    const seats = [Number((finalAfter as any[])[0].participant1_id), Number((finalAfter as any[])[0].participant2_id)];
    expect(seats.every((s) => Number.isFinite(s) && s > 0)).toBe(true);
    expect(seats[0]).not.toBe(seats[1]);
    expect(seats.slice().sort((a, b) => a - b)).toEqual(winners.slice().sort((a, b) => a - b));
  });

  it('14. Step 3E — a legacy individual participant missing its member row is repaired on approval (competition-scoped, no duplicates)', async () => {
    // Two IDENTICAL-geometry competitions (4 players → round 1 + final each).
    const payload = {
      ...createPayload(),
      age_mode: 'open',
      age_category_ids: [],
      gender_categories: ['male', 'female'],
      competitions: [
        { competition_type: 'singles', name: 'Male Repair', age_mode: 'open', age_category_ids: [], gender_categories: ['male'], level_ids: [] },
        { competition_type: 'singles', name: 'Female Repair', age_mode: 'open', age_category_ids: [], gender_categories: ['female'], level_ids: [] },
      ],
    };
    const tid = await createTournamentWith(payload);
    const comps = await competitionsOf(tid);
    const maleComp = comps.find((c) => c.name === 'Male Repair')!.id;
    const femaleComp = comps.find((c) => c.name === 'Female Repair')!.id;
    for (const u of [M14, M16, LV, M14B]) await register(tid, u, maleComp);
    for (const u of [F14, F16, F14B, F16B]) await register(tid, u, femaleComp);
    await lockDraw(tid, maleComp, CREATOR);
    await lockDraw(tid, femaleComp, CREATOR);
    const { matchScheduleService } = await import('../application/match-schedule.service.js');
    await matchScheduleService.generateMatchesFromLockedDraw(tid, CREATOR);

    // Simulate LEGACY data: only the male participants lost their authoritative
    // member rows (pre-Step-3C materialization). The female sibling keeps hers.
    await exec(
      'DELETE m FROM tournament_participant_members m JOIN tournament_participants p ON p.id = m.participant_id WHERE p.tournament_id = ? AND p.competition_id = ?',
      [tid, maleComp],
    );
    const [maleMembersGone] = await exec<RowData>(
      'SELECT COUNT(*) c FROM tournament_participant_members m JOIN tournament_participants p ON p.id = m.participant_id WHERE p.tournament_id = ? AND p.competition_id = ?', [tid, maleComp]);
    expect(Number((maleMembersGone as any[])[0].c)).toBe(0);
    const [femaleMembersBefore] = await exec<RowData>(
      'SELECT COUNT(*) c FROM tournament_participant_members m JOIN tournament_participants p ON p.id = m.participant_id WHERE p.tournament_id = ? AND p.competition_id = ?', [tid, femaleComp]);
    const femaleMemberCountBefore = Number((femaleMembersBefore as any[])[0].c);
    expect(femaleMemberCountBefore).toBe(4);

    const [maleFinalRows] = await exec<RowData>('SELECT * FROM tournament_matches WHERE tournament_id = ? AND competition_id = ? AND is_final = 1', [tid, maleComp]);
    const [femaleFinalRows] = await exec<RowData>('SELECT * FROM tournament_matches WHERE tournament_id = ? AND competition_id = ? AND is_final = 1', [tid, femaleComp]);
    const maleFinalId = Number((maleFinalRows as any[])[0].id);
    const femaleFinalId = Number((femaleFinalRows as any[])[0].id);

    const { matchResultRepository } = await import('../../match-result/infrastructure/match-result.repository.js');
    const { tournamentService } = await import('../application/tournament.service.js');
    const [maleRound1] = await exec<RowData>(
      'SELECT * FROM tournament_matches WHERE tournament_id = ? AND competition_id = ? AND round = 1 AND participant1_id IS NOT NULL AND participant2_id IS NOT NULL ORDER BY id', [tid, maleComp]);
    expect((maleRound1 as any[]).length).toBe(2);

    const winners: number[] = [];
    let resultId = 700;
    for (const m of (maleRound1 as any[])) {
      winners.push(Number(m.participant1_id));
      const spy = vi.spyOn(matchResultRepository, 'getParticipants').mockResolvedValue([
        { id: 1, resultId, matchId: Number(m.match_id), userId: Number(m.player1_id), teamIndex: 0, side: 'home', outcome: 'win', matchEvidence: 100, evidenceCounted: true, ratingSnapshotPercent: null, ratingBefore: null, ratingAfter: null },
        { id: 2, resultId, matchId: Number(m.match_id), userId: Number(m.player2_id), teamIndex: 0, side: 'away', outcome: 'loss', matchEvidence: 0, evidenceCounted: true, ratingSnapshotPercent: null, ratingBefore: null, ratingAfter: null },
      ] as any);
      await tournamentService.progressFromApprovedResult({ matchId: Number(m.match_id), resultId });
      spy.mockRestore();
      resultId += 1;
    }

    // Progression succeeded — both winners seated into the male final. This is
    // possible ONLY because the missing member rows were repaired before winner
    // resolution (no fixture/backfill was performed).
    const [maleFinalAfter] = await exec<RowData>('SELECT participant1_id, participant2_id FROM tournament_matches WHERE id = ?', [maleFinalId]);
    const seats = [Number((maleFinalAfter as any[])[0].participant1_id), Number((maleFinalAfter as any[])[0].participant2_id)];
    expect(seats.every((s) => Number.isFinite(s) && s > 0)).toBe(true);
    expect(seats[0]).not.toBe(seats[1]);
    expect(seats.slice().sort((a, b) => a - b)).toEqual(winners.slice().sort((a, b) => a - b));

    // Exactly one ACTIVE member row per male participant, and NO duplicates.
    const [maleMembersAfter] = await exec<RowData>(
      'SELECT participant_id, user_id, status, COUNT(*) c FROM tournament_participant_members WHERE tournament_id = ? AND participant_id IN (SELECT id FROM tournament_participants WHERE tournament_id = ? AND competition_id = ?) GROUP BY participant_id, user_id, status',
      [tid, tid, maleComp]);
    expect((maleMembersAfter as any[]).length).toBe(4);
    for (const r of (maleMembersAfter as any[])) {
      expect(r.status).toBe('active');
      expect(Number(r.c)).toBe(1);
    }

    // Isolation: the same-geometry sibling competition is untouched — its member
    // rows are unchanged and its final was never seeded by the male progression.
    const [femaleMembersAfter] = await exec<RowData>(
      'SELECT COUNT(*) c FROM tournament_participant_members m JOIN tournament_participants p ON p.id = m.participant_id WHERE p.tournament_id = ? AND p.competition_id = ?', [tid, femaleComp]);
    expect(Number((femaleMembersAfter as any[])[0].c)).toBe(femaleMemberCountBefore);
    const [femaleFinalAfter] = await exec<RowData>('SELECT participant1_id, participant2_id FROM tournament_matches WHERE id = ?', [femaleFinalId]);
    expect((femaleFinalAfter as any[])[0].participant1_id).toBeNull();
    expect((femaleFinalAfter as any[])[0].participant2_id).toBeNull();
  });
});