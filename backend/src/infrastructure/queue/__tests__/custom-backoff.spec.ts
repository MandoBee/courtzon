import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * CZ-F22-3 — BullMQ custom backoff registration.
 *
 * Producer side (`queue.service.addToQueue`) enqueues event-subscriber jobs with
 * `backoff: { type: 'custom', delay }`. BullMQ only knows the built-in `fixed`
 * and `exponential` strategies; any other type MUST be registered on the
 * consumer via `WorkerOptions.settings.backoffStrategy`, otherwise retry
 * scheduling throws `Unknown backoff strategy custom` and a failed event can
 * never be retried.
 *
 * Mock-only: no Redis, no DB, no application bootstrap.
 */

const captured = vi.hoisted(() => ({ workers: [] as any[] }));

vi.mock('bullmq', () => {
  class Worker {
    name: string;
    processor: any;
    options: any;
    constructor(name: string, processor: any, options: any) {
      this.name = name;
      this.processor = processor;
      this.options = options;
      captured.workers.push(this);
    }
    on() { return this; }
    close() { return Promise.resolve(); }
  }
  class Queue { constructor() {} }
  return { Worker, Queue };
});

vi.mock('../../redis/redis.client.js', () => ({ getRedisClient: () => ({}) }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => ({}) }));
vi.mock('../../../shared/utils/logger.js', () => ({
  createModuleLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../../event-bus/processed-events.repository.js', () => ({
  processedEventsRepository: {
    hasBeenProcessed: vi.fn(async () => false),
    recordProcessing: vi.fn(async () => undefined),
  },
}));
vi.mock('../../metrics/metrics.js', () => ({ registry: {} }));
vi.mock('prom-client', () => {
  class NoopMetric { constructor(_?: any) {} observe() {} inc() {} }
  class Registry { constructor() {} }
  return {
    default: { Histogram: NoopMetric, Counter: NoopMetric, Registry },
    Histogram: NoopMetric,
    Counter: NoopMetric,
    Registry,
  };
});

import {
  customBackoff,
  EVENT_BACKOFF_BASE_DELAY_MS,
  EVENT_BACKOFF_MAX_DELAY_MS,
} from '../queue.service.js';
import { createSubscriberWorker } from '../../../shared/event-bus/subscriber.worker.js';

function jobWithDelay(delay?: number): any {
  return { opts: { backoff: delay === undefined ? undefined : { type: 'custom', delay } } };
}

beforeEach(() => {
  captured.workers.length = 0;
});

describe('customBackoff — delay behaviour', () => {
  it('grows x4 from the base and falls back to the base when the job carries no delay', () => {
    expect(customBackoff(1, 'custom', undefined, jobWithDelay(undefined))).toBe(2000);
    expect(customBackoff(2, 'custom', undefined, jobWithDelay(undefined))).toBe(8000);
    expect(customBackoff(3, 'custom', undefined, jobWithDelay(undefined))).toBe(32000);
  });

  it('honours the producer-supplied job delay as the base (producer/consumer agree)', () => {
    expect(customBackoff(1, 'custom', undefined, jobWithDelay(5000))).toBe(5000);
    expect(customBackoff(2, 'custom', undefined, jobWithDelay(5000))).toBe(20000);
  });

  it('is capped at the maximum delay', () => {
    expect(customBackoff(20, 'custom', undefined, jobWithDelay(2000))).toBe(EVENT_BACKOFF_MAX_DELAY_MS);
    expect(EVENT_BACKOFF_MAX_DELAY_MS).toBe(3_600_000);
  });

  it('exposes the documented base constant', () => {
    expect(EVENT_BACKOFF_BASE_DELAY_MS).toBe(2000);
  });
});

describe('subscriber worker — strategy registration', () => {
  it('registers customBackoff as WorkerOptions.settings.backoffStrategy (no unregistered custom type)', () => {
    createSubscriberWorker({
      subscriberId: 'accounting-replay',
      queueName: 'accounting-replay',
      handler: async () => undefined,
      concurrency: 2,
      attempts: 6,
      backoffDelay: 2000,
    } as any);

    expect(captured.workers).toHaveLength(1);
    const worker = captured.workers[0];
    expect(worker.options.settings).toBeDefined();
    expect(worker.options.settings.backoffStrategy).toBe(customBackoff);
    expect(typeof worker.options.settings.backoffStrategy).toBe('function');
  });
});
