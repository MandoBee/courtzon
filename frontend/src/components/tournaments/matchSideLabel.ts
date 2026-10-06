/**
 * Shared, ID-free participant label resolution for tournament match rows.
 *
 * The same rule is applied (inlined) by `MatchCard` and `MatchDetailsDrawer`;
 * the player TournamentDetailPage overview "prediction line" resolves through
 * this helper so it can never fall back to an internal id such as `P12`.
 *
 * Resolution order per side:
 *   1. player display name
 *   2. participant display name (pair/team bracket slots expose it only)
 *   3. neutral localized label when the slot carries only an internal id
 *   4. TBD / Bye placeholders for unassigned slots (never an id)
 */
import { hasBye } from '../../utils/tournamentScore';
import type { TournamentMatchNode } from '../../types/tournamentBracket';

export type MatchSide = 'p1' | 'p2';

type Translate = (key: string) => string;

/** Neutral, localized label for one side of a match. Internal ids never appear. */
export function resolveMatchSideLabel(
  match: Partial<TournamentMatchNode>,
  side: MatchSide,
  t: Translate,
): string {
  const playerName = side === 'p1' ? match.player1_name : match.player2_name;
  const participantName = side === 'p1' ? match.participant1_name : match.participant2_name;
  const playerId = side === 'p1' ? match.player1_id : match.player2_id;

  const displayName = playerName || participantName;
  if (displayName) return displayName;

  // Slot assigned but exposes no display name → neutral label, never P{id}.
  if (playerId != null) return t('tournamentBracket.notAvailable');

  // Unassigned slot → Bye on the second side, TBD otherwise.
  if (side === 'p2' && hasBye(match as TournamentMatchNode)) return t('tournamentBracket.bye');
  return t('tournamentBracket.tbd');
}

/**
 * Overview "prediction line" (`A vs B`).
 *
 * The `A vs B` structure is kept only while at least one side carries
 * meaningful information (a real display name, TBD or Bye). When both sides
 * would resolve to the neutral label the line degrades to a single neutral
 * label — ids are never interpolated into the string.
 */
export function matchPredictionLabel(
  match: Partial<TournamentMatchNode>,
  t: Translate,
): string {
  const neutral = t('tournamentBracket.notAvailable');
  const p1 = resolveMatchSideLabel(match, 'p1', t);
  const p2 = resolveMatchSideLabel(match, 'p2', t);
  if (p1 === neutral && p2 === neutral) return neutral;
  return `${p1} vs ${p2}`;
}
