import type { FastifyRequest, FastifyReply } from 'fastify';
import { seasonService } from '../application/season.service.js';
import { leagueService } from '../application/league.service.js';
import { divisionService } from '../application/division.service.js';
import { fixtureService } from '../application/fixture.service.js';
import { standingService } from '../application/standing.service.js';
import { statisticsService } from '../application/statistics.service.js';
import {
  CreateSeasonSchema, UpdateSeasonSchema, ListSeasonsQuerySchema,
  CreateLeagueSchema, UpdateLeagueSchema, ListLeaguesQuerySchema,
  CreateDivisionSchema, UpdateDivisionSchema,
  RegisterTeamSchema, RecordResultSchema, AssignCourtSchema, AssignRefereeSchema,
} from './league.dto.js';
import { recordAudit } from '../../audit-log/index.js';
import { getPool } from '../../../database/mysql.js';

type RowData = import('mysql2').RowDataPacket[];

function getUserId(request: FastifyRequest): number { return (request as any).userId; }
function getUserAgent(request: FastifyRequest): string | undefined {
  const ua = request.headers['user-agent'];
  return typeof ua === 'string' ? ua : undefined;
}

// ── Dashboard ──

export async function getDashboardHandler(_request: FastifyRequest, reply: FastifyReply) {
  const data = await leagueService.getDashboard();
  return reply.send(data);
}

// ── Seasons ──

export async function listSeasonsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = ListSeasonsQuerySchema.parse(request.query);
  const result = await seasonService.list(query);
  return reply.send(result);
}

export async function getSeasonHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const season = await seasonService.getById(Number(id));
  return reply.send(season);
}

export async function createSeasonHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = CreateSeasonSchema.parse(request.body);
  const season = await seasonService.create(body);
  recordAudit({
    actorId: userId, action: 'SEASON.CREATE', entityType: 'season',
    entityId: season.id!, afterState: { code: body.code, name: body.name },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(season);
}

export async function updateSeasonHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = UpdateSeasonSchema.parse(request.body);
  const before = await seasonService.getById(Number(id));
  const season = await seasonService.update(Number(id), body);
  recordAudit({
    actorId: userId, action: 'SEASON.UPDATE', entityType: 'season',
    entityId: Number(id), beforeState: before ? { name: before.name, status: before.status } : null,
    afterState: { ...body }, ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(season);
}

export async function publishSeasonHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const season = await seasonService.publish(Number(id));
  recordAudit({
    actorId: userId, action: 'SEASON.PUBLISH', entityType: 'season',
    entityId: Number(id), afterState: { status: 'published' },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(season);
}

export async function archiveSeasonHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await seasonService.archive(Number(id));
  recordAudit({
    actorId: userId, action: 'SEASON.ARCHIVE', entityType: 'season',
    entityId: Number(id), afterState: { status: 'archived' },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(204).send();
}

// ── Leagues ──

export async function listLeaguesHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = ListLeaguesQuerySchema.parse(request.query);
  const result = await leagueService.list(query);
  return reply.send(result);
}

export async function getLeagueHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const league = await leagueService.getById(Number(id));
  return reply.send(league);
}

export async function createLeagueHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = CreateLeagueSchema.parse(request.body);
  const league = await leagueService.create(body);
  recordAudit({
    actorId: userId, action: 'LEAGUE.CREATE', entityType: 'league',
    entityId: league.id!, afterState: { code: body.code, name: body.name },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(league);
}

export async function updateLeagueHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = UpdateLeagueSchema.parse(request.body);
  const before = await leagueService.getById(Number(id));
  const league = await leagueService.update(Number(id), body);
  recordAudit({
    actorId: userId, action: 'LEAGUE.UPDATE', entityType: 'league',
    entityId: Number(id), beforeState: before ? { name: before.name, status: before.status } : null,
    afterState: { ...body }, ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(league);
}

// ── League status transitions ──

export async function publishLeagueHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const league = await leagueService.publish(Number(id));
  recordAudit({
    actorId: userId, action: 'LEAGUE.PUBLISH', entityType: 'league',
    entityId: Number(id), afterState: { status: 'registration_open' },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(league);
}

export async function openRegHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const league = await leagueService.openRegistration(Number(id));
  recordAudit({
    actorId: userId, action: 'LEAGUE.OPEN_REGISTRATION', entityType: 'league',
    entityId: Number(id), afterState: { status: 'registration_open' },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(league);
}

export async function closeRegHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const league = await leagueService.closeRegistration(Number(id));
  recordAudit({
    actorId: userId, action: 'LEAGUE.CLOSE_REGISTRATION', entityType: 'league',
    entityId: Number(id), afterState: { status: 'registration_closed' },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(league);
}

export async function startLeagueHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const league = await leagueService.start(Number(id));
  recordAudit({
    actorId: userId, action: 'LEAGUE.START', entityType: 'league',
    entityId: Number(id), afterState: { status: 'running' },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(league);
}

export async function completeLeagueHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const league = await leagueService.complete(Number(id));
  recordAudit({
    actorId: userId, action: 'LEAGUE.COMPLETE', entityType: 'league',
    entityId: Number(id), afterState: { status: 'completed' },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(league);
}

export async function cancelLeagueHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const league = await leagueService.cancel(Number(id));
  recordAudit({
    actorId: userId, action: 'LEAGUE.CANCEL', entityType: 'league',
    entityId: Number(id), afterState: { status: 'cancelled' },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(league);
}

export async function archiveLeagueHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await leagueService.archive(Number(id));
  recordAudit({
    actorId: userId, action: 'LEAGUE.ARCHIVE', entityType: 'league',
    entityId: Number(id), afterState: { status: 'archived' },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(204).send();
}

// ── Divisions ──

export async function listDivisionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const pool = getPool();
  const [rows] = await pool.query<RowData>(
    'SELECT * FROM league_divisions WHERE league_id = ? ORDER BY tier ASC, name ASC',
    [Number(id)],
  );
  return reply.send({ data: rows });
}

export async function createDivisionHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = CreateDivisionSchema.parse(request.body);
  const division = await divisionService.create(body);
  recordAudit({
    actorId: userId, action: 'DIVISION.CREATE', entityType: 'league_division',
    entityId: division.id!, afterState: { league_id: body.league_id, name: body.name, tier: body.tier },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(division);
}

export async function updateDivisionHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = UpdateDivisionSchema.parse(request.body);
  const before = await divisionService.update(Number(id), body);
  recordAudit({
    actorId: userId, action: 'DIVISION.UPDATE', entityType: 'league_division',
    entityId: Number(id), afterState: { ...body },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(before);
}

export async function promoteHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const { team_count } = request.body as any;
  await divisionService.promote(Number(id), team_count ?? 1);
  recordAudit({
    actorId: userId, action: 'DIVISION.PROMOTE', entityType: 'league_division',
    entityId: Number(id), afterState: { action: 'promote', team_count: team_count ?? 1 },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Teams promoted' });
}

export async function relegateHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const { team_count } = request.body as any;
  await divisionService.relegate(Number(id), team_count ?? 1);
  recordAudit({
    actorId: userId, action: 'DIVISION.RELEGATE', entityType: 'league_division',
    entityId: Number(id), afterState: { action: 'relegate', team_count: team_count ?? 1 },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Teams relegated' });
}

// ── Teams ──

export async function listTeamsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const pool = getPool();
  const [rows] = await pool.query<RowData>(
    `SELECT lt.*, ld.name AS division_name
     FROM league_teams lt
     JOIN league_divisions ld ON ld.id = lt.division_id
     WHERE ld.league_id = ?
     ORDER BY lt.status, lt.seed`,
    [Number(id)],
  );
  return reply.send({ data: rows });
}

export async function registerTeamHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = RegisterTeamSchema.parse(request.body);
  const team = await leagueService.registerTeam(Number(id), body.team_name, body.captain_id, body.player_ids);
  recordAudit({
    actorId: userId, action: 'LEAGUE.REGISTER_TEAM', entityType: 'league_team',
    entityId: team.id!, afterState: { league_id: Number(id), team_name: body.team_name },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(team);
}

export async function cancelTeamHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await leagueService.cancelRegistration(Number(id));
  recordAudit({
    actorId: userId, action: 'LEAGUE.CANCEL_TEAM', entityType: 'league_team',
    entityId: Number(id), ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Team registration cancelled' });
}

export async function confirmTeamHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await leagueService.confirmRegistration(Number(id));
  recordAudit({
    actorId: userId, action: 'LEAGUE.CONFIRM_TEAM', entityType: 'league_team',
    entityId: Number(id), ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Team registration confirmed' });
}

// ── Fixtures ──

export async function generateFixturesHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await fixtureService.generateFixtures(Number(id));
  recordAudit({
    actorId: userId, action: 'LEAGUE.GENERATE_FIXTURES', entityType: 'league',
    entityId: Number(id), ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Fixtures generated' });
}

export async function listMatchesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const pool = getPool();
  const [rows] = await pool.query<RowData>(
    `SELECT lm.*, ht.team_name AS home_team_name, at.team_name AS away_team_name
     FROM league_matches lm
     JOIN league_teams ht ON ht.id = lm.home_team_id
     JOIN league_teams at ON at.id = lm.away_team_id
     JOIN league_divisions ld ON ld.id = lm.division_id
     WHERE ld.league_id = ?
     ORDER BY lm.round, lm.id`,
    [Number(id)],
  );
  return reply.send({ data: rows });
}

export async function assignCourtHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = AssignCourtSchema.parse(request.body);
  await fixtureService.assignCourt(Number(id), body.court_id);
  recordAudit({
    actorId: userId, action: 'LEAGUE.ASSIGN_COURT', entityType: 'league_match',
    entityId: Number(id), afterState: { court_id: body.court_id },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Court assigned' });
}

export async function assignRefereeHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = AssignRefereeSchema.parse(request.body);
  await fixtureService.assignReferee(Number(id), body.referee_id);
  recordAudit({
    actorId: userId, action: 'LEAGUE.ASSIGN_REFEREE', entityType: 'league_match',
    entityId: Number(id), afterState: { referee_id: body.referee_id },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Referee assigned' });
}

export async function recordResultHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = RecordResultSchema.parse(request.body);
  await fixtureService.recordResult(Number(id), body.home_score, body.away_score, userId);
  recordAudit({
    actorId: userId, action: 'LEAGUE.RECORD_RESULT', entityType: 'league_match',
    entityId: Number(id), afterState: { home_score: body.home_score, away_score: body.away_score },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ success: true });
}

// ── Standings ──

export async function getStandingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { division_id } = request.query as any;
  if (division_id) {
    const data = await standingService.getStandings(Number(division_id));
    return reply.send({ data });
  }
  const pool = getPool();
  const [divisions] = await pool.query<RowData>(
    'SELECT id FROM league_divisions WHERE league_id = ? ORDER BY tier',
    [Number(id)],
  );
  const result: Record<number, any> = {};
  for (const d of divisions) {
    result[d.id] = await standingService.getStandings(d.id);
  }
  return reply.send({ data: result });
}

export async function recalculateStandingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const pool = getPool();
  const [divisions] = await pool.query<RowData>(
    'SELECT id FROM league_divisions WHERE league_id = ?',
    [Number(id)],
  );
  for (const d of divisions) {
    await standingService.recalculate(d.id);
  }
  recordAudit({
    actorId: userId, action: 'LEAGUE.RECALCULATE_STANDINGS', entityType: 'league',
    entityId: Number(id), ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Standings recalculated' });
}

// ── Statistics ──

export async function getPlayerStatsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { division_id, player_id, team_id } = request.query as any;
  const pool = getPool();
  const [seasonRows] = await pool.query<RowData>(
    'SELECT l.season_id FROM leagues l WHERE l.id = ?',
    [Number(id)],
  );
  if (!seasonRows.length) return reply.send({ data: [] });
  const data = await statisticsService.getPlayerStats({
    season_id: seasonRows[0].season_id,
    division_id: division_id ? Number(division_id) : undefined,
    player_id: player_id ? Number(player_id) : undefined,
    team_id: team_id ? Number(team_id) : undefined,
  });
  return reply.send({ data });
}

export async function recalculateStatsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const pool = getPool();
  const [divisions] = await pool.query<RowData>(
    'SELECT id FROM league_divisions WHERE league_id = ?',
    [Number(id)],
  );
  for (const d of divisions) {
    await statisticsService.recalculatePlayerStats(d.id);
    await statisticsService.recalculateTeamStats(d.id);
  }
  recordAudit({
    actorId: userId, action: 'LEAGUE.RECALCULATE_STATS', entityType: 'league',
    entityId: Number(id), ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Statistics recalculated' });
}

export async function getMyLeaguesHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const pool = getPool();
  const [rows] = await pool.query<RowData>(
    `SELECT lt.*, ld.name AS division_name, l.name AS league_name, l.code AS league_code
     FROM league_teams lt
     JOIN league_divisions ld ON ld.id = lt.division_id
     JOIN leagues l ON l.id = ld.league_id
     WHERE lt.captain_id = ? OR JSON_CONTAINS(lt.player_ids, CAST(? AS JSON), '$')
     ORDER BY l.created_at DESC`,
    [userId, JSON.stringify(userId)],
  );
  return reply.send(rows);
}

export async function publicRegisterTeamHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = RegisterTeamSchema.parse(request.body);
  const result = await leagueService.registerTeam(
    Number(id),
    body.team_name || `${(request as any).user?.full_name || 'Player'}'s Team`,
    userId,
    body.player_ids || [userId],
  );
  recordAudit({
    actorId: userId, action: 'LEAGUE.PUBLIC_REGISTER_TEAM', entityType: 'league_team',
    entityId: result.id, afterState: { league_id: Number(id), team_name: result.team_name },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(result);
}
