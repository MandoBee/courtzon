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
