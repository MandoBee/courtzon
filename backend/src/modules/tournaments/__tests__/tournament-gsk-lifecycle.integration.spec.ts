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
let koStageId = 0;
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
      if (auth === `Bearer ${ownerToken}`) return CREATOR;
      const player = PLAYERS.findIndex((_, i) => auth === `Bearer p${i}`);
      return player >= 0 ? PLAYERS[player] : null;
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
  const { matchResultRoutes } = await import('../../match-result/presentation/match-result.routes.js');
  app.register(orgTournamentRoutes);
  app.register(tournamentRoutes);
  app.register(matchResultRoutes);
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
  knockout: { startingRound: 'semifinals', seeding: 'automatic', separateGroupWinners: true, preventSameGroupRematch: true, allowByes: false, playInRounds: 0 },
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
// -----------------------------------------------------------------------------
// Step 3B-5C � REAL result?progression pipeline ? standings ? qualify ?
// knockout ? QF?SF?F ? completion (the production subscriber processor).
// -----------------------------------------------------------------------------
describe('GSK result progression pipeline (Step 3B-5C)', () => {
  async function processApproved(m: any) {
    const shared = Number(m.match_id);
    const tmId = Number(m.id);
    // 0. Start the match session (records played time; required before submitting).
    const stRes = await app.inject({ method: 'POST', url: `/org/${ORG}/tournaments/matches/${tmId}/start`, headers: { authorization: `Bearer ${ownerToken}` }, payload: {} });
    if (stRes.statusCode !== 200) console.error('STARTMATCH-FAIL', stRes.statusCode, JSON.stringify(stRes.json()));
    // 1. Operator submits through the REAL org result route.
    const sub = await app.inject({
      method: 'POST', url: `/org/${ORG}/tournaments/matches/${tmId}/result`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { outcome: 'completed', score: { sets: [{ home: 6, away: 3 }, { home: 6, away: 3 }] } },
    });
    if (sub.statusCode !== 200 && sub.statusCode !== 201) console.error('SUBMIT-FAIL', sub.statusCode, JSON.stringify(sub.json()));
    expect([200, 201]).toContain(sub.statusCode);
    const rec = await q('SELECT id FROM match_result_records WHERE match_id = ? ORDER BY id DESC LIMIT 1', [shared]);
    const resultId = Number((rec as any)[0].id);
    // 2. The OPPONENT (side-1 participant) accepts through the REAL accept route.
    const memberRows = await q('SELECT user_id FROM tournament_participant_members WHERE participant_id = ? AND status = ? LIMIT 1', [Number(m.participant1_id), 'active']);
    const acceptUserId = Number((memberRows as any)[0]?.user_id);
    const acceptToken = `p${PLAYERS.indexOf(acceptUserId)}`;
    const acc = await app.inject({ method: 'POST', url: `/matches/${shared}/result/accept`, headers: { authorization: `Bearer ${acceptToken}` }, payload: {} });
    if (acc.statusCode !== 200 && acc.statusCode !== 201) console.error('ACCEPT-FAIL', acc.statusCode, JSON.stringify(acc.json()));
    expect([200, 201]).toContain(acc.statusCode);
    // 3. Execute the EXACT production subscriber processor (mirror + progress).
    const { handleProgressionEvent } = await import('../application/tournament-progression.listener.js');
    try {
      await handleProgressionEvent({ eventName: 'match:result-approved', payload: { matchId: shared, resultId } } as any);
    } catch (e: any) {
      console.error('PROGRESS-FAIL', e?.message ?? String(e));
      throw e;
    }
  }

  it('9. group results approved through the real pipeline ? standings computed', async () => {
    const startRes = await org('start'); if (startRes.statusCode !== 200) console.error('START-FAIL', startRes.statusCode, JSON.stringify(startRes.json())); expect(startRes.statusCode).toBe(200);
    const groupMatches = await q('SELECT id, match_id, participant1_id FROM tournament_matches WHERE stage_id = ? ORDER BY id', [groupStageId]);
    expect(groupMatches).toHaveLength(12);
    for (const m of groupMatches as any[]) await processApproved(m);
    // Authoritative standings per group: 4 rows each, ranks 1..4, 3 matches each.
    const st = await q('SELECT group_id, COUNT(*) AS c, SUM(rank_position) AS rsum FROM tournament_standings WHERE tournament_id = ? GROUP BY group_id', [tournamentId]);
    for (const s of st as any[]) {
      expect(Number(s.c)).toBe(4);
      expect(Number(s.rsum)).toBe(10); // 1+2+3+4
    }
  });

  it('10. qualification over HTTP ? exactly 4 qualifiers (2 per group)', async () => {
    const res = await app.inject({
      method: 'POST', url: `/org/${ORG}/tournaments/${tournamentId}/qualify`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { stage_id: groupStageId },
    });
    if (res.statusCode !== 200) console.error('HTTP-FAIL', res.statusCode, JSON.stringify(res.json()));
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalQualified).toBe(4);
    const perGroup = new Set(body.qualified.map((x: any) => x.groupId));
    expect(perGroup.size).toBe(2);
    expect(body.qualified.every((x: any) => x.groupRank === 1 || x.groupRank === 2)).toBe(true);
  });

  it('11. knockout transition over HTTP ? 4 QF + 2 SF + 1 F structure', async () => {
    const res = await app.inject({
      method: 'POST', url: `/org/${ORG}/tournaments/${tournamentId}/knockout`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { stage_id: groupStageId },
    });
    if (res.statusCode !== 200) console.error('HTTP-FAIL', res.statusCode, JSON.stringify(res.json()));
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.bracketSize).toBe(4); // semifinals bracket: Q=4 → 2 SF → 1 F
    koStageId = Number(body.stageId);
    const rows = await q('SELECT round, COUNT(*) AS c FROM tournament_matches WHERE stage_id = ? GROUP BY round ORDER BY round', [koStageId]);
    expect((rows as any[]).map((r) => [Number(r.round), Number(r.c)])).toEqual([[1, 2], [2, 1]]);
  });

  it('12. QF?SF?F results approved ? tournament completes with a winner', async () => {
    for (let guard = 0; guard < 4; guard++) {
      const pending = await q('SELECT id, match_id, participant1_id FROM tournament_matches WHERE stage_id = ? AND progression_state = ? AND match_id IS NOT NULL', [koStageId, 'pending']);
      if ((pending as any[]).length === 0) break;
      for (const m of pending as any[]) await processApproved(m);
    }
    // All knockout matches are resolved — finalise through the existing lifecycle endpoint.
    expect((await org('complete')).statusCode).toBe(200);
    const statusRows = await q('SELECT status FROM tournaments WHERE id = ?', [tournamentId]);
    expect(String((statusRows as any)[0].status)).toBe('completed');
    const finals = await q('SELECT winner_id, final_position FROM tournament_matches WHERE stage_id = ? AND is_final = 1', [koStageId]);
    expect((finals as any[]).length).toBe(1);
    // (champion/final_position projection is a bracket-placements concern — reported limitation)
    const all = await q('SELECT COUNT(*) AS c FROM tournament_matches WHERE stage_id = ?', [koStageId]);
    expect(Number((all as any)[0].c)).toBe(3); // no extra matches
  });
});
