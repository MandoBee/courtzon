import type { FastifyRequest, FastifyReply } from 'fastify';
import { playerService } from '../application/player.service.js';
import { SearchQuerySchema } from './player.dto.js';
import { recordAudit } from '../../audit-log/index.js';

function getUserId(request: FastifyRequest): number { return (request as any).userId; }
function getUserAgent(request: FastifyRequest): string | undefined {
  const ua = request.headers['user-agent'];
  return typeof ua === 'string' ? ua : undefined;
}

export async function getDashboardHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const data = await playerService.getDashboard(userId);
  return reply.send(data);
}

export async function getUpcomingHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const data = await playerService.getUpcoming(userId);
  return reply.send(data);
}

export async function getStatisticsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const data = await playerService.getStatistics(userId);
  return reply.send(data);
}

export async function getQRProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const data = await playerService.getQRProfile(userId);
  return reply.send(data);
}

export async function searchPlayersHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = SearchQuerySchema.parse(request.query);
  const currentUserId = getUserId(request);
  const result = await playerService.searchPlayers(query.q, query.page, query.limit, currentUserId);
  return reply.send(result);
}

export async function getPlayerProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const currentUserId = getUserId(request);
  const data = await playerService.getPlayerProfile(Number(id), currentUserId);
  return reply.send(data);
}

export async function getFavoriteClubsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const data = await playerService.getFavoriteClubs(userId);
  return reply.send(data);
}

export async function addFavoriteClubHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { orgId } = request.params as any;
  await playerService.addFavoriteClub(userId, Number(orgId));
  recordAudit({
    actorId: userId, action: 'PLAYER.ADD_FAVORITE_CLUB', entityType: 'user_follows',
    entityId: Number(orgId), afterState: { org_id: Number(orgId) },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send({ message: 'Club added to favorites' });
}

export async function removeFavoriteClubHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { orgId } = request.params as any;
  await playerService.removeFavoriteClub(userId, Number(orgId));
  recordAudit({
    actorId: userId, action: 'PLAYER.REMOVE_FAVORITE_CLUB', entityType: 'user_follows',
    entityId: Number(orgId), beforeState: { org_id: Number(orgId) },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Club removed from favorites' });
}

export async function getFavoriteCoachesHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const data = await playerService.getFavoriteCoaches(userId);
  return reply.send(data);
}

export async function removeFavoriteCoachHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await playerService.removeFavoriteCoach(userId, Number(id));
  recordAudit({
    actorId: userId, action: 'PLAYER.REMOVE_FAVORITE_COACH', entityType: 'user_follows',
    entityId: Number(id), beforeState: { user_id: Number(id) },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Coach removed from favorites' });
}

export async function getDevicesHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const data = await playerService.getDevices(userId);
  return reply.send(data);
}

export async function removeDeviceHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await playerService.removeDevice(userId, Number(id));
  recordAudit({
    actorId: userId, action: 'PLAYER.REMOVE_DEVICE', entityType: 'user_device',
    entityId: Number(id), ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Device removed' });
}

export async function getAchievementsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const data = await playerService.getAchievements(userId);
  return reply.send(data);
}

export async function getRankHistoryHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const pool = (await import('../../../database/mysql.js')).getPool();
  type RowData = import('mysql2').RowDataPacket[];
  const [tournamentRows] = await pool.query<RowData>(
    `SELECT ts.*, t.name AS tournament_name, t.start_date
     FROM tournament_standings ts
     JOIN tournament_registrations tr ON tr.id = ts.registration_id
     JOIN tournaments t ON t.id = ts.tournament_id
     WHERE tr.player_id = ? AND ts.rank_position IS NOT NULL
     ORDER BY t.start_date DESC
     LIMIT 50`, [userId],
  );
  const [leagueRows] = await pool.query<RowData>(
    `SELECT ls.*, ld.name AS division_name, l.name AS league_name, l.code AS league_code
     FROM league_standings ls
     JOIN league_teams lt ON lt.id = ls.team_id
     JOIN league_divisions ld ON ld.id = ls.division_id
     JOIN leagues l ON l.id = ld.league_id
     WHERE lt.captain_id = ? OR JSON_CONTAINS(lt.player_ids, CAST(? AS JSON), '$')
     ORDER BY l.created_at DESC
     LIMIT 50`, [userId, JSON.stringify(userId)],
  );
  return reply.send({ tournament_standings: tournamentRows, league_standings: leagueRows });
}

export async function getMyTournamentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const pool = (await import('../../../database/mysql.js')).getPool();
  type RowData = import('mysql2').RowDataPacket[];
  const [rows] = await pool.query<RowData>(
    `SELECT tr.*, t.name AS tournament_name, t.code AS tournament_code, t.status AS tournament_status,
            t.format, t.start_date, t.end_date
     FROM tournament_registrations tr
     JOIN tournaments t ON t.id = tr.tournament_id
     WHERE tr.player_id = ?
     ORDER BY tr.registered_at DESC`, [userId],
  );
  return reply.send(rows);
}
