import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { notificationRepository } from '../infrastructure/repositories/notification.repository.js';
import { getTemplate, resolveTemplate } from '../application/template.service.js';
import { checkRateLimit, incrementRateLimit } from '../application/rate-limiter.service.js';
import { accumulateDigest } from '../application/digest.service.js';
import { isOnline, queueForReconnect } from '../application/presence.service.js';
import { queueService } from '../../../infrastructure/queue/queue.service.js';
import { categorizeEvent, shouldDispatch } from '../domain/notification-aggregate.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';
import type { ProcessNotificationJob } from '../../../infrastructure/queue/queue.service.js';

const log = createModuleLogger('notification-dispatch');

export interface DispatchNotificationPayload {
  userId: number;
  eventName: string;
  categorySlug?: string;
  data: Record<string, unknown>;
  organisationId?: number;
  branchId?: number;
  relatedEntityType?: string;
  relatedEntityId?: string;
  senderId?: number;
  actionPayload?: Record<string, unknown>;
  actions?: unknown[];
  imageUrls?: Record<string, string>;
  digestable?: boolean;
  priority?: string;
  type?: string;
  locale?: string;
}

export interface DispatchNotificationResult {
  notificationId: number;
  userId: number;
  dispatched: boolean;
}

export const dispatchNotificationHandler: CommandHandler<Command, DispatchNotificationResult> = {

  validate: async (command) => {
    const p = command.payload as unknown as DispatchNotificationPayload;
    if (!p.userId || p.userId <= 0) throw new Error('userId is required and must be positive');
    if (!p.eventName) throw new Error('eventName is required');
    if (!p.data) throw new Error('data is required');
  },

  execute: async (command, _conn: PoolConnection) => {
    const p = command.payload as unknown as DispatchNotificationPayload;
    const categorySlug = p.categorySlug || categorizeEvent(p.eventName);

    const rateCheck = await checkRateLimit(p.userId, categorySlug);
    if (!shouldDispatch(rateCheck)) {
      log.warn({ userId: p.userId, eventName: p.eventName, categorySlug }, 'Rate limited notification');
      return { notificationId: 0, userId: p.userId, dispatched: false };
    }

    if (p.digestable === true) {
      const accumulated = await accumulateDigest(p.userId, categorySlug, p.eventName);
      if (accumulated) {
        log.debug({ userId: p.userId, eventName: p.eventName }, 'Notification accumulated in digest');
        return { notificationId: 0, userId: p.userId, dispatched: false };
      }
    }

    const effectiveLocale = p.locale ?? 'en';
    const template = await getTemplate(p.eventName, effectiveLocale);
    if (!template) {
      log.warn({ eventName: p.eventName, locale: effectiveLocale }, 'No template found for event');
      return { notificationId: 0, userId: p.userId, dispatched: false };
    }

    const resolved = resolveTemplate(template, p.data as Record<string, any>);

    const notificationId = await notificationRepository.create({
      userId: p.userId,
      title: resolved.title,
      body: resolved.body ?? undefined,
      categorySlug,
      actionKey: p.actionPayload ? undefined : template.actionKey ?? undefined,
      actionPayload: p.actionPayload,
      type: p.type ?? template.type ?? 'info',
      priority: p.priority ?? template.priority ?? 'normal',
      organisationId: p.organisationId,
      branchId: p.branchId,
      senderId: p.senderId,
      relatedEntityType: p.relatedEntityType,
      relatedEntityId: p.relatedEntityId,
      eventName: p.eventName,
      actions: (p.actions ?? template.actions) ?? undefined,
      imageUrls: p.imageUrls,
      templateId: template.id,
    });

    await incrementRateLimit(p.userId, categorySlug, p.eventName);

    const online = await isOnline(p.userId);

    const jobData: ProcessNotificationJob = {
      notificationId,
      userId: p.userId,
      channel: 'in_app',
      deliveryId: 0,
      templateId: template.id,
      locale: effectiveLocale,
      eventName: p.eventName,
      categorySlug,
      title: resolved.title,
      body: resolved.body ?? undefined,
      actionKey: template.actionKey ?? undefined,
      actionPayload: p.actionPayload,
      actions: (p.actions ?? template.actions) ?? undefined,
      imageUrls: p.imageUrls,
      priority: p.priority ?? template.priority,
      organisationId: p.organisationId,
      branchId: p.branchId,
      relatedEntityType: p.relatedEntityType,
      relatedEntityId: p.relatedEntityId,
      senderId: p.senderId,
    };

    if (online) {
      await queueService.add('process_notification', jobData, { priority: 1, attempts: 3 });
    } else {
      await queueForReconnect(p.userId, [notificationId]);
      await queueService.add('process_notification', jobData, { delay: 0, priority: 5, attempts: 3 });
    }

    log.info({ notificationId, userId: p.userId, eventName: p.eventName }, 'Notification dispatched');
    return { notificationId, userId: p.userId, dispatched: true };
  },

  events: (command, result) => [{
    eventName: 'notification.dispatched',
    payload: {
      notificationId: result.notificationId,
      userId: result.userId,
      eventName: (command.payload as unknown as DispatchNotificationPayload).eventName,
      dispatched: result.dispatched,
    },
    context: {
      aggregateType: 'notification',
      aggregateId: String(result.notificationId || result.userId),
      aggregateVersion: 1,
      correlationId: command.correlationId,
      causationId: command.commandId,
    },
  }],
};
