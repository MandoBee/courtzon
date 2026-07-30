import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import { requireOrganisationAccess } from '../../../shared/middleware/route-guard.js';
import * as ctrl from './booking.controller.js';

export async function bookingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.post('/bookings', { preHandler: [requirePermission(['bookings.create'])] }, ctrl.createBookingHandler);
  app.post('/bookings/prepare', { preHandler: [requirePermission(['bookings.create'])] }, ctrl.prepareBookingHandler);
  app.delete('/bookings/prepare/:prepareId', { preHandler: [requirePermission(['bookings.create'])] }, ctrl.cancelPrepareHandler);
  app.get('/bookings', { preHandler: [requirePermission(['bookings.view'])] }, ctrl.getUserBookingsHandler);
  app.get('/bookings/:id', { preHandler: [requirePermission(['bookings.view'])] }, ctrl.getBookingHandler);
  app.post('/bookings/:id/cancel', { preHandler: [requirePermission(['bookings.cancel'])] }, ctrl.cancelBookingHandler);
  app.post('/bookings/:id/check-in', { preHandler: [requirePermission(['bookings.check-in'])] }, ctrl.checkInHandler);
  app.patch('/bookings/:id/status', { preHandler: [requirePermission(['admin.bookings.update-status', 'org.bookings.manage'])] }, ctrl.updateBookingStatusHandler);
  app.patch('/bookings/:id/payment', { preHandler: [requirePermission(['admin.bookings.update-status', 'org.bookings.manage'])] }, ctrl.updatePaymentStatusHandler);
  app.get('/resources/:resourceId/slots', { preHandler: [requirePermission(['bookings.view'])] }, ctrl.getResourceSlotsHandler);
  app.get('/organisations/:orgId/bookings', { preHandler: [requirePermission(['bookings.view']), requireOrganisationAccess('orgId')] }, ctrl.getOrganisationBookingsHandler);
  app.get('/admin/bookings', { preHandler: [requirePermission(['bookings.view'])] }, ctrl.getAllBookingsHandler);

  app.post('/bookings/:id/matchmaking', { preHandler: [requirePermission(['bookings.matchmaking'])] }, ctrl.startMatchmakingHandler);
  app.get('/bookings/:id/matchmaking/candidates', { preHandler: [requirePermission(['bookings.matchmaking'])] }, ctrl.getMatchmakingCandidatesHandler);
  app.post('/bookings/:id/apply', { preHandler: [requirePermission(['bookings.matchmaking'])] }, ctrl.applyToBookingHandler);
  app.delete('/booking-invitations/:invitationId', { preHandler: [requirePermission(['bookings.matchmaking'])] }, ctrl.cancelApplicationHandler);
  app.post('/booking-invitations/:invitationId/respond', { preHandler: [requirePermission(['bookings.matchmaking'])] }, ctrl.respondToApplicantHandler);

  app.get('/bookings/:id/applicants', { preHandler: [requirePermission(['bookings.view'])] }, ctrl.getBookingApplicantsHandler);
}
