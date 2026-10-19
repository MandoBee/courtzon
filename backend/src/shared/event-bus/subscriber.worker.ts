import { Worker } from 'bullmq';
import { getRedisClient } from '../../infrastructure/redis/redis.client.js';
import { getPool } from '../../database/mysql.js';
import { createModuleLogger } from '../utils/logger.js';
import { processedEventsRepository } from '../../infrastructure/event-bus/processed-events.repository.js';
import { registry } from '../../infrastructure/metrics/metrics.js';
import { customBackoff } from '../../infrastructure/queue/queue.service.js';
import client from 'prom-client';
import type { EventEnvelope } from './event-envelope.js';
import type { SubscriberWorkerConfig } from './event-bus.types.js';

const log = createModuleLogger('event-bus');

const subscriberDuration = new client.Histogram({
  name: 'courtzon_eventbus_subscriber_duration_seconds',
  help: 'Subscriber handler execution time',
  labelNames: ['event_name'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

const subscriberErrorsTotal = new client.Counter({
  name: 'courtzon_eventbus_subscriber_errors_total',
  help: 'Total subscriber handler errors',
  labelNames: ['event_name'] as const,
  registers: [registry],
});

const processedTotal = new client.Counter({
  name: 'courtzon_eventbus_subscriber_processed_total',
  help: 'Total events processed/skipped by subscriber workers',
  labelNames: ['event_name', 'result'] as const,
  registers: [registry],
});

export function createSubscriberWorker(config: SubscriberWorkerConfig): Worker {
  const worker = new Worker(
    config.queueName,
    async (job) => {
      const envelope = job.data as EventEnvelope;
      const subscriberId = config.subscriberId;
      const start = Date.now();

      if (await processedEventsRepository.hasBeenProcessed(envelope.eventId, subscriberId)) {
        log.debug({ eventId: envelope.eventId, subscriberId }, 'event.skipped');
        processedTotal.inc({ event_name: envelope.eventName, result: 'skipped' });
        return { status: 'skipped', reason: 'already_processed' };
      }

      try {
        await config.handler(envelope);

        await processedEventsRepository.recordProcessing(envelope.eventId, subscriberId);

        const duration = (Date.now() - start) / 1000;
        subscriberDuration.observe({ event_name: envelope.eventName }, duration);
        processedTotal.inc({ event_name: envelope.eventName, result: 'processed' });

        log.info({ eventId: envelope.eventId, subscriberId, duration }, 'event.processed');
        return { status: 'processed' };
      } catch (err: any) {
        subscriberErrorsTotal.inc({ event_name: envelope.eventName });
        log.warn({ err, eventId: envelope.eventId, subscriberId, attempt: job.attemptsMade },
          'event.failed');
        throw err;
      }
    },
    {
      connection: getRedisClient(),
      concurrency: config.concurrency,
      lockDuration: 30000,
      stalledInterval: 15000,
      // CZ-F22-3 — register the custom backoff strategy on the CONSUMER. Event
      // subscriber jobs are produced with `backoff: { type: 'custom', delay }`
      // (queue.service.addToQueue), and BullMQ only knows the built-in `fixed`
      // and `exponential` strategies: an unregistered non-builtin type makes the
      // retry step throw `Unknown backoff strategy custom`, so a failed event
      // could never be retried. This registers the SAME strategy the producer
      // relies on (single definition in queue.service).
      settings: { backoffStrategy: customBackoff },
    },
  );

  worker.on('failed', (job, err) => {
    if (job && job.attemptsMade >= (job.opts?.attempts || 6)) {
      log.error({ eventId: job.data.eventId, subscriberId: config.subscriberId, err },
        'event.dead_letter');
    }
  });

  return worker;
}
