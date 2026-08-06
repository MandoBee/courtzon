import type { FastifyRequest, FastifyReply } from 'fastify';
import { systemSettingsService } from '../application/system-settings.service.js';
import { featureFlagService } from '../application/feature-flag.service.js';
import { healthService } from '../application/health.service.js';
import { cacheService } from '../application/cache.service.js';
import { queueAdminService } from '../application/queue.service.js';
import { recordAudit } from '../../audit-log/index.js';
import {
  UpdateSettingSchema,
  CreateFeatureFlagSchema,
  UpdateFeatureFlagSchema,
  ToggleFeatureFlagSchema,
  ListSettingsQuerySchema,
  ListFeatureFlagsQuerySchema,

} from './admin.dto.js';

function buildMeta(request: FastifyRequest) {
  return { requestId: request.id, timestamp: new Date().toISOString() };
}

function sendSuccess(reply: FastifyReply, data: unknown, meta?: Record<string, unknown>, pagination?: Record<string, unknown>) {
  const response: Record<string, unknown> = { data };
  response.meta = { requestId: meta?.requestId, timestamp: meta?.timestamp, ...(meta?.code ? { code: meta.code } : {}) };
  if (pagination) response.pagination = pagination;
  return reply.send(response);
}

// ── Settings ─────────────────────────────────────────────────────────────

export async function getSettingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = ListSettingsQuerySchema.parse(request.query);
  const result = await systemSettingsService.list(query);
  return sendSuccess(reply, result.data, buildMeta(request), result.pagination);
}

export async function getSettingByKeyHandler(request: FastifyRequest, reply: FastifyReply) {
  const { key } = request.params as { key: string };
  const setting = await systemSettingsService.getByKey(key);
  if (!setting) {
    return reply.status(404).send({ error: 'NOT_FOUND', message: `Setting "${key}" not found`, meta: buildMeta(request) });
  }
  return sendSuccess(reply, setting, buildMeta(request));
}

export async function updateSettingHandler(request: FastifyRequest, reply: FastifyReply) {
  const { key } = request.params as { key: string };
  const userId = (request as any).userId;
  const body = UpdateSettingSchema.parse(request.body);
  const updated = await systemSettingsService.update(key, body.value, userId);

  recordAudit({
    actorId: userId,
    action: 'SETTINGS.UPDATE',
    entityType: 'system_settings',
    entityId: key,
    beforeState: undefined,
    afterState: { key, value: body.value },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return sendSuccess(reply, updated, buildMeta(request));
}

export async function getSettingCategoriesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const categories = await systemSettingsService.getCategories();
  return sendSuccess(reply, categories, buildMeta(_request));
}

export async function getSettingsMetadataHandler(_request: FastifyRequest, reply: FastifyReply) {
  const metadata = await systemSettingsService.getMetadata();
  return sendSuccess(reply, metadata, buildMeta(_request));
}

export async function getSettingsHistoryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { page } = request.query as any;
  const result = await systemSettingsService.getHistory(Number(page) || 1);
  return sendSuccess(reply, result);
}

export async function getPublicSettingsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const settings = await systemSettingsService.getPublic();
  return sendSuccess(reply, settings, buildMeta(_request));
}

// ── Feature Flags ────────────────────────────────────────────────────────

export async function listFeatureFlagsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = ListFeatureFlagsQuerySchema.parse(request.query);
  const result = await featureFlagService.list(query);
  return sendSuccess(reply, result.data, buildMeta(request), result.pagination);
}

export async function createFeatureFlagHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = CreateFeatureFlagSchema.parse(request.body);
  const flag = await featureFlagService.create(body, userId);
  return reply.status(201).send(sendSuccess(reply, flag, { ...buildMeta(request), code: 'CREATED' }));
}

export async function updateFeatureFlagHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const userId = (request as any).userId;
  const body = UpdateFeatureFlagSchema.parse(request.body);
  const flag = await featureFlagService.update(Number(id), body, userId);
  return sendSuccess(reply, flag, buildMeta(request));
}

export async function toggleFeatureFlagHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const userId = (request as any).userId;
  const body = ToggleFeatureFlagSchema.parse(request.body);
  const flag = await featureFlagService.toggle(Number(id), body.enabled, userId);
  return sendSuccess(reply, flag, buildMeta(request));
}

export async function deleteFeatureFlagHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const userId = (request as any).userId;
  await featureFlagService.delete(Number(id), userId);
  return reply.status(204).send();
}

// ── Health ───────────────────────────────────────────────────────────────

export async function getSystemHealthHandler(_request: FastifyRequest, reply: FastifyReply) {
  const health = await healthService.getSystemHealth();
  return sendSuccess(reply, health, buildMeta(_request));
}

// ── Cache ────────────────────────────────────────────────────────────────

export async function getCacheStatsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const stats = await cacheService.getStats();
  return sendSuccess(reply, stats, buildMeta(_request));
}

export async function clearCacheHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { key } = request.body as { key?: string };

  if (key) {
    const result = await cacheService.clear(key);
    return sendSuccess(reply, result, buildMeta(request));
  }

  await cacheService.clearAll(userId);
  return sendSuccess(reply, { cleared: true }, buildMeta(request));
}

// ── Queues ───────────────────────────────────────────────────────────────

export async function getQueueStatusHandler(_request: FastifyRequest, reply: FastifyReply) {
  const status = await queueAdminService.getStatus();
  return sendSuccess(reply, status, buildMeta(_request));
}

export async function getQueueJobsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { queueName } = request.params as { queueName: string };
  const { status: jobStatus = 'failed', page = '1', limit = '20' } = request.query as Record<string, string>;
  const jobs = await queueAdminService.getJobs(queueName, jobStatus, Number(page), Number(limit));
  return sendSuccess(reply, jobs.data, buildMeta(request), jobs.pagination);
}

export async function retryJobHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { queueName, jobId } = request.params as { queueName: string; jobId: string };
  await queueAdminService.retryJob(queueName, jobId);

  recordAudit({
    actorId: userId,
    action: 'QUEUE.RETRY_JOB',
    entityType: 'queue_job',
    entityId: `${queueName}:${jobId}`,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return sendSuccess(reply, { retried: true }, buildMeta(request));
}

export async function drainQueueHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { queueName } = request.params as { queueName: string };
  await queueAdminService.drainQueue(queueName);

  recordAudit({
    actorId: userId,
    action: 'QUEUE.DRAIN',
    entityType: 'queue',
    entityId: queueName,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return sendSuccess(reply, { drained: true }, buildMeta(request));
}

export async function pauseQueueHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { queueName } = request.params as { queueName: string };
  await queueAdminService.pauseQueue(queueName);

  recordAudit({
    actorId: userId,
    action: 'QUEUE.PAUSE',
    entityType: 'queue',
    entityId: queueName,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return sendSuccess(reply, { paused: true }, buildMeta(request));
}

export async function resumeQueueHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { queueName } = request.params as { queueName: string };
  await queueAdminService.resumeQueue(queueName);

  recordAudit({
    actorId: userId,
    action: 'QUEUE.RESUME',
    entityType: 'queue',
    entityId: queueName,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return sendSuccess(reply, { resumed: true }, buildMeta(request));
}
