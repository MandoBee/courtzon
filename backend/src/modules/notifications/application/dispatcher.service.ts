import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { queueService } from '../../../infrastructure/queue/queue.service.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { getTemplate, resolveTemplate, type NotificationTemplate } from './template.service.js';
import { checkRateLimit, incrementRateLimit } from './rate-limiter.service.js';
import { accumulateDigest } from './digest.service.js';
import { isOnline, queueForReconnect } from './presence.service.js';
import { notificationRepository } from '../infrastructure/repositories/notification.repository.js';
import { isFeatureEnabled } from '../../../shared/utils/feature-flags.js';
import { commandPipeline } from '../../../shared/command/command-pipeline.js';
import { dispatchNotificationHandler, type DispatchNotificationPayload } from '../commands/dispatch-notification.command.js';
import type { Command } from '../../../shared/command/command-base.js';
import type { ProcessNotificationJob, SendNotificationBatchJob } from '../../../infrastructure/queue/queue.service.js';

const log = createModuleLogger('dispatcher');

type RowData = RowDataPacket[];

export interface DispatchOptions {
  userId: number;
  eventName: string;
  categorySlug: string;
  type?: string;
  priority?: string;
  locale?: string;
  data: Record<string, any>;
  organisationId?: number;
  branchId?: number;
  relatedEntityType?: string;
  relatedEntityId?: string;
  senderId?: number;
  imageUrls?: Record<string, string>;
  actions?: any[];
  actionKey?: string;
  actionPayload?: Record<string, any>;
  digestable?: boolean;
}

export async function dispatchToUser(options: DispatchOptions): Promise<void> {
  if (isFeatureEnabled('NOTIFICATION_V2_DISPATCH')) {
    return dispatchToUserV2(options);
  }
  const { userId, eventName, categorySlug, data, locale } = options;

  const rateCheck = await checkRateLimit(userId, categorySlug);
  if (!rateCheck.allowed) {
    log.warn({ userId, eventName, categorySlug }, 'Rate limited notification');
    return;
  }

  if (options.digestable === true) {
    const accumulated = await accumulateDigest(userId, categorySlug, eventName);
    if (accumulated) return;
  }

  const effectiveLocale = locale ?? 'en';
  const template = await getTemplate(eventName, effectiveLocale);
  if (!template) {
    log.warn({ eventName, locale: effectiveLocale }, 'No template found for event');
    return;
  }

  const resolved = resolveTemplate(template, data);

  const notificationId = await notificationRepository.create({
    userId,
    title: resolved.title,
    body: resolved.body ?? undefined,
    categorySlug,
    actionKey: options.actionKey ?? template.actionKey ?? undefined,
    actionPayload: options.actionPayload,
    type: options.type ?? template.type ?? 'info',
    priority: options.priority ?? template.priority ?? 'normal',
    organisationId: options.organisationId,
    branchId: options.branchId,
    senderId: options.senderId,
    relatedEntityType: options.relatedEntityType,
    relatedEntityId: options.relatedEntityId,
    eventName,
    actions: (options.actions ?? template.actions) ?? undefined,
    imageUrls: options.imageUrls,
    templateId: template.id,
  });

  await incrementRateLimit(userId, categorySlug, eventName);

  const online = await isOnline(userId);

  const jobData: ProcessNotificationJob = {
    notificationId,
    userId,
    channel: online ? 'in_app' : 'in_app',
    deliveryId: 0,
    templateId: template.id,
    locale: effectiveLocale,
    eventName,
    categorySlug,
    title: resolved.title,
    body: resolved.body ?? undefined,
    actionKey: options.actionKey ?? template.actionKey ?? undefined,
    actionPayload: options.actionPayload,
    actions: (options.actions ?? template.actions) ?? undefined,
    imageUrls: options.imageUrls,
    priority: options.priority ?? template.priority,
    organisationId: options.organisationId,
    branchId: options.branchId,
    relatedEntityType: options.relatedEntityType,
    relatedEntityId: options.relatedEntityId,
    senderId: options.senderId,
  };

  if (online) {
    await queueService.add('process_notification', jobData, { priority: 1, attempts: 3 });
  } else {
    await queueForReconnect(userId, [notificationId]);
    await queueService.add('process_notification', jobData, { delay: 0, priority: 5, attempts: 3 });
  }
}

export async function dispatchBulk(
  userIds: number[],
  options: Omit<DispatchOptions, 'userId'>,
): Promise<void> {
  if (!userIds.length) return;

  const userIdChunks: number[][] = [];
  for (let i = 0; i < userIds.length; i += 100) {
    userIdChunks.push(userIds.slice(i, i + 100));
  }

  for (const chunk of userIdChunks) {
    await dispatchBulkChunk(chunk, options);
  }
}

async function dispatchBulkChunk(
  userIds: number[],
  options: Omit<DispatchOptions, 'userId'>,
): Promise<void> {
  const template = await getTemplate(options.eventName, options.locale ?? 'en');
  if (!template) {
    log.warn({ eventName: options.eventName }, 'No template for bulk dispatch');
    return;
  }

  const resolved = resolveTemplate(template, options.data);
  const userIdsToQueue: number[] = [];

  for (const userId of userIds) {
    await notificationRepository.create({
      userId,
      title: resolved.title,
      body: resolved.body ?? undefined,
      categorySlug: options.categorySlug,
      actionKey: options.actionKey ?? template.actionKey ?? undefined,
      actionPayload: options.actionPayload,
      type: options.type ?? template.type ?? 'info',
      priority: options.priority ?? template.priority ?? 'normal',
      organisationId: options.organisationId,
      branchId: options.branchId,
      senderId: options.senderId,
      relatedEntityType: options.relatedEntityType,
      relatedEntityId: options.relatedEntityId,
      eventName: options.eventName,
      actions: (options.actions ?? template.actions) ?? undefined,
      imageUrls: options.imageUrls,
      templateId: template.id,
    });
    userIdsToQueue.push(userId);
  }

  const batchItem: ProcessNotificationJob = {
    notificationId: 0,
    userId: 0,
    channel: 'in_app' as const,
    deliveryId: 0,
    templateId: template.id,
    locale: options.locale ?? 'en',
    eventName: options.eventName,
    categorySlug: options.categorySlug,
    title: resolved.title,
    body: resolved.body ?? undefined,
    actionKey: options.actionKey ?? template.actionKey ?? undefined,
    actionPayload: options.actionPayload ?? undefined,
    actions: (options.actions ?? template.actions) ?? undefined,
    imageUrls: options.imageUrls,
    priority: options.priority ?? template.priority,
    organisationId: options.organisationId,
    branchId: options.branchId,
    relatedEntityType: options.relatedEntityType,
    relatedEntityId: options.relatedEntityId,
    senderId: options.senderId,
  };

  const batchJob: SendNotificationBatchJob = {
    items: userIdsToQueue.map((uid) => ({ ...batchItem, userId: uid })),
    channel: 'in_app',
  };

  await queueService.add('send_notification_batch', batchJob, { priority: 5, attempts: 3 });
}

export async function dispatchByRole(
  roleSlug: string,
  options: Omit<DispatchOptions, 'userId'>,
): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT DISTINCT u.id FROM users u
     JOIN user_roles ur ON u.id = ur.user_id
     JOIN roles r ON ur.role_id = r.id
     WHERE r.slug = ? AND u.is_active = TRUE AND u.deleted_at IS NULL`,
    [roleSlug],
  );
  const userIds = rows.map((r: any) => r.id);
  await dispatchBulk(userIds, options);
}

export async function dispatchByOrg(
  organisationId: number,
  options: Omit<DispatchOptions, 'userId'>,
): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT DISTINCT u.id FROM users u
     JOIN user_organisations uo ON u.id = uo.user_id
     WHERE uo.organisation_id = ? AND u.is_active = TRUE AND u.deleted_at IS NULL`,
    [organisationId],
  );
  const userIds = rows.map((r: any) => r.id);
  await dispatchBulk(userIds, options);
}

export async function dispatchByBranch(
  branchId: number,
  options: Omit<DispatchOptions, 'userId'>,
): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT DISTINCT u.id FROM users u
     JOIN user_branches ub ON u.id = ub.user_id
     WHERE ub.branch_id = ? AND u.is_active = TRUE AND u.deleted_at IS NULL`,
    [branchId],
  );
  const userIds = rows.map((r: any) => r.id);
  await dispatchBulk(userIds, options);
}

export async function dispatchToAll(
  options: Omit<DispatchOptions, 'userId'>,
): Promise<void> {
  const pool = getPool();
  const batchSize = 500;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const [rows] = await pool.execute<RowData>(
      'SELECT id FROM users WHERE is_active = TRUE AND deleted_at IS NULL LIMIT ? OFFSET ?',
      [batchSize, offset],
    );
    const userIds = rows.map((r: any) => r.id);
    if (userIds.length) {
      await dispatchBulk(userIds, options);
      offset += batchSize;
    } else {
      hasMore = false;
    }
  }
}

export async function dispatchByUserIdsBulk(
  userIds: number[],
  options: Omit<DispatchOptions, 'userId'>,
): Promise<void> {
  await dispatchBulk(userIds, options);
}

async function dispatchToUserV2(options: DispatchOptions): Promise<void> {
  const command: Command = {
    commandId: `dispatch-notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    commandType: 'DispatchNotification',
    aggregateType: 'notification',
    aggregateId: String(options.userId),
    payload: {
      userId: options.userId,
      eventName: options.eventName,
      categorySlug: options.categorySlug,
      data: options.data,
      organisationId: options.organisationId,
      branchId: options.branchId,
      relatedEntityType: options.relatedEntityType,
      relatedEntityId: options.relatedEntityId,
      senderId: options.senderId,
      actionPayload: options.actionPayload,
      actions: options.actions,
      imageUrls: options.imageUrls,
      digestable: options.digestable,
      priority: options.priority,
      type: options.type,
      locale: options.locale,
    } satisfies DispatchNotificationPayload,
    correlationId: `ntf_${Date.now()}`,
  };

  const result = await commandPipeline.execute(command, {
    validate: async () => dispatchNotificationHandler.validate(command),
    execute: async (cmd, conn) => dispatchNotificationHandler.execute(cmd, conn),
    events: (cmd, res) => dispatchNotificationHandler.events!(cmd, res),
  });

  if (result.status === 'error') {
    log.error({ userId: options.userId, eventName: options.eventName, error: result.message }, 'DispatchNotification failed');
  }
}
