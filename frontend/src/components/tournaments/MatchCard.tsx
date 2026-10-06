import { useTranslation } from '../../i18n';
import { formatDateTime } from '../../utils/formatDate';
import { formatTournamentScore, hasBye } from '../../utils/tournamentScore';
import { isCurrentUser } from './playerHighlight';
import { PlayerAvatar, resolveWinnerSide, type AvatarTone } from './PlayerAvatar';
import type { TournamentMatchNode } from '../../types/tournamentBracket';

interface MatchCardProps {
  match: TournamentMatchNode;
  currentUserId?: number | null;
  onClick?: (match: TournamentMatchNode) => void;
  /** Optional per-match action row (e.g. "Enter Score") rendered under the card. */
  footer?: (match: TournamentMatchNode) => React.ReactNode;
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-gray-100 text-gray-700',
  pending: 'bg-amber-100 text-amber-700',
  pending_payment: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  walkover: 'bg-purple-100 text-purple-700',
  forfeit: 'bg-purple-100 text-purple-700',
  no_show: 'bg-red-100 text-red-700',
};
const STATUS_KEYS: Record<string, string> = {
  scheduled: 'tournamentBracket.statusScheduled',
  pending: 'tournamentBracket.statusPending',
  pending_payment: 'tournamentBracket.statusPendingPayment',
  in_progress: 'tournamentBracket.statusInProgress',
  completed: 'tournamentBracket.statusCompleted',
  cancelled: 'tournamentBracket.statusCancelled',
  walkover: 'tournamentBracket.statusWalkover',
  forfeit: 'tournamentBracket.statusForfeit',
  no_show: 'tournamentBracket.statusNoShow',
};

export function MatchCard({ match, currentUserId, onClick, footer }: MatchCardProps) {
  const { t } = useTranslation();
  const bye = hasBye(match);
  // Side labels fall back to the PARTICIPANT name (pair/team bracket slots and the
  // public discovery read-model expose `participant1_name` only). One label
  // resolver keeps every role/screen on the same naming rule.
  const p1N = match.player1_name || match.participant1_name || (match.player1_id ? `P${match.player1_id}` : bye ? t('tournamentBracket.bye') : t('tournamentBracket.tbd'));
  const p2N = match.player2_name || match.participant2_name || (match.player2_id ? `P${match.player2_id}` : bye ? t('tournamentBracket.bye') : t('tournamentBracket.tbd'));
  const p1Mine = isCurrentUser(match.player1_id, currentUserId);
  const p2Mine = isCurrentUser(match.player2_id, currentUserId);
  // ONE primary score representation, rendered once between the two players.
  // Sport-aware formatting stays in the shared formatTournamentScore utility.
  const score = formatTournamentScore(match);
  const hasScore = Boolean(score);
  const hasTime = Boolean(match.start_time);
  const winnerSide = resolveWinnerSide(match);

  // Winner emphasised, loser secondary (never disabled). Current-player highlight
  // always wins so it stays distinguishable from the winner treatment.
  const rowTone = (mine: boolean, side: 'p1' | 'p2') => {
    if (mine) return 'text-[var(--color-primary)] font-bold';
    if (winnerSide === side) return 'text-[var(--color-text)] font-semibold';
    if (winnerSide !== 'none') return 'text-[var(--color-text-muted)]';
    return 'text-[var(--color-text)]';
  };
  const avatarTone = (mine: boolean, side: 'p1' | 'p2'): AvatarTone => {
    if (mine) return 'current';
    if (winnerSide === side) return 'winner';
    if (winnerSide !== 'none') return 'loser';
    return 'default';
  };
  const winnerBadge = (side: 'p1' | 'p2') =>
    winnerSide === side ? (
      <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-green-700">
        {t('tournamentBracket.winner')}
      </span>
    ) : null;

  return (
    <button
      type="button"
      onClick={() => onClick?.(match)}
      className="cz-match-card w-full text-left rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2 transition-[transform,border-color] duration-150 hover:-translate-y-px hover:border-[var(--color-primary)] active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-[var(--color-text-muted)]">
          {t('tournamentBracket.round', { round: match.round ?? '' })}
          {match.round_name ? ` · ${match.round_name}` : ''}
          {match.match_number != null ? ` · ${t('tournamentBracket.matchShort', { number: match.match_number })}` : ''}
        </span>
        <span className={`px-1.5 py-0.5 rounded-full capitalize shrink-0 ${STATUS_STYLES[match.status || ''] || 'bg-gray-100 text-gray-600'}`}>
          {t(STATUS_KEYS[match.status || ''] || 'tournamentBracket.statusUnknown', match.status || '—')}
        </span>
      </div>

      <div className="space-y-1 text-sm">
        <div className={`flex items-center gap-2 ${rowTone(p1Mine, 'p1')}`}>
          <PlayerAvatar name={p1N} tone={avatarTone(p1Mine, 'p1')} />
          <span className={`truncate flex-1${p1Mine ? ' cz-player-emphasis' : ''}`}>{p1N}</span>
          {winnerBadge('p1')}
        </div>
        <div className="text-center text-xs tabular-nums">
          {hasScore
            ? <span className="font-medium text-[var(--color-text)]">{score}</span>
            : <span className="text-[var(--color-text-muted)]">vs</span>}
        </div>
        <div className={`flex items-center gap-2 ${rowTone(p2Mine, 'p2')}`}>
          <PlayerAvatar name={p2N} tone={avatarTone(p2Mine, 'p2')} />
          <span className={`truncate flex-1${p2Mine ? ' cz-player-emphasis' : ''}`}>{p2N}</span>
          {winnerBadge('p2')}
        </div>
      </div>

      {(match.resource_name || hasTime) && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--color-text-muted)]">
          {match.resource_name && <span>{t('tournamentBracket.court')}: {match.resource_name}</span>}
          {hasTime && <span>{formatDateTime(match.start_time as string)}</span>}
        </div>
      )}
      {footer?.(match)}
    </button>
  );
}