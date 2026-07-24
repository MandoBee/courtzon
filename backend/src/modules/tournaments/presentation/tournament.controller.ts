import type { FastifyRequest, FastifyReply } from 'fastify';
import { tournamentService } from '../application/tournament.service.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import { CreateTournamentSchema, RegisterSchema, UpdateScoreSchema } from './tournament.dto.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';

export async function createTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateTournamentSchema.parse(request.body);
  const id = await tournamentService.create(body as any);
  return reply.status(201).send({ data: { id } });
}

export async function getTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const tournament = await tournamentRepository.findById(Number(id));
  if (!tournament) throw new NotFoundError('Tournament');
  return reply.send({ data: tournament });
}

export async function getOpenTournamentsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const data = await tournamentService.getOpenTournaments();
  return reply.send({ data });
}

export async function registerHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = RegisterSchema.parse(request.body);
  const id = await tournamentService.register(body.tournamentId, userId);
  return reply.status(201).send({ data: { id } });
}

export async function generateBracketHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await tournamentService.generateBracket(Number(id));
  return reply.send({ success: true });
}

export async function getBracketHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const data = await tournamentService.getBracket(Number(id));
  return reply.send({ data });
}

export async function updateScoreHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = UpdateScoreSchema.parse(request.body);
  await tournamentService.updateScore(body.matchId, body.winnerId, body.score);
  return reply.send({ success: true });
}

export async function getStandingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const data = await tournamentService.getStandings(Number(id));
  return reply.send({ data });
}

export async function getParticipantsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const data = await tournamentRepository.findParticipants(Number(id));
  return reply.send({ data });
}

export async function getEloHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const query = request.query as any;
  const sportId = parseInt(query.sportId) || 1;
  const data = await tournamentService.getElo(userId, sportId);
  return reply.send({ data });
}
