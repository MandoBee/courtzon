import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../shared/errors/app-error.js';

const publisher = vi.hoisted(() => ({ publish: vi.fn() }));
const repo = vi.hoisted(() => ({ findById: vi.fn() }));
const eligibility = vi.hoisted(() => ({}));

let respondQueue: Array<() => [] | unknown[]> = [];

const pool = vi.hoisted(() => ({
  execute: vi.fn(async () => {
    const respond = respondQueue.shift();
    if (!respond) return [[]];
    return [respond()] as any;
  }),
}));

vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../application/events/match-event-publisher.js', () => ({ matchEventPublisher: publisher }));
vi.mock('../infrastructure/repositories/match.repository.js', () => ({ matchRepository: repo }));
vi.mock('../application/services/eligibility.service.js', () => ({ eligibilityService: eligibility }));

import { joinRequestService } from '../application/services/join-request.service.js';

describe('JoinRequestService capacity guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    respondQueue = [];
  });

  it('throws MATCH_FULL when the roster is already at capacity (host-inclusive count)', async () => {
    respondQueue = [
      () => [{ match_id: 1, user_id: 100, status: 'submitted' }],
      () => [{ max_players: 2 }],
      () => [{ cnt: 2 }],
    ];

    await expect(joinRequestService.approve(7, 55)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'MATCH_FULL',
    });

    // No participant should be inserted and no events should fire.
    const calls = (pool.execute as any).mock.calls;
    expect(calls.some((c: any[]) => String(c[0]).includes('INSERT INTO match_participants'))).toBe(false);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('approves when within capacity and flips the match to full exactly at capacity', async () => {
    respondQueue = [
      () => [{ match_id: 1, user_id: 100, status: 'submitted' }],
      () => [{ max_players: 2 }],
      () => [{ cnt: 1 }],
      () => [],
      () => [],
      () => [{ cnt: 2 }],
      () => [],
    ];

    await joinRequestService.approve(7, 55);

    const sql = (pool.execute as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(sql.some((s: string) => s.includes('INSERT INTO match_participants'))).toBe(true);
    expect(sql.some((s: string) => s.includes("status = 'full'"))).toBe(true);
    expect(publisher.publish).toHaveBeenCalledTimes(2);
  });

  it('keeps the roster below max when a spot frees up (open stays open)', async () => {
    respondQueue = [
      () => [{ match_id: 1, user_id: 100, status: 'submitted' }],
      () => [{ max_players: 3 }],
      () => [{ cnt: 2 }],
      () => [],
      () => [],
      () => [{ cnt: 2 }],
    ];

    await joinRequestService.approve(7, 55);

    const sql = (pool.execute as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(sql.some((s: string) => s.includes("status = 'full'"))).toBe(false);
    expect(publisher.publish).toHaveBeenCalledTimes(2);
  });

  it('propagates a programmer error as-is (no swallow)', async () => {
    respondQueue = [() => []];
    // Empty join_requests rowset after the guard's first query would be a data
    // fault; ensure we still throw REQUEST_NOT_FOUND cleanly for unknown rows.
    await expect(joinRequestService.approve(999, 55)).rejects.toBeInstanceOf(AppError);
  });
});