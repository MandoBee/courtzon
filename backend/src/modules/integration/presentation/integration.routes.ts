import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import { apiKeyAuth } from '../middleware/api-key-auth.js';
import * as ctrl from './integration.controller.js';

export async function apiGatewayRoutes(app: FastifyInstance): Promise<void> {

  // ── API Key Management (admin, internal auth) ──
  app.addHook('preHandler', authMiddleware);
  app.post('/api/v1/api-keys', { preHandler: [requirePermission(['integration.api-keys.manage'])] }, ctrl.createApiKeyHandler);
  app.get('/api/v1/api-keys', { preHandler: [requirePermission(['integration.api-keys.view'])] }, ctrl.listApiKeysHandler);
  app.delete('/api/v1/api-keys/:id', { preHandler: [requirePermission(['integration.api-keys.manage'])] }, ctrl.revokeApiKeyHandler);

  // ── Public API Gateway (api-key auth) ──
  // These routes use apiKeyAuth middleware which accepts EITHER
  // a valid API key (X-API-Key header) OR standard session auth.

  app.get('/api/v1/bookings', { preHandler: [apiKeyAuth] }, ctrl.gatewayListBookingsHandler);
  app.get('/api/v1/bookings/:id', { preHandler: [apiKeyAuth] }, ctrl.gatewayGetBookingHandler);
  app.get('/api/v1/organisations', { preHandler: [apiKeyAuth] }, ctrl.gatewayListOrganisationsHandler);
  app.get('/api/v1/tournaments', { preHandler: [apiKeyAuth] }, ctrl.gatewayListTournamentsHandler);
  app.get('/api/v1/tournaments/:id', { preHandler: [apiKeyAuth] }, ctrl.gatewayGetTournamentHandler);
  app.get('/api/v1/academy/programs', { preHandler: [apiKeyAuth] }, ctrl.gatewayListAcademyProgramsHandler);
  app.get('/api/v1/marketplace/products', { preHandler: [apiKeyAuth] }, ctrl.gatewayListProductsHandler);
  app.get('/api/v1/leagues', { preHandler: [apiKeyAuth] }, ctrl.gatewayListLeaguesHandler);
}
