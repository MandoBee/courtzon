import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './support.controller.js';

export async function supportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Admin ticket management
  app.get('/admin/support/tickets', { preHandler: [requirePermission(['support.tickets.view'])] }, ctrl.listTicketsHandler);
  app.get('/admin/support/tickets/:id', { preHandler: [requirePermission(['support.tickets.view'])] }, ctrl.getTicketHandler);
  app.put('/admin/support/tickets/:id', { preHandler: [requirePermission(['support.tickets.manage'])] }, ctrl.updateTicketHandler);
  app.post('/admin/support/tickets/:id/assign', { preHandler: [requirePermission(['support.tickets.manage'])] }, ctrl.assignTicketHandler);
  app.get('/admin/support/tickets/:id/messages', { preHandler: [requirePermission(['support.tickets.view'])] }, ctrl.getTicketMessagesHandler);
  app.post('/admin/support/tickets/:id/messages', { preHandler: [requirePermission(['support.tickets.manage'])] }, ctrl.addTicketMessageHandler);
  app.get('/admin/support/stats', { preHandler: [requirePermission(['support.tickets.view'])] }, ctrl.getTicketStatsHandler);

  // User-facing ticket submission
  app.post('/support/tickets', { preHandler: [requirePermission(['support.tickets.create'])] }, ctrl.createTicketHandler);
  app.get('/my/support/tickets', { preHandler: [requirePermission(['support.tickets.view'])] }, ctrl.getMyTicketsHandler);
  app.post('/my/support/tickets/:id/messages', { preHandler: [requirePermission(['support.tickets.create'])] }, ctrl.addMyTicketMessageHandler);
}
