import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Consumer contract for durable event subscribers (subscriber.worker.ts).
 *
 * Verifies the retry/idempotency contract that the tournament progression
 * consumer relies on:
 *   * `hasBeenProcessed` is checked BEFORE the handler;
 *   * `recordProcessing` runs ONLY after the handler SUCCEEDS;
 *   * a FAILED delivery is therefore NOT recorded → the same event can be
 *     safely retried and will run again;
 *   * a successful delivery is recorded exactly once → a redelivery is skipped
 *     (no duplicate handler side effects).
 */

const captured = vi.hoisted(() => ({ processor: null as any, opts: null as any }));

vi.mock('bullmq', () => ({
  Worker: class {
    constructor(_name: string, processor: any, opts: any) {
      captured.processor = processor;
      captured.opts = opts;
    }
    on() { /* no-op */ }
  },
}));

vi.mock('../../infrastructure/redis/redis.client.js', () => ({ getRedisClient: () => ({}) }));
vi.mock('../../database/mysql.js', () => ({ getPool: () => ({}) }));

const repo = vi.hoisted(() => ({ hasBeenProcessed: vi.fn(), recordProcessing: vi.fn() }));
vi.mock('../../infrastructure/event-bus/processed-events.repository.js', () => ({
  processedEventsRepository: {
    hasBeenProcessed: repo.hasBeenProcessed,
    recordProcessing: repo.recordProcessing,
  },
}));

import { createSubscriberWorker } from './subscriber.worker.js';

const ENVELOPE = {
  eventId: 'evt-result-8',
  eventName: 'match:result-approved',
  payload: { matchId: 16, resultId: 8 },
} as any;

function makeProcessor(handler: (env: any) => Promise<void>) {
  createSubscriberWorker({
    subscriberId: 'tournament-progression',
    queueName: 'tournament-progression',
    handler,
    concurrency: 1,
    attempts: 6,
    backoffDelay: 2000,
  } as any);
  return captured.processor as (job: any) => Promise<any>;
}

const job = (attemptsMade = 0) => ({ data: ENVELOPE, attemptsMade, opts: { attempts: 6 } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('subscriber.worker — retry / processed_events contract', () => {
  it('a FAILED delivery is not recorded and can be retried; on success it is recorded exactly once', async () => {
    repo.hasBeenProcessed.mockResolvedValue(false);
    const handler = vi.fn().mockRejectedValueOnce(new Error('Cannot transition tournament')).mockResolvedValue(undefined);
    const processor = makeProcessor(handler);

    // Attempt 1 — handler throws → job rejected, event NOT marked processed.
    await expect(processor(job(0))).rejects.toThrow('Cannot transition tournament');
    expect(repo.recordProcessing).not.toHaveBeenCalled();

    // Attempt 2 (retry) — hasBeenProcessed is still false → handler runs again.
    const res = await processor(job(1));
    expect(handler).toHaveBeenCalledTimes(2);
    expect(repo.recordProcessing).toHaveBeenCalledTimes(1);
    expect(repo.recordProcessing).toHaveBeenCalledWith('evt-result-8', 'tournament-progression');
    expect(res).toEqual({ status: 'processed' });
  });

  it('an already-processed event is skipped (no handler call, no duplicate record)', async () => {
    repo.hasBeenProcessed.mockResolvedValue(true);
    const handler = vi.fn();
    const processor = makeProcessor(handler);

    const res = await processor(job(0));

    expect(handler).not.toHaveBeenCalled();
    expect(repo.recordProcessing).not.toHaveBeenCalled();
    expect(res).toEqual({ status: 'skipped', reason: 'already_processed' });
  });

  it('a redelivery AFTER a successful handling is skipped (processed once, no duplicate side effects)', async () => {
    repo.hasBeenProcessed.mockResolvedValue(false);
    const handler = vi.fn().mockResolvedValue(undefined);
    const processor = makeProcessor(handler);

    await processor(job(0));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(repo.recordProcessing).toHaveBeenCalledTimes(1);

    // The idempotency table now holds the event → redelivery is a no-op.
    repo.hasBeenProcessed.mockResolvedValue(true);
    const res = await processor(job(0));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(repo.recordProcessing).toHaveBeenCalledTimes(1);
    expect(res.status).toBe('skipped');
  });
});
