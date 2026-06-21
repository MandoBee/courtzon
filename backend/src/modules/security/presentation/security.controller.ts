import type { FastifyRequest, FastifyReply } from 'fastify';
import { securityService } from '../application/security.service.js';
import { getHealth } from '../../../infrastructure/health/health.service.js';

export async function getSecurityDashboardHandler(_request: FastifyRequest, reply: FastifyReply) {
  const data = await securityService.getDashboard();
  return reply.send({ data });
}

export async function getActiveSessionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const limit = parseInt(query.limit) || 50;
  const offset = parseInt(query.offset) || 0;
  const data = await securityService.getActiveSessions(limit, offset);
  return reply.send(data);
}

export async function getSuspiciousSessionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const limit = parseInt(query.limit) || 20;
  const data = await securityService.getSuspiciousSessions(limit);
  return reply.send({ data });
}

export async function revokeSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await securityService.revokeSession(Number(id));
  return reply.send({ success: true });
}

export async function getFailedLoginStatsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const days = parseInt(query.days) || 7;
  const data = await securityService.getFailedLoginStats(days);
  return reply.send({ data });
}

export async function getFailedLoginFeedHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const limit = parseInt(query.limit) || 20;
  const data = await securityService.getFailedLoginFeed(limit);
  return reply.send({ data });
}

export async function getUploadSecurityStatsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const days = parseInt(query.days) || 7;
  const data = await securityService.getUploadSecurityStats(days);
  return reply.send({ data });
}

export async function getRecentUploadsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const limit = parseInt(query.limit) || 20;
  const data = await securityService.getRecentUploads(limit);
  return reply.send({ data });
}

export async function getSecurityAlertsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const limit = parseInt(query.limit) || 10;
  const data = await securityService.getRecentSecurityAlerts(limit);
  return reply.send({ data });
}

export async function getOrganisationSecurityHandler(_request: FastifyRequest, reply: FastifyReply) {
  const data = await securityService.getOrganisationSecurity();
  return reply.send({ data });
}

export async function getRoleAuditHandler(_request: FastifyRequest, reply: FastifyReply) {
  const data = await securityService.getRoleAuditLog();
  return reply.send({ data });
}

export async function getRedisInfoHandler(_request: FastifyRequest, reply: FastifyReply) {
  const data = await securityService.getRedisInfo();
  return reply.send({ data });
}

export async function getSystemHealthHandler(_request: FastifyRequest, reply: FastifyReply) {
  const health = await getHealth();
  const redisInfo = await securityService.getRedisInfo();
  return reply.send({ data: { ...health, redisInfo } });
}
