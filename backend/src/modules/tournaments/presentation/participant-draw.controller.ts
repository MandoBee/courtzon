import type { FastifyRequest, FastifyReply } from 'fastify';
import { participantDrawService } from '../application/participant-draw.service.js';
import { AssignSeedSchema, GenerateDrawSchema, MoveParticipantSchema } from './tournament.dto.js';

function getUserId(request: FastifyRequest): number { return (request as any).userId; }

// ── Group 5 — Participants / Seeding / Draw foundation (admin) ──

export async function listParticipantsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const data = await participantDrawService.listParticipants(Number(id));
  return reply.send({ data });
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