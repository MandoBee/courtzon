/**
 * Defensive tournament-bracket navigation resolver (frontend-only).
 *
 * Derives the related previous / next bracket match from data that is ALREADY
 * loaded — the match list returned by `GET /tournaments/:id/matches`. It never
 * performs a network call, never invents an API field and never guesses a
 * relationship: when a target cannot be proven from the loaded data the result
 * is `null` and the caller disables that direction.
 *
 * The ONLY progression contract persisted by the backend is the documented
 * `progression_meta` shape
 * (backend/src/modules/tournaments/domain/knockout-placements.ts):
 *
 *   {
 *     is_bracket?: boolean;
 *     bye?: boolean;
 *     target_round?: number | null;
 *     target_bracket_position?: number | null;
 *     target_side?: 'player1' | 'player2' | null;
 *   }
 *
 * Semantics: the WINNER of this slot advances into the match located at
 * (`target_round`, `target_bracket_position`); `target_side` is the side of the
 * target match the winner occupies. `is_bracket !== true` marks a non-bracket
 * (round-robin / league / group) slot — progression navigation is never offered
 * for those.
 */
import type { TournamentMatchNode } from '../../types/tournamentBracket';

export interface BracketNavigation {
  prev: TournamentMatchNode | null;
  next: TournamentMatchNode | null;
}

interface BracketTarget {
  round: number;
  position: number;
  side: 'player1' | 'player2' | null;
}

const EMPTY: BracketNavigation = { prev: null, next: null };

/** Coerce an unknown value to a finite number, or null. Never throws. */
function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Read the documented bracket target of a match. Returns null unless the slot
 * is explicitly a bracket slot (`is_bracket === true`) AND both target
 * coordinates are present and numeric. Unknown / malformed meta yields null.
 */
function readBracketTarget(match: TournamentMatchNode | null | undefined): BracketTarget | null {
  const meta = match?.progression_meta;
  if (!meta || typeof meta !== 'object') return null;

  const raw = meta as Record<string, unknown>;
  if (raw.is_bracket !== true) return null;

  const round = toFiniteNumber(raw.target_round);
  const position = toFiniteNumber(raw.target_bracket_position);
  if (round === null || position === null) return null;

  const side = raw.target_side === 'player1' || raw.target_side === 'player2' ? raw.target_side : null;
  return { round, position, side };
}

/** Two rows belong to the same tournament when both ids are known and equal. */
function sameTournament(a: TournamentMatchNode, b: TournamentMatchNode): boolean {
  if (a.tournament_id == null || b.tournament_id == null) return true;
  return Number(a.tournament_id) === Number(b.tournament_id);
}

/** The side of `current` the authenticated user occupies, if any. */
function currentPlayerSide(current: TournamentMatchNode, currentUserId?: number | null): 'player1' | 'player2' | null {
  if (currentUserId == null) return null;
  const uid = Number(currentUserId);
  if (current.player1_id != null && Number(current.player1_id) === uid) return 'player1';
  if (current.player2_id != null && Number(current.player2_id) === uid) return 'player2';
  return null;
}

/**
 * Resolve the previous (feeder) and next (progression) matches for `current`
 * from the already-loaded `matches`.
 *
 * Next  — the unique match at the current slot's documented target coordinates.
 * Previous — a unique feeder whose winner advances into the current slot. When
 *   two feeders exist (a standard bracket pair) the relationship is ambiguous
 *   as a single "previous"; it is resolved ONLY when the authenticated user
 *   occupies a side, in which case the feeder targeting that side is used.
 *   Otherwise that direction stays disabled.
 */
export function resolveBracketNavigation(
  current: TournamentMatchNode | null | undefined,
  matches: readonly TournamentMatchNode[] | null | undefined,
  currentUserId?: number | null,
): BracketNavigation {
  if (!current || !Array.isArray(matches) || matches.length === 0) return EMPTY;

  const others = matches.filter((m) => m && m.id !== current.id);
  const currentRound = toFiniteNumber(current.round);
  const currentPosition = toFiniteNumber(current.bracket_position);

  // ── Next: the unique slot this match's winner advances into ──────────────
  let next: TournamentMatchNode | null = null;
  const target = readBracketTarget(current);
  if (target) {
    const candidates = others.filter(
      (m) =>
        sameTournament(current, m) &&
        toFiniteNumber(m.round) === target.round &&
        toFiniteNumber(m.bracket_position) === target.position,
    );
    // Only an unambiguous single target is navigable.
    if (candidates.length === 1) next = candidates[0];
  }

  // ── Previous: the feeder(s) whose winner advances into this slot ─────────
  let prev: TournamentMatchNode | null = null;
  if (currentRound !== null && currentPosition !== null) {
    const feeders = others.filter((m) => {
      if (!sameTournament(current, m)) return false;
      const t = readBracketTarget(m);
      return t !== null && t.round === currentRound && t.position === currentPosition;
    });

    if (feeders.length === 1) {
      prev = feeders[0];
    } else if (feeders.length > 1) {
      // Two feeders (player1/player2) are ambiguous on their own. Disambiguate
      // only via the authenticated user's side; otherwise stay disabled.
      const side = currentPlayerSide(current, currentUserId);
      if (side) {
        const onSide = feeders.filter((m) => readBracketTarget(m)?.side === side);
        if (onSide.length === 1) prev = onSide[0];
      }
    }
  }

  return { prev, next };
}
