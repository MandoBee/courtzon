import type { FastifyRequest, FastifyReply } from 'fastify';
import { tournamentService } from '../application/tournament.service.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import { z } from 'zod';
import {
  CreateTournamentSchema, UpdateTournamentSchema, ListTournamentsQuerySchema,
  GenerateGroupsSchema,
  AssignCourtSchema, AssignRefereeSchema, CreateStageSchema,
} from './tournament.dto.js';
import { RawMatchResultBodySchema } from '../../match-result/presentation/match-result.dto.js';

const OrgRegisterSchema = z.object({
  team_id: z.coerce.number().int().positive().optional(),
});
import { recordAudit } from '../../audit-log/index.js';
import { AppError } from '../../../shared/errors/app-error.js';

function getUserId(request: FastifyRequest): number { return (request as any).userId; }
function getOrgId(request: FastifyRequest): number { return Number((request.params as any).orgId); }

// ── Group 5B-SR — org-scoped configuration reads (delegate to the SAME shared service) ──

export async function listActiveBracketTypesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const types = await tournamentService.listBracketTypes(false);
  return reply.send({ data: types });
}

export async function getOrgCommissionConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const config = await tournamentService.getOrgCommissionConfig(orgId);
  return reply.send(config);
}

export async function listSportFormatsCascadeHandler(request: FastifyRequest, reply: FastifyReply) {
  const { sportId } = request.params as any;
  const { bracket_type_id } = request.query as any;
  const cascade = await tournamentService.listSportFormatsCascade(Number(sportId), bracket_type_id ? Number(bracket_type_id) : undefined);
  return reply.send({ data: cascade });
}

/**
 * Organisation-scoped tournament API. Tenant isolation is enforced twice:
 * the `requireOrgScopedPermission` guard checks the actor's organisation
 * role-scope, and every handler below asserts the tournament row belongs to
 * `:orgId` before delegating to the SAME authoritative `tournamentService`
 * the admin workbench uses — so no cross-tenant data can ever leak.
 */

async function assertOrgOwnsTournament(orgId: number, tournamentId: number): Promise<void> {
  const ownerOrgId = await tournamentRepository.getOrganisationId(tournamentId);
  if (ownerOrgId == null || ownerOrgId !== orgId) {
    throw new AppError('Tournament does not belong to this organisation', 404, 'TOURNAMENT_NOT_FOUND', {});
  }
}

// ── CRUD ──

export async function listOrgTournamentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const query = ListTournamentsQuerySchema.parse(request.query);
  const result = await tournamentRepository.listForOrg(orgId, query);
  return reply.send(result);
}

export async function getOrgTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const { id } = request.params as any;
  await assertOrgOwnsTournament(orgId, Number(id));
  // Same enriched management detail shape the Super Admin workbench uses.
  const tournament = await tournamentService.getByIdDetailed(Number(id));
  return reply.send(tournament);
}

export async function createOrgTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const userId = getUserId(request);
  const body = CreateTournamentSchema.parse(request.body);
  // Tenancy is authoritative — an org user can never create for another org.
  const tournament = await tournamentService.create({ ...body, organisation_id: orgId }, userId);
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.CREATE', entityType: 'tournament', entityId: tournament.id,
    afterState: { orgId, name: tournament.name },
  });
  return reply.status(201).send(tournament);
}

export async function updateOrgTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = UpdateTournamentSchema.parse(request.body);
  await assertOrgOwnsTournament(orgId, Number(id));
  const tournament = await tournamentService.update(Number(id), body);
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.UPDATE', entityType: 'tournament', entityId: Number(id),
    afterState: { orgId },
  });
  return reply.send(tournament);
}

// ── Lifecycle ──

async function lifecycle(request: FastifyRequest, reply: FastifyReply, action: string) {
  const orgId = getOrgId(request);
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertOrgOwnsTournament(orgId, Number(id));
  const tournament = await (tournamentService as any)[action](Number(id));
  recordAudit({ actorId: userId, action: `TOURNAMENT.${action.toUpperCase()}`, entityType: 'tournament', entityId: Number(id), afterState: { orgId, status: tournament?.status } });
  return reply.send(tournament);
}

export const publishOrgTournamentHandler = (r: FastifyRequest, reply: FastifyReply) => lifecycle(r, reply, 'publish');
export const openOrgRegistrationHandler = (r: FastifyRequest, reply: FastifyReply) => lifecycle(r, reply, 'openRegistration');
export const closeOrgRegistrationHandler = (r: FastifyRequest, reply: FastifyReply) => lifecycle(r, reply, 'closeRegistration');
export const startOrgTournamentHandler = (r: FastifyRequest, reply: FastifyReply) => lifecycle(r, reply, 'startTournament');
export const completeOrgTournamentHandler = (r: FastifyRequest, reply: FastifyReply) => lifecycle(r, reply, 'complete');
export const cancelOrgTournamentHandler = (r: FastifyRequest, reply: FastifyReply) => lifecycle(r, reply, 'cancel');
export const archiveOrgTournamentHandler = (r: FastifyRequest, reply: FastifyReply) => lifecycle(r, reply, 'archive');

// ── Registrations ──

export async function getOrgRegistrationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const { id } = request.params as any;
  await assertOrgOwnsTournament(orgId, Number(id));
  return reply.send(await tournamentService.getRegistrations(Number(id)));
}

export async function registerOrgPlayerHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = OrgRegisterSchema.parse(request.body);
  await assertOrgOwnsTournament(orgId, Number(id));
  const registration = await tournamentService.register(Number(id), userId, body.team_id);
  recordAudit({ actorId: userId, action: 'TOURNAMENT.REGISTER', entityType: 'tournament_registration', entityId: Number(id), afterState: { orgId } });
  return reply.status(201).send(registration);
}

export async function cancelOrgRegistrationHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const userId = getUserId(request);
  const { regId } = request.params as any;
  const ownerOrgId = await tournamentRepository.getRegistrationOrganisationId(Number(regId));
  if (ownerOrgId == null || ownerOrgId !== orgId) throw new AppError('Registration does not belong to this organisation', 404, 'REGISTRATION_NOT_FOUND', {});
  await tournamentService.cancelRegistration(Number(regId));
  recordAudit({ actorId: userId, action: 'TOURNAMENT.CANCEL_REGISTRATION', entityType: 'tournament_registration', entityId: Number(regId), afterState: { orgId } });
  return reply.send({ ok: true });
}

export async function confirmOrgRegistrationHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const userId = getUserId(request);
  const { regId } = request.params as any;
  const ownerOrgId = await tournamentRepository.getRegistrationOrganisationId(Number(regId));
  if (ownerOrgId == null || ownerOrgId !== orgId) throw new AppError('Registration does not belong to this organisation', 404, 'REGISTRATION_NOT_FOUND', {});
  await tournamentService.confirmRegistration(Number(regId));
  recordAudit({ actorId: userId, action: 'TOURNAMENT.CONFIRM_REGISTRATION', entityType: 'tournament_registration', entityId: Number(regId), afterState: { orgId } });
  return reply.send({ ok: true });
}

// ── Groups / fixtures / bracket ──

export async function generateOrgGroupsHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = GenerateGroupsSchema.parse(request.body);
  await assertOrgOwnsTournament(orgId, Number(id));
  await tournamentService.generateGroups(Number(id), body.group_size, body.advance_count);
  recordAudit({ actorId: userId, action: 'TOURNAMENT.GENERATE_GROUPS', entityType: 'tournament', entityId: Number(id), afterState: { orgId } });
  return reply.send({ ok: true });
}

export async function generateOrgFixturesHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertOrgOwnsTournament(orgId, Number(id));
  await tournamentService.generateFixtures(Number(id));
  recordAudit({ actorId: userId, action: 'TOURNAMENT.GENERATE_FIXTURES', entityType: 'tournament', entityId: Number(id), afterState: { orgId } });
  return reply.send({ ok: true });
}

export async function generateOrgBracketHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertOrgOwnsTournament(orgId, Number(id));
  await tournamentService.generateBracket(Number(id));
  recordAudit({ actorId: userId, action: 'TOURNAMENT.GENERATE_BRACKET', entityType: 'tournament', entityId: Number(id), afterState: { orgId } });
  return reply.send({ ok: true });
}

export async function getOrgGroupsHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const { id } = request.params as any;
  await assertOrgOwnsTournament(orgId, Number(id));
  return reply.send(await tournamentService.getGroups(Number(id)));
}

export async function getOrgMatchesHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const { id } = request.params as any;
  await assertOrgOwnsTournament(orgId, Number(id));
  return reply.send(await tournamentService.getMatchesDetailed(Number(id)));
}

export async function getOrgStandingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const { id } = request.params as any;
  await assertOrgOwnsTournament(orgId, Number(id));
  return reply.send(await tournamentService.getStandings(Number(id)));
}

export async function getOrgBracketHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const { id } = request.params as any;
  await assertOrgOwnsTournament(orgId, Number(id));
  return reply.send(await tournamentService.getBracket(Number(id)));
}

// ── Stages (Group 5A mixed formats) ──

export async function createOrgStageHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = CreateStageSchema.parse(request.body);
  await assertOrgOwnsTournament(orgId, Number(id));
  const stage = await tournamentService.createStage(Number(id), body);
  recordAudit({ actorId: userId, action: 'TOURNAMENT.CREATE_STAGE', entityType: 'tournament_stage', entityId: Number(id), afterState: { orgId } });
  return reply.status(201).send(stage);
}

export async function getOrgStagesHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const { id } = request.params as any;
  await assertOrgOwnsTournament(orgId, Number(id));
  return reply.send(await tournamentService.getStages(Number(id)));
}

// ── Match operations (court / referee / result) ──

export async function assignOrgCourtHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const userId = getUserId(request);
  const { matchId } = request.params as any;
  const body = AssignCourtSchema.parse(request.body);
  const ownerOrgId = await tournamentRepository.getMatchOrganisationId(Number(matchId));
  if (ownerOrgId == null || ownerOrgId !== orgId) throw new AppError('Match does not belong to this organisation', 404, 'MATCH_NOT_FOUND', {});
  await tournamentService.assignCourt(Number(matchId), body.resource_id);
  recordAudit({ actorId: userId, action: 'TOURNAMENT.ASSIGN_COURT', entityType: 'tournament_match', entityId: Number(matchId), afterState: { orgId } });
  return reply.send({ ok: true });
}

export async function assignOrgRefereeHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const userId = getUserId(request);
  const { matchId } = request.params as any;
  const body = AssignRefereeSchema.parse(request.body);
  const ownerOrgId = await tournamentRepository.getMatchOrganisationId(Number(matchId));
  if (ownerOrgId == null || ownerOrgId !== orgId) throw new AppError('Match does not belong to this organisation', 404, 'MATCH_NOT_FOUND', {});
  await tournamentService.assignReferee(Number(matchId), body.referee_id);
  recordAudit({ actorId: userId, action: 'TOURNAMENT.ASSIGN_REFEREE', entityType: 'tournament_match', entityId: Number(matchId), afterState: { orgId } });
  return reply.send({ ok: true });
}

export async function recordOrgMatchResultHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const userId = getUserId(request);
  const { matchId } = request.params as any;
  // T-B — the org portal records results through the SAME authoritative shared
  // Match Result lifecycle as the admin workbench (no parallel engine).
  const body = RawMatchResultBodySchema.parse(request.body);
  const ownerOrgId = await tournamentRepository.getMatchOrganisationId(Number(matchId));
  if (ownerOrgId == null || ownerOrgId !== orgId) throw new AppError('Match does not belong to this organisation', 404, 'MATCH_NOT_FOUND', {});
  const out = await tournamentService.recordSharedResult(Number(matchId), userId, body, (request as any).ip);
  recordAudit({ actorId: userId, action: 'TOURNAMENT.RECORD_RESULT', entityType: 'match_result_records', entityId: out.resultId, afterState: { orgId } });
  return reply.status(201).send({ ok: true, resultId: out.resultId });
}

/** T-B — org-scoped start of a Tournament Match's shared Match Session. */
export async function startOrgTournamentMatchHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const userId = getUserId(request);
  const { matchId } = request.params as any;
  const ownerOrgId = await tournamentRepository.getMatchOrganisationId(Number(matchId));
  if (ownerOrgId == null || ownerOrgId !== orgId) throw new AppError('Match does not belong to this organisation', 404, 'MATCH_NOT_FOUND', {});
  const updated = await tournamentService.startTournamentMatch(Number(matchId), userId);
  recordAudit({ actorId: userId, action: 'TOURNAMENT.START_MATCH', entityType: 'tournament_match', entityId: Number(matchId), afterState: { orgId, status: updated.status } });
  return reply.send({ ok: true, status: updated.status });
}

/** T-B — org-scoped completion of a Tournament Match's shared Match Session. */
export async function completeOrgTournamentMatchHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = getOrgId(request);
  const userId = getUserId(request);
  const { matchId } = request.params as any;
  const ownerOrgId = await tournamentRepository.getMatchOrganisationId(Number(matchId));
  if (ownerOrgId == null || ownerOrgId !== orgId) throw new AppError('Match does not belong to this organisation', 404, 'MATCH_NOT_FOUND', {});
  const updated = await tournamentService.completeTournamentMatch(Number(matchId), userId);
  recordAudit({ actorId: userId, action: 'TOURNAMENT.COMPLETE_MATCH', entityType: 'tournament_match', entityId: Number(matchId), afterState: { orgId, status: updated.status } });
  return reply.send({ ok: true, status: updated.status });
}