import type { FastifyInstance } from 'fastify';
import { authMiddleware, requireRole } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './membership.controller.js';

const adminGuard = requireRole(['super_admin', 'super-admin', 'org-admin']);

export async function membershipRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Player-facing
  app.get('/membership/plans', ctrl.getPlansHandler);
  app.get('/membership/plans/:id', ctrl.getPlanHandler);
  app.post('/membership/subscribe', ctrl.subscribeHandler);
  app.get('/membership/my', ctrl.getMyMembershipsHandler);
  app.get('/membership/active', ctrl.getActiveMembershipHandler);
  app.get('/membership/loyalty', ctrl.getLoyaltyHandler);
  app.post('/membership/earn', ctrl.earnPointsHandler);
  app.get('/membership/rewards', ctrl.getRewardsHandler);
  app.post('/membership/rewards/claim', ctrl.claimRewardHandler);

  // Admin
  app.post('/admin/membership/plans', { preHandler: [adminGuard] }, ctrl.createPlanHandler);
  app.get('/admin/membership/campaigns', { preHandler: [adminGuard] }, ctrl.getCampaignsHandler);
  app.post('/admin/membership/campaigns', { preHandler: [adminGuard] }, ctrl.createCampaignHandler);
  app.post('/admin/membership/rewards', { preHandler: [adminGuard] }, ctrl.createRewardHandler);
}
