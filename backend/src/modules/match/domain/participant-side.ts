import type { MatchFormatSnapshot } from './match.types.js';
import type { ParticipantSide } from './match.types.js';

export interface SideAssignment {
  side: ParticipantSide;
  teamIndex: number;
}

/**
 * Format-driven authoritative side assignment (Group 2).
 *
 * Determines which side a participant belongs to based on the Match's frozen
 * `format_snapshot` and the participants already assigned. This is the single
 * domain mechanism used by the Match creation path (host) and the join-approval
 * path (joiners) — NOT insertion-order splitting.
 *
 * Rules (all derived from configuration, never hardcoded sport names):
 *  - The host/creator always opens on 'home' (teamIndex 0).
 *  - Each side fills up to `players_per_side` participants (teamIndex 0 = home,
 *    1 = away, matching `match_result_participants` conventions).
 *  - When `players_per_side` is NULL (format exists but side size unconfigured,
 *    e.g. a team format whose size is not set), sides are balanced so no side
 *    leads by more than one participant — no team size is invented.
 *  - When the Match has no format at all, the assignment is NULL (legacy
 *    fallback is preserved — never fabricated).
 *
 * Returns the authoritative assignment for the NEXT participant, or null when
 * no authoritative side can be determined (format-less Match).
 */
export function assignNextParticipantSide(
  format: MatchFormatSnapshot | null,
  existing: Array<{ side: ParticipantSide | null }>,
): SideAssignment | null {
  if (!format) return null;

  const homeCount = existing.filter((p) => p.side === 'home').length;
  const awayCount = existing.filter((p) => p.side === 'away').length;

  // No participants yet → the first (host/creator) opens on home.
  if (homeCount === 0 && awayCount === 0) {
    return { side: 'home', teamIndex: 0 };
  }

  const capacity = format.playersPerSide;

  // Side size configured → fill home first, then away, never exceeding the
  // configured capacity per side. teamIndex is derived from side.
  if (capacity != null && capacity > 0) {
    if (homeCount < capacity) return { side: 'home', teamIndex: 0 };
    if (awayCount < capacity) return { side: 'away', teamIndex: 1 };
    // Both sides full — over-capacity is rejected by the result engine.
    return { side: 'away', teamIndex: 1 };
  }

  // players_per_side unconfigured → balance sides (no side leads by >1).
  const side: ParticipantSide = awayCount < homeCount ? 'away' : 'home';
  return { side, teamIndex: side === 'home' ? 0 : 1 };
}