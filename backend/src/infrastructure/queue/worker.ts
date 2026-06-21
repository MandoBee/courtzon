import { Worker, type WorkerOptions } from 'bullmq';
import { getRedisClient } from '../redis/redis.client.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { DEFAULT_QUEUE_NAME, type JobPayloadMap, type JobType } from './queue.service.js';

const log = createModuleLogger('worker');

type JobHandler = (data: unknown) => Promise<void>;

const handlers = new Map<JobType, JobHandler>();

export function registerHandler<T extends JobType>(
  type: T,
  handler: (data: JobPayloadMap[T]) => Promise<void>,
): void {
  handlers.set(type, handler as JobHandler);
}

export function startWorker(name: string = DEFAULT_QUEUE_NAME): Worker {
  const redis = getRedisClient();

  const workerOptions: WorkerOptions = {
    connection: redis,
    concurrency: 5,
    lockDuration: 30000,
  };

  const worker = new Worker(
    name,
    async (job) => {
      const handler = handlers.get(job.name as JobType);
      if (!handler) {
        log.warn({ jobName: job.name }, `No handler for job type: ${job.name}`);
        return;
      }
      log.info({ jobId: job.id, type: job.name }, `Processing: ${job.name}`);
      await handler(job.data);
      log.info({ jobId: job.id, type: job.name }, `Completed: ${job.name}`);
    },
    workerOptions,
  );

  worker.on('failed', (job, err) => {
    log.error(
      { jobId: job?.id, type: job?.name, attempt: job?.attemptsMade, error: err.message },
      `Job failed: ${job?.name}`,
    );
  });

  worker.on('error', (err) => {
    log.error({ error: err.message }, 'Worker error');
  });

  log.info({ worker: name }, `Worker started: ${name}`);
  return worker;
}

export async function closeWorker(worker: Worker): Promise<void> {
  await worker.close();
}
