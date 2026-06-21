import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import { auditLogService } from '../application/audit-log.service.js';

export async function auditLogRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/admin/audit-logs',
    { preHandler: [authMiddleware, requirePermission(['audit.view'])] },
    async (request, reply) => {
      const query = request.query as any;
      const limit = parseInt(query.limit) || 30;
      const offset = parseInt(query.offset) || 0;
      const page = parseInt(query.page) || 1;
      const computedOffset = query.offset !== undefined ? offset : (page - 1) * limit;

      const result = await auditLogService.findByFilters({
        entityType: query.entityType as string || undefined,
        action: query.action as string || undefined,
        actorId: query.actorId ? parseInt(query.actorId) : undefined,
        dateFrom: query.dateFrom as string || undefined,
        dateTo: query.dateTo as string || undefined,
        ipAddress: query.ipAddress as string || undefined,
        limit,
        offset: computedOffset,
      });

      return reply.send({ data: result.rows, total: result.total, limit, offset: computedOffset });
    }
  );
}
