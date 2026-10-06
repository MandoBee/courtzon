import { useTranslation } from '../../i18n';
import { Modal } from '../ui/Modal';
import { formatDateTime, formatISODate } from '../../utils/formatDate';
import { formatTournamentScore, hasBye } from '../../utils/tournamentScore';
import { isCurrentUser } from './playerHighlight';
import { resolveBracketNavigation } from './matchNavigation';
import { PlayerAvatar, resolveWinnerSide, type AvatarTone } from './PlayerAvatar';
import ResultSummaryView from '../match-result/ResultSummaryView';
import type { TournamentMatchNode } from '../../types/tournamentBracket';

interface MatchDetailsDrawerProps {
  open: boolean;
  onClose: () => void;
  match: TournamentMatchNode | null;
  currentUserId?: number | null;
  /** When provided, the shared result view is used for the result section. */
  resultRecord?: unknown | null;
  /**
   * Already-loaded bracket rows (the same list feeding TournamentBracket).
   * When supplied, defensive Previous/Next controls are rendered; when omitted
   * the drawer behaves exactly as before (no navigation controls).
   */
  matches?: TournamentMatchNode[];
  /** Selects a related match, keeping the drawer open and re-targeting it. */
  onSelectMatch?: (match: TournamentMatchNode) => void;
}

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">{title}</h4>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === '' || value === '—') return null;
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="text-right font-medium text-[var(--color-text)]">{value}</span>
    </div>
  );
}

export function MatchDetailsDrawer({ open, onClose, match, currentUserId, resultRecord, matches, onSelectMatch }: MatchDetailsDrawerProps) {
  const { t } = useTranslation();
  if (!match) return null;

  // Same side-label rule as MatchCard: player name, then participant name (pair/team
  // slots and the public read-model expose participant names only), then id/TBD.
  const p1N = match.player1_name || match.participant1_name || (match.player1_id ? `P${match.player1_id}` : t('tournamentBracket.tbd'));
  const p2N = match.player2_name || match.participant2_name || (match.player2_id ? `P${match.player2_id}` : hasBye(match) ? t('tournamentBracket.bye') : t('tournamentBracket.tbd'));
  const p1Mine = isCurrentUser(match.player1_id, currentUserId);
  const p2Mine = isCurrentUser(match.player2_id, currentUserId);
  const score = formatTournamentScore(match);
  const scoreStructure = match.rule_snapshot?.score_structure;
  const hasResult = Boolean(score);
  const winner = resolveWinnerSide(match);
  // Defensive, pure derivation from already-loaded rows — no network call.
  const navigation = resolveBracketNavigation(match, matches, currentUserId);
  const showNavigation = typeof onSelectMatch === 'function' && Array.isArray(matches);

  // Winner emphasised, loser secondary (never disabled). Current-player highlight
  // always wins so it stays distinguishable from the winner treatment.
  const rowTone = (mine: boolean, side: 'p1' | 'p2') => {
    if (mine) return 'text-[var(--color-primary)] font-bold';
    if (winner === side) return 'text-[var(--color-text)] font-semibold';
    if (winner !== 'none') return 'text-[var(--color-text-muted)]';
    return 'text-[var(--color-text)]';
  };
  const avatarTone = (mine: boolean, side: 'p1' | 'p2'): AvatarTone => {
    if (mine) return 'current';
    if (winner === side) return 'winner';
    if (winner !== 'none') return 'loser';
    return 'default';
  };
  const winnerBadge = (side: 'p1' | 'p2') =>
    winner === side ? (
      <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700">
        {t('tournamentBracket.winner')}
      </span>
    ) : null;

  return (
    <Modal open={open} onClose={onClose} title={t('tournamentBracket.matchDetailsTitle')}>
      <div className="space-y-5">
        <Section title={t('tournamentBracket.sectionMatch')}>
          <div className={`flex items-center gap-3 ${rowTone(p1Mine, 'p1')}`}>
            <PlayerAvatar name={p1N} tone={avatarTone(p1Mine, 'p1')} size="md" />
            <span className="truncate flex-1">{p1N}</span>
            {winnerBadge('p1')}
          </div>
          <div className="py-1 text-center tabular-nums">
            {hasResult
              ? <span className="text-lg font-semibold text-[var(--color-text)]">{score}</span>
              : <span className="text-xs text-[var(--color-text-muted)]">vs</span>}
          </div>
          <div className={`flex items-center gap-3 ${rowTone(p2Mine, 'p2')}`}>
            <PlayerAvatar name={p2N} tone={avatarTone(p2Mine, 'p2')} size="md" />
            <span className="truncate flex-1">{p2N}</span>
            {winnerBadge('p2')}
          </div>
          {hasResult && scoreStructure && (
            <div className="text-center text-[11px] text-[var(--color-text-muted)]">
              {t('tournamentBracket.scoreStructure', { structure: String(scoreStructure) })}
            </div>
          )}
          <Row label={t('tournamentBracket.status')} value={t(STATUS_KEYS[match.status || ''] || 'tournamentBracket.statusUnknown', match.status || '—')} />
          <Row label={t('tournamentBracket.roundLabel')} value={[match.round != null ? t('tournamentBracket.round', { round: match.round }) : null, match.round_name, match.is_final ? t('tournamentBracket.final') : null].filter(Boolean).join(' · ')} />
          {match.match_number != null && <Row label={t('tournamentBracket.matchNumber')} value={match.match_number} />}
        </Section>

        {(match.start_time || match.resource_name || match.referee_name) && (
          <Section title={t('tournamentBracket.sectionSchedule')}>
            {match.start_time && <Row label={t('tournamentBracket.date')} value={formatISODate(match.start_time)} />}
            {match.start_time && <Row label={t('tournamentBracket.startTime')} value={formatDateTime(match.start_time)} />}
            {match.end_time && <Row label={t('tournamentBracket.endTime')} value={formatDateTime(match.end_time)} />}
            <Row label={t('tournamentBracket.court')} value={match.resource_name || (match.resource_id ? `#${match.resource_id}` : undefined)} />
            <Row label={t('tournamentBracket.referee')} value={match.referee_name || (match.referee_id ? `#${match.referee_id}` : undefined)} />
            {match.booking_id != null && <Row label={t('tournamentBracket.booking')} value={`#${match.booking_id}`} />}
          </Section>
        )}

        {hasResult && Boolean(resultRecord) && typeof resultRecord === 'object' && (
          <Section title={t('tournamentBracket.sectionResult')}>
            <ResultSummaryView record={resultRecord as any} />
          </Section>
        )}

        {!hasResult && !match.start_time && !match.resource_name && !match.referee_name && (
          <p className="text-sm text-[var(--color-text-muted)]">{t('tournamentBracket.noDetails')}</p>
        )}

        {showNavigation && (
          <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] pt-4">
            <button
              type="button"
              onClick={() => navigation.prev && onSelectMatch?.(navigation.prev)}
              disabled={!navigation.prev}
              aria-label={t('tournamentBracket.prevMatch')}
              title={t('tournamentBracket.prevMatch')}
              className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden="true">←</span>
              {t('tournamentBracket.prevMatch')}
            </button>
            <button
              type="button"
              onClick={() => navigation.next && onSelectMatch?.(navigation.next)}
              disabled={!navigation.next}
              aria-label={t('tournamentBracket.nextMatch')}
              title={t('tournamentBracket.nextMatch')}
              className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('tournamentBracket.nextMatch')}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}