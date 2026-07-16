import type { FastifyRequest, FastifyReply } from 'fastify';
import { activitiesService as svc } from '../application/activities.service.js';
import { recordAudit } from '../../audit-log/index.js';
import { coachSessionStateService } from '../../coaches/application/coach-session-state.service.js';
import { eventBus } from '../../../shared/event-bus/index.js';
import {
  CreateTournamentSchema, RegisterTournamentSchema, MatchScoreSchema,
  CreateAcademySchema, CreateCurriculumSchema, EnrollPlayerSchema,
  CreateAcademySessionSchema, MarkAttendanceSchema, CreateEvaluationSchema,
  CreateCoachProfileSchema, UpsertOrgAgreementSchema, CreateCoachSessionSchema, CreateCoachReviewSchema,
  SetCoachAvailabilitySchema, AddCoachBlackoutSchema, RespondOrgInviteSchema,
  BookCourtSchema, DeclineSessionSchema,
} from './activities.dto.js';

// ── Tournaments ──
export async function listTournamentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { status, sportId, orgId, page, limit } = request.query as any;
  const result = await svc.listTournaments({
    status, sportId: sportId ? Number(sportId) : undefined, orgId: orgId ? Number(orgId) : undefined,
    page: Number(page) || 1, limit: Number(limit) || 20,
  });
  return reply.send(result);
}

export async function getTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const t = await svc.getTournament(Number(id));
  return reply.send(t);
}

export async function createTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateTournamentSchema.parse(request.body);
  const userId = (request as any).userId;
  const t = await svc.createTournament(userId, body);
  return reply.status(201).send(t);
}

export async function registerTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = RegisterTournamentSchema.parse(request.body);
  await svc.registerPlayer(Number(id), body.playerId);
  return reply.status(201).send({ message: 'Registered' });
}

export async function generateBracketHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const matches = await svc.generateBracket(Number(id));
  return reply.send({ data: matches });
}

export async function enterMatchScoreHandler(request: FastifyRequest, reply: FastifyReply) {
  const { matchId } = request.params as any;
  const body = MatchScoreSchema.parse(request.body);
  const userId = (request as any).userId;
  await svc.enterMatchScore(Number(matchId), body, userId);
  return reply.send({ message: 'Score saved' });
}

// ── Academies ──
export async function listAcademiesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, branchId } = request.query as any;
  const academies = await svc.listAcademies(orgId ? Number(orgId) : undefined, branchId ? Number(branchId) : undefined);
  return reply.send({ data: academies });
}

export async function getAcademyHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const a = await svc.getAcademy(Number(id));
  return reply.send(a);
}

export async function createAcademyHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateAcademySchema.parse(request.body);
  const a = await svc.createAcademy(body);
  return reply.status(201).send(a);
}

export async function createCurriculumHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = CreateCurriculumSchema.parse(request.body);
  const curriculumId = await svc.createCurriculum(Number(id), body);
  return reply.status(201).send({ id: curriculumId });
}

export async function enrollPlayerHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = EnrollPlayerSchema.parse(request.body);
  await svc.enrollPlayer(Number(id), body.playerId, body.curriculumId);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'ACADEMY.ENROLL',
    entityType: 'academy',
    entityId: Number(id),
    afterState: { playerId: body.playerId, curriculumId: body.curriculumId ?? null },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send({ message: 'Enrolled' });
}

export async function createAcademySessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = CreateAcademySessionSchema.parse(request.body);
  const sessionId = await svc.createSession(Number(id), body);
  return reply.status(201).send({ id: sessionId });
}

export async function markAttendanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const { sessionId } = request.params as any;
  const body = MarkAttendanceSchema.parse(request.body);
  await svc.markAttendance(Number(sessionId), body.playerId, body.status);
  return reply.send({ message: 'Attendance marked' });
}

export async function createEvaluationHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = CreateEvaluationSchema.parse(request.body);
  const userId = (request as any).userId;
  const evalId = await svc.createEvaluation(Number(id), userId, body);
  return reply.status(201).send({ id: evalId });
}

// ── Coaches ──
export async function listCoachesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { sportId, available, page, limit } = request.query as any;
  const userId = (request as any).userId;
  const coaches = await svc.listCoaches({
    sportId: sportId ? Number(sportId) : undefined,
    isAvailable: available !== undefined ? available === 'true' : undefined,
    page: Number(page) || 1, limit: Number(limit) || 20,
    excludeUserId: userId ? Number(userId) : undefined,
  });
  return reply.send({ data: coaches });
}

export async function getMyCoachProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const profile = await svc.getCoachProfile(userId);
  if (!profile) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Coach profile not found' });
  return reply.send(profile);
}

export async function getCoachByIdHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const coach = await svc.getCoachById(Number(id));
  return reply.send(coach);
}

export async function createCoachProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateCoachProfileSchema.parse(request.body);
  const userId = (request as any).userId;
  const profile = await svc.createCoachProfile(userId, body);
  return reply.status(201).send(profile);
}

export async function updateCoachProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateCoachProfileSchema.parse(request.body);
  const userId = (request as any).userId;
  const profile = await svc.updateCoachProfile(userId, body);
  return reply.send(profile);
}

export async function listOrgAgreementsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const agreements = await svc.getOrgAgreements(userId);
  return reply.send({ data: agreements });
}

export async function listCoachAgreementsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const agreements = await svc.getCoachAgreements(Number(id));
  return reply.send({ data: agreements });
}

export async function upsertOrgAgreementHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = UpsertOrgAgreementSchema.parse(request.body);
  const userId = (request as any).userId;
  await svc.upsertOrgAgreement(userId, body);
  return reply.send({ message: 'Agreement saved' });
}

export async function respondOrgInviteHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { accept } = RespondOrgInviteSchema.parse(request.body);
  const userId = (request as any).userId;
  const result = await svc.respondToOrgInvite(userId, Number(id), accept);
  recordAudit({
    actorId: userId ?? null,
    action: accept ? 'COACH.INVITE_ACCEPT' : 'COACH.INVITE_REJECT',
    entityType: 'coach_org_agreement',
    entityId: Number(id),
    afterState: { status: result.status },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function createCoachSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateCoachSessionSchema.parse(request.body);
  const userId = (request as any).userId;
  const id = await svc.createCoachSession(userId, body);
  return reply.status(201).send({ id });
}

export async function getMyCoachSessionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { page, limit, role } = request.query as any;
  const viewRole = role === 'player' ? 'player' : 'coach';
  const sessions = await svc.getCoachSessions(userId, viewRole, Number(page) || 1, Number(limit) || 20);
  return reply.send({ data: sessions });
}

export async function createCoachReviewHandler(request: FastifyRequest, reply: FastifyReply) {
  const { coachId } = request.params as any;
  const body = CreateCoachReviewSchema.parse(request.body);
  const userId = (request as any).userId;
  const id = await svc.createCoachReview(userId, Number(coachId), body);
  recordAudit({
    actorId: userId ?? null,
    action: 'COACH.REVIEW_CREATE',
    entityType: 'coach',
    entityId: Number(coachId),
    afterState: { rating: body.rating },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send({ id });
}

// ── Coach dual-confirmation flow ──
export async function getPendingCoachSessionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const sessions = await svc.getPendingCoachSessions(userId);
  return reply.send({ data: sessions });
}

export async function getCoachStatsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const stats = await svc.getCoachStats(userId);
  return reply.send(stats);
}

export async function getCoachPlayersHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const players = await svc.getCoachPlayers(userId);
  return reply.send({ data: players });
}

export async function getCoachSessionByIdHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  const session = await svc.getCoachSessionById(Number(id), userId);
  return reply.send(session);
}

export async function getSessionAvailableCourtsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  const courts = await svc.getAvailableCourts(Number(id), userId);
  return reply.send({ data: courts });
}

export async function bookCourtForSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = BookCourtSchema.parse(request.body);
  const userId = (request as any).userId;
  const result = await svc.bookCourtForSession(userId, Number(id), body);
  recordAudit({
    actorId: userId ?? null,
    action: 'COACH.BOOK_COURT',
    entityType: 'coach_session',
    entityId: Number(id),
    afterState: { bookingId: result.bookingId },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(result);
}

export async function acceptCoachSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  const result = await svc.acceptCoachSession(userId, Number(id));
  recordAudit({
    actorId: userId ?? null,
    action: 'COACH.SESSION_ACCEPT',
    entityType: 'coach_session',
    entityId: Number(id),
    afterState: { status: 'confirmed' },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function declineCoachSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = DeclineSessionSchema.parse(request.body || {});
  const userId = (request as any).userId;
  const result = await svc.declineCoachSession(userId, Number(id), body.reason);
  recordAudit({
    actorId: userId ?? null,
    action: 'COACH.SESSION_DECLINE',
    entityType: 'coach_session',
    entityId: Number(id),
    afterState: { status: 'cancelled', reason: body.reason || null },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

// ── Coach availability ──
export async function getMyCoachAvailabilityHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const result = await svc.getMyCoachAvailability(userId);
  return reply.send(result);
}

export async function setMyCoachAvailabilityHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = SetCoachAvailabilitySchema.parse(request.body);
  const userId = (request as any).userId;
  const weekly = await svc.setMyCoachAvailability(userId, body.slots);
  recordAudit({
    actorId: userId ?? null,
    action: 'COACH.AVAILABILITY_UPDATE',
    entityType: 'coach',
    entityId: userId,
    afterState: { slotCount: body.slots.length },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ weekly });
}

export async function addCoachBlackoutHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = AddCoachBlackoutSchema.parse(request.body);
  const userId = (request as any).userId;
  const result = await svc.addMyCoachBlackout(userId, body.date, body.reason);
  recordAudit({
    actorId: userId ?? null,
    action: 'COACH.BLACKOUT_ADD',
    entityType: 'coach',
    entityId: userId,
    afterState: { date: body.date },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(result);
}

export async function removeCoachBlackoutHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  await svc.removeMyCoachBlackout(userId, Number(id));
  recordAudit({
    actorId: userId ?? null,
    action: 'COACH.BLACKOUT_REMOVE',
    entityType: 'coach',
    entityId: userId,
    afterState: { blackoutId: Number(id) },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

export async function getCoachAvailabilityHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const result = await svc.getCoachAvailabilityPublic(Number(id));
  return reply.send(result);
}

// ── Admin: Tournaments ──
export async function adminListTournamentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { page, limit, status } = request.query as any;
  const result = await svc.listTournamentsAdmin(Number(page) || 1, Number(limit) || 20, status);
  return reply.send(result);
}

export async function updateTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const t = await svc.updateTournament(Number(id), request.body);
  return reply.send(t);
}

export async function deleteTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await svc.deleteTournament(Number(id));
  return reply.status(204).send();
}

// ── Admin: Academies ──
export async function adminListAcademiesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { page, limit } = request.query as any;
  const result = await svc.listAcademiesAdmin(Number(page) || 1, Number(limit) || 20);
  return reply.send(result);
}

export async function updateAcademyHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const a = await svc.updateAcademy(Number(id), request.body);
  return reply.send(a);
}

export async function deleteAcademyHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await svc.deleteAcademy(Number(id));
  return reply.status(204).send();
}

// ── Admin: Coaches ──
export async function adminListCoachesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { page, limit } = request.query as any;
  const result = await svc.listCoachesAdmin(Number(page) || 1, Number(limit) || 20);
  return reply.send(result);
}

export async function updateCoachAdminHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const c = await svc.updateCoachAdmin(Number(id), request.body);
  return reply.send(c);
}

export async function deleteCoachHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await svc.deleteCoach(Number(id));
  return reply.status(204).send();
}

export async function verifyCoachHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await svc.verifyCoach(Number(id));
  return reply.send({ success: true });
}

export async function toggleCoachAvailabilityHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const result = await svc.toggleCoachAvailability(Number(id));
  return reply.send(result);
}

// ── Coach Collaboration Flow (Slice 4) ────────────────────────────────────

const SESSION_EVENTS: Record<string, string> = {
  accepted: 'CoachSessionAccepted',
  declined: 'CoachSessionDeclined',
  counter_proposal: 'CoachSessionCounterProposed',
  confirmed: 'CoachSessionConfirmed',
  started: 'CoachSessionStarted',
  completed: 'CoachSessionCompleted',
  cancelled: 'CoachSessionCancelled',
  no_show: 'CoachSessionNoShow',
};

function emitSessionEvent(eventName: string, session: any, meta?: any) {
  const domainEvent = SESSION_EVENTS[eventName] || eventName;
  eventBus.emit(domainEvent as any, { sessionId: session.id, ...meta, coachId: session.coach_id, playerId: session.player_id });
}

export async function requestCoachSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { coachId, startTime, endTime, organisationId } = request.body as any;

  const pool = (await import('../../../database/mysql.js')).getPool();
  const coach = await (await import('../../activities/infrastructure/repositories/activities.repository.js')).activitiesRepository.findCoachById(coachId);
  if (!coach || coach.status !== 'approved') {
    return reply.status(404).send({ error: 'NOT_FOUND', message: 'Coach not found or not approved' });
  }

  const [result] = await pool.execute<any>(
    `INSERT INTO coach_sessions (coach_id, player_id, organisation_id, start_time, end_time, status, price, currency_code, requested_at)
     VALUES (?, ?, ?, ?, ?, 'requested', ?, ?, NOW())`,
    [coachId, userId, organisationId || null, `${startTime}`, `${endTime}`, coach.hourly_rate || 0, coach.currency_code || 'EGP'],
  );
  const sessionId = result.insertId;

  await coachSessionStateService.logEvent(sessionId, 'requested', { id: userId, role: 'player' });

  recordAudit({ actorId: userId, action: 'COACH_SESSION.REQUESTED', entityType: 'coach_session', entityId: sessionId, afterState: { coachId, startTime, endTime } });

  emitSessionEvent('requested', { id: sessionId, coach_id: coachId, player_id: userId });

  return reply.status(201).send({ id: sessionId, status: 'requested' });
}

export async function respondCoachSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const sessionId = Number((request.params as any).id);
  const { action, proposedStartTime, proposedEndTime } = request.body as any;

  const coach = await svc.findCoachByUserId(userId);
  if (!coach) return reply.status(403).send({ error: 'FORBIDDEN', message: 'Not a coach' });

  const { session } = await coachSessionStateService.transition(
    sessionId, action as string,
    { id: userId, role: 'coach' },
    { proposedStartTime, proposedEndTime, cancelledBy: 'coach', reason: 'Coach declined' },
  );

  emitSessionEvent(action, session);

  recordAudit({ actorId: userId, action: `COACH_SESSION.${action.toUpperCase()}`, entityType: 'coach_session', entityId: sessionId, afterState: { action } });

  return reply.send({ session });
}

export async function confirmCoachSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const sessionId = Number((request.params as any).id);

  const { session } = await coachSessionStateService.transition(sessionId, 'confirmed', { id: userId, role: 'player' });

  emitSessionEvent('confirmed', session);

  recordAudit({ actorId: userId, action: 'COACH_SESSION.CONFIRMED', entityType: 'coach_session', entityId: sessionId });

  return reply.send({ session });
}

export async function cancelCoachSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const sessionId = Number((request.params as any).id);
  const { reason } = request.body as any;

  const { session } = await coachSessionStateService.transition(sessionId, 'cancelled', { id: userId, role: 'player' }, { cancelledBy: 'player', reason });

  emitSessionEvent('cancelled', session, { reason });

  recordAudit({ actorId: userId, action: 'COACH_SESSION.CANCELLED', entityType: 'coach_session', entityId: sessionId, afterState: { reason } });

  return reply.send({ session });
}

export async function startCoachSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const sessionId = Number((request.params as any).id);

  const { session } = await coachSessionStateService.transition(sessionId, 'in_progress', { id: userId, role: 'coach' });

  emitSessionEvent('started', session);

  recordAudit({ actorId: userId, action: 'COACH_SESSION.STARTED', entityType: 'coach_session', entityId: sessionId });

  return reply.send({ session });
}

export async function completeCoachSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const sessionId = Number((request.params as any).id);

  const { session } = await coachSessionStateService.transition(sessionId, 'completed', { id: userId, role: 'coach' });

  emitSessionEvent('completed', session);

  recordAudit({ actorId: userId, action: 'COACH_SESSION.COMPLETED', entityType: 'coach_session', entityId: sessionId });

  return reply.send({ session });
}

export async function noShowCoachSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const sessionId = Number((request.params as any).id);

  const { session } = await coachSessionStateService.transition(sessionId, 'no_show', { id: userId, role: 'coach' });

  emitSessionEvent('no_show', session);

  recordAudit({ actorId: userId, action: 'COACH_SESSION.NO_SHOW', entityType: 'coach_session', entityId: sessionId });

  return reply.send({ session });
}

export async function getCoachSessionDetailHandler(request: FastifyRequest, reply: FastifyReply) {
  const sessionId = Number((request.params as any).id);
  const pool = (await import('../../../database/mysql.js')).getPool();
  const [rows] = await pool.execute<any>(
    `SELECT cs.*, cp.full_name as coach_name, u.full_name as player_name
     FROM coach_sessions cs
     LEFT JOIN coach_profiles cp ON cp.id = cs.coach_id
     LEFT JOIN users u ON u.id = cs.player_id
     WHERE cs.id = ?`,
    [sessionId],
  );
  if (!rows.length) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Session not found' });

  const timeline = await coachSessionStateService.getTimeline(sessionId);
  const allowed = coachSessionStateService.getAllowedTransitions(rows[0].status);

  return reply.send({ session: rows[0], timeline, allowedTransitions: allowed });
}

export async function listCoachRequestsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const coach = await svc.findCoachByUserId(userId);
  if (!coach) return reply.status(403).send({ error: 'FORBIDDEN', message: 'Not a coach' });

  const pool = (await import('../../../database/mysql.js')).getPool();
  const [rows] = await pool.execute<any>(
    `SELECT cs.*, u.full_name as player_name, u.full_phone as player_phone
     FROM coach_sessions cs
     JOIN users u ON u.id = cs.player_id
     WHERE cs.coach_id = ? AND cs.status IN ('requested', 'pending_acceptance')
     ORDER BY cs.start_time ASC`,
    [coach.id],
  );
  return reply.send({ data: rows });
}
