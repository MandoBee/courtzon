/**
 * Frontend-only presentation helpers for the shared tournament bracket.
 *
 * `playerInitials` and `PlayerAvatar` use ONLY the display name already present
 * in the bracket read-model (player name / participant name). There are no
 * avatar URLs, no API/profile lookups, no network calls, no internal IDs.
 */
import type { TournamentMatchNode } from '../../types/tournamentBracket';

/** First alphanumeric character of a word, uppercased, or empty string. */
function firstLetter(word: string): string {
  const match = word.match(/[\p{L}\p{N}]/u);
  return match ? match[0].toUpperCase() : '';
}

/**
 * Derive up to two uppercase initials from a display name.
 * - "Alpha"            → "A"
 * - "Alpha Bravo"      → "AB"
 * - "Alpha / Beta"     → "AB"
 * - "" / null / "123?" → safe fallback ("?" or the leading character)
 */
export function playerInitials(name?: string | null): string {
  const safe = typeof name === 'string' ? name.trim() : '';
  if (!safe) return '?';

  const words = safe.split(/[\s/\\]+/).filter(Boolean);
  if (words.length === 0) return '?';

  const first = firstLetter(words[0]);
  if (words.length === 1) return first || '?';

  const last = firstLetter(words[words.length - 1]);
  return `${first}${last}` || '?';
}

/**
 * Resolve which side won from the result already present in the read-model.
 * Uses `winner_id` (player/user) with a `winner_participant_id` fallback for
 * team/pair slots. Unknown, draw, bye or unplayed → 'none'. Never guesses.
 */
export function resolveWinnerSide(match: TournamentMatchNode): 'p1' | 'p2' | 'none' {
  const winnerId = match.winner_id != null ? Number(match.winner_id) : null;
  const winnerParticipantId = match.winner_participant_id != null ? Number(match.winner_participant_id) : null;

  if (winnerId != null) {
    if (match.player1_id != null && Number(match.player1_id) === winnerId) return 'p1';
    if (match.player2_id != null && Number(match.player2_id) === winnerId) return 'p2';
  }
  if (winnerParticipantId != null) {
    if (match.participant1_id != null && Number(match.participant1_id) === winnerParticipantId) return 'p1';
    if (match.participant2_id != null && Number(match.participant2_id) === winnerParticipantId) return 'p2';
  }
  return 'none';
}

export type AvatarTone = 'default' | 'current' | 'winner' | 'loser';

interface PlayerAvatarProps {
  name?: string | null;
  tone?: AvatarTone;
  /** `sm` is used by the compact bracket card; `md` by the details drawer. */
  size?: 'sm' | 'md';
  className?: string;
}

const SIZE_CLASS: Record<'sm' | 'md', string> = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
};

const TONE_CLASS: Record<AvatarTone, string> = {
  default: 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]',
  current: 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] ring-1 ring-[var(--color-primary)]',
  winner: 'bg-green-100 text-green-700 ring-1 ring-green-600',
  loser: 'bg-[var(--color-bg)] text-[var(--color-text-muted)]',
};

/**
 * Circular initials avatar. Decorative (the adjacent name text is the
 * accessible label), so it is hidden from assistive tech.
 */
export function PlayerAvatar({ name, tone = 'default', size = 'sm', className = '' }: PlayerAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold uppercase ${SIZE_CLASS[size]} ${TONE_CLASS[tone]} ${className}`}
    >
      {playerInitials(name)}
    </span>
  );
}
