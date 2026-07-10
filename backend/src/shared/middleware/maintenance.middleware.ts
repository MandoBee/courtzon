import type { FastifyRequest, FastifyReply } from 'fastify';
import { appSettingsRepository } from '../../modules/app-settings/infrastructure/repositories/app-settings.repository.js';

// Allow notifications and other essential paths during maintenance
const WHITELIST = [
  '/health',
  '/metrics',
  '/auth/',
  '/public/',
  '/uploads/',
  '/notifications/',
  '/feature-flags',
  '/feature-flags/',
];

const CACHE_TTL_MS = 30_000;
let cachedEnabled: boolean | null = null;
let cachedAt = 0;

async function isMaintenanceMode(): Promise<boolean> {
  const now = Date.now();
  if (cachedAt > 0 && now - cachedAt < CACHE_TTL_MS && cachedEnabled !== null) {
    return cachedEnabled;
  }
  try {
    const settings = await appSettingsRepository.listPublic();
    cachedEnabled = settings.maintenance_mode === true;
  } catch {
    cachedEnabled = false;
  }
  cachedAt = Date.now();
  return cachedEnabled;
}

export async function maintenanceMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const url = request.url;
  if (WHITELIST.some((p) => url.startsWith(p))) return;
  const enabled = await isMaintenanceMode();
  if (!enabled) return;
  return reply.status(503).send({
    error: 'MAINTENANCE_MODE',
    message: 'The application is currently undergoing maintenance. Please check back shortly.',
  });
}
