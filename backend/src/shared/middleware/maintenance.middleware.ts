import type { FastifyRequest, FastifyReply } from 'fastify';
import { rbacRepository } from '../../modules/rbac/infrastructure/repositories/rbac.repository.js';

const WHITELIST = [
  '/health',
  '/metrics',
  '/auth/',
  '/public/',
  '/uploads/',
  '/feature-flags',
  '/feature-flags/',
];

export async function maintenanceMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const url = request.url;
  if (WHITELIST.some((p) => url.startsWith(p))) return;
  const enabled = await rbacRepository.isFeatureEnabled('app.maintenance_mode');
  if (!enabled) return;
  return reply.status(503).send({
    error: 'MAINTENANCE_MODE',
    message: 'The application is currently undergoing maintenance. Please check back shortly.',
  });
}
