import type { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../../../shared/errors/app-error.js';
import { RulesValidationError } from '../application/rules/rules-engine.js';
import {
  sportConfigAdminService,
  type FormatWritePayload,
  type RuleSetWritePayload,
} from '../application/sport-config.admin.service.js';
import {
  AdminFormatListQuerySchema,
  AdminFormatParamsSchema,
  AdminFormatRuleSetParamsSchema,
  AdminRuleSetParamsSchema,
  AdminSportParamsSchema,
  FormatCreateBodySchema,
  FormatUpdateBodySchema,
  RuleSetCreateBodySchema,
  RuleSetUpdateBodySchema,
} from './sport-config.admin.dto.js';

function toClientError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof RulesValidationError) {
    return new AppError(err.message, 422, 'RULES_VALIDATION', {});
  }
  return new AppError('Unexpected error', 500, 'INTERNAL_ERROR', {});
}

/** GET /admin/sport-formats — every format (active + inactive), enriched. */
export async function listFormatsHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { sportId } = AdminFormatListQuerySchema.parse(request.query);
  const data = await sportConfigAdminService.listFormats(sportId);
  reply.send({ data });
}

/** GET /admin/sport-formats/:id — format detail incl. all rule-set versions. */
export async function getFormatHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = AdminFormatParamsSchema.parse(request.params);
  const data = await sportConfigAdminService.getFormatDetail(id);
  reply.send({ data });
}

/** POST /admin/sports/:sportId/formats — create a format under a sport. */
export async function createFormatHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const actorId = (request as any).userId;
    const { sportId } = AdminSportParamsSchema.parse(request.params);
    const body = FormatCreateBodySchema.parse(request.body);
    const data = await sportConfigAdminService.createFormat(
      sportId,
      body as FormatWritePayload & { slug: string; name: string; formatType: 'singles' | 'doubles' | 'team' },
      actorId,
    );
    reply.status(201).send({ data });
  } catch (err) {
    throw toClientError(err);
  }
}

/** PUT /admin/sport-formats/:id — update format metadata/lifecycle (slug immutable). */
export async function updateFormatHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const actorId = (request as any).userId;
    const { id } = AdminFormatParamsSchema.parse(request.params);
    const body = FormatUpdateBodySchema.parse(request.body) as FormatWritePayload;
    const data = await sportConfigAdminService.updateFormat(id, body, actorId);
    reply.send({ data });
  } catch (err) {
    throw toClientError(err);
  }
}

/** DELETE /admin/sport-formats/:id — safe delete (409 while referenced). */
export async function deleteFormatHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const actorId = (request as any).userId;
    const { id } = AdminFormatParamsSchema.parse(request.params);
    await sportConfigAdminService.deleteFormat(id, actorId);
    reply.send({ data: { deleted: true, formatId: id } });
  } catch (err) {
    throw toClientError(err);
  }
}

/** GET /admin/sport-formats/:formatId/rule-sets — all versions (newest first). */
export async function listRuleSetsHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { formatId } = AdminFormatRuleSetParamsSchema.parse(request.params);
  const data = await sportConfigAdminService.listRuleSets(formatId);
  reply.send({ data });
}

/** GET /admin/sport-rule-sets/:id — one version with reference count. */
export async function getRuleSetHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = AdminRuleSetParamsSchema.parse(request.params);
  const data = await sportConfigAdminService.getRuleSet(id);
  reply.send({ data });
}

/** POST /admin/sport-formats/:formatId/rule-sets — append a new version. */
export async function createRuleSetHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const actorId = (request as any).userId;
    const { formatId } = AdminFormatRuleSetParamsSchema.parse(request.params);
    const body = RuleSetCreateBodySchema.parse(request.body);
    const data = await sportConfigAdminService.createRuleSet(
      formatId,
      body as RuleSetWritePayload & { rules: Record<string, unknown> },
      actorId,
    );
    reply.status(201).send({ data });
  } catch (err) {
    throw toClientError(err);
  }
}

/** PUT /admin/sport-rule-sets/:id — metadata + (unreferenced) scoring payload. */
export async function updateRuleSetHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const actorId = (request as any).userId;
    const { id } = AdminRuleSetParamsSchema.parse(request.params);
    const body = RuleSetUpdateBodySchema.parse(request.body) as RuleSetWritePayload;
    const data = await sportConfigAdminService.updateRuleSet(id, body, actorId);
    reply.send({ data });
  } catch (err) {
    throw toClientError(err);
  }
}

/** POST /admin/sport-rule-sets/:id/activate — make this the live version. */
export async function activateRuleSetHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const actorId = (request as any).userId;
    const { id } = AdminRuleSetParamsSchema.parse(request.params);
    const data = await sportConfigAdminService.activateRuleSet(id, actorId);
    reply.send({ data });
  } catch (err) {
    throw toClientError(err);
  }
}

/** POST /admin/sport-rule-sets/:id/deactivate — remove from live resolution. */
export async function deactivateRuleSetHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const actorId = (request as any).userId;
    const { id } = AdminRuleSetParamsSchema.parse(request.params);
    const data = await sportConfigAdminService.deactivateRuleSet(id, actorId);
    reply.send({ data });
  } catch (err) {
    throw toClientError(err);
  }
}
