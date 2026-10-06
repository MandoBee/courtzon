import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import Fastify from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Step 3B-5B — GSK BACKEND LIFECYCLE OVER HTTP (dev DB 3307/courtzon_v3).
 *
 * Exercises the REAL application routes through `app.inject`:
 *   create (org) → publish/open/close → generate-groups (stage_id) → qualify → knockout
 * with lifecycle/idempotency/authorization enforced by the real middleware.
 *
 * Auth: the same harness style as the membership integration specs — the auth
 * middleware is initialised with a token→user resolution and a permissive
 * permission/role/org access guard, so the ROUTE + DTO + service contract is what
 * is verified.
 *
 * Participants are populated with the established integration fixture pattern
 * (registration + participant rows) because the org register endpoint registers
 * the authenticated OPERATOR (existing product behaviour), so per-player
 * registration over HTTP is not the authoritative participant source here.
 * The GSK stage lifecycle is 100% HTTP.
 */
const ORG = 27305101;
const CREATOR = 27305102;
const PLAYERS = Array.from({ length: 8 }, (_, i) => 27305110 + i);

let pool: mysql.Pool;
let app: ReturnType<typeof Fastify>;
let sportId = 0;
let fmtId = 0;
let ruleId = 0;
let tournamentId = 0;
let competitionId = 0;
let groupStageId = 0;
const ownerToken = 'gsk-owner-token';

const q = async <T = any>(sql: string, params: any[] = []): Promise<T[]> => {
  const [rows] = await pool.execute<any>(sql, params);
  return rows as T[];
};

const del = (sql: string, params: any[] = []) => pool.execute(sql, params);

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });

  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
  await del(`DELETE FROM tournaments WHERE organisation_id = ${ORG} OR creator_id = ${CREATOR}`);
  await del(`DELETE FROM organisations WHERE id = ${ORG}`);
  await del(`DELETE FROM users WHERE id IN (${[CREATOR, ...PLAYERS].join(',')})`);
  await del(`DELETE FROM sport_formats WHERE id = ${fmtId} OR slug = 'gsk-singles'`);
  await del(`DELETE FROM sports WHERE id = ${sportId} OR slug = 'gsk-sport'`);
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');

  for (const [id, email] of [[CREATOR, 'gsk-owner@t.local'], ...PLAYERS.map((p, i) => [p, `gsk-p${i}@t.local`])] as const) {
    await pool.execute(
      `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status, birth_date)
       VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'GSK U', 'male', 'active', '1995-01-01')`,
      [id, `055${id}`, `+97255${id}`, email],
    );
    await pool.execute('INSERT IGNORE INTO player_profiles (user_id) VALUES (?)', [id]);
  }
  const ot = await q('SELECT id FROM organisation_types LIMIT 1');
  const orgTypeId = Number((ot as any)[0].id);
  await pool.execute(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
     VALUES (?, UUID(), ?, ?, 'GSK Org', 'gsk-org', 1)`,
    [ORG, orgTypeId, CREATOR],
  );
  const sp = await q(`INSERT INTO sports (name, slug, is_active, show_in_marketplace, sort_order) VALUES ('GSK Sport', 'gsk-sport', 1, 1, 0)`);
  sportId = Number((sp as any).insertId);
  const ff = await q(
    `INSERT INTO sport_formats (sport_id, slug, name, format_type, players_per_side, roster_size, is_default, is_active)
     VALUES (?, 'gsk-singles', 'GSK Singles', 'singles', 1, NULL, 1, 1)`, [sportId],
  );
  fmtId = Number((ff as any).insertId);
  const rr = await q(
    `INSERT INTO sport_rule_sets (format_id, name, version, is_active, rules)
     VALUES (?, 'GSK Rules', 1, 1, ?)`,
    [fmtId, JSON.stringify({ best_of: 3, sets_to_win: 2, first_to: 6, margin: 2, score_structure: 'sets', standings: { points: { win: 2, draw: 1, loss: 0 }, tiebreakers: ['points', 'game_difference'] } })],
  );
  ruleId = Number((rr as any).insertId);

  // ── Auth harness (token→user; permissive role/permission/org guards) ──
  const { initAuthMiddleware } = await import('../../../shared/middleware/auth.middleware.js');
  initAuthMiddleware({
    resolveUser: async (request: FastifyRequest) => {
      const auth = String((request.headers as any).authorization ?? '');
      return auth === `Bearer ${ownerToken}` ? CREATOR : null;
    },
    checkRole: async () => true,
    checkPermission: async () => true,
    checkOrgApproved: async () => true,
  });
  const { initRouteGuard } = await import('../../../shared/middleware/route-guard.js');
  initRouteGuard({ checkOrgAccess: async () => true, checkOrgManage: async () => true, checkOrgPermission: async () => true });

  const { AppError } = await import('../../../shared/errors/app-error.js');
  app = Fastify();
  app.setErrorHandler((error: any, _req: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) return reply.status(error.statusCode).send({ error: error.errorCode, message: error.message });
    throw error;
  });
  const { orgTournamentRoutes } = await import('../presentation/org-tournament.routes.js');
  const { tournamentRoutes } = await import('../presentation/tournament.routes.js');
  // EventBus listeners for in-process progression (deterministic only when a
  // result is approved; group results below are pending by design).
  const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
  void eventBusV2;
  app.register(orgTournamentRoutes);
  app.register(tournamentRoutes);
  await app.ready();
}, 240000);

afterAll(async () => {
  if (app) await app.close();
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  if (pool) {
    await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
    await del(`DELETE FROM tournament_prize_awards WHERE tournament_id IN (SELECT id FROM tournaments WHERE organisation_id=${ORG})`);
    await del(`DELETE FROM tournament_standings WHERE tournament_id IN (SELECT id FROM tournaments WHERE organisation_id=${ORG})`);
    await del(`DELETE FROM tournament_matches WHERE tournament_id IN (SELECT id FROM tournaments WHERE organisation_id=${ORG})`);
    await del(`DELETE FROM match_result_records WHERE match_id IN (SELECT id FROM matches WHERE tournament_id IN (SELECT id FROM tournaments WHERE organisation_id=${ORG}))`);
    await del(`DELETE FROM matches WHERE tournament_id IN (SELECT id FROM tournaments WHERE organisation_id=${ORG})`);
    await del(`DELETE FROM tournament_match_results WHERE match_id IN (SELECT id FROM tournament_matches WHERE tournament_id IN (SELECT id FROM tournaments WHERE organisation_id=${ORG}))`);
    await del(`DELETE FROM tournament_group_members WHERE group_id IN (SELECT id FROM tournament_groups WHERE tournament_id IN (SELECT id FROM tournaments WHERE organisation_id=${ORG}))`);
    await del(`DELETE FROM tournament_groups WHERE tournament_id IN (SELECT id FROM tournaments WHERE organisation_id=${ORG})`);
    await del(`DELETE FROM tournament_draw_entries WHERE draw_id IN (SELECT id FROM tournament_draws WHERE tournament_id IN (SELECT id FROM tournaments WHERE organisation_id=${ORG}))`);
    await del(`DELETE FROM tournament_draws WHERE tournament_id IN (SELECT id FROM tournaments WHERE organisation_id=${ORG})`);
    await del(`DELETE FROM tournament_seeds WHERE tournament_id IN (SELECT id FROM tournaments WHERE organisation_id=${ORG})`);
    await del(`DELETE FROM tournament_participants WHERE tournament_id IN (SELECT id FROM tournaments WHERE organisation_id=${ORG})`);
    await del(`DELETE FROM tournament_registrations WHERE tournament_id IN (SELECT id FROM tournaments WHERE organisation_id=${ORG})`);
    await del(`DELETE FROM tournament_stages WHERE tournament_id IN (SELECT id FROM tournaments WHERE organisation_id=${ORG})`);
    await del(`DELETE FROM tournament_competitions WHERE tournament_id IN (SELECT id FROM tournaments WHERE organisation_id=${ORG})`);
    await del(`DELETE FROM tournaments WHERE organisation_id=${ORG}`);
    await del('DELETE FROM sport_rule_sets WHERE id = ?', [ruleId]);
    await del('DELETE FROM sport_formats WHERE id = ?', [fmtId]);
    await del('DELETE FROM sports WHERE id = ?', [sportId]);
    await del(`DELETE FROM player_profiles WHERE user_id IN (${[CREATOR, ...PLAYERS].join(',')})`);
    await del(`DELETE FROM users WHERE id IN (${[CREATOR, ...PLAYERS].join(',')})`);
    await del(`DELETE FROM organisations WHERE id = ${ORG}`);
    await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
    await pool.end();
  }
}, 60000);

const gskConfig = {
  format: 'group_stage_knockout',
  groupStage: { groupCount: 2, participantsPerGroup: 4, format: 'round_robin', qualification: { topPerGroup: 2, bestThirdPlaces: 0, ordering: 'rank' } },
  knockout: { startingRound: 'quarterfinals', seeding: 'automatic', separateGroupWinners: true, preventSameGroupRematch: true, allowByes: false, playInRounds: 0 },
};

async function createTournament() {
  const res = await app.inject({
    method: 'POST', url: `/org/${ORG}/tournaments`,
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: {
      name: 'GSK Journey Cup',
      bracket_type_id: 1, // single-elimination substrate
      format: 'group_stage_knockout',
      gsk_config: gskConfig,
      sport_id: sportId, match_format_id: fmtId, rule_set_id: ruleId,
      max_participants: 8, min_participants: 2, entry_fee: 0,
      currency_code: 'EGP', price_type: 'FREE',
      start_date: '2026-12-01', end_date: '2026-12-10',
    },
  });
  return res;
}

async function org(cmd: string, extra = '') {
  return app.inject({ method: 'POST', url: `/org/${ORG}/tournaments/${tournamentId}/${cmd}`, headers: { authorization: `Bearer ${ownerToken}` } });
}

describe('GSK lifecycle over HTTP (Step 3B-5B)', () => {
  it('1. create a GSK tournament through the org API (format + skeleton, no false readiness)', async () => {
    const bracket = await q('SELECT id FROM tournament_bracket_types WHERE slug = ? LIMIT 1', ['single-elimination']);
    const res = await createTournament();
    expect(res.statusCode).toBe(201);
    const body = res.json();
    tournamentId = Number(body.id);
    expect(body.format).toBe('group_stage_knockout');
    expect(body.competition_prepared).toBe(false);
    expect(body.status).toBe('draft');
  });

  it('2. close registration before the participant fixture (lifecycle control)', async () => {
    const comp = await q('SELECT id FROM tournament_competitions WHERE tournament_id = ? AND is_default = 1', [tournamentId]);
    competitionId = Number((comp as any)[0].id);
    // Seed the 8 participants with the established integration fixture pattern.
    await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
    for (const uid of PLAYERS) {
      const [reg] = await pool.execute<any>(
        `INSERT INTO tournament_registrations (tournament_id, competition_id, player_id, payment_status, status)
         VALUES (?, ?, ?, 'paid', 'confirmed')`, [tournamentId, competitionId, uid]);
      const [pp] = await pool.execute<any>(
        `INSERT INTO tournament_participants (tournament_id, competition_id, registration_id, participant_type, status, member_user_ids)
         VALUES (?, ?, ?, 'individual', 'active', JSON_ARRAY(?))`, [tournamentId, competitionId, Number(reg.insertId), uid]);
      await pool.execute(
        `INSERT INTO tournament_participant_members (tournament_id, participant_id, user_id, member_order, status)
         VALUES (?, ?, ?, 0, 'active')`, [tournamentId, Number(pp.insertId), uid]);
    }
    await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
    await org('publish');
    await org('open-reg');
    expect((await org('close-reg')).statusCode).toBe(200);
    const stageRows = await q('SELECT id, progression_format, stage_order FROM tournament_stages WHERE tournament_id = ?', [tournamentId]);
    const [stage] = stageRows;
    groupStageId = Number((stage as any)?.id ?? 0);
    expect(groupStageId).toBeGreaterThan(0);
  });

  it('3. generate the Group Stage over HTTP; verify groups/members/matches exactly once', async () => {
    const res = await app.inject({
      method: 'POST', url: `/org/${ORG}/tournaments/${tournamentId}/generate-groups`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { stage_id: groupStageId },
    });
    expect(res.statusCode).toBe(200);
    const groups = await q('SELECT id FROM tournament_groups WHERE tournament_id = ? ORDER BY name', [tournamentId]);
    expect(groups).toHaveLength(2);
    const members = await q('SELECT COUNT(*) AS c FROM tournament_group_members gm JOIN tournament_groups g ON g.id = gm.group_id WHERE g.tournament_id = ?', [tournamentId]);
    expect(Number((members as any)[0].c)).toBe(8);
    const matches = await q('SELECT COUNT(*) AS c, SUM(group_id IS NOT NULL) AS with_group, SUM(stage_id = ?) AS with_stage FROM tournament_matches WHERE tournament_id = ?', [groupStageId, tournamentId]);
    expect(Number((matches as any)[0].c)).toBe(12);
    expect(Number((matches as any)[0].with_group)).toBe(12);
    expect(Number((matches as any)[0].with_stage)).toBe(12);
  });

  it('4. duplicate group generation is rejected (idempotency)', async () => {
    const res = await app.inject({
      method: 'POST', url: `/org/${ORG}/tournaments/${tournamentId}/generate-groups`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { stage_id: groupStageId },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(JSON.stringify(body)).toContain('already generated');
  });

  it('5. qualification before group completion is rejected over HTTP', async () => {
    const res = await app.inject({
      method: 'POST', url: `/org/${ORG}/tournaments/${tournamentId}/qualify`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { stage_id: groupStageId },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.stringify(res.json())).toContain('unresolved');
  });

  it('6. knockout transition before group completion is rejected over HTTP', async () => {
    const res = await app.inject({
      method: 'POST', url: `/org/${ORG}/tournaments/${tournamentId}/knockout`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { stage_id: groupStageId },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.stringify(res.json())).toContain('unresolved');
  });

  it('7. unauthorised actor is rejected on qualify and knockout', async () => {
    for (const path of ['qualify', 'knockout']) {
      const res = await app.inject({ method: 'POST', url: `/org/${ORG}/tournaments/${tournamentId}/${path}`, payload: { stage_id: groupStageId } });
      expect(res.statusCode).toBe(401);
    }
  });

  it('8. admin workbench qualify/knockout routes are reachable and lifecycle-guarded', async () => {
    const res = await app.inject({
      method: 'POST', url: `/admin/tournaments/${tournamentId}/qualify`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { stage_id: groupStageId },
    });
    expect(res.statusCode).toBe(409); // incomplete group stage (correct boundary through the admin surface too)
    expect(JSON.stringify(res.json())).toContain('unresolved');
  });
});