import type { FastifyInstance } from 'fastify';
import { rbacService } from '../application/rbac.service.js';

export async function publicFeatureFlagsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/public/feature-flags', async (_request, reply) => {
    const flags = await rbacService.getEnabledFeatureFlags();
    return reply.send(flags);
  });
}
