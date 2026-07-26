import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './membership.controller.js';

export async function membershipRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── Plans ──
  app.get('/admin/membership/plans', { preHandler: [requirePermission(['membership.view'])] }, ctrl.listPlansHandler);
  app.get('/admin/membership/plans/options', { preHandler: [requirePermission(['membership.view'])] }, ctrl.getPlanOptionsHandler);
  app.get('/admin/membership/plans/:id', { preHandler: [requirePermission(['membership.view'])] }, ctrl.getPlanHandler);
  app.post('/admin/membership/plans', { preHandler: [requirePermission(['membership.create'])] }, ctrl.createPlanHandler);
  app.put('/admin/membership/plans/:id', { preHandler: [requirePermission(['membership.update'])] }, ctrl.updatePlanHandler);
  app.delete('/admin/membership/plans/:id', { preHandler: [requirePermission(['membership.delete'])] }, ctrl.deletePlanHandler);

  // ── User assignments ──
  app.get('/admin/membership/assignments', { preHandler: [requirePermission(['membership.view'])] }, ctrl.listAssignmentsHandler);
  app.post('/admin/membership/assign', { preHandler: [requirePermission(['membership.assign'])] }, ctrl.assignMembershipHandler);
  app.get('/admin/membership/assignments/:id', { preHandler: [requirePermission(['membership.view'])] }, ctrl.getUserMembershipHandler);
  app.post('/admin/membership/:id/freeze', { preHandler: [requirePermission(['membership.manage'])] }, ctrl.freezeMembershipHandler);
  app.post('/admin/membership/:id/resume', { preHandler: [requirePermission(['membership.manage'])] }, ctrl.resumeMembershipHandler);
  app.post('/admin/membership/:id/cancel', { preHandler: [requirePermission(['membership.manage'])] }, ctrl.cancelMembershipHandler);
  app.post('/admin/membership/:id/renew', { preHandler: [requirePermission(['membership.manage'])] }, ctrl.renewMembershipHandler);
  app.get('/admin/membership/:id/history', { preHandler: [requirePermission(['membership.view'])] }, ctrl.getMembershipHistoryHandler);
}
