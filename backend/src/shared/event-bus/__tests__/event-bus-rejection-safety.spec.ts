import { describe, it, expect, vi } from 'vitest';

/**
 * CZ-F22 — the in-memory dispatch of the EventBus must OBSERVE rejected handler
 * promises (log them) instead of leaving an unhandled rejection. This is what
 * makes the accounting listener's "rethrow on posting failure" safe on the
 * fire-and-forget path (the durable worker, which awaits the handler, is the one
 * that retries and owns `processed_events`).
 * Fully mocked: no database, no Redis, no application bootstrap.
 */

const mocks = vi.hoisted(() => {
  const log = { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
  return {
    log,
    published: { insert: vi.fn(async () => undefined), cleanup: vi.fn(async () => 0) },
  };
});

vi.mock('../../utils/logger.js', () => ({
  createModuleLogger: () => mocks.log,
  default: { createModuleLogger: () => mocks.log },
}));
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: vi.fn(async () => [[], []]) }),
  createPool: vi.fn(),
  acquireConnection: vi.fn(),
}));
vi.mock('../../../infrastructure/event-store/published-events.repository.js', () => ({
  publishedEventsRepository: mocks.published,
}));
vi.mock('../../../database/database.transaction.js', () => ({
  isInTransaction: () => false,
  onAfterCommit: async (fn: () => unknown) => fn(),
}));
vi.mock('../../../infrastructure/queue/queue.service.js', () => ({
  queueService: { addToQueue: vi.fn(async () => undefined) },
}));

import { eventBusV2 } from '../event-bus.v2.js';

describe('eventBusV2 in-memory dispatch (CZ-F22)', () => {
  it('logs a rejected async handler instead of leaving it unhandled', async () => {
    eventBusV2.on('cz.test.reject', async () => { throw new Error('posting failed: no accounting period'); });

    await expect(eventBusV2.emit('cz.test.reject', { any: 'payload' })).resolves.toBeUndefined();
    // Allow the handler's rejection to settle so the .catch() runs.
    await new Promise((r) => setTimeout(r, 0));

    expect(mocks.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'cz.test.reject' }),
      'event.in_memory_handler_failed',
    );
    expect(mocks.published.insert).toHaveBeenCalledTimes(1);
  });

  it('still runs a resolved handler without logging an error', async () => {
    const handler = vi.fn(async () => undefined);
    eventBusV2.on('cz.test.resolve', handler);

    await eventBusV2.emit('cz.test.resolve', { any: 'payload' });
    await new Promise((r) => setTimeout(r, 0));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(mocks.log.error).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'cz.test.resolve' }),
      'event.in_memory_handler_failed',
    );
  });

  it('isolates a handler that throws SYNCHRONOUSLY and keeps dispatching later handlers', async () => {
    // The dispatch loop calls each handler inside a try/catch, so a synchronous
    // throw must be logged and must not abort the loop, break `emit`, or become
    // an unhandled rejection.
    const syncThrower = vi.fn(() => {
      throw new Error('sync dispatch boom');
    });
    const later = vi.fn(async () => undefined);

    eventBusV2.on('cz.test.sync-throw', syncThrower);
    eventBusV2.on('cz.test.sync-throw', later);

    await expect(eventBusV2.emit('cz.test.sync-throw', { any: 'payload' })).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 0));

    expect(syncThrower).toHaveBeenCalledTimes(1);
    // The handler registered AFTER the throwing one must still run.
    expect(later).toHaveBeenCalledTimes(1);
    expect(later).toHaveBeenCalledWith({ any: 'payload' });
    expect(mocks.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'cz.test.sync-throw' }),
      'event.in_memory_handler_failed',
    );
  });
});
