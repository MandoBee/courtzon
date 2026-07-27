import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './academy.controller.js';

export async function academyRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── Dashboard ──
  app.get('/admin/academy/dashboard', { preHandler: [requirePermission(['academy.dashboard.view'])] }, ctrl.getDashboardHandler);

  // ── Programs ──
  app.get('/admin/academy/programs', { preHandler: [requirePermission(['academy.view'])] }, ctrl.listProgramsHandler);
  app.get('/admin/academy/programs/options', { preHandler: [requirePermission(['academy.view'])] }, ctrl.getProgramCategoriesHandler);
  app.get('/admin/academy/programs/:id', { preHandler: [requirePermission(['academy.view'])] }, ctrl.getProgramHandler);
  app.post('/admin/academy/programs', { preHandler: [requirePermission(['academy.create'])] }, ctrl.createProgramHandler);
  app.put('/admin/academy/programs/:id', { preHandler: [requirePermission(['academy.update'])] }, ctrl.updateProgramHandler);
  app.post('/admin/academy/programs/:id/publish', { preHandler: [requirePermission(['academy.publish'])] }, ctrl.publishProgramHandler);
  app.post('/admin/academy/programs/:id/archive', { preHandler: [requirePermission(['academy.delete'])] }, ctrl.archiveProgramHandler);
  app.post('/admin/academy/programs/:id/transition', { preHandler: [requirePermission(['academy.update'])] }, ctrl.transitionProgramStatusHandler);

  // ── Groups ──
  app.get('/admin/academy/groups', { preHandler: [requirePermission(['academy.view'])] }, ctrl.listGroupsHandler);
  app.get('/admin/academy/programs/:programId/groups', { preHandler: [requirePermission(['academy.view'])] }, ctrl.listGroupsHandler);
  app.get('/admin/academy/groups/:id', { preHandler: [requirePermission(['academy.view'])] }, ctrl.getGroupHandler);
  app.post('/admin/academy/groups', { preHandler: [requirePermission(['academy.create'])] }, ctrl.createGroupHandler);
  app.put('/admin/academy/groups/:id', { preHandler: [requirePermission(['academy.update'])] }, ctrl.updateGroupHandler);
  app.post('/admin/academy/groups/:id/assign-coach', { preHandler: [requirePermission(['academy.manage'])] }, ctrl.assignCoachHandler);
  app.post('/admin/academy/groups/:id/archive', { preHandler: [requirePermission(['academy.delete'])] }, ctrl.archiveGroupHandler);

  // ── Enrollments ──
  app.get('/admin/academy/enrollments', { preHandler: [requirePermission(['academy.view'])] }, ctrl.listEnrollmentsHandler);
  app.get('/admin/academy/programs/:programId/enrollments', { preHandler: [requirePermission(['academy.view'])] }, ctrl.listEnrollmentsHandler);
  app.get('/admin/academy/enrollments/:id', { preHandler: [requirePermission(['academy.view'])] }, ctrl.getEnrollmentHandler);
  app.post('/admin/academy/enrollments', { preHandler: [requirePermission(['academy.enroll'])] }, ctrl.createEnrollmentHandler);
  app.post('/admin/academy/enrollments/:id/cancel', { preHandler: [requirePermission(['academy.enroll'])] }, ctrl.cancelEnrollmentHandler);
  app.post('/admin/academy/enrollments/:id/complete', { preHandler: [requirePermission(['academy.enroll'])] }, ctrl.completeEnrollmentHandler);
  app.post('/admin/academy/enrollments/:id/confirm', { preHandler: [requirePermission(['academy.enroll'])] }, ctrl.confirmEnrollmentHandler);
  app.post('/admin/academy/enrollments/:id/move', { preHandler: [requirePermission(['academy.manage'])] }, ctrl.moveEnrollmentHandler);
  app.get('/admin/academy/enrollments/:id/history', { preHandler: [requirePermission(['academy.view'])] }, ctrl.getEnrollmentHistoryHandler);

  // ── Group Sessions ──
  app.get('/admin/academy/sessions', { preHandler: [requirePermission(['academy.view'])] }, ctrl.listSessionsHandler);
  app.get('/admin/academy/groups/:groupId/sessions', { preHandler: [requirePermission(['academy.view'])] }, ctrl.listSessionsHandler);
  app.post('/admin/academy/sessions', { preHandler: [requirePermission(['academy.create'])] }, ctrl.createSessionHandler);
  app.put('/admin/academy/sessions/:id', { preHandler: [requirePermission(['academy.update'])] }, ctrl.updateSessionHandler);

  // ── Attendance ──
  app.get('/admin/academy/sessions/:sessionId/attendance', { preHandler: [requirePermission(['attendance.manage'])] }, ctrl.getSessionAttendanceHandler);
  app.get('/admin/academy/attendance', { preHandler: [requirePermission(['attendance.manage'])] }, ctrl.listAttendanceHandler);
  app.post('/admin/academy/attendance', { preHandler: [requirePermission(['attendance.manage'])] }, ctrl.recordAttendanceHandler);
  app.post('/admin/academy/sessions/:sessionId/attendance/bulk', { preHandler: [requirePermission(['attendance.manage'])] }, ctrl.recordBulkAttendanceHandler);
  app.put('/admin/academy/attendance/:id', { preHandler: [requirePermission(['attendance.manage'])] }, ctrl.updateAttendanceHandler);

  // ── Player-facing Academy endpoints ──
  app.get('/academy/programs', { preHandler: [requirePermission(['academy.view'])] }, ctrl.listPublicProgramsHandler);
  app.get('/academy/programs/:id', { preHandler: [requirePermission(['academy.view'])] }, ctrl.getPublicProgramHandler);
  app.get('/my/academy/enrollments', { preHandler: [requirePermission(['academy.view'])] }, ctrl.getMyEnrollmentsHandler);
  app.post('/academy/programs/:id/enroll', { preHandler: [requirePermission(['academy.enroll'])] }, ctrl.publicEnrollHandler);
}
