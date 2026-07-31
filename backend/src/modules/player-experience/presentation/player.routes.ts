import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './player.controller.js';

export async function playerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/players/my/dashboard', { preHandler: [requirePermission(['player.dashboard.view'])] }, ctrl.getDashboardHandler);
  app.get('/players/my/upcoming', { preHandler: [requirePermission(['player.dashboard.view'])] }, ctrl.getUpcomingHandler);
  app.get('/players/my/statistics', { preHandler: [requirePermission(['player.statistics.view'])] }, ctrl.getStatisticsHandler);
  app.get('/players/my/qr-profile', { preHandler: [requirePermission(['player.qr.view'])] }, ctrl.getQRProfileHandler);

  app.get('/players/search', { preHandler: [requirePermission(['player.search'])] }, ctrl.searchPlayersHandler);
  app.get('/players/:id/profile', { preHandler: [requirePermission(['player.profile.view'])] }, ctrl.getPlayerProfileHandler);

  app.get('/players/my/favorites/clubs', { preHandler: [requirePermission(['player.favorites.manage'])] }, ctrl.getFavoriteClubsHandler);
  app.post('/players/my/favorites/clubs/:orgId', { preHandler: [requirePermission(['player.favorites.manage'])] }, ctrl.addFavoriteClubHandler);
  app.delete('/players/my/favorites/clubs/:orgId', { preHandler: [requirePermission(['player.favorites.manage'])] }, ctrl.removeFavoriteClubHandler);

  app.get('/players/my/favorites/coaches', { preHandler: [requirePermission(['player.favorites.manage'])] }, ctrl.getFavoriteCoachesHandler);
  app.delete('/players/my/favorites/coaches/:id', { preHandler: [requirePermission(['player.favorites.manage'])] }, ctrl.removeFavoriteCoachHandler);

  app.get('/players/my/devices', { preHandler: [requirePermission(['player.devices.manage'])] }, ctrl.getDevicesHandler);
  app.delete('/players/my/devices/:id', { preHandler: [requirePermission(['player.devices.manage'])] }, ctrl.removeDeviceHandler);

  app.get('/players/my/achievements', { preHandler: [requirePermission(['player.achievements.view'])] }, ctrl.getAchievementsHandler);

  app.get('/my/rank-history', { preHandler: [requirePermission(['player.rank.history'])] }, ctrl.getRankHistoryHandler);
  app.get('/my/tournaments', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.getMyTournamentsHandler);
}
