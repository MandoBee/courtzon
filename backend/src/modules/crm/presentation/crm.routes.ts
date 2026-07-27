import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './crm.controller.js';

export async function crmRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Customer 360
  app.get('/admin/crm/customers', { preHandler: [requirePermission(['crm.customers.view'])] }, ctrl.listCustomersHandler);
  app.get('/admin/crm/customers/:id', { preHandler: [requirePermission(['crm.customers.view'])] }, ctrl.getCustomerHandler);
  app.get('/admin/crm/customers/:id/timeline', { preHandler: [requirePermission(['crm.customers.view'])] }, ctrl.getCustomerTimelineHandler);

  // Segments
  app.get('/admin/crm/segments', { preHandler: [requirePermission(['crm.segments.view'])] }, ctrl.listSegmentsHandler);
  app.post('/admin/crm/segments', { preHandler: [requirePermission(['crm.segments.manage'])] }, ctrl.createSegmentHandler);
  app.put('/admin/crm/segments/:id', { preHandler: [requirePermission(['crm.segments.manage'])] }, ctrl.updateSegmentHandler);
  app.post('/admin/crm/segments/:id/refresh', { preHandler: [requirePermission(['crm.segments.manage'])] }, ctrl.refreshSegmentHandler);
  app.delete('/admin/crm/segments/:id', { preHandler: [requirePermission(['crm.segments.manage'])] }, ctrl.deleteSegmentHandler);

  // Leads
  app.get('/admin/crm/leads', { preHandler: [requirePermission(['crm.leads.view'])] }, ctrl.listLeadsHandler);
  app.post('/admin/crm/leads', { preHandler: [requirePermission(['crm.leads.manage'])] }, ctrl.createLeadHandler);
  app.put('/admin/crm/leads/:id', { preHandler: [requirePermission(['crm.leads.manage'])] }, ctrl.updateLeadHandler);
  app.post('/admin/crm/leads/:id/convert', { preHandler: [requirePermission(['crm.leads.manage'])] }, ctrl.convertLeadHandler);

  // Marketing Campaigns
  app.get('/admin/crm/campaigns', { preHandler: [requirePermission(['crm.campaigns.view'])] }, ctrl.listCampaignsHandler);
  app.post('/admin/crm/campaigns', { preHandler: [requirePermission(['crm.campaigns.manage'])] }, ctrl.createCampaignHandler);
  app.put('/admin/crm/campaigns/:id', { preHandler: [requirePermission(['crm.campaigns.manage'])] }, ctrl.updateCampaignHandler);
  app.post('/admin/crm/campaigns/:id/launch', { preHandler: [requirePermission(['crm.campaigns.manage'])] }, ctrl.launchCampaignHandler);
  app.post('/admin/crm/campaigns/:id/pause', { preHandler: [requirePermission(['crm.campaigns.manage'])] }, ctrl.pauseCampaignHandler);
  app.post('/admin/crm/campaigns/:id/complete', { preHandler: [requirePermission(['crm.campaigns.manage'])] }, ctrl.completeCampaignHandler);

  // Communication Log
  app.get('/admin/crm/communications', { preHandler: [requirePermission(['crm.communications.view'])] }, ctrl.listCommunicationsHandler);

  // Dashboard
  app.get('/admin/crm/dashboard', { preHandler: [requirePermission(['crm.dashboard.view'])] }, ctrl.getCRMDashboardHandler);
}
