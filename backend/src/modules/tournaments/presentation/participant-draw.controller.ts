import type { FastifyRequest, FastifyReply } from 'fastify';
import { participantDrawService } from '../application/participant-draw.service.js';
import { participantMemberService } from '../application/participant-member.service.js';
import {
  AssignSeedSchema, GenerateDrawSchema, MoveParticipantSchema, WithdrawParticipantSchema,
  PromoteWaitlistSchema, ReplaceParticipantSchema,
  CreatePairParticipantSchema, CreateTeamParticipantSchema,
  AddParticipantMemberSchema, RemoveParticipantMemberSchema,
  CreateReplacementRequestSchema, ReviewReplacementSchema,
  ScheduleMatchSchema, GenerateMatchesSchema,
} from './tournament.dto.js';
import { matchScheduleService } from '../application/match-schedule.service.js';

function getUserId(request: FastifyRequest): number { return (request as any).userId; }

// ── Group 5 — Participants / Seeding / Draw foundation (admin) ──

export async function listParticipantsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const data = await participantDrawService.listParticipants(Number(id));
  return reply.send({ data });
}

// ── Group 6 — Participant lifecycle (admin) ──

export async function listWaitlistHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const data = await participantDrawService.listWaitingParticipants(Number(id));
  return reply.send({ data });
}

export async function withdrawParticipantHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id, participantId } = request.params as any;
  const body = WithdrawParticipantSchema.parse(request.body);
  const result = await participantDrawService.withdrawParticipant(Number(id), Number(participantId), userId, body.reason);
  return reply.send(result);
}

export async function promoteNextWaitlistedHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = PromoteWaitlistSchema.parse(request.body);
  const result = await participantDrawService.promoteNextWaitlisted(Number(id), userId, body.payment_method);
  return reply.send(result);
}

export async function replaceParticipantHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id, participantId } = request.params as any;
  const body = ReplaceParticipantSchema.parse(request.body);
  const result = await participantDrawService.replaceParticipant(Number(id), Number(participantId), body.replacement_participant_id, userId, body.payment_method);
  return reply.send(result);
}

export async function assignSeedHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id, participantId } = request.params as any;
  const body = AssignSeedSchema.parse(request.body);
  const seed = await participantDrawService.assignSeed(Number(id), Number(participantId), { seedNumber: body.seed_number, source: body.source, reason: body.reason }, userId);
  return reply.send(seed);
}

export async function generateDrawHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = GenerateDrawSchema.parse(request.body);
  const draw = await participantDrawService.generateDraw(Number(id), userId, body.draw_seed);
  return reply.send(draw);
}

export async function listDrawsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const data = await participantDrawService.listDraws(Number(id));
  return reply.send({ data });
}

export async function getCurrentDrawHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const draw = await participantDrawService.getCurrentDraw(Number(id));
  return reply.send(draw);
}

export async function validateDrawHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const result = await participantDrawService.validateDraw(Number(id));
  return reply.send(result);
}

export async function moveParticipantHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = MoveParticipantSchema.parse(request.body);
  const result = await participantDrawService.moveParticipant(Number(id), body.participant_id, body.position, userId, { override: body.override });
  return reply.send(result);
}

export async function approveDrawHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const draw = await participantDrawService.approveDraw(Number(id), userId);
  return reply.send(draw);
}

export async function lockDrawHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const draw = await participantDrawService.lockDraw(Number(id), userId);
  return reply.send(draw);
}

// ── Group 7 — pair/team participants, members & player replacement requests (admin) ──

export async function createPairParticipantHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = CreatePairParticipantSchema.parse(request.body);
  const result = await participantMemberService.createPairParticipant(Number(id), { name: body.name, memberUserIds: body.member_user_ids, paymentMethod: body.payment_method }, userId);
  return reply.status(201).send(result);
}

export async function createTeamParticipantHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = CreateTeamParticipantSchema.parse(request.body);
  const result = await participantMemberService.createTeamParticipant(Number(id), { name: body.name, memberUserIds: body.member_user_ids, paymentMethod: body.payment_method }, userId);
  return reply.status(201).send(result);
}

export async function listParticipantMembersHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id, participantId } = request.params as any;
  const data = await participantMemberService.listParticipantMembers(Number(id), Number(participantId));
  return reply.send({ data });
}

export async function addParticipantMemberHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id, participantId } = request.params as any;
  const body = AddParticipantMemberSchema.parse(request.body);
  const data = await participantMemberService.addParticipantMember(Number(id), Number(participantId), body.user_id, userId);
  return reply.send({ data });
}

export async function removeParticipantMemberHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id, participantId } = request.params as any;
  const body = RemoveParticipantMemberSchema.parse(request.body);
  const data = await participantMemberService.removeParticipantMember(Number(id), Number(participantId), body.user_id, userId);
  return reply.send({ data });
}

export async function listReplacementRequestsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { status } = request.query as any;
  const data = await participantMemberService.listReplacementRequests(Number(id), status ? String(status) : undefined);
  return reply.send({ data });
}

export async function createReplacementRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id, participantId } = request.params as any;
  const body = CreateReplacementRequestSchema.parse(request.body);
  const result = await participantMemberService.createReplacementRequest(Number(id), Number(participantId), { outgoingUserId: body.outgoing_user_id, replacementUserId: body.replacement_user_id, reason: body.reason }, userId);
  return reply.status(201).send(result);
}

export async function approveReplacementRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id, requestId } = request.params as any;
  const result = await participantMemberService.approveReplacementRequest(Number(id), Number(requestId), userId);
  return reply.send(result);
}

export async function rejectReplacementRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id, requestId } = request.params as any;
  const body = ReviewReplacementSchema.parse(request.body ?? {});
  const result = await participantMemberService.rejectReplacementRequest(Number(id), Number(requestId), userId, body.reason);
  return reply.send(result);
}

export async function cancelReplacementRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id, requestId } = request.params as any;
  const result = await participantMemberService.cancelReplacementRequest(Number(id), Number(requestId), userId);
  return reply.send(result);
}

// ── Group 8 — match generation, scheduling & court reservation (admin) ──

export async function generateMatchesHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  GenerateMatchesSchema?.parse(request.body ?? {});
  const result = await matchScheduleService.generateMatchesFromLockedDraw(Number(id), userId);
  return reply.status(201).send(result);
}

export async function listEligibleCourtsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const data = await matchScheduleService.listEligibleCourts(Number(id));
  return reply.send({ data });
}

export async function scheduleMatchHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id, matchId } = request.params as any;
  const body = ScheduleMatchSchema.parse(request.body);
  const result = await matchScheduleService.scheduleMatch(Number(id), Number(matchId), { date: body.date, start_time: body.start_time, end_time: body.end_time, resource_id: body.resource_id }, userId);
  return reply.send(result);
}

export async function autoScheduleHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const result = await matchScheduleService.autoSchedule(Number(id), userId);
  return reply.send(result);
}

export async function releaseMatchCourtHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id, matchId } = request.params as any;
  const result = await matchScheduleService.releaseMatchCourt(Number(id), Number(matchId), userId);
  return reply.send(result);
}