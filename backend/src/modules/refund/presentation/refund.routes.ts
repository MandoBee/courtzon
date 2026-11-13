import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './refund.controller.js';

/**
 * Institution-funded Refund Engine routes.
 *
 * Every route is authenticated and permission-gated; organisation access is
 * additionally validated inside each handler against the canonical refund case
 * (never a client-supplied organisation id). Separation of duties is enforced in
 * the service layer (`approved_by != executed_by`).
 */
export async function refundRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/refunds',
    { preHandler: [authMiddleware, requirePermission(['refunds.view'])] },
    ctrl.listRefundCasesHandler,
  );

  app.get(
    '/refunds/export',
    { preHandler: [authMiddleware, requirePermission(['refunds.export'])] },
    ctrl.exportRefundCasesHandler,
  );

  app.get(
    '/refunds/:id',
    { preHandler: [authMiddleware, requirePermission(['refunds.view'])] },
    ctrl.getRefundCaseHandler,
  );

  app.post(
    '/refunds',
    { preHandler: [authMiddleware, requirePermission(['refunds.request'])] },
    ctrl.createRefundCaseHandler,
  );

  app.post(
    '/refunds/:id/approve',
    { preHandler: [authMiddleware, requirePermission(['refunds.approve'])] },
    ctrl.approveRefundCaseHandler,
  );

  app.post(
    '/refunds/:id/reject',
    { preHandler: [authMiddleware, requirePermission(['refunds.reject'])] },
    ctrl.rejectRefundCaseHandler,
  );

  app.post(
    '/refunds/:id/retry-operational',
    { preHandler: [authMiddleware, requirePermission(['refunds.retry'])] },
    ctrl.retryOperationalHandler,
  );

  app.post(
    '/refunds/:id/payouts',
    { preHandler: [authMiddleware, requirePermission(['refunds.payout'])] },
    ctrl.recordPayoutHandler,
  );

  app.post(
    '/refunds/:id/payouts/:payoutId/confirm',
    { preHandler: [authMiddleware, requirePermission(['refunds.payout.confirm'])] },
    ctrl.confirmPayoutHandler,
  );

  app.post(
    '/refunds/:id/payouts/:payoutId/fail',
    { preHandler: [authMiddleware, requirePermission(['refunds.payout'])] },
    ctrl.failPayoutHandler,
  );
}
