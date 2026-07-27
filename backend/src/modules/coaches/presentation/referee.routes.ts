import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './referee.controller.js';

export async function refereeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Referee Dashboard
  app.get('/referee/dashboard', { preHandler: [requirePermission(['referee.dashboard.view'])] }, ctrl.getRefereeDashboardHandler);

  // Referee Profile
  app.get('/referee/profile', { preHandler: [requirePermission(['referee.profile.view'])] }, ctrl.getRefereeProfileHandler);
  app.put('/referee/profile', { preHandler: [requirePermission(['referee.profile.update'])] }, ctrl.updateRefereeProfileHandler);

  // Referee Availability
  app.get('/referee/availability', { preHandler: [requirePermission(['referee.availability.view'])] }, ctrl.getRefereeAvailabilityHandler);
  app.put('/referee/availability', { preHandler: [requirePermission(['referee.availability.manage'])] }, ctrl.updateRefereeAvailabilityHandler);
  app.post('/referee/availability/blackouts', { preHandler: [requirePermission(['referee.availability.manage'])] }, ctrl.addBlackoutHandler);
  app.delete('/referee/availability/blackouts/:id', { preHandler: [requirePermission(['referee.availability.manage'])] }, ctrl.removeBlackoutHandler);

  // Referee Assignments
  app.get('/referee/assignments', { preHandler: [requirePermission(['referee.assignments.view'])] }, ctrl.getRefereeAssignmentsHandler);
  app.post('/referee/assignments/:id/accept', { preHandler: [requirePermission(['referee.assignments.manage'])] }, ctrl.acceptAssignmentHandler);
  app.post('/referee/assignments/:id/decline', { preHandler: [requirePermission(['referee.assignments.manage'])] }, ctrl.declineAssignmentHandler);

  // Referee Match History
  app.get('/referee/matches', { preHandler: [requirePermission(['referee.assignments.view'])] }, ctrl.getRefereeMatchHistoryHandler);

  // Referee Statistics
  app.get('/referee/statistics', { preHandler: [requirePermission(['referee.statistics.view'])] }, ctrl.getRefereeStatisticsHandler);

  // Coach Revenue
  app.get('/coach/revenue', { preHandler: [requirePermission(['coach.revenue.view'])] }, ctrl.getCoachRevenueHandler);
  app.get('/coach/revenue/summary', { preHandler: [requirePermission(['coach.revenue.view'])] }, ctrl.getCoachRevenueSummaryHandler);

  // Coach Attendance
  app.get('/coach/attendance', { preHandler: [requirePermission(['coach.attendance.view'])] }, ctrl.getCoachAttendanceHandler);

  // Coach Statistics
  app.get('/coach/statistics', { preHandler: [requirePermission(['coach.statistics.view'])] }, ctrl.getCoachStatisticsHandler);
}
