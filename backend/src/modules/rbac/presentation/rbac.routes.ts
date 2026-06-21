import type { FastifyInstance } from 'fastify';
import { authMiddleware, requireRole, adminGuard, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './rbac.controller.js';

const superAdminGuard = requireRole(['super_admin', 'super-admin']);
export async function rbacRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Permissions — super admin only
  app.get('/permission-modules', { preHandler: [superAdminGuard] }, ctrl.getModulesHandler);
  app.get('/permissions', { preHandler: [superAdminGuard] }, ctrl.getPermissionsHandler);
  app.post('/permissions', { preHandler: [superAdminGuard] }, ctrl.createPermissionHandler);
  app.put('/permissions/:id', { preHandler: [superAdminGuard] }, ctrl.updatePermissionHandler);
  app.delete('/permissions/:id', { preHandler: [superAdminGuard] }, ctrl.deletePermissionHandler);

  // Roles — super admin only
  app.get('/roles', { preHandler: [superAdminGuard] }, ctrl.getRolesHandler);
  app.get('/roles/:id', { preHandler: [superAdminGuard] }, ctrl.getRoleHandler);
  app.post('/roles', { preHandler: [superAdminGuard] }, ctrl.createRoleHandler);
  app.put('/roles/:id', { preHandler: [superAdminGuard] }, ctrl.updateRoleHandler);
  app.delete('/roles/:id', { preHandler: [superAdminGuard] }, ctrl.deleteRoleHandler);
  app.put('/roles/:id/restore', { preHandler: [superAdminGuard] }, ctrl.restoreRoleHandler);
  app.put('/roles/:id/permissions', { preHandler: [superAdminGuard] }, ctrl.setRolePermissionsHandler);

  // Users — admin can list, super admin can manage
  app.get('/admin/users', { preHandler: [adminGuard] }, ctrl.listUsersHandler);
  app.get('/admin/users/:id', { preHandler: [adminGuard] }, ctrl.getUserHandler);
  app.put('/admin/users/:id', { preHandler: [superAdminGuard] }, ctrl.updateUserHandler);
  app.delete('/admin/users/:id', { preHandler: [adminGuard, requirePermission(['users.delete'])] }, ctrl.deleteUserHandler);
  app.get('/admin/users/:id/bookings', { preHandler: [adminGuard] }, ctrl.getUserBookingsHandler);
  app.get('/admin/users/:id/academies', { preHandler: [adminGuard] }, ctrl.getUserAcademyEnrollmentsHandler);
  app.get('/admin/users/:id/orders', { preHandler: [adminGuard] }, ctrl.getUserOrdersHandler);
  app.get('/admin/users/:id/activity', { preHandler: [adminGuard] }, ctrl.getUserActivityHandler);
  app.get('/admin/users/:id/organisations', { preHandler: [adminGuard] }, ctrl.getUserOrganisationsHandler);
  app.get('/admin/users/:id/branch-access', { preHandler: [adminGuard] }, ctrl.getUserBranchAccessHandler);
  app.put('/admin/users/:id/password', { preHandler: [superAdminGuard] }, ctrl.changeUserPasswordHandler);
  app.get('/admin/bookings/:bookingId', { preHandler: [adminGuard] }, ctrl.getUserBookingDetailHandler);
  app.get('/admin/orders/:orderId', { preHandler: [adminGuard] }, ctrl.getUserOrderDetailHandler);
  // Coach approval — super admin only
  app.patch('/admin/users/:id/coach/approve', { preHandler: [superAdminGuard] }, ctrl.approveCoachHandler);
  app.patch('/admin/users/:id/coach/reject', { preHandler: [superAdminGuard] }, ctrl.rejectCoachHandler);

  // User-Role assignments — super admin only
  app.post('/user-roles', { preHandler: [superAdminGuard] }, ctrl.assignRoleHandler);
  app.delete('/user-roles/:userId/:roleId', { preHandler: [superAdminGuard] }, ctrl.removeUserRoleHandler);
  app.get('/users/:userId/roles', { preHandler: [superAdminGuard] }, ctrl.getUserRolesHandler);

  // Reference data
  app.get('/player-levels', ctrl.getPlayerLevelsHandler);

  // My scopes — any authenticated user (player can see own scopes)
  app.get('/my/scopes', ctrl.getUserScopesHandler);

  // Feature flags — admin can view and toggle, super admin can create/update/delete
  app.get('/feature-flags', { preHandler: [adminGuard] }, ctrl.getFeatureFlagsHandler);
  app.patch('/feature-flags/:id/toggle', { preHandler: [adminGuard] }, ctrl.toggleFlagHandler);
  app.post('/feature-flags', { preHandler: [superAdminGuard] }, ctrl.createFlagHandler);
  app.put('/feature-flags/:id', { preHandler: [superAdminGuard] }, ctrl.updateFlagHandler);
  app.delete('/feature-flags/:id', { preHandler: [superAdminGuard] }, ctrl.deleteFlagHandler);

  // Dashboard — super admin stats (accept both hyphen and underscore forms)
  const dashboardGuard = requireRole(['super_admin', 'super-admin']);
  app.get('/admin/dashboard', { preHandler: [dashboardGuard] }, ctrl.getDashboardStatsHandler);
  app.get('/admin/dashboard/trends', { preHandler: [dashboardGuard] }, ctrl.getDashboardTrendsHandler);

  // UI Permissions — super admin only
  app.get('/ui-permissions', { preHandler: [superAdminGuard] }, ctrl.getUIPermissionsHandler);
  app.post('/ui-permissions/sync', { preHandler: [superAdminGuard] }, ctrl.syncUIRegistryHandler);

  // My permissions — any authenticated user
  app.get('/my/permissions', ctrl.getMyPermissionsHandler);
}
