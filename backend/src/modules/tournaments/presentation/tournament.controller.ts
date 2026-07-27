import type { FastifyRequest, FastifyReply } from 'fastify';
import { tournamentService } from '../application/tournament.service.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import {
  CreateTournamentSchema, UpdateTournamentSchema, ListTournamentsQuerySchema,
  RegisterSchema, GenerateGroupsSchema, RecordResultSchema,
  AssignCourtSchema, AssignRefereeSchema,
} from './tournament.dto.js';
import { recordAudit } from '../../audit-log/index.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';

function getUserId(request: FastifyRequest): number { return (request as any).userId; }
function getUserAgent(request: FastifyRequest): string | undefined {
  const ua = request.headers['user-agent'];
  return typeof ua === 'string' ? ua : undefined;
}

// ── Dashboard ──

export async function getDashboardHandler(_request: FastifyRequest, reply: FastifyReply) {
  const data = await tournamentService.getDashboard();
  return reply.send(data);
}

// ── CRUD ──

export async function listTournamentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = ListTournamentsQuerySchema.parse(request.query);
  const result = await tournamentService.list(query);
  return reply.send(result);
}

export async function getTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const tournament = await tournamentService.getById(Number(id));
  return reply.send(tournament);
}

export async function createTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = CreateTournamentSchema.parse(request.body);
  const tournament = await tournamentService.create(body);
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.CREATE', entityType: 'tournament',
    entityId: tournament.id!, afterState: { code: body.code, name: body.name, format: body.format },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(tournament);
}

export async function updateTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = UpdateTournamentSchema.parse(request.body);
  const before = await tournamentService.getById(Number(id));
  const tournament = await tournamentService.update(Number(id), body);
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.UPDATE', entityType: 'tournament',
    entityId: Number(id), beforeState: before ? { name: before.name, status: before.status } : null,
    afterState: { ...body }, ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(tournament);
}

// ── Status transitions ──

export async function publishTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const tournament = await tournamentService.publish(Number(id));
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.PUBLISH', entityType: 'tournament',
    entityId: Number(id), afterState: { status: 'published' },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(tournament);
}

export async function openRegistrationHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const tournament = await tournamentService.openRegistration(Number(id));
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.OPEN_REGISTRATION', entityType: 'tournament',
    entityId: Number(id), afterState: { status: 'registration_open' },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(tournament);
}

export async function closeRegistrationHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const tournament = await tournamentService.closeRegistration(Number(id));
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.CLOSE_REGISTRATION', entityType: 'tournament',
    entityId: Number(id), afterState: { status: 'registration_closed' },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(tournament);
}

export async function startTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const tournament = await tournamentService.startTournament(Number(id));
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.START', entityType: 'tournament',
    entityId: Number(id), afterState: { status: 'running' },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(tournament);
}

export async function completeTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const tournament = await tournamentService.complete(Number(id));
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.COMPLETE', entityType: 'tournament',
    entityId: Number(id), afterState: { status: 'completed' },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(tournament);
}

export async function cancelTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const tournament = await tournamentService.cancel(Number(id));
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.CANCEL', entityType: 'tournament',
    entityId: Number(id), afterState: { status: 'cancelled' },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(tournament);
}

export async function archiveTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await tournamentService.archive(Number(id));
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.ARCHIVE', entityType: 'tournament',
    entityId: Number(id), afterState: { status: 'archived' },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(204).send();
}

// ── Registration ──

export async function registerHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = RegisterSchema.parse(request.body);
  const registration = await tournamentService.register(body.tournament_id, userId, body.team_id);
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.REGISTER', entityType: 'tournament_registration',
    entityId: registration.id!, afterState: { tournament_id: body.tournament_id, team_id: body.team_id },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(registration);
}

export async function registerPlayerHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = RegisterSchema.parse(request.body);
  const registration = await tournamentService.register(Number(id), userId, body.team_id);
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.REGISTER', entityType: 'tournament_registration',
    entityId: registration.id!, afterState: { tournament_id: id, team_id: body.team_id },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(registration);
}

export async function cancelRegistrationHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { regId } = request.params as any;
  await tournamentService.cancelRegistration(Number(regId));
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.CANCEL_REGISTRATION', entityType: 'tournament_registration',
    entityId: Number(regId), ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Registration cancelled' });
}

export async function confirmRegistrationHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { regId } = request.params as any;
  await tournamentService.confirmRegistration(Number(regId));
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.CONFIRM_REGISTRATION', entityType: 'tournament_registration',
    entityId: Number(regId), ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Registration confirmed' });
}

// ── Groups ──

export async function generateGroupsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = GenerateGroupsSchema.parse(request.body);
  await tournamentService.generateGroups(Number(id), body.group_size, body.advance_count);
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.GENERATE_GROUPS', entityType: 'tournament',
    entityId: Number(id), afterState: { group_size: body.group_size, advance_count: body.advance_count },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Groups generated' });
}

export async function getGroupsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const data = await tournamentService.getGroups(Number(id));
  return reply.send({ data });
}

export async function generateFixturesHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await tournamentService.generateFixtures(Number(id));
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.GENERATE_FIXTURES', entityType: 'tournament',
    entityId: Number(id), ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Fixtures generated' });
}

export async function generateBracketHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await tournamentService.generateBracket(Number(id));
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.GENERATE_BRACKET', entityType: 'tournament',
    entityId: Number(id), ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ success: true });
}

export async function getBracketHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const data = await tournamentService.getBracket(Number(id));
  return reply.send({ data });
}

export async function getMatchesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const data = await tournamentService.getMatches(Number(id));
  return reply.send({ data });
}

export async function getStandingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { group_id } = request.query as any;
  const data = await tournamentService.getStandings(Number(id), group_id ? Number(group_id) : undefined);
  return reply.send({ data });
}

export async function getParticipantsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const data = await tournamentService.getRegistrations(Number(id));
  return reply.send({ data });
}

// ── Match management ──

export async function recordMatchResultHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { matchId } = request.params as any;
  const body = RecordResultSchema.parse(request.body);
  await tournamentService.recordMatchResult(Number(matchId), body.winner_id, body.home_score, body.away_score, body.score_details, userId);
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.RECORD_RESULT', entityType: 'tournament_match',
    entityId: Number(matchId), afterState: { winner_id: body.winner_id },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ success: true });
}

export async function assignCourtHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { matchId } = request.params as any;
  const body = AssignCourtSchema.parse(request.body);
  await tournamentService.assignCourt(Number(matchId), body.resource_id);
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.ASSIGN_COURT', entityType: 'tournament_match',
    entityId: Number(matchId), afterState: { resource_id: body.resource_id },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Court assigned' });
}

export async function assignRefereeHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { matchId } = request.params as any;
  const body = AssignRefereeSchema.parse(request.body);
  await tournamentService.assignReferee(Number(matchId), body.referee_id);
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.ASSIGN_REFEREE', entityType: 'tournament_match',
    entityId: Number(matchId), afterState: { referee_id: body.referee_id },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Referee assigned' });
}
