import type { FastifyInstance } from 'fastify';
import { authMiddleware, adminGuard, eitherRoleOrPermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './organisation.controller.js';
import { registerOrgPortalRoutes } from './org-portal.routes.js';

const branchGuard = eitherRoleOrPermission(['super_admin', 'super-admin'], ['organisations.edit.branches']);
const branchFinancialGuard = eitherRoleOrPermission(
  ['super_admin', 'super-admin'],
  ['organisations.edit.branches', 'branches.edit.financial'],
);

export async function organisationRoutes(app: FastifyInstance): Promise<void> {
  // Public sports lists (no auth)
  app.get('/sports', { preHandler: [] }, ctrl.getSportsHandler);
  app.get('/sports/marketplace', { preHandler: [] }, ctrl.getMarketplaceSportsHandler);

  app.addHook('preHandler', authMiddleware);
  app.get('/sports/all', { preHandler: [adminGuard] }, ctrl.getAllSportsHandler);
  app.get('/sports/:id', ctrl.getSportHandler);
  app.post('/sports', { preHandler: [adminGuard] }, ctrl.createSportHandler);
  app.put('/sports/:id', { preHandler: [adminGuard] }, ctrl.updateSportHandler);
  app.delete('/sports/:id', { preHandler: [adminGuard] }, ctrl.deleteSportHandler);

  // Organisation types
  app.get('/organisation-types', ctrl.getOrganisationTypesHandler);
  app.post('/organisation-types', { preHandler: [adminGuard] }, ctrl.createOrganisationTypeHandler);
  app.put('/organisation-types/:id', { preHandler: [adminGuard] }, ctrl.updateOrganisationTypeHandler);
  app.delete('/organisation-types/:id', { preHandler: [adminGuard] }, ctrl.deleteOrganisationTypeHandler);

  // Organisations
  app.get('/organisations', ctrl.listOrganisationsHandler);
  app.get('/organisations/:id/storefront', ctrl.getStorefrontHandler);
  app.get('/organisations/:id', ctrl.getOrganisationHandler);
  app.post('/organisations', { preHandler: [adminGuard] }, ctrl.createOrganisationHandler);
  app.put('/organisations/:id', { preHandler: [adminGuard] }, ctrl.updateOrganisationHandler);
  app.delete('/organisations/:id', { preHandler: [adminGuard] }, ctrl.deleteOrganisationHandler);

  // Branches
  app.get('/organisations/:orgId/branches', ctrl.listBranchesHandler);
  app.get('/branches', ctrl.listBranchesBySportHandler);
  app.get('/branches/:id', ctrl.getBranchHandler);
  app.post('/branches', { preHandler: [branchGuard] }, ctrl.createBranchHandler);
  app.put('/branches/:id', { preHandler: [branchGuard] }, ctrl.updateBranchHandler);
  app.delete('/branches/:id', { preHandler: [branchGuard] }, ctrl.deleteBranchHandler);
  app.get('/branches/:branchId/financial-details', { preHandler: [branchFinancialGuard] }, ctrl.getBranchFinancialDetailsHandler);
  app.put('/branches/:branchId/financial-details', { preHandler: [branchFinancialGuard] }, ctrl.upsertBranchFinancialDetailsHandler);

  // Branch access requests
  app.get('/branches/:branchId/access-requests', { preHandler: [adminGuard] }, ctrl.getAccessRequestsHandler);
  app.post('/branches/:branchId/approve/:playerId', { preHandler: [adminGuard] }, ctrl.approveAccessHandler);
  app.post('/branches/:branchId/reject/:playerId', { preHandler: [adminGuard] }, ctrl.rejectAccessHandler);
  app.post('/branches/:branchId/request-access', ctrl.requestAccessHandler);
  app.get('/branches/:branchId/my-access', ctrl.getMyAccessHandler);
  app.get('/admin/branch-access-requests', { preHandler: [adminGuard] }, ctrl.getAllAccessRequestsHandler);
  app.put('/branches/:branchId/access/:playerId', { preHandler: [adminGuard] }, ctrl.updateAccessStatusHandler);

  // Resource types
  app.get('/resource-types', ctrl.getResourceTypesHandler);
  app.post('/resource-types', { preHandler: [adminGuard] }, ctrl.createResourceTypeHandler);

  // Resources
  app.get('/branches/:branchId/resources', ctrl.listResourcesHandler);
  app.get('/resources/:id', ctrl.getResourceHandler);
  app.post('/resources', { preHandler: [adminGuard] }, ctrl.createResourceHandler);
  app.put('/resources/:id', { preHandler: [adminGuard] }, ctrl.updateResourceHandler);
  app.delete('/resources/:id', { preHandler: [adminGuard] }, ctrl.deleteResourceHandler);

  // Amenities
  app.get('/amenities', ctrl.listAmenitiesHandler);
  app.get('/branches/:id/amenities', ctrl.getBranchAmenitiesHandler);
  app.put('/branches/:id/amenities', { preHandler: [branchGuard] }, ctrl.setBranchAmenitiesHandler);

  // Subscription plans
  app.get('/subscription-plans', ctrl.listSubscriptionPlansHandler);
  app.get('/subscription-plans/all', { preHandler: [adminGuard] }, ctrl.listAllPlansHandler);
  app.get('/subscription-plans/:id', ctrl.getPlanHandler);
  app.post('/subscription-plans', { preHandler: [adminGuard] }, ctrl.createPlanHandler);
  app.put('/subscription-plans/:id', { preHandler: [adminGuard] }, ctrl.updatePlanHandler);
  app.delete('/subscription-plans/:id', { preHandler: [adminGuard] }, ctrl.deletePlanHandler);
  app.patch('/subscription-plans/:id/toggle', { preHandler: [adminGuard] }, ctrl.togglePlanHandler);
  app.get('/subscription-features', { preHandler: [adminGuard] }, ctrl.listSubscriptionFeaturesHandler);
  app.get('/organisations/:orgId/subscription', ctrl.getOrgSubscriptionHandler);
  app.put('/organisations/:orgId/subscription', { preHandler: [adminGuard] }, ctrl.updateOrgSubscriptionHandler);
  app.post('/organisations/:orgId/subscription/activate', { preHandler: [adminGuard] }, ctrl.activateSubscriptionHandler);
  app.get('/admin/organisation-subscriptions', { preHandler: [adminGuard] }, ctrl.getAllOrgSubscriptionsHandler);

  // Payment Methods Admin
  app.get('/admin/payment-methods', { preHandler: [adminGuard] }, ctrl.getAllPaymentMethodsHandler);
  app.post('/admin/payment-methods', { preHandler: [adminGuard] }, ctrl.createPaymentMethodHandler);
  app.put('/admin/payment-methods/:id', { preHandler: [adminGuard] }, ctrl.updatePaymentMethodHandler);
  app.delete('/admin/payment-methods/:id', { preHandler: [adminGuard] }, ctrl.deletePaymentMethodHandler);

  // Payment Gateway Config Admin
  app.get('/admin/payment-gateways', { preHandler: [adminGuard] }, ctrl.listGatewayConfigsHandler);
  app.post('/admin/payment-gateways', { preHandler: [adminGuard] }, ctrl.createGatewayConfigHandler);
  app.put('/admin/payment-gateways/:id', { preHandler: [adminGuard] }, ctrl.updateGatewayConfigHandler);
  app.delete('/admin/payment-gateways/:id', { preHandler: [adminGuard] }, ctrl.deleteGatewayConfigHandler);

  // Cancellation Policies
  app.get('/organisations/:orgId/cancellation-policies', { preHandler: [adminGuard] }, ctrl.getOrgPoliciesHandler);
  app.get('/organisations/:orgId/cancellation-settings', { preHandler: [adminGuard] }, ctrl.getOrgPolicySettingsHandler);
  app.put('/organisations/:orgId/cancellation-settings', { preHandler: [adminGuard] }, ctrl.updateOrgPolicySettingsHandler);
  app.get('/branches/:branchId/cancellation-policies', { preHandler: [branchGuard] }, ctrl.getBranchPoliciesHandler);
  app.post('/cancellation-policies', { preHandler: [adminGuard] }, ctrl.createPolicyHandler);
  app.put('/cancellation-policies/:id', { preHandler: [adminGuard] }, ctrl.updatePolicyHandler);
  app.delete('/cancellation-policies/:id', { preHandler: [adminGuard] }, ctrl.deletePolicyHandler);

  // Branch Holidays
  app.get('/branches/:branchId/holidays', { preHandler: [branchGuard] }, ctrl.getBranchHolidaysHandler);
  app.post('/branches/:branchId/holidays', { preHandler: [branchGuard] }, ctrl.createBranchHolidayHandler);
  app.put('/branches/holidays/:id', { preHandler: [branchGuard] }, ctrl.updateBranchHolidayHandler);
  app.delete('/branches/holidays/:id', { preHandler: [branchGuard] }, ctrl.deleteBranchHolidayHandler);

  // Resource Maintenance
  app.get('/resources/:resourceId/maintenance', { preHandler: [adminGuard] }, ctrl.getResourceMaintenanceHandler);
  app.post('/resources/:resourceId/maintenance', { preHandler: [adminGuard] }, ctrl.createResourceMaintenanceHandler);
  app.put('/resources/maintenance/:id', { preHandler: [adminGuard] }, ctrl.updateResourceMaintenanceHandler);
  app.delete('/resources/maintenance/:id', { preHandler: [adminGuard] }, ctrl.deleteResourceMaintenanceHandler);

  // Resource Peak Hours
  app.put('/resources/:resourceId/peak-hours', { preHandler: [adminGuard] }, ctrl.upsertResourcePeakHoursHandler);

  // Admin subscription requests
  app.get('/admin/subscription-requests', { preHandler: [adminGuard] }, ctrl.listSubscriptionRequestsHandler);
  app.post('/admin/subscription-requests/:requestId/approve', { preHandler: [adminGuard] }, ctrl.approveSubscriptionRequestHandler);
  app.post('/admin/subscription-requests/:requestId/reject', { preHandler: [adminGuard] }, ctrl.rejectSubscriptionRequestHandler);

  // Org portal (self-service under /org/:orgId — merged from legacy `modules/org`)
  await registerOrgPortalRoutes(app);
}
