import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './booking.controller.js';

export async function bookingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.post('/bookings', ctrl.createBookingHandler);
  app.get('/bookings', ctrl.getUserBookingsHandler);
  app.get('/bookings/:id', ctrl.getBookingHandler);
  app.post('/bookings/:id/cancel', ctrl.cancelBookingHandler);
  app.post('/bookings/:id/check-in', ctrl.checkInHandler);
  app.patch('/bookings/:id/status', { preHandler: [requirePermission(['admin.bookings.update-status', 'org.bookings.manage'])] }, ctrl.updateBookingStatusHandler);
  app.patch('/bookings/:id/payment', { preHandler: [requirePermission(['admin.bookings.update-status', 'org.bookings.manage'])] }, ctrl.updatePaymentStatusHandler);
  app.get('/resources/:resourceId/slots', ctrl.getResourceSlotsHandler);
  app.get('/organisations/:orgId/bookings', { preHandler: [requirePermission(['bookings.view'])] }, ctrl.getOrganisationBookingsHandler);
  app.get('/admin/bookings', { preHandler: [requirePermission(['bookings.view'])] }, ctrl.getAllBookingsHandler);

  app.post('/bookings/:id/matchmaking', ctrl.startMatchmakingHandler);
  app.get('/bookings/:id/matchmaking/candidates', ctrl.getMatchmakingCandidatesHandler);
  app.post('/bookings/:id/apply', ctrl.applyToBookingHandler);
  app.delete('/booking-invitations/:invitationId', ctrl.cancelApplicationHandler);
  app.post('/booking-invitations/:invitationId/respond', ctrl.respondToApplicantHandler);

  app.get('/matches', ctrl.getPublicMatchesHandler);
  app.get('/bookings/:id/applicants', ctrl.getBookingApplicantsHandler);
  app.post('/booking-intents/:intentId/fulfill', ctrl.fulfillBookingIntentHandler);
}
