import type { FastifyRequest, FastifyReply } from 'fastify';
import { designTokenService } from '../application/design-token.service.js';
import { recordAudit } from '../../audit-log/index.js';
import {
  DesignTokenSchema,
  DesignTokenUpdateSchema,
  DesignTokenQuerySchema,
  SaveDraftSchema,
  PublishSchema,
  RoleEditableSchema,
  ResetBaselineSchema,
  RoleThemeSchema,
} from './design-token.dto.js';

export async function listTokensHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = DesignTokenQuerySchema.parse(request.query);
  const result = await designTokenService.list(query.page, query.limit);
  return reply.send(result);
}

export async function getTokenHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const result = await designTokenService.get(Number(id));
  return reply.send(result);
}

export async function createTokenHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = DesignTokenSchema.parse(request.body);
  const result = await designTokenService.create(body);
  return reply.status(201).send(result);
}

export async function updateTokenHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = DesignTokenUpdateSchema.parse(request.body);
  const result = await designTokenService.update(Number(id), body);
  return reply.send(result);
}

export async function deleteTokenHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await designTokenService.delete(Number(id));
  return reply.status(204).send();
}

// -- Appearance Studio --------------------------------------------------------

export async function getPublicThemeHandler(_request: FastifyRequest, reply: FastifyReply) {
  const theme = await designTokenService.getPublishedTheme();
  // Public, cacheable for a short window; revalidated client-side in background.
  reply.header('Cache-Control', 'public, max-age=60');
  return reply.send(theme);
}

export async function getThemeStudioHandler(_request: FastifyRequest, reply: FastifyReply) {
  const result = await designTokenService.listForEditor();
  return reply.send(result);
}

export async function saveThemeDraftHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = SaveDraftSchema.parse(request.body);
  const result = await designTokenService.saveDrafts(body.tokens, body.tokensDark);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'DESIGN_TOKEN.SAVE_DRAFT',
    entityType: 'design_token',
    afterState: { keys: Object.keys(body.tokens) },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function publishThemeHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = PublishSchema.parse(request.body ?? {});
  const userId = (request as any).userId ?? null;
  const result = await designTokenService.publish(userId, body.label);
  recordAudit({
    actorId: userId,
    action: 'DESIGN_TOKEN.PUBLISH',
    entityType: 'design_token_version',
    entityId: result.versionId,
    afterState: { label: body.label ?? null },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function saveRoleEditableHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = RoleEditableSchema.parse(request.body);
  const result = await designTokenService.saveRoleEditable(body.tokens);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'DESIGN_TOKEN.ROLE_EDITABLE',
    entityType: 'design_token',
    afterState: { keys: Object.keys(body.tokens) },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function saveResetBaselineHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = ResetBaselineSchema.parse(request.body ?? {});
  const userId = (request as any).userId ?? null;
  const result = await designTokenService.saveResetBaseline(userId, body.label);
  recordAudit({
    actorId: userId,
    action: 'DESIGN_TOKEN.SAVE_RESET_BASELINE',
    entityType: 'design_theme_reset_baseline',
    afterState: { label: body.label ?? null },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function restoreResetBaselineHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId ?? null;
  const result = await designTokenService.restoreResetBaseline(userId);
  recordAudit({
    actorId: userId,
    action: 'DESIGN_TOKEN.RESTORE_RESET_BASELINE',
    entityType: 'design_theme_reset_baseline',
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function getRoleThemeHandler(request: FastifyRequest, reply: FastifyReply) {
  const { roleId } = request.params as { roleId: string };
  const result = await designTokenService.getRoleTheme(Number(roleId));
  return reply.send(result);
}

export async function saveRoleThemeHandler(request: FastifyRequest, reply: FastifyReply) {
  const { roleId } = request.params as { roleId: string };
  const body = RoleThemeSchema.parse(request.body);
  const result = await designTokenService.saveRoleTheme(Number(roleId), body.tokens);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'DESIGN_TOKEN.ROLE_THEME_SAVE',
    entityType: 'role_theme_override',
    entityId: Number(roleId),
    afterState: { keys: Object.keys(body.tokens) },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function getMyThemeHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  if (!userId) return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });
  const result = await designTokenService.getThemeForUser(userId);
  reply.header('Cache-Control', 'private, no-cache');
  return reply.send(result);
}

export async function saveMyThemeHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  if (!userId) return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });
  const body = RoleThemeSchema.parse(request.body);
  const result = await designTokenService.saveMyRoleTheme(userId, body.tokens);
  recordAudit({
    actorId: userId,
    action: 'DESIGN_TOKEN.MY_ROLE_THEME_SAVE',
    entityType: 'role_theme_override',
    afterState: { keys: Object.keys(body.tokens) },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function rollbackThemeHandler(request: FastifyRequest, reply: FastifyReply) {
  const { versionId } = request.params as any;
  const userId = (request as any).userId ?? null;
  const result = await designTokenService.rollback(Number(versionId), userId);
  recordAudit({
    actorId: userId,
    action: 'DESIGN_TOKEN.ROLLBACK',
    entityType: 'design_token_version',
    entityId: Number(versionId),
    afterState: { rolledBackTo: Number(versionId) },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}
