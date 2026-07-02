import { Queue, type JobsOptions } from 'bullmq';
import { getRedisClient } from '../redis/redis.client.js';
import { createModuleLogger } from '../../shared/utils/logger.js';

const log = createModuleLogger('queue');

export type JobType = 'send_email' | 'process_settlement' | 'cancel_expired_bookings' | 'database_backup' | 'run_settlements' | 'auto_complete_bookings' | 'sync_pending_payments' | 'expire_stale_payments';

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

export type JobPayloadMap = {
  send_email: SendEmailJob;
  process_settlement: ProcessSettlementJob;
  cancel_expired_bookings: CancelExpiredBookingsJob;
  database_backup: DatabaseBackupJob;
  run_settlements: RunSettlementsJob;
  auto_complete_bookings: AutoCompleteBookingsJob;
  sync_pending_payments: SyncPendingPaymentsJob;
  expire_stale_payments: ExpireStalePaymentsJob;
};

// All jobs share a single queue. The worker (worker.ts) binds to this same
// queue name and dispatches by job NAME (the JobType) via its handler map.
// Producer (this file) and consumer (worker) MUST use the same queue name,
// otherwise jobs are enqueued but never processed.
export const DEFAULT_QUEUE_NAME = 'default';

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
    const queue = this.getQueue(DEFAULT_QUEUE_NAME);
    const job = await queue.add(type, data, opts);
    log.info({ jobId: job?.id, type }, `Job added: ${type}`);
    return job?.id;
  }

  async addBulk<T extends JobType>(
    type: T,
    items: { data: JobPayloadMap[T]; opts?: JobsOptions }[],
  ): Promise<void> {
    const queue = this.getQueue(DEFAULT_QUEUE_NAME);
    await queue.addBulk(
      items.map((item) => ({ name: type, data: item.data, opts: item.opts })),
    );
    log.info({ type, count: items.length }, `Bulk jobs added: ${type}`);
  }

  async close(): Promise<void> {
    for (const queue of this.queues.values()) {
      await queue.close();
    }
    this.queues.clear();
  }
}

export const queueService = new QueueService();
