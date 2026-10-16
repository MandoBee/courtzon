import type { FastifyInstance } from 'fastify';
import { authMiddleware, eitherRoleOrPermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './reports.controller.js';

/**
 * P1-03 — Reports authorization.
 *
 * Every report read endpoint is permission-driven via `reports.view`, with an
 * explicit Super Admin role bypass (`super_admin` / `super-admin`). Uses the
 * shared `eitherRoleOrPermission` guard so the check fails closed and performs
 * no database access in the presentation layer.
 *
 * There is no backend export endpoint — export is a frontend-only capability
 * (`reports.export` gates the CSV button on the Reports page). No read route is
 * therefore gated on `reports.export`, and no route is left on a role-only guard.
 */
const reportsViewGuard = eitherRoleOrPermission(['super_admin', 'super-admin'], ['reports.view']);

export async function reportsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  const g = reportsViewGuard;

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
