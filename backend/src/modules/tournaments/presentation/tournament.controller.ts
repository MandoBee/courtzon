import type { FastifyRequest, FastifyReply } from 'fastify';
import { tournamentService } from '../application/tournament.service.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import { tournamentPrizeAwardService } from '../application/tournament-prize-award.service.js';
import {
  UpdateTournamentSchema, ListTournamentsQuerySchema,
  RegisterSchema, GenerateGroupsSchema,
  AssignCourtSchema, AssignRefereeSchema, CreateStageSchema, BracketTypeUpdateSchema,
} from './tournament.dto.js';
import { RawMatchResultBodySchema } from '../../match-result/presentation/match-result.dto.js';
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
  // G11.14 — when a tenant scope is supplied, the platform list honours it in
  // SQL (never a JS filter) so an org-scoped caller can never observe another
  // tenant's tournaments by accident. Platform admins omit it and see all orgs.
  const result = await tournamentService.list({
    ...query,
    organisationId: query.organisation_id ?? undefined,
  });
  return reply.send(result);
}

// ── G11.16 — Public / anonymous tournament discovery (NON-FINANCIAL) ──
// Paths are under /public/ so the GLOBAL auth middleware skips them (no token
// is required). Read-only; is_public=1 only; private tournaments 404.

export async function listPublicTournamentsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const data = await tournamentService.listPublic();
  return reply.send({ data });
}

export async function getPublicTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const data = await tournamentService.getPublicTournament(Number(id));
  return reply.send({ data });
}

// ── G11.17 — Player team self-service (non-financial) ──
// Reuses teamInvitationService + participantMemberService. All operations are
// scoped to the tournament/participant and are server-authoritative.

export async function createTeamHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = (request.body ?? {}) as { name?: string; memberUserIds?: number[]; competitionId?: number | null };
  const { teamInvitationService } = await import('../application/team-invitation.service.js');
  const team = await teamInvitationService.createTeamForPlayer(Number(id), userId, body);
  return reply.status(201).send(team);
}

export async function listTeamsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const { teamInvitationService } = await import('../application/team-invitation.service.js');
  const [mine, joinable] = await Promise.all([
    teamInvitationService.listMyTeams(Number(id), userId),
    teamInvitationService.listTeamsForJoin(Number(id)),
  ]);
  return reply.send({ data: { mine, joinable } });
}

// ── G11.18 Phase 2 — competition categories for the player registration flow ──
export async function listTournamentCompetitionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { competitionService } = await import('../application/competition.service.js');
  const competitions = await competitionService.listCompetitions(Number(id));
  return reply.send({ data: competitions });
}

export async function joinTeamHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id, participantId } = request.params as any;
  const { teamInvitationService } = await import('../application/team-invitation.service.js');
  await teamInvitationService.joinTeam(Number(id), Number(participantId), userId);
  return reply.send({ ok: true });
}

export async function createInvitationHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id, participantId } = request.params as any;
  const body = (request.body ?? {}) as { inviteeUserId?: number };
  if (!body.inviteeUserId) {
    return reply.status(400).send({ message: 'inviteeUserId is required', code: 'VALIDATION_ERROR' });
  }
  const { teamInvitationService } = await import('../application/team-invitation.service.js');
  const invitation = await teamInvitationService.invitePlayer(Number(id), Number(participantId), Number(body.inviteeUserId), userId);
  return reply.status(201).send(invitation);
}

export async function listSentInvitationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id, participantId } = request.params as any;
  const { teamInvitationService } = await import('../application/team-invitation.service.js');
  const invitations = await teamInvitationService.listSentInvitations(Number(id), Number(participantId), userId);
  return reply.send({ data: invitations });
}

export async function listMyInvitationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { teamInvitationService } = await import('../application/team-invitation.service.js');
  const invitations = await teamInvitationService.listMyInvitations(userId);
  return reply.send({ data: invitations });
}

export async function acceptInvitationHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id, invitationId } = request.params as any;
  const { teamInvitationService } = await import('../application/team-invitation.service.js');
  const invitation = await teamInvitationService.acceptInvitation(Number(id), Number(invitationId), userId);
  return reply.send(invitation);
}

export async function rejectInvitationHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id, invitationId } = request.params as any;
  const { teamInvitationService } = await import('../application/team-invitation.service.js');
  const invitation = await teamInvitationService.rejectInvitation(Number(id), Number(invitationId), userId);
  return reply.send(invitation);
}

export async function getTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  // Shared Admin/Org management detail shape (raw row + sport_name/organisation_name/max_players/type).
  const tournament = await tournamentService.getByIdDetailed(Number(id));
  return reply.send(tournament);
}

// G11 Phase 3 — `createTournamentHandler` is REMOVED. The global
// `POST /admin/tournaments` route that referenced it is gone: it trusted the
// body `organisation_id` with no ownership check and could therefore create an
// org-less ("platform") tournament, which the locked product rule forbids.
// Tournament creation is now organisation-only via
// `POST /org/:orgId/tournaments` (`createOrgTournamentHandler`), which forces
// `organisation_id` from `:orgId`. Super-admins create on behalf of a selected
// organisation through that same organisation-scoped capability.

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

// ── G11.5 — Prize Awards ─────────────────────────────────────────────────────
// Staff-scoped award management. Award creation + refund already record their
// own audit entries inside the service (tournament.prize.awarded/refunded) — no
// duplicate audit here.

export async function listPrizeAwardsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const awards = await tournamentPrizeAwardService.listAwards(Number(id));
  return reply.send(awards);
}

export async function listAwardablePrizesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const prizes = await tournamentPrizeAwardService.listAwardablePrizes(Number(id));
  return reply.send(prizes);
}

export async function grantPrizeAwardHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = (request.body ?? {}) as { prizeId?: number; winnerUserId?: number };
  if (!body.prizeId || !body.winnerUserId) {
    return reply.status(400).send({ message: 'prizeId and winnerUserId are required', code: 'VALIDATION_ERROR' });
  }
  const award = await tournamentPrizeAwardService.manualGrant(Number(id), {
    prizeId: Number(body.prizeId),
    winnerUserId: Number(body.winnerUserId),
    createdBy: userId,
  });
  return reply.status(201).send(award);
}

export async function refundPrizeAwardHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { awardId } = request.params as any;
  const body = (request.body ?? {}) as { reason?: string };
  const award = await tournamentPrizeAwardService.refundAward(Number(awardId), userId, body.reason);
  return reply.send(award);
}

// G11-Tournament Phase 2 — READ-ONLY tournament finances (admin, financial.reconcile).
export async function getTournamentFinancesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { tournamentFinancesService } = await import('../../financial/application/tournament-finances.service.js');
  const report = await tournamentFinancesService.forTournament(Number(id));
  return reply.send({ data: report });
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
  // G11.21.4 — the route `:id` is the authoritative tournament. A client-supplied
  // `body.tournament_id` is IGNORED: it previously let a caller redirect an
  // org-scoped operator registration to another organisation's tournament.
  const tournamentId = Number((request.params as any).id);
  // Group 7-B — this route is gated by `tournament.register` (privileged
  // registration): the operator MAY bypass eligibility, recorded in the snapshot.
  const registration = body.payment_method
    ? await tournamentService.register(tournamentId, userId, body.team_id, body.payment_method, { operatorBypass: true, competitionId: body.competition_id })
    : await tournamentService.register(tournamentId, userId, body.team_id, undefined, { operatorBypass: true, competitionId: body.competition_id });
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.REGISTER', entityType: 'tournament_registration',
    entityId: registration.id!, afterState: { tournament_id: tournamentId, team_id: body.team_id, competition_id: body.competition_id ?? null, payment_method: body.payment_method ?? null },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(registration);
}

export async function registerPlayerHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = RegisterSchema.parse(request.body);
  // G7-B.1 — THIS is the PLAYER SELF-REGISTRATION route. It always enforces
  // eligibility (age/gender/level): operatorBypass is hard-coded FALSE here and
  // can NEVER be influenced by the client. Only the permission-gated admin/org
  // operator routes may bypass.
  const registration = body.payment_method
    ? await tournamentService.register(Number(id), userId, body.team_id, body.payment_method, { operatorBypass: false, competitionId: body.competition_id })
    : await tournamentService.register(Number(id), userId, body.team_id, undefined, { operatorBypass: false, competitionId: body.competition_id });
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.REGISTER', entityType: 'tournament_registration',
    entityId: registration.id!, afterState: { tournament_id: id, team_id: body.team_id, competition_id: body.competition_id ?? null, payment_method: body.payment_method ?? null },
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

// ── G11.3 — player refund-request endpoints (ownership enforced in service) ──

export async function requestRefundHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { regId } = request.params as any;
  const { RefundRequestSchema } = await import('./tournament.dto.js');
  const body = RefundRequestSchema.parse(request.body ?? {});
  const { tournamentRefundService } = await import('../application/tournament-refund.service.js');
  const created = await tournamentRefundService.requestRefund(Number(regId), userId, body.reason);
  return reply.status(201).send(created);
}

export async function getMyRefundRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { regId } = request.params as any;
  const { tournamentRefundService } = await import('../application/tournament-refund.service.js');
  const current = await tournamentRefundService.getMyRefundRequest(Number(regId), userId);
  return reply.send(current ?? { status: null });
}

// ── G11.8 — player self-service cancellation (own registration) ──

export async function cancelRegistrationSelfServiceHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { registrationId } = request.params as any;
  const { CancelRegistrationSchema } = await import('./tournament.dto.js');
  const body = CancelRegistrationSchema.parse(request.body ?? {});
  const { tournamentRefundService } = await import('../application/tournament-refund.service.js');
  const result = await tournamentRefundService.cancelRegistrationSelfService(Number(registrationId), userId, body.reason);
  return reply.send(result);
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
  if (body.stage_id != null) {
    // Step 3B-2 — GSK group stage generation (stage-driven configuration).
    // Lazy import keeps the heavy DB/env module graph out of unrelated boot paths.
    const { groupStageService } = await import('../application/group-stage.service.js');
    const res = await groupStageService.generateGroupStage(Number(id), body.stage_id, userId, body.competition_id);
    recordAudit({
      actorId: userId, action: 'TOURNAMENT.GROUP_STAGE_GENERATED', entityType: 'tournament',
      entityId: Number(id), afterState: { ...res }, ipAddress: request.ip, userAgent: getUserAgent(request),
    });
    return reply.send({ message: 'Group stage generated', data: res });
  }
  await tournamentService.generateGroups(Number(id), body.group_size, body.advance_count, body.competition_id);
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.GENERATE_GROUPS', entityType: 'tournament',
    entityId: Number(id), afterState: { group_size: body.group_size, advance_count: body.advance_count, competition_id: body.competition_id ?? null },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Groups generated' });
}

export async function getGroupsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  // Admin management contract: RAW array (matches the org + shared detail page).
  const data = await tournamentService.getGroups(Number(id));
  return reply.send(data);
}

export async function getBracketHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const data = await tournamentService.getBracket(Number(id));
  return reply.send({ data });
}

export async function getMatchesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const data = await tournamentService.getMatchesDetailed(Number(id));
  return reply.send({ data });
}

export async function getStandingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { group_id } = request.query as any;
  const data = await tournamentService.getStandings(Number(id), group_id ? Number(group_id) : undefined);
  return reply.send({ data });
}

/**
 * Admin management matches — RAW array (matches the org + shared detail page
 * contract). The public/player `/tournaments/:id/matches` keeps the `{ data }`
 * envelope via getMatchesHandler.
 */
export async function getAdminMatchesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const data = await tournamentService.getMatchesDetailed(Number(id));
  return reply.send(data);
}

/**
 * Admin management standings — RAW array (matches the org + shared detail page
 * contract). The public/player `/tournaments/:id/standings` keeps the
 * `{ data }` envelope via getStandingsHandler.
 */
export async function getAdminStandingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { group_id } = request.query as any;
  const data = await tournamentService.getStandings(Number(id), group_id ? Number(group_id) : undefined);
  return reply.send(data);
}

/** Admin management registrations — RAW array (mirrors the org registrations contract). */
export async function getRegistrationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const data = await tournamentService.getRegistrations(Number(id));
  return reply.send(data);
}

export async function getParticipantsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const data = await tournamentService.getRegistrations(Number(id));
  return reply.send({ data });
}

// ── Stages (Group 5A — MIXED tournaments) ──

export async function createStageHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = CreateStageSchema.parse(request.body);
  const stage = await tournamentService.createStage(Number(id), body);
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.CREATE_STAGE', entityType: 'tournament_stage',
    entityId: stage.id!, afterState: { ...body },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(stage);
}

export async function getStagesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const data = await tournamentService.getStages(Number(id));
  return reply.send({ data });
}

// ── Match management ──

export async function recordMatchResultHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { matchId } = request.params as any;
  // T-B — tournament results go through the AUTHORITATIVE shared Match Result
  // lifecycle (operator submission). The legacy tournament_match_results path
  // is retained for history only.
  const body = RawMatchResultBodySchema.parse(request.body);
  const out = await tournamentService.recordSharedResult(Number(matchId), userId, body, (request as any).ip);
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.RECORD_RESULT', entityType: 'match_result_records',
    entityId: out.resultId, afterState: { sharedMatchId: out.sharedMatchId },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send({ success: true, resultId: out.resultId, sharedMatchId: out.sharedMatchId });
}

/** T-B — start the shared Match Session of a Tournament Match. */
export async function startTournamentMatchHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { matchId } = request.params as any;
  const updated = await tournamentService.startTournamentMatch(Number(matchId), userId);
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.START_MATCH', entityType: 'tournament_match',
    entityId: Number(matchId), afterState: { status: updated.status },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ success: true, status: updated.status });
}

/** T-B — complete the shared Match Session of a Tournament Match. */
export async function completeTournamentMatchHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { matchId } = request.params as any;
  const updated = await tournamentService.completeTournamentMatch(Number(matchId), userId);
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.COMPLETE_MATCH', entityType: 'tournament_match',
    entityId: Number(matchId), afterState: { status: updated.status },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ success: true, status: updated.status });
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

// ── Group 5B-SR — Bracket type configuration ──

/** Active bracket types (create form) — platform config reference data. */
export async function listActiveBracketTypesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const types = await tournamentService.listBracketTypes(false);
  return reply.send({ data: types });
}

/** All bracket types (Super Admin management) with reference counts + engine support. */
export async function listBracketTypesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const types = await tournamentService.listBracketTypes(true);
  const enriched = await Promise.all(
    types.map(async (bt) => ({
      ...bt,
      is_active: Boolean(Number(bt.is_active)),
      referenced_count: await tournamentRepository.countBracketTypeReferences(bt.id),
    })),
  );
  return reply.send({ data: enriched });
}

export async function updateBracketTypeHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = BracketTypeUpdateSchema.parse(request.body);
  const updated = await tournamentService.updateBracketTypeActive(Number(id), body.is_active, userId);
  recordAudit({
    actorId: userId, action: 'TOURNAMENT.BRACKET_TYPE_UPDATE', entityType: 'tournament_bracket_type',
    entityId: Number(id), afterState: { is_active: body.is_active },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(updated);
}

/** Organisation's authoritative tournament commission config (read-only, subscription-derived). */
export async function getOrgCommissionConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const config = await tournamentService.getOrgCommissionConfig(Number(orgId));
  return reply.send(config);
}

/** Sport → Match Format → Rule Set cascade (create form). */
export async function listSportFormatsCascadeHandler(request: FastifyRequest, reply: FastifyReply) {
  const { sportId } = request.params as any;
  const { bracket_type_id } = request.query as any;
  const cascade = await tournamentService.listSportFormatsCascade(Number(sportId), bracket_type_id ? Number(bracket_type_id) : undefined);
  return reply.send({ data: cascade });
}
