import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../database/mysql.js', () => ({
  getPool: vi.fn(),
  acquireConnection: vi.fn(),
}));

vi.mock('../../infrastructure/event-store/published-events.repository.js', () => ({
  publishedEventsRepository: { insert: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../infrastructure/queue/queue.service.js', () => ({
  queueService: { addToQueue: vi.fn().mockResolvedValue(true) },
}));

import { eventBusV2 } from './event-bus.v2.js';
import { runProvidedTransaction } from '../../database/database.transaction.js';
import { publishedEventsRepository } from '../../infrastructure/event-store/published-events.repository.js';

function fakeConnection() {
  return {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockResolvedValue([[]]),
    query: vi.fn().mockResolvedValue([[]]),
    release: vi.fn(),
  } as never;
}

describe('Group 6 — transaction-safe publishing (runProvidedTransaction)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT deliver to in-memory/socket handlers before the transaction commits', async () => {
    const conn = fakeConnection();
    const deliveries: Array<Record<string, unknown>> = [];
    eventBusV2.on('group6.defer-once', (data: any) => deliveries.push(data));

    await runProvidedTransaction(conn, async () => {
      await eventBusV2.emit('group6.defer-once', { matchId: 15 });
      expect(deliveries).toHaveLength(0);
    });

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ matchId: 15 });
    expect(conn.commit).toHaveBeenCalledTimes(1);
  });

  it('emits exactly ONE realtime delivery on a successful commit', async () => {
    const conn = fakeConnection();
    const deliveries: Array<Record<string, unknown>> = [];
    eventBusV2.on('group6.exactly-once', (data: any) => deliveries.push(data));

    await runProvidedTransaction(conn, async () => {
      await eventBusV2.emit('group6.exactly-once', { matchId: 16 });
      await eventBusV2.emit('group6.exactly-once', { matchId: 17 });
      expect(deliveries).toHaveLength(0);
    });

    // One per emitted event — never zero, never duplicated.
    expect(deliveries.map((d) => d.matchId)).toEqual([16, 17]);
    expect(conn.commit).toHaveBeenCalledTimes(1);
  });

  it('rolls back silently and NEVER produces a realtime/notification delivery', async () => {
    const conn = fakeConnection();
    const deliveries: Array<Record<string, unknown>> = [];
    eventBusV2.on('group6.rollback-never', (data: any) => deliveries.push(data));

    await expect(
      runProvidedTransaction(conn, async () => {
        await eventBusV2.emit('group6.rollback-never', { matchId: 18 });
        throw new Error('business write failed');
      }),
    ).rejects.toThrow('business write failed');

    expect(deliveries).toHaveLength(0);
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalledTimes(1);
  });

  it('binds the outbox insert to the transaction connection (atomic rollback)', async () => {
    const conn = fakeConnection();

    await expect(
      runProvidedTransaction(conn, async () => {
        await eventBusV2.emit('group6.outbox-atomic', { matchId: 19 }, undefined, conn);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(publishedEventsRepository.insert).toHaveBeenCalled();
    const [, boundaryConn] = (publishedEventsRepository.insert as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(boundaryConn).toBe(conn);
  });

  it('keeps non-transactional emits immediate (unchanged behaviour)', async () => {
    const deliveries: Array<Record<string, unknown>> = [];
    eventBusV2.on('group6.plain-emit', (data: any) => deliveries.push(data));

    await eventBusV2.emit('group6.plain-emit', { matchId: 20 });
    expect(deliveries).toHaveLength(1);
  });
});