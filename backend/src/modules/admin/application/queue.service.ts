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

interface JobListItem {
  id: string;
  name: string;
  data: Record<string, unknown>;
  status: string;
  attempts: number;
  maxAttempts: number;
  timestamp: string | null;
  processedOn: string | null;
  finishedOn: string | null;
  failedReason: string | null;
  stacktrace: string[];
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

  async getJobs(queueName: string, jobStatus: string, page: number, limit: number): Promise<{ data: JobListItem[]; pagination: { page: number; limit: number; total: number } }> {
    const queue = queueService.getQueue(queueName);
    const types = (jobStatus === 'all' ? ['waiting', 'active', 'completed', 'failed', 'delayed', 'paused'] : [jobStatus]) as any;
    const jobs = await queue.getJobs(types, 0, 10000);
    const total = jobs.length;
    const offset = (page - 1) * limit;
    const paged = jobs.slice(offset, offset + limit);

    const data: JobListItem[] = paged.map((j) => ({
      id: j.id?.toString() || '',
      name: j.name || '',
      data: (j as any).data || {},
      status: (j as any).status || jobStatus,
      attempts: j.attemptsMade || 0,
      maxAttempts: (j as any).opts?.attempts || 3,
      timestamp: j.timestamp ? new Date(j.timestamp).toISOString() : null,
      processedOn: j.processedOn ? new Date(j.processedOn).toISOString() : null,
      finishedOn: j.finishedOn ? new Date(j.finishedOn).toISOString() : null,
      failedReason: j.failedReason || null,
      stacktrace: (j as any).stacktrace || [],
    }));

    return { data, pagination: { page, limit, total } };
  }

  async retryJob(queueName: string, jobId: string): Promise<void> {
    const queue = queueService.getQueue(queueName);
    const job = await queue.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found in queue ${queueName}`);
    await job.retry();
    log.info({ jobId, queue: queueName }, 'Job retried');
  }

  async drainQueue(queueName: string): Promise<void> {
    const queue = queueService.getQueue(queueName);
    await queue.drain();
    log.info({ queue: queueName }, 'Queue drained');
  }

  async pauseQueue(queueName: string): Promise<void> {
    const queue = queueService.getQueue(queueName);
    await queue.pause();
    log.info({ queue: queueName }, 'Queue paused');
  }

  async resumeQueue(queueName: string): Promise<void> {
    const queue = queueService.getQueue(queueName);
    await queue.resume();
    log.info({ queue: queueName }, 'Queue resumed');
  }
}

export const queueAdminService = new QueueAdminService();
