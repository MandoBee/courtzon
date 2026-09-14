import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
});

const pool = vi.hoisted(() => ({ execute: vi.fn() }));
const queue = vi.hoisted(() => ({ add: vi.fn() }));

vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../../../infrastructure/queue/queue.service.js', () => ({ queueService: queue }));

import { processDigest } from '../application/digest-scheduler.service.js';

const capturedSince = () => pool.execute.mock.calls[0][1][0];

describe('digest-scheduler lookback math (BE-5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T10:00:00.000Z'));
    pool.execute.mockReset();
    pool.execute.mockResolvedValue([[]] as any);
    queue.add.mockReset();
    queue.add.mockResolvedValue('job-1');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hourly lookback subtracts exactly one hour (UTC, no local-hour mutation)', async () => {
    await processDigest('hourly');
    expect(capturedSince()).toBe('2026-07-10 09:00:00');
  });

  it('daily lookback subtracts exactly 24 hours', async () => {
    await processDigest('daily');
    expect(capturedSince()).toBe('2026-07-09 10:00:00');
  });

  it('weekly lookback subtracts exactly 7 days', async () => {
    await processDigest('weekly');
    expect(capturedSince()).toBe('2026-07-03 10:00:00');
  });
});