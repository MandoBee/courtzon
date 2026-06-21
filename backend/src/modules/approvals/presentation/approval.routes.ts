import type { FastifyInstance } from 'fastify';
import { authMiddleware, adminGuard } from '../../../shared/middleware/auth.middleware.js';
import { listPendingApprovalsHandler, approveRegistrationHandler, rejectRegistrationHandler } from './approval.controller.js';

export async function approvalRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/admin/approvals', { preHandler: [adminGuard] }, listPendingApprovalsHandler);
  app.post('/admin/approvals/:requestId/approve', { preHandler: [adminGuard] }, approveRegistrationHandler);
  app.post('/admin/approvals/:requestId/reject', { preHandler: [adminGuard] }, rejectRegistrationHandler);
}
