import { queueService } from '../../../infrastructure/queue/queue.service.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('admin-queue');

interface QueueStatus {
  name: string;
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  } | null;
  error?: string;
}

export class QueueAdminService {
  async getStatus(): Promise<QueueStatus[]> {
    const queueNames = ['default', 'notifications'];
    const results: QueueStatus[] = [];

    for (const name of queueNames) {
      try {
        const queue = queueService.getQueue(name);
        const counts = await queue.getJobCounts();
        results.push({
          name,
          counts: {
            waiting: counts.waiting || 0,
            active: counts.active || 0,
            completed: counts.completed || 0,
            failed: counts.failed || 0,
            delayed: counts.delayed || 0,
            paused: counts.paused || 0,
          },
        });
      } catch (err: any) {
        log.error({ err, queue: name }, 'Failed to get queue status');
        results.push({ name, counts: null, error: err.message });
      }
    }

    return results;
  }
}

export const queueAdminService = new QueueAdminService();
