import { describe, it, expect, vi, beforeEach } from 'vitest';

const responses = vi.hoisted(() => ({
  bookings: 3,
  matches: 1,
  tournaments: 0,
  academies: 2,
  chat: 5,
  marketplace: 1,
}));

const pool = vi.hoisted(() => ({
  execute: vi.fn(async (sql: string) => {
    let cnt = 0;
    if (sql.includes('FROM bookings')) cnt = responses.bookings;
    else if (sql.includes('FROM invitations')) cnt = responses.matches;
    else if (sql.includes('FROM tournaments')) cnt = responses.tournaments;
    else if (sql.includes('academy_programs')) cnt = responses.academies;
    else if (sql.includes('FROM messages m')) cnt = responses.chat;
    else if (sql.includes('FROM orders')) cnt = responses.marketplace;
    return [[{ cnt }]];
  }),
}));

vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));

import { playerService } from '../application/player.service.js';
import type { PlayerNavSummary } from '../domain/player.types.js';

describe('PlayerService.getNavSummary', () => {
  const service = playerService;

  beforeEach(() => {
    vi.clearAllMocks();
    responses.bookings = 3;
    responses.matches = 1;
    responses.tournaments = 0;
    responses.academies = 2;
    responses.chat = 5;
    responses.marketplace = 1;
  });

  it('runs exactly six scoped counters and coerces numeric counts', async () => {
    const summary = await service.getNavSummary(42);
    expect(pool.execute).toHaveBeenCalledTimes(6);
    expect(summary).toEqual<PlayerNavSummary>({
      bookings: 3,
      matches: 1,
      tournaments: 0,
      academies: 2,
      chat: 5,
      marketplace: 1,
    });
  });

  it('always parameterizes the acting user id (no client scope drift)', async () => {
    responses.matches = 4;
    await service.getNavSummary(42);
    const sql = (pool.execute as any).mock.calls.map((c: any[]) => String(c[0]));
    const invitationsSql = sql.find((s: string) => s.includes('FROM invitations'));
    expect(invitationsSql).toContain('user_id = ?');
    const args = (pool.execute as any).mock.calls.find((c: any[]) => String(c[0]).includes('FROM invitations'))[1];
    expect(args).toContain(42);
  });

  it('counts only actionable invitations (open/full matches, not a participant)', async () => {
    responses.matches = 2;
    await service.getNavSummary(42);

    // The match badge must be derived from the LIVE match state — stale
    // invitations to started/ended/cancelled matches must not inflate the badge.
    const invitationsSql = (pool.execute as any).mock.calls
      .map((c: any[]) => String(c[0]))
      .find((s: string) => s.includes('FROM invitations'));

    expect(invitationsSql).toContain('JOIN matches');
    expect(invitationsSql).toContain("m.status IN ('open', 'full')");
    expect(invitationsSql).toContain('NOT EXISTS');
    expect(invitationsSql).toContain('match_participants');

    // An already-joined player must never see the badge count that invitation.
    // The participant exclian is correlated (mp.user_id = i.user_id), so only
    // the acting user id is bound.
    const args = (pool.execute as any).mock.calls
      .find((c: any[]) => String(c[0]).includes('FROM invitations'))[1];
    expect(args).toEqual([42]);
  });
});