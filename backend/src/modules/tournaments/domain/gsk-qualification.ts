/**
 * Step 3B-3 — GSK Qualification: typed result + deterministic comparator.
 *
 * The qualification engine consumes the EXISTING authoritative per-group
 * standings (`tournament_standings` via `getStandings(tournamentId, groupId)`)
 * and never re-implements scoring. Ranking reuses the single standings
 * comparator used by `computeStandings` (domain/tournament-aggregate.ts):
 * points DESC → game difference DESC. Cross-group best-third ties are resolved
 * deterministically by that same comparator and then by stable identity keys
 * (groupId, participantId) — never by randomness.
 */

export type GskQualificationType = 'group_position' | 'best_third';

export interface GskQualifiedParticipant {
  participantId: number;
  groupId: number;
  groupRank: number;
  qualificationType: GskQualificationType;
  /** 1-based position in the final deterministic qualified ordering. */
  qualificationRank: number;
  /** Authoritative tournament seed when available (for ordering = 'seed'). */
  seed?: number | null;
  /** Authoritative standings points (for ordering = 'points' / reference). */
  points?: number | null;
}

export interface GskQualificationResult {
  tournamentId: number;
  stageId: number;
  qualified: GskQualifiedParticipant[];
  totalQualified: number;
}

/** Minimal standing fields consumed by the comparator (matches TournamentStandingRow). */
export interface StandingsLike {
  points: number | string;
  wins?: number | string;
  losses?: number | string;
  draws?: number | string;
  games_won?: number | string;
  games_lost?: number | string;
}

/**
 * The SINGLE standings comparator (mirror of `computeStandings`' final sort):
 * points DESC, then game difference DESC. Deterministic and already the product
 * rule — used both for in-group ranking fallback and best-third cross-group
 * selection.
 */
export function compareStandingRows(a: StandingsLike, b: StandingsLike): number {
  const aPoints = Number(a.points ?? 0);
  const bPoints = Number(b.points ?? 0);
  const aDiff = Number(a.games_won ?? 0) - Number(a.games_lost ?? 0);
  const bDiff = Number(b.games_won ?? 0) - Number(b.games_lost ?? 0);
  return bPoints - aPoints || bDiff - aDiff;
}

/**
 * Stable identity tie-break for cross-group comparisons where the standings
 * comparator is equal. Uses existing deterministic identity keys only.
 */
export function compareGroupIdentity(a: { groupId: number; participantId: number }, b: { groupId: number; participantId: number }): number {
  return a.groupId - b.groupId || a.participantId - b.participantId;
}