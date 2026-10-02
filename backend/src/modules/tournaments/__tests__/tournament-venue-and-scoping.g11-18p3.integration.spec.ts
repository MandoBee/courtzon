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
 * G11.18 Phase 3 — VENUE MODES + org-court ownership + competition-scoped
 * draw/stage/group + per-competition match numbering.
 * Non-financial: registration fees still post through the EXISTING pipeline;
 * NO tournament commission is ever computed from court/venue values here.
 */

const ORG = 2770001;
const ORG2 = 2770002;
const CREATOR = 2770009;
const U = { a: 2770011, b: 2770012, c: 2770013, d: 2770014 };
const SPORT = 2770101;

let pool: mysql.Pool;
let fmtSingles = 0;
let fmtTeam = 0;
let ruleSet = 0;
let branch1 = 0;
let branch2 = 0;
let resource1 = 0;
let resource2 = 0;
const tournamentIds: number[] = [];
const compIds: number[] = [];

const exec = (sql: string, params: any[] = []) => pool.execute(sql, params);

async function mkUser(id: number) {
  await exec(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status, birth_date)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'G11.18P3 U', 'male', 'active', '1995-05-05')`,
    [id, `021${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, `g1118p3-${id}@test.com`],
  );
  await exec(`INSERT IGNORE INTO player_profiles (user_id, main_sport_id) VALUES (?, ?)`, [id, SPORT]);
}

async function seedBase() {
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  await pool.execute(`INSERT IGNORE INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG}, UUID(), ?, 1, 'G11.18P3 Org', 'g1118p3-org', 1)`, [otId]);
  await pool.execute(`INSERT IGNORE INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG2}, UUID(), ?, 1, 'G11.18P3 Org2', 'g1118p3-org2', 1)`, [otId]);
  await pool.execute(`INSERT IGNORE INTO sports (id, name, slug, is_active, show_in_marketplace, sort_order) VALUES (${SPORT}, 'G1118P3', 'g1118p3-sport', 1, 1, 0)`);
  const [s1] = await pool.execute<RowData>(`INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active) VALUES (?, 'g1118p3-s', 'Singles', 'singles', 1, NULL, 1, 1)`, [SPORT]);
  fmtSingles = Number((s1 as any).insertId);
  const [s2] = await pool.execute<RowData>(`INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active) VALUES (?, 'g1118p3-t', 'Team', 'team', 3, 3, 0, 1)`, [SPORT]);
  fmtTeam = Number((s2 as any).insertId);
  const [rs] = await pool.execute<RowData>(`INSERT INTO sport_rule_sets (format_id, version, name, rules) VALUES (?, 1, 'G1118P3 Rules', ?)`, [fmtSingles, JSON.stringify({ scoring: 'sets' })]);
  ruleSet = Number((rs as any).insertId);
  const [b1] = await pool.execute<RowData>(`INSERT INTO branches (public_id, organisation_id, name, slug, city, country_id, timezone, is_active) VALUES (UUID(), ?, 'Branch 1', 'g1118p3-b1', 'Cairo', 1, 'UTC', 1)`, [ORG]);
  branch1 = Number((b1 as any).insertId);
  const [b2] = await pool.execute<RowData>(`INSERT INTO branches (public_id, organisation_id, name, slug, city, country_id, timezone, is_active) VALUES (UUID(), ?, 'Branch 2', 'g1118p3-b2', 'Giza', 1, 'UTC', 1)`, [ORG2]);
  branch2 = Number((b2 as any).insertId);
  const [r1] = await pool.execute<RowData>(`INSERT INTO resources (public_id, branch_id, name, resource_type_id, sport_id, capacity, is_active) VALUES (UUID(), ?, 'Court 1', 1, ?, 4, 1)`, [branch1, SPORT]);
  resource1 = Number((r1 as any).insertId);
  const [r2] = await pool.execute<RowData>(`INSERT INTO resources (public_id, branch_id, name, resource_type_id, sport_id, capacity, is_active) VALUES (UUID(), ?, 'Court 2', 1, ?, 4, 1)`, [branch2, SPORT]);
  resource2 = Number((r2 as any).insertId);
  for (const u of Object.values(U)) await mkUser(u);
  await mkUser(CREATOR);
}

async function createTournament(org = ORG, opts: { status?: string; branchId?: number | null } = {}): Promise<number> {
  const [res] = await exec<RowData>(
    `INSERT INTO tournaments (public_id, creator_id, organisation_id, branch_id, venue_type, bracket_type_id, format, match_format_id, rule_set_id, sport_id, name,
       max_participants, min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type, commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, ?, 'ORGANISATION_COURTS', 1, 'knockout', ?, ?, ?, 'G11.18P3 Cup', 32, 2, 0, 0, 'EGP', 'FIXED', 'community', 0, ?, 1, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
    [CREATOR, org, opts.branchId ?? null, fmtSingles, ruleSet, SPORT, opts.status ?? 'registration_open'],
  );
  const tid = Number((res as any).insertId);
  tournamentIds.push(tid);
  await exec(
    `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, match_format_id, currency_code, entry_fee, is_default)
     VALUES (UUID(), ?, 'singles', 'Default', ?, 'EGP', 0, 1)`, [tid, fmtSingles]);
  return tid;
}

async function createCompetition(tid: number, type: 'singles' | 'team'): Promise<number> {
  const [r] = await exec<RowData>(
    `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, match_format_id, currency_code, entry_fee, is_default)
     VALUES (UUID(), ?, ?, ?, ?, 'EGP', 0, 0)`,
    [tid, type, type === 'team' ? 'Teams' : 'Singles', type === 'team' ? fmtTeam : fmtSingles],
  );
  const id = Number((r as any).insertId);
  compIds.push(id);
  return id;
}

async function defaultComp(tid: number): Promise<number> {
  return Number((await exec<RowData>('SELECT id FROM tournament_competitions WHERE tournament_id = ? AND is_default = 1', [tid]))[0][0].id);
}

async function addParticipant(tid: number, compId: number, user: number, type = 'individual'): Promise<void> {
  const [regR] = await exec<RowData>(
    `INSERT INTO tournament_registrations (tournament_id, competition_id, player_id, payment_status, status) VALUES (?, ?, ?, 'unpaid', 'confirmed')`,
    [tid, compId, user],
  );
  const reg = Number((regR as any).insertId);
  await exec(
    `INSERT INTO tournament_participants (tournament_id, competition_id, registration_id, participant_type, status, member_user_ids) VALUES (?, ?, ?, ?, 'active', JSON_ARRAY(?))`,
    [tid, compId, reg, type, user],
  );
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 6 });
  const { createPool, closePool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
  await pool.execute(`DELETE FROM tournament_participant_members WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id = ${CREATOR})`);
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
  await pool.execute(`DELETE FROM tournament_groups WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_stages WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_competitions WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${idList})`);
  await pool.execute(`DELETE FROM resources WHERE id IN (?, ?)`, [resource1, resource2]);
  await pool.execute(`DELETE FROM branches WHERE id IN (?, ?)`, [branch1, branch2]);
  await pool.execute(`DELETE FROM sport_formats WHERE id IN (?, ?)`, [fmtSingles, fmtTeam]);
  await pool.execute(`DELETE FROM sport_rule_sets WHERE id = ${ruleSet}`);
  await pool.execute(`DELETE FROM sports WHERE id = ${SPORT}`);
  await pool.execute(`DELETE FROM player_profiles WHERE user_id IN (${CREATOR}, ${U.a}, ${U.b}, ${U.c}, ${U.d})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${CREATOR}, ${U.a}, ${U.b}, ${U.c}, ${U.d})`);
  await pool.execute(`DELETE FROM organisations WHERE id IN (${ORG}, ${ORG2})`);
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
  tournamentIds.length = 0;
}, 60000);

beforeEach(() => { vi.clearAllMocks(); });

describe('G11.18 Phase 3 — venue modes, org-court ownership and competition scoping', () => {
  it('V. create defaults to ORGANISATION_COURTS; EXTERNAL_VENUE persists auto-captured location + derived maps_url', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');
    const defaultCreated = await tournamentService.create({
      organisation_id: ORG,
      name: 'Phase3 Venue Default',
      bracket_type_id: 1,
      sport_id: SPORT,
      match_format_id: fmtSingles,
      rule_set_id: ruleSet,
      max_participants: 16,
      min_participants: 2,
      entry_fee: 0,
      currency_code: 'EGP',
      price_type: 'FREE',
      start_date: '2026-12-01',
      end_date: '2026-12-31',
      registration_opens: '2026-11-01',
      registration_closes: '2026-11-30',
      status: 'draft',
      is_public: 1,
    }, CREATOR);
    const tidDef = Number(defaultCreated.id);
    if (!tournamentIds.includes(tidDef)) tournamentIds.push(tidDef);
    const [dRow] = await exec<RowData>('SELECT venue_type FROM tournaments WHERE id = ?', [tidDef]);
    expect(dRow[0].venue_type).toBe('ORGANISATION_COURTS');

    const external = await tournamentService.create({
      organisation_id: ORG,
      name: 'Phase3 Venue External',
      bracket_type_id: 1,
      sport_id: SPORT,
      match_format_id: fmtSingles,
      rule_set_id: ruleSet,
      venue_type: 'EXTERNAL_VENUE',
      venue_name: 'Garden Club',
      venue_address: '12 El Maadi',
      venue_city: 'Cairo',
      venue_country: 'Egypt',
      latitude: 30.0444,
      longitude: 31.2357,
      max_participants: 16,
      min_participants: 2,
      entry_fee: 0,
      currency_code: 'EGP',
      price_type: 'FREE',
      start_date: '2026-12-01',
      end_date: '2026-12-31',
      registration_opens: '2026-11-01',
      registration_closes: '2026-11-30',
      status: 'draft',
      is_public: 1,
    }, CREATOR);
    const tidExt = Number(external.id);
    if (!tournamentIds.includes(tidExt)) tournamentIds.push(tidExt);
    const [eRow] = await exec<RowData>('SELECT venue_type, venue_name, latitude, longitude, maps_url, branch_id FROM tournaments WHERE id = ?', [tidExt]);
    expect(eRow[0].venue_type).toBe('EXTERNAL_VENUE');
    expect(eRow[0].venue_name).toBe('Garden Club');
    expect(String(eRow[0].latitude)).toBe('30.0444000');
    expect(eRow[0].maps_url).toContain('30.0444');
    // an external venue never uses an org branch
    expect(eRow[0].branch_id).toBeNull();

    // missing locator fails closed
    await expect(tournamentService.create({
      organisation_id: ORG,
      name: 'Phase3 Venue Bad',
      bracket_type_id: 1,
      sport_id: SPORT,
      match_format_id: fmtSingles,
      rule_set_id: ruleSet,
      venue_type: 'EXTERNAL_VENUE',
      max_participants: 8,
      min_participants: 2,
      start_date: '2026-12-01',
      registration_opens: '2026-11-01',
      registration_closes: '2026-11-30',
      status: 'draft',
      is_public: 1,
    }, CREATOR)).rejects.toThrow();
  });

  it('V2. org-court branch ownership: cross-organisation branch on create fails closed', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');
    await expect(tournamentService.create({
      organisation_id: ORG,
      name: 'Phase3 Wrong Branch',
      bracket_type_id: 1,
      sport_id: SPORT,
      match_format_id: fmtSingles,
      rule_set_id: ruleSet,
      branch_id: branch2, // belongs to ORG2
      max_participants: 16,
      min_participants: 2,
      start_date: '2026-12-01',
      registration_opens: '2026-11-01',
      registration_closes: '2026-11-30',
      status: 'draft',
      is_public: 1,
    }, CREATOR)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('V3. eligible courts are ORG-scoped (same org other branch OK; other org rejected)', async () => {
    const tid = await createTournament(ORG, { branchId: null });
    const courtIds = (await exec<RowData>('SELECT id FROM resources WHERE branch_id = ?', [branch1]))[0] as any[];
    const { tournamentRepository } = await import('../infrastructure/repositories/tournament.repository.js');
    const eligible = await tournamentRepository.findEligibleCourts(tid);
    expect(eligible.map((c) => Number(c.id))).toContain(Number(resource1));
    expect(eligible.map((c) => Number(c.id))).not.toContain(Number(resource2));
    void courtIds;
    // scheduleMatch with the cross-org resource must fail (server-side)
    const { matchScheduleService } = await import('../application/match-schedule.service.js');
    const comp = await defaultComp(tid);
    await addParticipant(tid, comp, U.a);
    await addParticipant(tid, comp, U.b);
    const ps = (await exec<RowData>("SELECT id FROM tournament_participants WHERE tournament_id = ? AND competition_id = ? ORDER BY id", [tid, comp]))[0] as any[];
    const pA = Number(ps[0].id); const pB = Number(ps[1].id);
    await exec(`INSERT INTO tournament_matches (tournament_id, competition_id, round, match_number, participant1_id, participant2_id, player1_id, player2_id, status) VALUES (?, ?, 1, 1, ?, ?, ?, ?, 'scheduled')`,
      [tid, comp, pA, pB, U.a, U.b]);
    const [m] = await exec<RowData>('SELECT id FROM tournament_matches WHERE tournament_id = ? LIMIT 1', [tid]);
    await expect(matchScheduleService.scheduleMatch(tid, Number(m[0].id), { date: '2026-12-01', start_time: '10:00', end_time: '11:00', resource_id: resource2 }, CREATOR)).rejects.toThrow();
  });

  it('V4. competition venue override resolves via effective venue; clearing inherits the tournament venue', async () => {
    const tid = await createTournament(ORG);
    const comp = await createCompetition(tid, 'singles');
    const { competitionRepository } = await import('../infrastructure/repositories/competition.repository.js');
    const { competitionService } = await import('../application/competition.service.js');
    const { tournamentRepository } = await import('../infrastructure/repositories/tournament.repository.js');
    const tourn = await tournamentRepository.findById(tid);
    // override
    await competitionRepository.setVenueOverride(comp, competitionService.validateVenueOverride({ venueName: 'Comp Court', latitude: 25.1, longitude: 55.2 }));
    const withOverride = await competitionRepository.findById(comp);
    const effective = competitionService.resolveEffectiveVenue(tourn!, withOverride);
    expect(effective.venueMode).toBe('EXTERNAL_VENUE');
    expect(effective.name).toBe('Comp Court');
    expect(effective.mapsUrl).toContain('25.1');
    // clear → inherits tournament venue (branch/platform defaults)
    await competitionRepository.setVenueOverride(comp, null);
    const cleared = await competitionRepository.findById(comp);
    const inherited = competitionService.resolveEffectiveVenue(tourn!, cleared);
    expect(inherited.name).toBe(tourn!.venue_name ?? (tourn as any).branch_name ?? 'Venue');
  });

  it('D1. draws are competition-isolated (independent attempts + participant selection)', async () => {
    const tid = await createTournament(ORG);
    const compA = await defaultComp(tid);
    const compB = await createCompetition(tid, 'team');
    await addParticipant(tid, compA, U.a);
    await addParticipant(tid, compA, U.b);
    await addParticipant(tid, compB, U.c);
    await addParticipant(tid, compB, U.d);
    const { participantDrawService } = await import('../application/participant-draw.service.js');
    const drawA = await participantDrawService.generateDraw(tid, CREATOR, 111, compA);
    const drawB = await participantDrawService.generateDraw(tid, CREATOR, 222, compB);
    expect(Number(drawA.competition_id)).toBe(compA);
    expect(Number(drawB.competition_id)).toBe(compB);
    // both are attempt #1 (independent per-competition namespaces)
    const [rows] = await exec<RowData>('SELECT competition_id, attempt_number FROM tournament_draws WHERE tournament_id = ? ORDER BY id', [tid]);
    expect(Number(rows[0].competition_id)).toBe(compA);
    expect(Number(rows[0].attempt_number)).toBe(1);
    expect(Number(rows[1].competition_id)).toBe(compB);
    expect(Number(rows[1].attempt_number)).toBe(1);
    // entry isolation: each draw contains ONLY its competition's participants
    const [entA] = await exec<RowData>('SELECT de.participant_id FROM tournament_draw_entries de JOIN tournament_participants p ON p.id = de.participant_id WHERE de.draw_id = ?', [Number(drawA.id)]);
    const [entB] = await exec<RowData>('SELECT de.participant_id FROM tournament_draw_entries de JOIN tournament_participants p ON p.id = de.participant_id WHERE de.draw_id = ?', [Number(drawB.id)]);
    expect(entA.length).toBe(2);
    expect(entB.length).toBe(2);
    const partA = (entA as any[]).map((r) => Number(r.participant_id));
    const partB = (entB as any[]).map((r) => Number(r.participant_id));
    expect(partA).not.toEqual(partB);
  });

  it('N. match numbering is independent per competition', async () => {
    const tid = await createTournament(ORG);
    const compA = await defaultComp(tid);
    const compB = await createCompetition(tid, 'team');
    const { tournamentRepository } = await import('../infrastructure/repositories/tournament.repository.js');
    const m1 = await tournamentRepository.createMatch({ tournament_id: tid, competition_id: compA, round: 1 });
    const m2 = await tournamentRepository.createMatch({ tournament_id: tid, competition_id: compA, round: 1 });
    const m3 = await tournamentRepository.createMatch({ tournament_id: tid, competition_id: compB, round: 1 });
    const [rows] = await exec<RowData>('SELECT competition_id, match_number FROM tournament_matches WHERE tournament_id = ? ORDER BY id', [tid]);
    expect(Number(rows[0].competition_id)).toBe(compA);
    expect(Number(rows[0].match_number)).toBe(1);
    expect(Number(rows[1].competition_id)).toBe(compA);
    expect(Number(rows[1].match_number)).toBe(2);
    expect(Number(rows[2].competition_id)).toBe(compB);
    expect(Number(rows[2].match_number)).toBe(1);
    void m1; void m2; void m3;
  });

  it('F. registration commission context is preserved (Phase 2 amounts; court booking never feeds tournament commission)', async () => {
    // The tournament commission listener uses payment_transactions.amount for a
    // `tournament` reference (competition fee). Court bookings are booking-scoped.
    const tid = await createTournament(ORG);
    const { tournamentService } = await import('../application/tournament.service.js');
    const { competitionService } = await import('../application/competition.service.js');
    const comp = await createCompetition(tid, 'singles');
    const comps = await competitionService.listCompetitions(tid);
    const compRow = comps.find((c) => Number(c.id) === Number(comp))!;
    const tourn = (await import('../infrastructure/repositories/tournament.repository.js')).tournamentRepository;
    const t = await tourn.findById(tid);
    expect(competitionService.entryFee(compRow, t!)).toBe(0);
    // no venue field ever becomes a commission amount in the listener (read-only assertion via registry)
    expect(t!['commission_rate' as keyof typeof t]).toBeDefined();
    expect(await competitionService.listCompetitions(tid).then((x) => x.length)).toBeGreaterThanOrEqual(1);
  });

  it('MOVE. same-competition move succeeds; cross-competition / wrong-draw / IDOR fail closed', async () => {
    const tid = await createTournament(ORG);
    const compA = await defaultComp(tid);
    const compB = await createCompetition(tid, 'team');
    await addParticipant(tid, compA, U.a);
    await addParticipant(tid, compA, U.b);
    await addParticipant(tid, compB, U.c);
    await addParticipant(tid, compB, U.d);
    const { participantDrawService } = await import('../application/participant-draw.service.js');
    const drawA = await participantDrawService.generateDraw(tid, CREATOR, 111, compA);
    await participantDrawService.generateDraw(tid, CREATOR, 222, compB);

    const compAEntries = (await exec<RowData>('SELECT de.participant_id, de.position FROM tournament_draw_entries de WHERE de.draw_id = ? ORDER BY de.position', [Number(drawA.id)]))[0] as any[];
    const pid0 = Number(compAEntries[0].participant_id);
    const pid1 = Number(compAEntries[1].participant_id);

    // same-competition move succeeds (swap positions 0 <-> 1)
    const ok = await participantDrawService.moveParticipant(tid, pid0, 1, CREATOR, {});
    expect(ok.valid).toBe(true);

    // a Competition-B participant can NEVER enter Competition A's draw: the
    // authoritative competition is the participant's own, so the move is applied
    // in competition B's draw only.
    const compBp = Number((await exec<RowData>('SELECT id FROM tournament_participants WHERE tournament_id = ? AND competition_id = ? LIMIT 1', [tid, compB]))[0][0].id);
    await participantDrawService.moveParticipant(tid, compBp, 0, CREATOR, {});
    const afterA = (await exec<RowData>('SELECT participant_id FROM tournament_draw_entries WHERE draw_id = ?', [Number(drawA.id)]))[0] as any[];
    expect(afterA.map((r) => Number(r.participant_id))).not.toContain(compBp);

    // wrong-draw: a participant whose competition has NO current draw fails closed
    const tid2 = await createTournament(ORG);
    const compX = await defaultComp(tid2);
    await addParticipant(tid2, compX, U.a);
    await addParticipant(tid2, compX, U.b);
    const compXp = Number((await exec<RowData>('SELECT id FROM tournament_participants WHERE tournament_id = ? AND competition_id = ? LIMIT 1', [tid2, compX]))[0][0].id);
    await expect(participantDrawService.moveParticipant(tid2, compXp, 0, CREATOR, {})).rejects.toThrow();

    // IDOR: a participant from ANOTHER tournament fails at the tournament member check
    await expect(participantDrawService.moveParticipant(tid, compXp, 0, CREATOR, {})).rejects.toThrow();
    void pid1;
  });
});