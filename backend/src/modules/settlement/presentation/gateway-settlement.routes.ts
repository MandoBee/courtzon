import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import {
  listEligibleGatewaySettlementsHandler,
  createGatewaySettlementHandler,
  listGatewaySettlementsHandler,
  getGatewaySettlementHandler,
  reverseGatewaySettlementHandler,
} from './gateway-settlement.controller.js';

export async function gatewaySettlementRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Admin "Receive Gateway Settlement" workflow.
  app.get('/admin/gateway-settlements/eligible', { preHandler: [requirePermission(['financial.gateway-settlement.view'])] }, listEligibleGatewaySettlementsHandler);
  app.get('/admin/gateway-settlements', { preHandler: [requirePermission(['financial.gateway-settlement.view'])] }, listGatewaySettlementsHandler);
  app.get('/admin/gateway-settlements/:id', { preHandler: [requirePermission(['financial.gateway-settlement.view'])] }, getGatewaySettlementHandler);
  app.post('/admin/gateway-settlements', { preHandler: [requirePermission(['financial.gateway-settlement.create'])] }, createGatewaySettlementHandler);
  app.post('/admin/gateway-settlements/:id/reverse', { preHandler: [requirePermission(['financial.gateway-settlement.reverse'])] }, reverseGatewaySettlementHandler);
}