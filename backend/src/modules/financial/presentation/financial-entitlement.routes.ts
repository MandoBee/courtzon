import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import { financialEntitlementService } from '../application/financial-entitlement.service.js';
import { assertOrgAccess, assertSettlementOrgAccess } from '../../settlement/presentation/unified-settlement.controller.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('financial-entitlement-routes');

/**
 * Read entitlements linked to a settlement.
 *
 * SECURITY: the settlement's owning organisation is resolved from the canonical
 * settlement record (never from client input) and the actor is authorised
 * BEFORE any entitlement row is read. Denial uses the same 404/403 policy as
 * `unified-settlement.controller.ts`, so an unauthorised caller cannot learn
 * settlement/entitlement data from the response body.
 */
export async function getSettlementEntitlementsHandler(request: any, reply: any) {
  const { settlementId } = request.params as any;
  const userId = (request as any).userId;
  await assertSettlementOrgAccess(userId, Number(settlementId));
  const entitlements = await financialEntitlementService.getSettlementEntitlements(Number(settlementId));
  return reply.send(entitlements);
}

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
    const orgId = Number(organisationId);
    if (!Number.isInteger(orgId) || orgId <= 0) {
      return reply.status(400).send({ error: 'organisationId must be a positive integer' });
    }
    // SECURITY: authorise against the requested organisation BEFORE reading rows.
    await assertOrgAccess((request as any).userId, orgId);
    const result = await financialEntitlementService.getOrganisationEntitlements(
      orgId,
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
    // SECURITY: ownership comes from the stored record, never from the client.
    await assertOrgAccess((request as any).userId, Number(entitlement.organisation_id));
    return reply.send(entitlement);
  });

  // Get entitlement by public_id
  app.get('/entitlements/public/:publicId', {
    preHandler: [requirePermission(['financial.entitlements.view'])],
  }, async (request: any, reply: any) => {
    const { publicId } = request.params as any;
    const entitlement = await financialEntitlementService.getEntitlementByPublicId(publicId);
    if (!entitlement) return reply.status(404).send({ error: 'Entitlement not found' });
    // SECURITY: the UUID lookup is unchanged; ownership is enforced afterwards.
    await assertOrgAccess((request as any).userId, Number(entitlement.organisation_id));
    return reply.send(entitlement);
  });

  // Get entitlements by source (e.g., all entitlements for a booking)
  app.get('/entitlements/source/:sourceType/:sourceId', {
    preHandler: [requirePermission(['financial.entitlements.view'])],
  }, async (request: any, reply: any) => {
    const { sourceType, sourceId } = request.params as any;
    const entitlements = await financialEntitlementService.getEntitlementsBySource(sourceType, Number(sourceId));
    // Preserve the existing empty response.
    if (!entitlements.length) return reply.send(entitlements);
    // SECURITY: fail closed if ANY row belongs to an inaccessible organisation —
    // never return a partial cross-tenant result.
    const orgIds = [...new Set(entitlements.map((e: any) => Number(e.organisation_id)))];
    for (const orgId of orgIds) {
      await assertOrgAccess((request as any).userId, orgId);
    }
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
    const orgId = Number(organisationId);
    if (!Number.isInteger(orgId) || orgId <= 0) {
      return reply.status(400).send({ error: 'organisationId must be a positive integer' });
    }
    // SECURITY: authorise BEFORE any balance read.
    await assertOrgAccess((request as any).userId, orgId);
    const pending = await financialEntitlementService.getOrganisationBalance(orgId, 'PENDING');
    const available = await financialEntitlementService.getOrganisationBalance(orgId, 'AVAILABLE');
    const onHold = await financialEntitlementService.getOrganisationBalance(orgId, 'ON_HOLD');
    const settled = await financialEntitlementService.getOrganisationBalance(orgId, 'SETTLED');
    const cancelled = await financialEntitlementService.getOrganisationBalance(orgId, 'CANCELLED');
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
  }, getSettlementEntitlementsHandler);

  log.info('Financial entitlement routes registered');
}
