import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission, requireApprovedOrg } from '../../../shared/middleware/auth.middleware.js';
import {
  submitComplaintHandler, getMyComplaintsHandler, getComplaintHandler, confirmReceiptHandler,
  getOrgComplaintsHandler, getOrgComplaintHandler, reviewComplaintHandler, resolveComplaintHandler,
  collectReturnHandler, recordShipmentHandler, rejectComplaintHandler,
  getAdminApprovalsHandler, approveRefundHandler, rejectApprovalHandler,
} from './marketplace-complaint.controller.js';

export async function marketplaceComplaintRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── Player ──
  const playerMod = { preHandler: [requirePermission(['marketplace.complaints.submit'])] };
  app.post('/marketplace/complaints', playerMod, submitComplaintHandler);
  app.get('/marketplace/complaints', { preHandler: [requirePermission(['marketplace.complaints.view'])] }, getMyComplaintsHandler);
  app.get('/marketplace/complaints/:id', { preHandler: [requirePermission(['marketplace.complaints.view'])] }, getComplaintHandler);
  app.post('/marketplace/complaints/:id/confirm-receipt', playerMod, confirmReceiptHandler);

  // ── Organisation ──
  const orgMod = { preHandler: [requirePermission(['marketplace.complaints.manage']), requireApprovedOrg()] };
  app.get('/marketplace/seller/complaints', orgMod, getOrgComplaintsHandler);
  app.get('/marketplace/seller/complaints/:id', orgMod, getOrgComplaintHandler);
  app.post('/marketplace/seller/complaints/:id/review', orgMod, reviewComplaintHandler);
  app.post('/marketplace/seller/complaints/:id/resolve', orgMod, resolveComplaintHandler);
  app.post('/marketplace/seller/complaints/:id/collect', orgMod, collectReturnHandler);
  app.post('/marketplace/seller/complaints/:id/ship/:kind', orgMod, recordShipmentHandler);
  app.post('/marketplace/seller/complaints/:id/reject', orgMod, rejectComplaintHandler);

  // ── CourtZon Admin ──
  const adminMod = { preHandler: [requirePermission(['marketplace.complaints.approve'])] };
  app.get('/admin/marketplace/complaints', adminMod, getAdminApprovalsHandler);
  app.post('/admin/marketplace/complaints/:id/approve', adminMod, approveRefundHandler);
  app.post('/admin/marketplace/complaints/:id/reject', adminMod, rejectApprovalHandler);
}