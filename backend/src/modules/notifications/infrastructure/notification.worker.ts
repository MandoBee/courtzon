import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import {
  createDelivery, updateDeliveryStatus, recordAnalytics, sendToDeadLetter,
  getFailedDeliveries, retryFromDeadLetter,
} from './repositories/delivery.repository.js';
import { getTemplate, resolveTemplate } from '../application/template.service.js';
import { isOnline, queueForReconnect } from '../application/presence.service.js';
import { deliverToChannel } from './providers/provider.interface.js';
import type { DeliveryChannel } from './providers/provider.interface.js';
import { isInQuietHours, shouldBypassQuietHours } from '../application/quiet-hours.service.js';
import { recordAuditEvent } from '../application/audit.service.js';
import { selectVariant, recordAbResult } from '../application/ab-testing.service.js';
import { isFeatureEnabled } from '../application/feature-flags.service.js';
import type {
  ProcessNotificationJob, SendNotificationBatchJob,
  ProcessNotificationDigestJob, SendScheduledNotificationJob,
  ProcessDeadLetterJob, RetryFailedDeliveriesJob,
} from '../../../infrastructure/queue/queue.service.js';

const log = createModuleLogger('notification-worker');

type RowData = RowDataPacket[];

async function logAudit(notificationId: number, userId: number, event: any, opts?: any) {
  try { await recordAuditEvent(notificationId, userId, event, opts); } catch {}
}

export async function handleProcessNotification(
  job: ProcessNotificationJob & { renderedTitle?: string; renderedBody?: string },
): Promise<void> {
  const pool = getPool();
  const renderedTitle = job.renderedTitle || job.title;
  const renderedBody = job.renderedBody || job.body;
  const channel = job.channel as string;

  const deliveryId = await createDelivery(job.notificationId, job.userId, channel);
  await logAudit(job.notificationId, job.userId, 'queued', { channel });

  try {
    await updateDeliveryStatus(deliveryId, 'processing');
    await logAudit(job.notificationId, job.userId, 'processing', { channel, providerSlug: channel });

    const quietCheck = await isInQuietHours(job.userId);
    const isCritical = await shouldBypassQuietHours(job.priority || 'normal');

    if (quietCheck.inQuietHours && !isCritical) {
      const deferEnabled = await isFeatureEnabled('quiet_hours');
      if (deferEnabled) {
        await updateDeliveryStatus(deliveryId, 'queued');
        await logAudit(job.notificationId, job.userId, 'quiet_hours_deferred', {
          channel,
          metadata: { resumeIn: quietCheck.resumeAt },
        });

        const { queueService } = await import('../../../infrastructure/queue/queue.service.js');
        await queueService.add('process_notification', job, {
          delay: quietCheck.resumeAt || 3600000,
          attempts: 3,
        });
        return;
      }
    }

    const result = await deliverToChannel(channel as DeliveryChannel, {
      ...job,
      renderedTitle: renderedTitle!,
      renderedBody: renderedBody || undefined,
    });

    if (result.success) {
      await updateDeliveryStatus(deliveryId, 'delivered');
      await recordAnalytics(job.notificationId, job.userId, 'delivered', channel);
      await logAudit(job.notificationId, job.userId, 'delivered', {
        channel,
        providerSlug: result.provider,
        metadata: result.metadata,
      });

      if (channel === 'in_app' || channel === 'push') {
        const [delivery] = await pool.execute<RowData>(
          'SELECT attempts, max_retries FROM notification_delivery WHERE id = ?', [deliveryId],
        );
        if (delivery.length) {
          const d = delivery[0] as any;
          if (d.attempts >= d.max_retries) {
            await sendToDeadLetter(job.notificationId, job.userId, channel, result.error || 'Max retries exceeded', d.attempts, job as any);
            await logAudit(job.notificationId, job.userId, 'dead_letter', { channel });
          }
        }
      }
    }
  } catch (err: any) {
    log.error({ err, job }, 'Failed to process notification');

    await updateDeliveryStatus(deliveryId, 'failed', err.message);
    await recordAnalytics(job.notificationId, job.userId, 'failed', channel);
    await logAudit(job.notificationId, job.userId, 'delivery_failed', {
      channel,
      providerSlug: channel,
      metadata: { error: err.message },
    });

    throw err;
  }
}

export async function handleSendNotificationBatch(job: SendNotificationBatchJob): Promise<void> {
  const channel = job.channel as string;

  for (const item of job.items) {
    try {
      await handleProcessNotification({ ...item, channel: channel as 'in_app' | 'push' | 'email' | 'sms' });
    } catch (err: any) {
      log.error({ err, userId: item.userId }, 'Batch notification item failed');
    }
  }
}

export async function handleProcessNotificationDigest(job: ProcessNotificationDigestJob): Promise<void> {
  const pool = getPool();

  const ab = await selectVariant('system:digest', job.categorySlug, job.userId);
  const effectiveTemplateId = ab.templateId;

  const template = effectiveTemplateId
    ? (await getTemplate('system:digest', 'en'))
    : await getTemplate('system:digest', 'en');

  if (!template) return;

  const resolved = resolveTemplate(template, { count: job.count });

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO notifications
     (user_id, type, title, rendered_title, body, rendered_body, category_slug, event_name, template_id, template_version, is_read, is_archived, created_at)
     VALUES (?, 'info', ?, ?, ?, ?, ?, 'system:digest', ?, ?, FALSE, FALSE, NOW())`,
    [job.userId, resolved.title, resolved.title, resolved.body, resolved.body, job.categorySlug, effectiveTemplateId || template.id, template.version],
  );

  const notificationId = result.insertId;
  await logAudit(notificationId, job.userId, 'created', { channel: 'in_app' });

  if (ab.templateId && ab.variant && ab.testId) {
    await recordAbResult(ab.testId, notificationId, job.userId, ab.variant, ab.templateId, template.version);
    await logAudit(notificationId, job.userId, 'ab_variant_selected', {
      channel: 'in_app',
      metadata: { variant: ab.variant, testId: ab.testId },
    });
  }

  await createDelivery(notificationId, job.userId, 'in_app');
  await recordAnalytics(notificationId, job.userId, 'digested', 'in_app');

  const online = await isOnline(job.userId);
  if (online) {
    await deliverToChannel('in_app', {
      notificationId,
      userId: job.userId,
      channel: 'in_app',
      deliveryId: 0,
      title: resolved.title,
      body: resolved.body,
      renderedTitle: resolved.title,
      renderedBody: resolved.body,
      eventName: 'system:digest',
      categorySlug: job.categorySlug,
    } as any);
  }
}

export async function handleSendScheduledNotification(job: SendScheduledNotificationJob): Promise<void> {
  const pool = getPool();
  const eventName = job.payload.eventName || 'system:scheduled';

  const ab = await selectVariant(eventName, 'system', job.userId);

  const template = ab.templateId
    ? (await getTemplate(eventName, job.locale))
    : await getTemplate(eventName, job.locale);

  if (!template) return;

  const resolved = resolveTemplate(template, job.payload);

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO notifications
     (user_id, type, title, rendered_title, body, rendered_body, category_slug, event_name, template_id, template_version, is_read, is_archived, created_at)
     VALUES (?, 'reminder', ?, ?, ?, ?, 'system', ?, ?, ?, FALSE, FALSE, NOW())`,
    [job.userId, resolved.title, resolved.title, resolved.body, resolved.body, eventName, ab.templateId || template.id, template.version],
  );

  const notificationId = result.insertId;
  await logAudit(notificationId, job.userId, 'created', { channel: 'in_app' });

  if (ab.templateId && ab.variant && ab.testId) {
    await recordAbResult(ab.testId, notificationId, job.userId, ab.variant, ab.templateId, template.version);
  }

  await createDelivery(notificationId, job.userId, 'in_app');
  await recordAnalytics(notificationId, job.userId, 'sent', 'in_app');

  const online = await isOnline(job.userId);
  if (online) {
    await deliverToChannel('in_app', {
      notificationId,
      userId: job.userId,
      channel: 'in_app',
      deliveryId: 0,
      title: resolved.title,
      body: resolved.body,
      renderedTitle: resolved.title,
      renderedBody: resolved.body,
      eventName,
      categorySlug: 'system',
    } as any);
  }
}

export async function handleProcessDeadLetter(job: ProcessDeadLetterJob): Promise<void> {
  await retryFromDeadLetter(job.deadLetterId);
  log.info({ deadLetterId: job.deadLetterId }, 'Retried from dead letter queue');
}

export async function handleRetryFailedDeliveries(_job: RetryFailedDeliveriesJob): Promise<void> {
  const failed = await getFailedDeliveries(100);
  for (const d of failed) {
    try {
      await createDelivery(d.notificationId, d.userId, d.channel, d.maxRetries + 1);
    } catch (err: any) {
      log.error({ err, deliveryId: d.id }, 'Failed to retry delivery');
    }
  }
}
