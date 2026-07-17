import type { FastifyInstance } from 'fastify';
import { requireOrganisationAccess, requireOrgManageAccess, requireOrgScopedPermission } from '../../../shared/middleware/route-guard.js';
import * as ctrl from './org-portal.controller.js';
import * as adminCtrl from './organisation.controller.js';

/** Org-owner self-service routes (`/org/:orgId/*`). Registered from organisation.routes (auth already applied). */
export async function registerOrgPortalRoutes(app: FastifyInstance): Promise<void> {
  const orgAccessGuard = requireOrganisationAccess('orgId');
  const orgManageGuard = requireOrgManageAccess('orgId');

  app.get('/org/:orgId/info', { preHandler: [orgAccessGuard] }, ctrl.getOrgInfoHandler);
  app.put('/org/:orgId/info', { preHandler: [orgAccessGuard] }, ctrl.updateOrgInfoHandler);
  app.get('/org/:orgId/stats', { preHandler: [orgAccessGuard] }, ctrl.getOrgStatsHandler);
  app.get('/org/:orgId/bookings', { preHandler: [orgAccessGuard] }, ctrl.getOrgBookingsHandler);
  app.get('/org/:orgId/resources', { preHandler: [orgAccessGuard] }, ctrl.getOrgResourcesHandler);
  app.get('/org/:orgId/products', { preHandler: [orgAccessGuard] }, ctrl.getOrgProductsHandler);

   // Org self-service: branches (owner/club-admin can manage their own — D1-D3)
  app.get('/org/:orgId/branches', { preHandler: [orgAccessGuard] }, ctrl.listOrgBranchesHandler);
  app.post('/org/:orgId/branches', { preHandler: [orgAccessGuard] }, ctrl.createOrgBranchHandler);
  app.put('/org/:orgId/branches/:branchId', { preHandler: [orgAccessGuard] }, ctrl.updateOrgBranchHandler);
  app.delete('/org/:orgId/branches/:branchId', { preHandler: [orgAccessGuard] }, ctrl.deleteOrgBranchHandler);
  app.get('/org/:orgId/branches/:branchId/financial-details', { preHandler: [orgAccessGuard] }, ctrl.getOrgBranchFinancialDetailsHandler);
  app.put('/org/:orgId/branches/:branchId/financial-details', { preHandler: [orgAccessGuard] }, ctrl.updateOrgBranchFinancialDetailsHandler);

  // Org self-service: resources
  app.post('/org/:orgId/resources', { preHandler: [orgAccessGuard] }, ctrl.createOrgResourceHandler);
  app.put('/org/:orgId/resources/:resourceId', { preHandler: [orgAccessGuard] }, ctrl.updateOrgResourceHandler);
  app.delete('/org/:orgId/resources/:resourceId', { preHandler: [orgAccessGuard] }, ctrl.deleteOrgResourceHandler);

   // Org self-service: staff management (D5) — elevated (owner/club-admin only)
  app.get('/org/:orgId/staff', { preHandler: [orgManageGuard] }, ctrl.listOrgStaffHandler);
  app.post('/org/:orgId/staff', { preHandler: [orgManageGuard] }, ctrl.addOrgStaffHandler);
  app.put('/org/:orgId/staff/:userId', { preHandler: [orgManageGuard] }, ctrl.changeOrgStaffRoleHandler);
  app.delete('/org/:orgId/staff/:userId', { preHandler: [orgManageGuard] }, ctrl.removeOrgStaffHandler);
  app.get('/org/:orgId/staff/:userId/permissions', { preHandler: [orgManageGuard] }, ctrl.getStaffPermissionsHandler);
  app.put('/org/:orgId/staff/:userId/permissions', { preHandler: [orgManageGuard] }, ctrl.updateStaffPermissionsHandler);
  app.get('/org/:orgId/role-templates/:slug/permissions', { preHandler: [orgManageGuard] }, ctrl.getTemplateRolePermissionsHandler);

  // Org self-service: coach agreements / invites (D6) — elevated
  app.get('/org/:orgId/coaches', { preHandler: [orgManageGuard] }, ctrl.listOrgCoachesHandler);
  app.get('/org/:orgId/coaches/directory', { preHandler: [orgManageGuard] }, ctrl.listInvitableCoachesHandler);
  app.post('/org/:orgId/coaches/invite', { preHandler: [orgManageGuard] }, ctrl.inviteCoachHandler);
  app.put('/org/:orgId/coaches/:coachId/respond', { preHandler: [orgManageGuard] }, ctrl.respondOrgCoachHandler);
  app.delete('/org/:orgId/coaches/:coachId', { preHandler: [orgManageGuard] }, ctrl.removeOrgCoachHandler);

  // Org self-service: cancellation settings
  app.get('/org/:orgId/cancellation-settings', { preHandler: [orgAccessGuard] }, ctrl.getOrgPolicySettingsHandler);
  app.put('/org/:orgId/cancellation-settings', { preHandler: [orgAccessGuard] }, ctrl.updateOrgPolicySettingsHandler);

  // Facility members — branch_player_access (D8)
  const membersManageGuard = requireOrgScopedPermission('org.members.manage');
  app.get('/org/:orgId/members', { preHandler: [orgAccessGuard] }, ctrl.listOrgMembersHandler);
  app.put('/org/:orgId/members/:branchId/:playerId', { preHandler: [orgAccessGuard, membersManageGuard] }, ctrl.updateOrgMemberAccessHandler);

  // Branch cancellation policy CRUD (org self-service)
  app.get('/org/:orgId/branches/:branchId/cancellation-policies', { preHandler: [orgAccessGuard] }, adminCtrl.getBranchPoliciesHandler);
  app.post('/org/:orgId/branches/:branchId/cancellation-policies', { preHandler: [orgAccessGuard] }, adminCtrl.createPolicyHandler);
  app.put('/org/:orgId/branches/:branchId/cancellation-policies/:id', { preHandler: [orgAccessGuard] }, adminCtrl.updatePolicyHandler);
  app.delete('/org/:orgId/branches/:branchId/cancellation-policies/:id', { preHandler: [orgAccessGuard] }, adminCtrl.deletePolicyHandler);

  // Subscription requests (org self-service)
  app.get('/org/:orgId/subscription', { preHandler: [orgAccessGuard] }, ctrl.getOrgSubscriptionHandler);
  app.get('/org/:orgId/subscription/available-plans', { preHandler: [orgAccessGuard] }, ctrl.getAvailablePlansHandler);
  app.post('/org/:orgId/subscription/request', { preHandler: [orgAccessGuard] }, ctrl.submitSubscriptionRequestHandler);

  // Finance
  app.get('/org/:orgId/transactions', { preHandler: [orgAccessGuard] }, ctrl.getOrgTransactionsHandler);
  app.get('/org/:orgId/settlements', { preHandler: [orgAccessGuard] }, ctrl.getOrgSettlementsHandler);
  app.get('/org/:orgId/settlements/:settlementId', { preHandler: [orgAccessGuard] }, ctrl.getOrgSettlementDetailHandler);
}
