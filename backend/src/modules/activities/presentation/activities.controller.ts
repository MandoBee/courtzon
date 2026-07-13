import type { FastifyRequest, FastifyReply } from 'fastify';
import { activitiesService as svc } from '../application/activities.service.js';
import { recordAudit } from '../../audit-log/index.js';
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
