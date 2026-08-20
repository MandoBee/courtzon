import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import { financialEntitlementService } from '../application/financial-entitlement.service.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('financial-entitlement-routes');

export async function financialEntitlementRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // List entitlements for an organisation
  app.get('/entitlements', {
    preHandler: [requirePermission(['financial.entitlements.view'])],
  }, async (request: any, reply: any) => {
    const { organisationId, status, entitlementType, page = 1, limit = 20 } = request.query as any;
    if (!organisationId) {
      return reply.status(400).send({ error: 'organisationId is required' });
    }
    const result = await financialEntitlementService.getOrganisationEntitlements(
      Number(organisationId),
      { status, entitlementType, page: Number(page), limit: Number(limit) },
    );
    return reply.send(result);
  });

  // Get single entitlement
  app.get('/entitlements/:id', {
    preHandler: [requirePermission(['financial.entitlements.view'])],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any;
    const entitlement = await financialEntitlementService.getEntitlement(Number(id));
    if (!entitlement) return reply.status(404).send({ error: 'Entitlement not found' });
    return reply.send(entitlement);
  });

  // Get entitlement by public_id
  app.get('/entitlements/public/:publicId', {
    preHandler: [requirePermission(['financial.entitlements.view'])],
  }, async (request: any, reply: any) => {
    const { publicId } = request.params as any;
    const entitlement = await financialEntitlementService.getEntitlementByPublicId(publicId);
    if (!entitlement) return reply.status(404).send({ error: 'Entitlement not found' });
    return reply.send(entitlement);
  });

  // Get entitlements by source (e.g., all entitlements for a booking)
  app.get('/entitlements/source/:sourceType/:sourceId', {
    preHandler: [requirePermission(['financial.entitlements.view'])],
  }, async (request: any, reply: any) => {
    const { sourceType, sourceId } = request.params as any;
    const entitlements = await financialEntitlementService.getEntitlementsBySource(sourceType, Number(sourceId));
    return reply.send(entitlements);
  });

  // Bulk hold entitlements by source IDs (e.g., disputed marketplace order_items)
  app.post('/entitlements/hold-by-source', {
    preHandler: [requirePermission(['financial.entitlements.hold'])],
  }, async (request: any, reply: any) => {
    const { sourceType, sourceIds, reason } = request.body as any;
    if (!sourceType || !Array.isArray(sourceIds) || !sourceIds.length) {
      return reply.status(400).send({ error: 'sourceType and non-empty sourceIds[] are required' });
    }
    if (!reason) return reply.status(400).send({ error: 'reason is required' });
    const held = await financialEntitlementService.holdBySourceIds(sourceType, sourceIds.map(Number), reason);
    return reply.send({ success: true, held });
  });

  // Bulk release entitlements by source IDs back to AVAILABLE
  app.post('/entitlements/release-by-source', {
    preHandler: [requirePermission(['financial.entitlements.hold'])],
  }, async (request: any, reply: any) => {
    const { sourceType, sourceIds } = request.body as any;
    if (!sourceType || !Array.isArray(sourceIds) || !sourceIds.length) {
      return reply.status(400).send({ error: 'sourceType and non-empty sourceIds[] are required' });
    }
    const released = await financialEntitlementService.releaseBySourceIds(sourceType, sourceIds.map(Number));
    return reply.send({ success: true, released });
  });

  // Bulk cancel entitlements by source IDs (e.g., partially refunded marketplace items)
  app.post('/entitlements/cancel-by-source', {
    preHandler: [requirePermission(['financial.entitlements.cancel'])],
  }, async (request: any, reply: any) => {
    const { sourceType, sourceIds, reason } = request.body as any;
    if (!sourceType || !Array.isArray(sourceIds) || !sourceIds.length) {
      return reply.status(400).send({ error: 'sourceType and non-empty sourceIds[] are required' });
    }
    if (!reason) return reply.status(400).send({ error: 'reason is required' });
    const cancelled = await financialEntitlementService.cancelBySourceIds(sourceType, sourceIds.map(Number), reason);
    return reply.send({ success: true, cancelled });
  });

  // Get organisation balance summary
  app.get('/entitlements/balance/:organisationId', {
    preHandler: [requirePermission(['financial.entitlements.view'])],
  }, async (request: any, reply: any) => {
    const { organisationId } = request.params as any;
    const pending = await financialEntitlementService.getOrganisationBalance(Number(organisationId), 'PENDING');
    const available = await financialEntitlementService.getOrganisationBalance(Number(organisationId), 'AVAILABLE');
    const onHold = await financialEntitlementService.getOrganisationBalance(Number(organisationId), 'ON_HOLD');
    const settled = await financialEntitlementService.getOrganisationBalance(Number(organisationId), 'SETTLED');
    const cancelled = await financialEntitlementService.getOrganisationBalance(Number(organisationId), 'CANCELLED');
    return reply.send({ pending, available, onHold, settled, cancelled });
  });

  // Hold entitlement (admin)
  app.post('/entitlements/:id/hold', {
    preHandler: [requirePermission(['financial.entitlements.hold'])],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any;
    const { reason } = request.body as any;
    if (!reason) return reply.status(400).send({ error: 'reason is required' });
    await financialEntitlementService.holdEntitlement(Number(id), reason);
    return reply.send({ success: true });
  });

  // Release entitlement (admin)
  app.post('/entitlements/:id/release', {
    preHandler: [requirePermission(['financial.entitlements.hold'])],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any;
    await financialEntitlementService.releaseEntitlement(Number(id));
    return reply.send({ success: true });
  });

  // Cancel entitlement (admin)
  app.post('/entitlements/:id/cancel', {
    preHandler: [requirePermission(['financial.entitlements.cancel'])],
  }, async (request: any, reply: any) => {
    const { id } = request.params as any;
    const { reason } = request.body as any;
    if (!reason) return reply.status(400).send({ error: 'reason is required' });
    await financialEntitlementService.cancelEntitlement(Number(id), reason);
    return reply.send({ success: true });
  });

  // Get entitlements linked to a settlement
  app.get('/entitlements/settlement/:settlementId', {
    preHandler: [requirePermission(['financial.entitlements.view'])],
  }, async (request: any, reply: any) => {
    const { settlementId } = request.params as any;
    const entitlements = await financialEntitlementService.getSettlementEntitlements(Number(settlementId));
    return reply.send(entitlements);
  });

  log.info('Financial entitlement routes registered');
}
