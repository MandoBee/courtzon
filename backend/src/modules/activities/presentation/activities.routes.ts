import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission, adminGuard } from '../../../shared/middleware/auth.middleware.js';
import { requireFeatureFlag } from '../../../shared/middleware/feature-flag.middleware.js';
import * as ctrl from './activities.controller.js';

export async function activitiesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Tournaments — gated by app.tournaments_enabled
  await app.register(async function tournamentScope(scopedApp: FastifyInstance) {
    scopedApp.addHook('preHandler', requireFeatureFlag('app.tournaments_enabled'));

    scopedApp.get('/tournaments', ctrl.listTournamentsHandler);
    scopedApp.get('/tournaments/:id', ctrl.getTournamentHandler);
    scopedApp.post('/tournaments', { preHandler: [requirePermission(['tournaments.create'])] }, ctrl.createTournamentHandler);
    scopedApp.post('/tournaments/:id/register', ctrl.registerTournamentHandler);
    scopedApp.post('/tournaments/:id/generate-bracket', { preHandler: [requirePermission(['tournaments.manage_brackets'])] }, ctrl.generateBracketHandler);
    scopedApp.post('/matches/:matchId/score', { preHandler: [requirePermission(['tournaments.enter_scores'])] }, ctrl.enterMatchScoreHandler);

    // Admin tournament routes
    scopedApp.get('/admin/tournaments', { preHandler: [adminGuard] }, ctrl.adminListTournamentsHandler);
    scopedApp.put('/tournaments/:id', { preHandler: [adminGuard] }, ctrl.updateTournamentHandler);
    scopedApp.delete('/tournaments/:id', { preHandler: [adminGuard] }, ctrl.deleteTournamentHandler);
  });

  // Academies — gated by app.academies_enabled
  await app.register(async function academyScope(scopedApp: FastifyInstance) {
    scopedApp.addHook('preHandler', requireFeatureFlag('app.academies_enabled'));

    scopedApp.get('/academies', ctrl.listAcademiesHandler);
    scopedApp.get('/academies/:id', ctrl.getAcademyHandler);
    scopedApp.post('/academies', { preHandler: [requirePermission(['academies.create'])] }, ctrl.createAcademyHandler);
    scopedApp.post('/academies/:id/curriculums', { preHandler: [requirePermission(['academies.edit'])] }, ctrl.createCurriculumHandler);
    scopedApp.post('/academies/:id/enroll', ctrl.enrollPlayerHandler);
    scopedApp.post('/academies/:id/sessions', { preHandler: [requirePermission(['academies.edit'])] }, ctrl.createAcademySessionHandler);
    scopedApp.post('/sessions/:sessionId/attendance', ctrl.markAttendanceHandler);
    scopedApp.post('/academies/:id/evaluations', { preHandler: [requirePermission(['academies.evaluate'])] }, ctrl.createEvaluationHandler);

    // Admin academy routes
    scopedApp.get('/admin/academies', { preHandler: [adminGuard] }, ctrl.adminListAcademiesHandler);
    scopedApp.put('/academies/:id', { preHandler: [adminGuard] }, ctrl.updateAcademyHandler);
    scopedApp.delete('/academies/:id', { preHandler: [adminGuard] }, ctrl.deleteAcademyHandler);
  });

  // Coaches — view open to any authenticated user, profile management requires permission
  app.get('/coaches', ctrl.listCoachesHandler);
  app.get('/coaches/:id', ctrl.getCoachByIdHandler);
  app.get('/coaches/:id/agreements', ctrl.listCoachAgreementsHandler);
  app.get('/coaches/profile/me', ctrl.getMyCoachProfileHandler);
  app.post('/coaches/profile', { preHandler: [requirePermission(['coaches.manage_profile'])] }, ctrl.createCoachProfileHandler);
  app.put('/coaches/profile', { preHandler: [requirePermission(['coaches.manage_profile'])] }, ctrl.updateCoachProfileHandler);
  app.get('/coaches/agreements', ctrl.listOrgAgreementsHandler);
  app.post('/coaches/agreements', { preHandler: [requirePermission(['coaches.manage_agreements'])] }, ctrl.upsertOrgAgreementHandler);
  app.post('/coaches/agreements/:id/respond', { preHandler: [requirePermission(['coaches.invites.respond'])] }, ctrl.respondOrgInviteHandler);
  app.post('/coaches/sessions', { preHandler: [requirePermission(['coaches.create_sessions'])] }, ctrl.createCoachSessionHandler);
  app.get('/coaches/sessions/me', ctrl.getMyCoachSessionsHandler);
  app.get('/coaches/sessions/pending', ctrl.getPendingCoachSessionsHandler);
  app.get('/coaches/stats', ctrl.getCoachStatsHandler);
  app.get('/coaches/players', ctrl.getCoachPlayersHandler);
  app.get('/coaches/sessions/:id', ctrl.getCoachSessionByIdHandler);
  app.get('/coaches/sessions/:id/available-courts', ctrl.getSessionAvailableCourtsHandler);
  app.post('/coaches/sessions/:id/book-court', ctrl.bookCourtForSessionHandler);
  app.post('/coaches/sessions/:id/accept', ctrl.acceptCoachSessionHandler);
  app.post('/coaches/sessions/:id/decline', ctrl.declineCoachSessionHandler);
  app.post('/coaches/:coachId/reviews', ctrl.createCoachReviewHandler);

  // Coach weekly availability + blackout dates
  app.get('/coaches/availability/me', { preHandler: [requirePermission(['coaches.availability.manage'])] }, ctrl.getMyCoachAvailabilityHandler);
  app.put('/coaches/availability/me', { preHandler: [requirePermission(['coaches.availability.manage'])] }, ctrl.setMyCoachAvailabilityHandler);
  app.post('/coaches/availability/me/blackouts', { preHandler: [requirePermission(['coaches.availability.manage'])] }, ctrl.addCoachBlackoutHandler);
  app.delete('/coaches/availability/me/blackouts/:id', { preHandler: [requirePermission(['coaches.availability.manage'])] }, ctrl.removeCoachBlackoutHandler);
  app.get('/coaches/:id/availability', ctrl.getCoachAvailabilityHandler);

  // Admin coach routes
  app.get('/admin/coaches', { preHandler: [adminGuard] }, ctrl.adminListCoachesHandler);
  app.put('/coaches/:id', { preHandler: [adminGuard] }, ctrl.updateCoachAdminHandler);
  app.delete('/coaches/:id', { preHandler: [adminGuard] }, ctrl.deleteCoachHandler);
  app.patch('/coaches/:id/verify', { preHandler: [adminGuard] }, ctrl.verifyCoachHandler);
  app.patch('/coaches/:id/toggle', { preHandler: [adminGuard] }, ctrl.toggleCoachAvailabilityHandler);
}
