import type { PoolConnection } from 'mysql2/promise';
import { ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';

/**
 * Phase 3 — per-player event limit enforcement.
 *
 * `max_events_per_player` (NULL = unlimited) is a tournament-level setting read
 * from the tournament row. The count is ALWAYS derived from registration state
 * (never a separate counter that could drift): a player consumes allowance for
 * every DISTINCT ACTIVE event registration (`registered` / `confirmed`) they
 * hold in the tournament, across all competitions, whether as the registration
 * `player_id` (Singles, pair/team primary) or as a `tournament_participant_members`
 * row (non-primary pair/team members).
 *
 * Callers MUST hold the tournament-row lock (`SELECT id FROM tournaments
 * WHERE id = ? FOR UPDATE`) before calling — the count + the subsequent insert
 * then cannot race with a concurrent registration.
 */

/** Resolve the configured limit; NULL / absent / 0 → unlimited. */
export function resolveEventsPerPlayerLimit(t: { max_events_per_player?: number | null }): number | null {
  const v = Number(t.max_events_per_player ?? 0);
  return v >= 1 ? v : null;
}

/**
 * Enforce the limit for every given player. Throws a 409 ConflictError
 * (TOURNAMENT_EVENTS_PER_PLAYER_LIMIT) the moment any player already holds
 * `limit` active event registrations. All players are checked before the caller
 * writes anything, so a pair/team with an over-limit member fails atomically.
 */
export async function enforcePlayerEventLimit(
  t: { max_events_per_player?: number | null },
  tournamentId: number,
  conn: PoolConnection,
  playerIds: ReadonlyArray<number>,
): Promise<void> {
  const limit = resolveEventsPerPlayerLimit(t);
  if (limit == null) return;
  const seen = new Set<number>();
  for (const raw of playerIds) {
    const playerId = Number(raw);
    if (!playerId || seen.has(playerId)) continue;
    seen.add(playerId);
    const active = await tournamentRepository.countActiveEventRegistrationsForPlayer(tournamentId, playerId, conn);
    if (active >= limit) {
      throw new ConflictError(
        `A player has reached the maximum of ${limit} events for this tournament`,
        ErrorCodes.TOURNAMENT_EVENTS_PER_PLAYER_LIMIT,
      );
    }
  }
}