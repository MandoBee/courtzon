import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../shared/errors/app-error.js';
import { Match } from '../domain/match.entity.js';

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

function legacyMatch(id: number): Match {
  return new Match({
    id, type: 'public', status: 'open', bookingId: 1, sportId: 22,
    formatId: null, formatSnapshot: null,
    version: 1, createdAt: new Date(), updatedAt: new Date(),
  });
}

describe('JoinRequestService capacity guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    respondQueue = [];
    repo.findById.mockResolvedValue(legacyMatch(1));
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
      () => [],
      () => [{ cnt: 2 }],
      () => [],
    ];

    await joinRequestService.approve(7, 55);

    const sql = (pool.execute as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(sql.some((s: string) => s.includes('INSERT INTO match_participants'))).toBe(true);
    expect(sql.some((s: string) => s.includes("status = 'full'"))).toBe(true);
    // join_request:approved + participant:added + match:updated (realtime refresh)
    expect(publisher.publish).toHaveBeenCalledTimes(3);
  });

  it('keeps the roster below max when a spot frees up (open stays open)', async () => {
    respondQueue = [
      () => [{ match_id: 1, user_id: 100, status: 'submitted' }],
      () => [{ max_players: 3 }],
      () => [{ cnt: 2 }],
      () => [],
      () => [],
      () => [],
      () => [{ cnt: 2 }],
    ];

    await joinRequestService.approve(7, 55);

    const sql = (pool.execute as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(sql.some((s: string) => s.includes("status = 'full'"))).toBe(false);
    // join_request:approved + participant:added + match:updated (realtime refresh)
    expect(publisher.publish).toHaveBeenCalledTimes(3);
  });

  it('resolves the approved player\'s invitation atomically on admission', async () => {
    respondQueue = [
      () => [{ match_id: 1, user_id: 100, status: 'submitted' }],
      () => [{ max_players: 4 }],
      () => [{ cnt: 1 }],
      () => [],
      () => [],
      // UPDATE invitations below reports one affected row -> invitation:expired fires
      () => ({ affectedRows: 1 }),
      () => [{ cnt: 2 }],
    ];

    await joinRequestService.approve(7, 55);

    const sql = (pool.execute as any).mock.calls.map((c: any[]) => String(c[0]));
    const updateInvitations = sql.find((s: string) => String(s).includes('UPDATE invitations'));
    expect(updateInvitations).toBeTruthy();
    expect(String(updateInvitations)).toContain("status = 'expired'");
    expect(String(updateInvitations)).toContain('match_id = ? AND user_id = ?');

    // approve() publishes join_request:approved + participant:added +
    // match:updated (realtime refresh); the invitation resolution additionally
    // emits invitation:expired.
    expect(publisher.publish).toHaveBeenCalledTimes(4);
    const published = (publisher.publish as any).mock.calls.map((c: any[]) => c[0].type);
    expect(published).toContain('invitation:expired');
    expect(published).toContain('participant:added');
  });

  it('propagates a programmer error as-is (no swallow)', async () => {
    respondQueue = [() => []];
    // Empty join_requests rowset after the guard's first query would be a data
    // fault; ensure we still throw REQUEST_NOT_FOUND cleanly for unknown rows.
    await expect(joinRequestService.approve(999, 55)).rejects.toBeInstanceOf(AppError);
  });

  it('assigns an authoritative side for a joiner when the Match has a format', async () => {
    repo.findById.mockResolvedValue(new Match({
      id: 1, type: 'public', status: 'open', bookingId: 1, sportId: 22,
      formatId: 1, formatSnapshot: { formatId: 1, formatType: 'doubles', playersPerSide: 2, name: 'Padel Standard' },
      version: 1, createdAt: new Date(), updatedAt: new Date(),
    }));
    respondQueue = [
      () => [{ match_id: 1, user_id: 100, status: 'submitted' }],
      () => [{ max_players: 4 }],
      () => [{ cnt: 1 }], // host only
      () => [],
      () => [],
      () => [],
      () => [{ cnt: 2 }],
    ];

    await joinRequestService.approve(7, 55);

    const calls = (pool.execute as any).mock.calls.map((c: any[]) => ({ sql: String(c[0]), params: c[1] }));
    const insert = calls.find((c: any) => c.sql.includes('INSERT INTO match_participants'));
    expect(insert).toBeTruthy();
    // host is on home, so the first joiner is placed on home as the 2nd doubles player
    expect(insert.params[2]).toBe('home');
    expect(insert.params[3]).toBe(0);
  });
});