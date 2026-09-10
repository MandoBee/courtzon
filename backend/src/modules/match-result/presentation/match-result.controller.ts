import type { FastifyRequest, FastifyReply } from 'fastify';
import { RulesValidationError } from '../application/rules/rules-engine.js';
import { recordAudit } from '../../audit-log/index.js';
import { matchResultService } from '../application/match-result.service.js';
import { matchResultRepository } from '../infrastructure/match-result.repository.js';
import {
  CreateRuleSetBodySchema,
  DisputeBodySchema,
  MatchFormatParamsSchema,
  MatchParamsSchema,
  RawMatchResultBodySchema,
  RequestSportParamsSchema,
  ResolveDisputeBodySchema,
  ResultListQuerySchema,
  ResultParamsSchema,
} from './match-result.dto.js';
import { AppError } from '../../../shared/errors/app-error.js';

function toClientError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof RulesValidationError) {
    return new AppError(err.message, 422, 'RULES_VALIDATION', {});
  }
  return new AppError('Unexpected error', 500, 'INTERNAL_ERROR', {});
}

export async function getResultForMatchHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = MatchParamsSchema.parse(request.params);
  const data = await matchResultService.getResultForMatchWithParticipants(id);
  reply.send({ data });
}

export async function submitResultHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const userId = (request as any).userId;
    const { id } = MatchParamsSchema.parse(request.params);
    const body = RawMatchResultBodySchema.parse(request.body);
    const record = await matchResultService.submitMatchResult(id, userId, body, (request as any).ip);
    reply.status(201).send({ data: record });
  } catch (err) {
    throw toClientError(err);
  }
}

export async function replaceResultHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const userId = (request as any).userId;
    const { id } = MatchParamsSchema.parse(request.params);
    const body = RawMatchResultBodySchema.parse(request.body);
    const record = await matchResultService.replaceResult(id, userId, body, (request as any).ip);
    reply.send({ data: record });
  } catch (err) {
    throw toClientError(err);
  }
}

export async function withdrawResultHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const userId = (request as any).userId;
    const { id } = MatchParamsSchema.parse(request.params);
    const record = await matchResultService.withdrawResult(id, userId, (request as any).ip);
    reply.send({ data: record });
  } catch (err) {
    throw toClientError(err);
  }
}

export async function acceptResultHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const userId = (request as any).userId;
    const { id } = MatchParamsSchema.parse(request.params);
    const record = await matchResultService.acceptResult(id, userId, (request as any).ip);
    reply.send({ data: record });
  } catch (err) {
    throw toClientError(err);
  }
}

export async function disputeResultHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const userId = (request as any).userId;
    const { id } = MatchParamsSchema.parse(request.params);
    const body = DisputeBodySchema.parse(request.body);
    const record = await matchResultService.disputeResult(id, userId, body.reason, (request as any).ip);
    reply.send({ data: record });
  } catch (err) {
    throw toClientError(err);
  }
}

export async function resolveDisputeHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const userId = (request as any).userId;
    const { resultId } = ResultParamsSchema.parse(request.params);
    const body = ResolveDisputeBodySchema.parse(request.body);
    const record = await matchResultService.resolveDispute(resultId, userId, {
      approve: body.approve,
      displayResult: body.displayResult ?? undefined,
      note: body.note,
    }, (request as any).ip);
    reply.send({ data: record });
  } catch (err) {
    throw toClientError(err);
  }
}

export async function correctResultHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const userId = (request as any).userId;
    const { resultId } = ResultParamsSchema.parse(request.params);
    const body = RawMatchResultBodySchema.parse(request.body);
    const record = await matchResultService.correctResult(resultId, userId, body, (request as any).ip);
    reply.send({ data: record });
  } catch (err) {
    throw toClientError(err);
  }
}

export async function listMyResultsHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = (request as any).userId;
  const query = ResultListQuerySchema.parse(request.query);
  const data = await matchResultService.listForUser(userId, query.limit, query.offset);
  reply.send({ data });
}

export async function listAdminResultsHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const query = ResultListQuerySchema.parse(request.query);
  const data = await matchResultService.listForAdmin({ status: query.status, limit: query.limit, offset: query.offset });
  reply.send({ data });
}

export async function listSportRulesHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { sportId } = RequestSportParamsSchema.parse(request.params);
  const data = await matchResultRepository.listRuleSetsBySport(sportId, false);
  reply.send({ data });
}

export async function listFormatsHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const data = await matchResultRepository.listFormats();
  reply.send({ data });
}

export async function createRuleSetHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const actorId = (request as any).userId;
  const { formatId } = MatchFormatParamsSchema.parse(request.params);
  const body = CreateRuleSetBodySchema.parse(request.body);
  const ruleSetId = await matchResultRepository.createRuleSet({
    formatId,
    name: body.name ?? null,
    rules: body.rules,
    standingsRules: body.standingsRules ?? null,
    isActive: body.isActive,
    isDefault: body.isDefault,
  });
  await recordAudit({ actorId, action: 'match.rules.created', entityType: 'sport_rule_sets', entityId: ruleSetId, afterState: body as unknown as Record<string, unknown> });
  reply.status(201).send({ data: { ruleSetId } });
}