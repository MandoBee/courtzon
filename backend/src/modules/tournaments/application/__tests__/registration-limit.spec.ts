import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../infrastructure/repositories/tournament.repository.js', () => ({
  tournamentRepository: { countActiveEventRegistrationsForPlayer: vi.fn() },
}));

import { resolveEventsPerPlayerLimit, enforcePlayerEventLimit } from '../registration-limit.js';
import { tournamentRepository } from '../../infrastructure/repositories/tournament.repository.js';
import { ErrorCodes } from '../../../../shared/errors/error-codes.js';
import type { PoolConnection } from 'mysql2/promise';

const conn = {} as PoolConnection;
const repo = vi.mocked(tournamentRepository);

/**
 * Phase 3 — per-player event limit: resolving the configured limit and
 * enforcement behaviour (thrown only when a player already holds `limit` active
 * events; unlimited never skips counting; players are deduplicated).
 */
describe('resolveEventsPerPlayerLimit', () => {
  it('treats null, absent and 0 as unlimited', () => {
    expect(resolveEventsPerPlayerLimit({})).toBeNull();
    expect(resolveEventsPerPlayerLimit({ max_events_per_player: null })).toBeNull();
    expect(resolveEventsPerPlayerLimit({ max_events_per_player: 0 })).toBeNull();
  });

  it('accepts a positive configured limit', () => {
    expect(resolveEventsPerPlayerLimit({ max_events_per_player: 1 })).toBe(1);
    expect(resolveEventsPerPlayerLimit({ max_events_per_player: 5 })).toBe(5);
  });
});

describe('enforcePlayerEventLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.countActiveEventRegistrationsForPlayer.mockResolvedValue(0);
  });

  it('is a no-op when the limit is unlimited and does not even count', async () => {
    await enforcePlayerEventLimit({ max_events_per_player: null }, 7, conn, [1, 2]);
    expect(repo.countActiveEventRegistrationsForPlayer).not.toHaveBeenCalled();
  });

  it('throws a 409 TOURNAMENT_EVENTS_PER_PLAYER_LIMIT with the configured limit in the message', async () => {
    repo.countActiveEventRegistrationsForPlayer.mockResolvedValue(1);
    await expect(enforcePlayerEventLimit({ max_events_per_player: 1 }, 7, conn, [9])).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'CONFLICT',
      code: ErrorCodes.TOURNAMENT_EVENTS_PER_PLAYER_LIMIT,
      message: 'A player has reached the maximum of 1 events for this tournament',
    });
  });

  it('allows a registration that is still below the limit and counts the player once', async () => {
    repo.countActiveEventRegistrationsForPlayer.mockResolvedValue(0);
    await expect(enforcePlayerEventLimit({ max_events_per_player: 2 }, 7, conn, [9])).resolves.toBeUndefined();
    expect(repo.countActiveEventRegistrationsForPlayer).toHaveBeenCalledWith(7, 9, conn);
  });

  it('deduplicates repeated player ids when checking a pair/team member list', async () => {
    await enforcePlayerEventLimit({ max_events_per_player: 3 }, 7, conn, [1, 1, 2]);
    expect(repo.countActiveEventRegistrationsForPlayer).toHaveBeenCalledTimes(2);
  });
});