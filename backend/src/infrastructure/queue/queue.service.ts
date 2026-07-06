import { Queue, type JobsOptions } from 'bullmq';
import { getRedisClient } from '../redis/redis.client.js';
import { createModuleLogger } from '../../shared/utils/logger.js';

const log = createModuleLogger('queue');

export type JobType = 'send_email' | 'process_settlement' | 'cancel_expired_bookings' | 'database_backup'
  | 'run_settlements' | 'auto_complete_bookings' | 'sync_pending_payments' | 'expire_stale_payments'
  | 'cleanup_booking_intents' | 'process_notification' | 'send_notification_batch'
  | 'process_notification_digest' | 'send_scheduled_notification' | 'process_dead_letter'
  | 'retry_failed_deliveries' | 'trigger_digest_processing' | 'run_cleanup';

export interface EmailAttachment {
  filename: string;
  path: string;
  contentType?: string;
}

export interface SendEmailJob {
  to: string;
  subject: string;
  body: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export interface ProcessSettlementJob {
  orgId: number;
  periodStart: string;
  periodEnd: string;
}

export interface CancelExpiredBookingsJob {
  cutoffMinutes?: number;
}

export interface DatabaseBackupJob {
  pruneOldHours?: number;
}

export interface RunSettlementsJob {
  _?: undefined;
}

export interface AutoCompleteBookingsJob {
  _?: undefined;
}

export interface SyncPendingPaymentsJob {
  _?: undefined;
}

export interface ExpireStalePaymentsJob {
  timeoutMinutes?: number;
}

export interface CleanupIntentsJob {
  _?: undefined;
}

export interface ProcessNotificationJob {
  notificationId: number;
  userId: number;
  channel: 'in_app' | 'push' | 'email' | 'sms';
  deliveryId: number;
  templateId?: number;
  locale?: string;
  eventName?: string;
  categorySlug?: string;
  title: string;
  body?: string;
  actionKey?: string;
  actionPayload?: Record<string, any>;
  actions?: any[];
  imageUrls?: Record<string, string>;
  priority?: string;
  organisationId?: number;
  branchId?: number;
  relatedEntityType?: string;
  relatedEntityId?: string;
  senderId?: number;
}

export interface SendNotificationBatchJob {
  items: Array<Omit<ProcessNotificationJob, 'channel'>>;
  channel: 'in_app' | 'push' | 'email' | 'sms';
}

export interface ProcessNotificationDigestJob {
  userId: number;
  categorySlug: string;
  eventName: string;
  windowId: number;
  count: number;
}

export interface SendScheduledNotificationJob {
  templateId: number;
  userId: number;
  scheduledAt: Date;
  payload: Record<string, any>;
  locale: string;
}

export interface ProcessDeadLetterJob {
  deadLetterId: number;
}

export interface RetryFailedDeliveriesJob {
  maxRetries?: number;
}

export type JobPayloadMap = {
  send_email: SendEmailJob;
  process_settlement: ProcessSettlementJob;
  cancel_expired_bookings: CancelExpiredBookingsJob;
  database_backup: DatabaseBackupJob;
  run_settlements: RunSettlementsJob;
  auto_complete_bookings: AutoCompleteBookingsJob;
  sync_pending_payments: SyncPendingPaymentsJob;
  expire_stale_payments: ExpireStalePaymentsJob;
  cleanup_booking_intents: CleanupIntentsJob;
  process_notification: ProcessNotificationJob;
  send_notification_batch: SendNotificationBatchJob;
  process_notification_digest: ProcessNotificationDigestJob;
  send_scheduled_notification: SendScheduledNotificationJob;
  process_dead_letter: ProcessDeadLetterJob;
  retry_failed_deliveries: RetryFailedDeliveriesJob;
  trigger_digest_processing: Record<string, never>;
  run_cleanup: Record<string, never>;
};

export const DEFAULT_QUEUE_NAME = 'default';
export const NOTIFICATION_QUEUE_NAME = 'notifications';

class QueueService {
  private queues = new Map<string, Queue>();

  getQueue(name: string): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;

    const redis = getRedisClient();
    const queue = new Queue(name, {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 604800 },
      },
    });

    this.queues.set(name, queue);
    return queue;
  }

  async add<T extends JobType>(
    type: T,
    data: JobPayloadMap[T],
    opts?: JobsOptions,
  ): Promise<string | undefined> {
    const queueName = type.startsWith('process_notification') || type.startsWith('send_notification')
      || type === 'process_dead_letter' || type === 'retry_failed_deliveries'
      ? NOTIFICATION_QUEUE_NAME : DEFAULT_QUEUE_NAME;
    const queue = this.getQueue(queueName);
    const job = await queue.add(type, data, opts);
    log.info({ jobId: job?.id, type, queue: queueName }, `Job added: ${type}`);
    return job?.id;
  }

  async addBulk<T extends JobType>(
    type: T,
    items: { data: JobPayloadMap[T]; opts?: JobsOptions }[],
  ): Promise<void> {
    const queueName = type.startsWith('process_notification') || type.startsWith('send_notification')
      || type === 'process_dead_letter' || type === 'retry_failed_deliveries'
      ? NOTIFICATION_QUEUE_NAME : DEFAULT_QUEUE_NAME;
    const queue = this.getQueue(queueName);
    await queue.addBulk(
      items.map((item) => ({ name: type, data: item.data, opts: item.opts })),
    );
    log.info({ type, count: items.length, queue: queueName }, `Bulk jobs added: ${type}`);
  }

  async close(): Promise<void> {
    for (const queue of this.queues.values()) {
      await queue.close();
    }
    this.queues.clear();
  }
}

export const queueService = new QueueService();
