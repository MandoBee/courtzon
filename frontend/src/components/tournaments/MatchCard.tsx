import { useTranslation } from '../../i18n';
import { formatDateTime } from '../../utils/formatDate';
import { formatTournamentScore, hasBye } from '../../utils/tournamentScore';
import { isCurrentUser } from './playerHighlight';
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
  const p1N = match.player1_name || (match.player1_id ? `P${match.player1_id}` : bye ? t('tournamentBracket.bye') : t('tournamentBracket.tbd'));
  const p2N = match.player2_name || (match.player2_id ? `P${match.player2_id}` : bye ? t('tournamentBracket.bye') : t('tournamentBracket.tbd'));
  const p1Mine = isCurrentUser(match.player1_id, currentUserId);
  const p2Mine = isCurrentUser(match.player2_id, currentUserId);
  const score = formatTournamentScore(match);
  const hasScore = Boolean(score);
  const scoreTokens = score.split(' ').filter(Boolean);
  const homeScore = scoreTokens[0] ?? '';
  const awayScore = scoreTokens.slice(1).join(' ') || '';
  const hasTime = Boolean(match.start_time);

  return (
    <button
      type="button"
      onClick={() => onClick?.(match)}
      className="w-full text-left rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2 transition-colors hover:border-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
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
        <div className={`flex items-center justify-between gap-2 ${p1Mine ? 'text-[var(--color-primary)] font-bold' : 'text-[var(--color-text)]'}`}>
          <span className="truncate">{p1N}</span>
          {hasScore && <span className="text-xs font-medium tabular-nums">{homeScore}</span>}
        </div>
        <div className="text-center text-xs text-[var(--color-text-muted)]">vs</div>
        <div className={`flex items-center justify-between gap-2 ${p2Mine ? 'text-[var(--color-primary)] font-bold' : 'text-[var(--color-text)]'}`}>
          <span className="truncate">{p2N}</span>
          {hasScore && <span className="text-xs font-medium tabular-nums">{awayScore}</span>}
        </div>
        {hasScore && <div className="text-center text-xs font-medium tabular-nums">{score}</div>}
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