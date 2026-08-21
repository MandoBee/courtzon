import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './settlement.controller.js';
import * as bsCtrl from './booking-settlement.controller.js';

export async function settlementRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── Booking Settlement (coach + org economics) ──
  app.get('/settlements/bookings/eligible', {
    preHandler: [requirePermission(['settlements.view'])]
  }, bsCtrl.listEligibleBookingsHandler);

  app.post('/settlements/bookings/:bookingId/settle', {
    preHandler: [requirePermission(['settlements.request'])]
  }, bsCtrl.settleBookingHandler);

  app.post('/settlements/bookings/:bookingId/recovery/collect', {
    preHandler: [requirePermission(['settlements.request'])]
  }, bsCtrl.collectBookingRecoveryHandler);

  // List settlements (admin)
  app.get('/settlements', {
    preHandler: [requirePermission(['settlements.view'])]
  }, ctrl.getSettlementsHandler);
}
