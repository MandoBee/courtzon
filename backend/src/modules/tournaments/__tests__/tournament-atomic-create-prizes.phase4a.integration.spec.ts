import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = 'courtzon2026';
  process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6379';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

const ORG = 2840001;
const CREATOR = 2840009;
const SPORT = 2840101;

const M14 = 2840011;
const M14B = 2840012;
const F14 = 2840013;
const F14B = 2840014;
const M16 = 2840015;
const F16 = 2840016;

const ALL = [M14, M14B, F14, F14B, M16, F16, CREATOR];

const U14 = 1;
const U16 = 2;

let pool: mysql.Pool;
let fmt = 0;
let ruleSet = 0;
const tournamentIds: number[] = [];

const exec = (sql: string, params: any[] = []) => pool.execute(sql, params);

async function mkUser(id: number, gender: 'male' | 'female', birthYear: number) {
  await exec(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status, birth_date)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'P4A U', ?, 'active', ?)`,
    [id, `020${String(id).slice(-7)}`, `+20${String(id).slice(-7)}`, `p4a-${id}@t.com`, gender, `${birthYear}-05-05`],
  );
}

async function seedBase() {
  const [ot] = await exec<RowData>('SELECT id FROM organisation_types LIMIT 1');
  await exec(
    `INSERT IGNORE INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG}, UUID(), ?, 1, 'P4A Org', 'p4a-org', 1)`,
    [(ot as any[])[0].id],
  );
  await exec(
    `INSERT IGNORE INTO sports (id, name, slug, is_active, show_in_marketplace, sort_order) VALUES (${SPORT}, 'P4A Sport', 'p4a-sport', 1, 1, 0)`,
  );
  const [s] = await exec<RowData>(
    `INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, is_default, is_active) VALUES (?, 'p4a-singles', 'Singles', 'singles', 1, 1, 1)`,
    [SPORT],
  );
  fmt = Number((s as any).insertId);
  const [rs] = await exec<RowData>(
    `INSERT INTO sport_rule_sets (format_id, version, name, rules) VALUES (?, 1, 'P4A Rules', ?)`,
    [fmt, JSON.stringify({ scoring: 'sets', best_of: 3 })],
  );
  ruleSet = Number((rs as any).insertId);

  await mkUser(M14, 'male', 2012);
  await mkUser(M14B, 'male', 2012);
  await mkUser(F14, 'female', 2012);
  await mkUser(F14B, 'female', 2012);
  await mkUser(M16, 'male', 2010);
  await mkUser(F16, 'female', 2010);
  await mkUser(CREATOR, 'male', 1990);
}

function createPayload(competitions?: Array<Record<string, unknown>>, prizes?: Array<Record<string, unknown>>, sponsors?: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    organisation_id: ORG,
    bracket_type_id: 1,
    format: 'knockout',
    sport_id: SPORT,
    match_format_id: fmt,
    rule_set_id: ruleSet,
    name: 'P4A Atomic Cup',
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
    ...(prizes ? { prizes } : {}),
    ...(sponsors ? { sponsors } : {}),
    ...extra,
  };
}

function groupSeeds(): Array<Record<string, unknown>> {
  return [
    { key: 'male-u14', competition_type: 'singles', name: 'Male U14', age_mode: 'categories', age_category_ids: [U14], gender_categories: ['male'], level_ids: [] },
    { key: 'female-u14', competition_type: 'singles', name: 'Female U14', age_mode: 'categories', age_category_ids: [U14], gender_categories: ['female'], level_ids: [] },
  ];
}

async function createTournamentWith(payload: Record<string, unknown>): Promise<number> {
  const { tournamentService } = await import('../application/tournament.service.js');
  const t = await tournamentService.create(payload as any, CREATOR);
  const tid = Number(t.id);
  tournamentIds.push(tid);
  await exec(`UPDATE tournaments SET status = 'registration_open' WHERE id = ?`, [tid]);
  return tid;
}

async function countTournaments(): Promise<number> {
  const [rows] = await exec<RowData>('SELECT COUNT(*) c FROM tournaments WHERE creator_id = ?', [CREATOR]);
  return Number((rows as any[])[0].c);
}

async function countPrizesAll(): Promise<number> {
  const idList = tournamentIds.length ? tournamentIds.join(',') : '0';
  const [rows] = await exec<RowData>(`SELECT COUNT(*) c FROM tournament_prizes WHERE tournament_id IN (${idList})`);
  return Number((rows as any[])[0].c);
}

async function countSponsorsAll(): Promise<number> {
  const idList = tournamentIds.length ? tournamentIds.join(',') : '0';
  const [rows] = await exec<RowData>(`SELECT COUNT(*) c FROM tournament_sponsors WHERE tournament_id IN (${idList})`);
  return Number((rows as any[])[0].c);
}

async function competitionsOf(tid: number): Promise<Array<Record<string, any>>> {
  const [rows] = await exec<RowData>('SELECT id, name, competition_type, age_mode, age_category_ids, gender_categories, level_ids, is_default FROM tournament_competitions WHERE tournament_id = ? ORDER BY id', [tid]);
  const unjson = (v: any): any[] => (typeof v === 'string' ? JSON.parse(v) : (v ?? []));
  return (rows as any[]).map((r) => ({ id: Number(r.id), name: String(r.name), competition_type: String(r.competition_type), age_mode: r.age_mode != null ? String(r.age_mode) : null, age_category_ids: unjson(r.age_category_ids), gender_categories: unjson(r.gender_categories), level_ids: unjson(r.level_ids), is_default: Number(r.is_default) }));
}

async function prizesOf(tid: number): Promise<Array<Record<string, any>>> {
  const [rows] = await exec<RowData>('SELECT id, competition_id, placement, prize_type, description, amount, currency_code, display_order FROM tournament_prizes WHERE tournament_id = ? ORDER BY display_order ASC, id ASC', [tid]);
  return (rows as any[]).map((r) => ({ id: Number(r.id), competition_id: r.competition_id != null ? Number(r.competition_id) : null, placement: r.placement != null ? Number(r.placement) : null, prize_type: String(r.prize_type), description: r.description, amount: r.amount != null ? Number(r.amount) : null, currency_code: r.currency_code, display_order: Number(r.display_order) }));
}

async function sponsorsOf(tid: number): Promise<Array<Record<string, any>>> {
  const [rows] = await exec<RowData>('SELECT id, name, support_type, amount, description, display_order FROM tournament_sponsors WHERE tournament_id = ? ORDER BY display_order ASC, id ASC', [tid]);
  return (rows as any[]).map((r) => ({ id: Number(r.id), name: String(r.name), support_type: String(r.support_type), amount: r.amount != null ? Number(r.amount) : null, description: r.description, display_order: Number(r.display_order) }));
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 6 });
  const { createPool, closePool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  await exec('SET FOREIGN_KEY_CHECKS = 0');
  await exec(`DELETE FROM tournament_prizes WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await exec(`DELETE FROM tournament_sponsors WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await exec(`DELETE FROM tournament_participant_members WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await exec(`DELETE FROM tournament_participants WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await exec(`DELETE FROM tournament_registrations WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await exec(`DELETE FROM tournament_draw_entries WHERE draw_id IN (SELECT id FROM tournament_draws WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR}))`);
  await exec(`DELETE FROM tournament_draws WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await exec(`DELETE FROM tournament_matches WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await exec(`DELETE FROM tournament_stages WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await exec(`DELETE FROM tournament_competitions WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await exec(`DELETE FROM tournaments WHERE creator_id = ${CREATOR}`);
  await exec('SET FOREIGN_KEY_CHECKS = 1');
  await seedBase();
}, 60000);

afterAll(async () => {
  if (!pool) return;
  const idList = tournamentIds.length ? tournamentIds.join(',') : '0';
  await exec('SET FOREIGN_KEY_CHECKS = 0');
  await exec(`DELETE FROM tournament_prizes WHERE tournament_id IN (${idList})`);
  await exec(`DELETE FROM tournament_sponsors WHERE tournament_id IN (${idList})`);
  await exec(`DELETE FROM tournament_participant_members WHERE tournament_id IN (${idList})`);
  await exec(`DELETE FROM tournament_participants WHERE tournament_id IN (${idList})`);
  await exec(`DELETE FROM tournament_registrations WHERE tournament_id IN (${idList})`);
  await exec(`DELETE FROM tournament_draw_entries WHERE draw_id IN (SELECT id FROM tournament_draws WHERE tournament_id IN (${idList}))`);
  await exec(`DELETE FROM tournament_draws WHERE tournament_id IN (${idList})`);
  await exec(`DELETE FROM tournament_matches WHERE tournament_id IN (${idList})`);
  await exec(`DELETE FROM tournament_stages WHERE tournament_id IN (${idList})`);
  await exec(`DELETE FROM tournament_competitions WHERE tournament_id IN (${idList})`);
  await exec(`DELETE FROM tournaments WHERE id IN (${idList})`);
  await exec(`DELETE FROM sport_rule_sets WHERE id IN (${ruleSet})`);
  await exec(`DELETE FROM sport_formats WHERE id IN (${fmt})`);
  await exec(`DELETE FROM sports WHERE id IN (${SPORT})`);
  await exec(`DELETE FROM player_profiles WHERE user_id IN (${ALL.join(',')})`);
  await exec(`DELETE FROM users WHERE id IN (${ALL.join(',')})`);
  await exec(`DELETE FROM organisations WHERE id = ${ORG}`);
  await exec('SET FOREIGN_KEY_CHECKS = 1');
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
  tournamentIds.length = 0;
}, 60000);

beforeEach(() => { vi.clearAllMocks(); });

describe('Phase 4 Step 4A — atomic tournament create + competition-scoped prizes', () => {
  it('1. split create with prizes for 2 competitions — prizes land in correct competition_id', async () => {
    const prizes = [
      { placement: 1, prize_type: 'cash' as const, amount: 1000, competition_key: 'male-u14' },
      { placement: 1, prize_type: 'cash' as const, amount: 800, competition_key: 'female-u14' },
      { placement: 2, prize_type: 'other' as const, description: 'Medal', competition_key: 'male-u14' },
    ];
    const tid = await createTournamentWith(createPayload(groupSeeds(), prizes, undefined, { name: 'P4A Atomic Cup 1' }));
    const comps = await competitionsOf(tid);
    expect(comps.length).toBe(2);
    const byName = Object.fromEntries(comps.map((c) => [c.name, c.id]));
    const p = await prizesOf(tid);
    expect(p.length).toBe(3);
    const p1 = p.find((x) => x.amount === 1000);
    const p2 = p.find((x) => x.amount === 800);
    const p3 = p.find((x) => x.prize_type === 'other');
    expect(p1?.competition_id).toBe(byName['Male U14']);
    expect(p2?.competition_id).toBe(byName['Female U14']);
    expect(p3?.competition_id).toBe(byName['Male U14']);
  });

  it('2. target validation w/ no silent fallback — unknown key rejects before insert', async () => {
    const before = await countTournaments();
    const prizes = [{ placement: 1, prize_type: 'cash' as const, amount: 1000, competition_key: 'nope' }];
    await expect(createTournamentWith(createPayload(groupSeeds(), prizes, undefined, { name: 'P4A Atomic Cup 2' }))).rejects.toMatchObject({ statusCode: 422, errorCode: 'TOURNAMENT_COMPETITION_NOT_FOUND' });
    expect(await countTournaments()).toBe(before);
  });

  it('2b. multiple competitions, prize omits target → TOURNAMENT_COMPETITION_REQUIRED before insert', async () => {
    const before = await countTournaments();
    const prizes = [{ placement: 1, prize_type: 'cash' as const, amount: 1000 }];
    await expect(createTournamentWith(createPayload(groupSeeds(), prizes, undefined, { name: 'P4A Atomic Cup 2b' }))).rejects.toMatchObject({ statusCode: 422, errorCode: 'TOURNAMENT_COMPETITION_REQUIRED' });
    expect(await countTournaments()).toBe(before);
  });

  it('3. per-competition cash uniqueness — different comps allowed; same comp placement blocked', async () => {
    const before = await countTournaments();
    const prizesDupSameKey = [{ placement: 1, prize_type: 'cash' as const, amount: 1000, competition_key: 'male-u14' }, { placement: 1, prize_type: 'cash' as const, amount: 1100, competition_key: 'male-u14' }];
    await expect(createTournamentWith(createPayload(groupSeeds(), prizesDupSameKey, undefined, { name: 'P4A Atomic Cup 3a' }))).rejects.toMatchObject({ statusCode: 409, code: 'TOURNAMENT_INVALID_PRIZE' });
    expect(await countTournaments()).toBe(before);

    const prizesDifferentKeys = [{ placement: 1, prize_type: 'cash' as const, amount: 1000, competition_key: 'male-u14' }, { placement: 1, prize_type: 'cash' as const, amount: 1100, competition_key: 'female-u14' }];
    const tid = await createTournamentWith(createPayload(groupSeeds(), prizesDifferentKeys, undefined, { name: 'P4A Atomic Cup 3b' }));
    const comps = await competitionsOf(tid);
    const byName = Object.fromEntries(comps.map((c) => [c.name, c.id]));
    const p = await prizesOf(tid);
    expect(p.length).toBe(2);
    const m1 = p.find((x) => x.amount === 1000);
    const f1 = p.find((x) => x.amount === 1100);
    expect(m1?.competition_id).toBe(byName['Male U14']);
    expect(f1?.competition_id).toBe(byName['Female U14']);
  });

  it('4. legacy single-default compatibility — no competitions, prize without target lands on default', async () => {
    const prizes = [{ placement: 1, prize_type: 'cash' as const, amount: 500, description: '1st' }, { placement: 2, prize_type: 'other' as const, description: '2nd' }];
    const tid = await createTournamentWith(createPayload(undefined, prizes, undefined, { name: 'P4A Atomic Cup 4' }));
    const comps = await competitionsOf(tid);
    expect(comps.length).toBe(1);
    expect(comps[0].is_default).toBe(1);
    const p = await prizesOf(tid);
    expect(p.length).toBe(2);
    expect(p[0].competition_id).toBe(comps[0].id);
    expect(p[1].competition_id).toBe(comps[0].id);
  });

  it('5. injected prize/sponsor/description failure leaves zero rows', async () => {
    const beforeT = await countTournaments();
    const beforeP = await countPrizesAll();
    const beforeS = await countSponsorsAll();
    const { tournamentRepository } = await import('../infrastructure/repositories/tournament.repository.js');

    const prizes = [{ placement: 1, prize_type: 'cash' as const, amount: 1000, competition_key: 'male-u14' }];
    const spy1 = vi.spyOn(tournamentRepository, 'replacePrizes').mockImplementationOnce(() => { throw new Error('injected prize failure'); });
    await expect(createTournamentWith(createPayload(groupSeeds(), prizes, undefined, { name: 'P4A Atomic Cup 5a' }))).rejects.toThrow('injected prize failure');
    spy1.mockRestore();
    expect(await countTournaments()).toBe(beforeT);
    expect(await countPrizesAll()).toBe(beforeP);
    expect(await countSponsorsAll()).toBe(beforeS);

    const sponsorsLong = [{ name: 'X'.repeat(201), support_type: 'inkind' as const, description: 'Test' }];
    await expect(createTournamentWith(createPayload(groupSeeds(), undefined, sponsorsLong, { name: 'P4A Atomic Cup 5b' }))).rejects.toMatchObject({ message: expect.stringContaining('Data too long') });
    expect(await countTournaments()).toBe(beforeT);
    expect(await countPrizesAll()).toBe(beforeP);
    expect(await countSponsorsAll()).toBe(beforeS);

    const spy2 = vi.spyOn(tournamentRepository, 'update').mockImplementationOnce(() => { throw new Error('injected desc failure'); });
    await expect(createTournamentWith(createPayload(groupSeeds(), undefined, undefined, { name: 'P4A Atomic Cup 5c' }))).rejects.toThrow('injected desc failure');
    spy2.mockRestore();
    expect(await countTournaments()).toBe(beforeT);
    expect(await countPrizesAll()).toBe(beforeP);
    expect(await countSponsorsAll()).toBe(beforeS);
  });

  it('6. retry creates no duplicates', async () => {
    const beforeT = await countTournaments();
    const { tournamentRepository } = await import('../infrastructure/repositories/tournament.repository.js');
    const prizes = [{ placement: 1, prize_type: 'cash' as const, amount: 1000, competition_key: 'male-u14' }];
    const spy = vi.spyOn(tournamentRepository, 'replacePrizes').mockImplementationOnce(() => { throw new Error('fail once'); });
    await expect(createTournamentWith(createPayload(groupSeeds(), prizes, undefined, { name: 'P4A Atomic Cup 6a' }))).rejects.toThrow('fail once');
    spy.mockRestore();
    expect(await countTournaments()).toBe(beforeT);

    const tid1 = await createTournamentWith(createPayload(groupSeeds(), prizes, undefined, { name: 'P4A Atomic Cup 6a' }));
    const tid2 = await createTournamentWith(createPayload(groupSeeds(), prizes, undefined, { name: 'P4A Atomic Cup 6b' }));
    expect(tid2).not.toBe(tid1);
    const p1 = await prizesOf(tid1);
    const p2 = await prizesOf(tid2);
    expect(p1.length).toBe(1);
    expect(p2.length).toBe(1);
    const comps1 = await competitionsOf(tid1);
    const comps2 = await competitionsOf(tid2);
    expect(comps1.length).toBe(2);
    expect(comps2.length).toBe(2);
  });

  it('7. generate_competitions=true + empty competitions → 422 before any insert', async () => {
    const beforeT = await countTournaments();
    const beforeP = await countPrizesAll();
    await expect(createTournamentWith(createPayload([], [], undefined, { name: 'P4A Atomic Cup 7', generate_competitions: true }))).rejects.toMatchObject({ statusCode: 422, errorCode: 'TOURNAMENT_COMPETITION_REQUIRED' });
    expect(await countTournaments()).toBe(beforeT);
    expect(await countPrizesAll()).toBe(beforeP);
  });
});
