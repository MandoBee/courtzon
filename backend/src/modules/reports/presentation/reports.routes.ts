import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware, requireRole, adminGuard } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './reports.controller.js';
import { getPool } from '../../../database/mysql.js';

const superAdminGuard = requireRole(['super_admin', 'super-admin']);
function reportGuard(permission?: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!permission) return;
    const userId = (request as any).userId;
    if (!userId) return reply.status(401).send({ error: 'AUTHENTICATION_ERROR' });

    try {
      const pool = getPool();
      const [rows] = (await pool.execute(
        `SELECT DISTINCT r.slug FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = ? AND ur.is_active = TRUE
           AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
           AND r.is_active = TRUE AND r.deleted_at IS NULL`,
        [userId]
      )) as unknown as any[];
      const userRoles = rows.map((r: any) => r.slug);
      if (userRoles.includes('super_admin') || userRoles.includes('super-admin')) return;

      const [permRows] = (await pool.execute(
        `SELECT DISTINCT p.permission_key FROM user_roles ur
         JOIN role_permissions rp ON rp.role_id = ur.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE ur.user_id = ? AND ur.is_active = TRUE
           AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
        [userId]
      )) as unknown as any[];
      if (permRows.some((r: any) => r.permission_key === permission)) return;
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Insufficient permissions' });
    } catch {
      return reply.status(500).send({ error: 'INTERNAL_ERROR' });
    }
  };
}

export async function reportsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  const g = superAdminGuard;

  // Financial
  app.get('/reports/financial/summary', { preHandler: [g] }, ctrl.financialSummary);
  app.get('/reports/financial/by-source', { preHandler: [g] }, ctrl.revenueBySource);
  app.get('/reports/financial/timeline', { preHandler: [g] }, ctrl.revenueTimeline);
  app.get('/reports/financial/payment-methods', { preHandler: [g] }, ctrl.paymentMethods);
  app.get('/reports/financial/settlements', { preHandler: [g] }, ctrl.settlements);

  // Bookings
  app.get('/reports/bookings/volume', { preHandler: [g] }, ctrl.bookingVolume);
  app.get('/reports/bookings/by-type', { preHandler: [g] }, ctrl.bookingsByType);
  app.get('/reports/bookings/by-sport', { preHandler: [g] }, ctrl.bookingsBySport);
  app.get('/reports/bookings/peak-hours', { preHandler: [g] }, ctrl.peakHours);
  app.get('/reports/bookings/cancellation', { preHandler: [g] }, ctrl.cancellationRate);

  // Users
  app.get('/reports/users/registrations', { preHandler: [g] }, ctrl.userRegistrations);
  app.get('/reports/users/demographics', { preHandler: [g] }, ctrl.userDemographics);
  app.get('/reports/users/gender', { preHandler: [g] }, ctrl.userGenderDist);
  app.get('/reports/users/active', { preHandler: [g] }, ctrl.activeUsers);
  app.get('/reports/users/roles', { preHandler: [g] }, ctrl.userRoles);

  // Organisations
  app.get('/reports/organisations/top', { preHandler: [g] }, ctrl.topOrgs);
  app.get('/reports/organisations/by-type', { preHandler: [g] }, ctrl.orgTypeDist);
  app.get('/reports/organisations/subscriptions', { preHandler: [g] }, ctrl.subscriptionStatus);

  // Marketplace
  app.get('/reports/marketplace/overview', { preHandler: [g] }, ctrl.marketplaceOverview);
  app.get('/reports/marketplace/top-products', { preHandler: [g] }, ctrl.topProducts);
  app.get('/reports/marketplace/orders', { preHandler: [g] }, ctrl.orderStatusDist);

  // Tournaments
  app.get('/reports/tournaments/overview', { preHandler: [g] }, ctrl.tournamentOverview);
  app.get('/reports/tournaments/participation', { preHandler: [g] }, ctrl.tournamentParticipation);

  // Coaches
  app.get('/reports/coaches/performance', { preHandler: [g] }, ctrl.coachPerformance);

  // Ads
  app.get('/reports/ads/performance', { preHandler: [g] }, ctrl.adsPerformance);
  app.get('/reports/ads/daily-spend', { preHandler: [g] }, ctrl.adsDailySpend);

  // Audit
  app.get('/reports/audit/activity', { preHandler: [g] }, ctrl.auditActivity);
  app.get('/reports/audit/top-entities', { preHandler: [g] }, ctrl.topAuditEntities);
}
