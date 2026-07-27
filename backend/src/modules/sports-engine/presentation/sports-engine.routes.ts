import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './sports-engine.controller.js';

export async function sportsEngineRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Rankings
  app.get('/sports-engine/rankings', { preHandler: [requirePermission(['sports-engine.view'])] }, ctrl.getRankingsHandler);
  app.post('/sports-engine/rankings/calculate', { preHandler: [requirePermission(['sports-engine.manage'])] }, ctrl.calculateEloHandler);

  // Schedule Optimization
  app.get('/sports-engine/optimize/schedule', { preHandler: [requirePermission(['sports-engine.view'])] }, ctrl.getOptimizedScheduleHandler);

  // Sports Analytics
  app.get('/sports-engine/analytics/player/:id', { preHandler: [requirePermission(['sports-engine.view'])] }, ctrl.getPlayerAnalyticsHandler);
  app.get('/sports-engine/analytics/match-quality', { preHandler: [requirePermission(['sports-engine.view'])] }, ctrl.getMatchQualityHandler);
  app.get('/sports-engine/analytics/trends', { preHandler: [requirePermission(['sports-engine.view'])] }, ctrl.getSportsTrendsHandler);

  // Recommendations
  app.get('/sports-engine/recommend/partners', { preHandler: [requirePermission(['sports-engine.view'])] }, ctrl.getPartnerRecommendationsHandler);
  app.get('/sports-engine/recommend/coaches', { preHandler: [requirePermission(['sports-engine.view'])] }, ctrl.getCoachRecommendationsHandler);
}
