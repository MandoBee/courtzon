import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../../shared/middleware/auth.middleware.js';
import { requireOrganisationAccess, requireOrgManageAccess } from '../../../shared/middleware/route-guard.js';
import * as ctrl from './membership-p1.controller.js';
import * as p2 from './membership-p2.controller.js';

/**
 * G11.22 P1 membership routes.
 *
 * Org management endpoints are organisation-scoped via the existing
 * requireOrganisationAccess('orgId') guard (owner + org-scoped staff). Player
 * purchase/my endpoints are authenticated and self-scoped.
 */
export async function membershipP1Routes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── Organisation membership settings ──
  app.get('/org/:orgId/membership/settings', { preHandler: [requireOrganisationAccess('orgId')] }, ctrl.getOrgMembershipSettingsHandler);
  app.put('/org/:orgId/membership/settings', { preHandler: [requireOrgManageAccess('orgId')] }, ctrl.saveOrgMembershipSettingsHandler);

  // ── Org management: plans + versions ──
  app.get('/org/:orgId/membership/plans', { preHandler: [requireOrganisationAccess('orgId')] }, ctrl.listOrgPlansHandler);
  app.post('/org/:orgId/membership/plans', { preHandler: [requireOrgManageAccess('orgId')] }, ctrl.createPlanHandler);
  app.put('/org/:orgId/membership/plans/:planId', { preHandler: [requireOrgManageAccess('orgId')] }, ctrl.updatePlanBasicHandler);
  app.post('/org/:orgId/membership/plans/:planId/versions', { preHandler: [requireOrgManageAccess('orgId')] }, ctrl.createVersionHandler);
  app.put('/org/:orgId/membership/versions/:versionId', { preHandler: [requireOrgManageAccess('orgId')] }, ctrl.updateVersionHandler);
  app.post('/org/:orgId/membership/versions/:versionId/activate', { preHandler: [requireOrgManageAccess('orgId')] }, ctrl.activateVersionHandler);
  app.post('/org/:orgId/membership/versions/:versionId/archive', { preHandler: [requireOrgManageAccess('orgId')] }, ctrl.archiveVersionHandler);

  // ── Org subscriptions administration ──
  app.get('/org/:orgId/membership/subscriptions', { preHandler: [requireOrganisationAccess('orgId')] }, ctrl.listOrgSubscriptionsHandler);
  app.get('/org/:orgId/membership/subscriptions/:subscriptionId', { preHandler: [requireOrganisationAccess('orgId')] }, ctrl.getOrgSubscriptionHandler);
  app.post('/org/:orgId/membership/subscriptions/:subscriptionId/confirm-cash', { preHandler: [requireOrgManageAccess('orgId')] }, ctrl.confirmCashHandler);
  app.post('/org/:orgId/membership/subscriptions/:subscriptionId/complete-card', { preHandler: [requireOrgManageAccess('orgId')] }, ctrl.completeCardHandler);

  // ── G11.22 P2 — installments / renewal / cancel / refund / eligibility ──
  app.get('/org/:orgId/membership/subscriptions/:subscriptionId/eligibility', { preHandler: [requireOrganisationAccess('orgId')] }, p2.getOrgEligibilityHandler);
  app.post('/org/:orgId/membership/subscriptions/:subscriptionId/installments/:seq/confirm-cash', { preHandler: [requireOrgManageAccess('orgId')] }, p2.confirmInstallmentCashHandler);
  app.post('/org/:orgId/membership/subscriptions/:subscriptionId/installments/:seq/complete-card', { preHandler: [requireOrgManageAccess('orgId')] }, p2.completeInstallmentCardHandler);
  app.post('/org/:orgId/membership/subscriptions/:subscriptionId/renew', { preHandler: [requireOrgManageAccess('orgId')] }, p2.renewSubscriptionHandler);
  app.post('/org/:orgId/membership/subscriptions/:subscriptionId/cancel', { preHandler: [requireOrgManageAccess('orgId')] }, p2.cancelSubscriptionHandler);
  app.post('/org/:orgId/membership/subscriptions/:subscriptionId/refund', { preHandler: [requireOrgManageAccess('orgId')] }, p2.refundInstallmentsHandler);

  // ── Player: browse active plans + purchase + my subscriptions ──
  app.get('/organisations/:orgId/membership/plans-active', ctrl.listActiveVersionsForPurchaseHandler);
  app.post('/organisations/:orgId/membership/subscriptions', ctrl.createSubscriptionHandler);
  app.get('/my/membership/subscriptions', ctrl.listMySubscriptionsHandler);
  app.get('/my/membership/subscriptions/:subscriptionId', ctrl.getMySubscriptionHandler);
  app.get('/my/membership/subscriptions/:subscriptionId/eligibility', p2.getMyEligibilityHandler);
}