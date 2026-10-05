import { useTranslation } from '../../i18n';
import { Modal } from '../ui/Modal';
import { formatDateTime, formatISODate } from '../../utils/formatDate';
import { formatTournamentScore, hasBye } from '../../utils/tournamentScore';
import { isCurrentUser } from './playerHighlight';
import ResultSummaryView from '../match-result/ResultSummaryView';
import type { TournamentMatchNode } from '../../types/tournamentBracket';

interface MatchDetailsDrawerProps {
  open: boolean;
  onClose: () => void;
  match: TournamentMatchNode | null;
  currentUserId?: number | null;
  /** When provided, the shared result view is used for the result section. */
  resultRecord?: unknown | null;
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

export function MatchDetailsDrawer({ open, onClose, match, currentUserId, resultRecord }: MatchDetailsDrawerProps) {
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
  const scoreFirst = score.split(' ')[0] ?? '';
  const scoreRest = score.split(' ').slice(1).join(' ') || '';
  const winner: 'p1' | 'p2' | 'none' =
    match.winner_id == null ? 'none' : Number(match.winner_id) === Number(match.player1_id) ? 'p1' : Number(match.winner_id) === Number(match.player2_id) ? 'p2' : 'none';
  const progression = match.progression_meta;

  return (
    <Modal open={open} onClose={onClose} title={t('tournamentBracket.matchDetailsTitle')}>
      <div className="space-y-5">
        <Section title={t('tournamentBracket.sectionMatch')}>
          <div className={`flex items-center justify-between ${p1Mine ? 'text-[var(--color-primary)] font-bold' : 'text-[var(--color-text)]'}`}>
            <span>{p1N}</span>
            {hasResult && <span className="text-sm tabular-nums">{scoreFirst}</span>}
            {winner === 'p1' && <span className="text-xs text-green-600">Winner</span>}
          </div>
          <div className="text-center text-xs text-[var(--color-text-muted)]">vs</div>
          <div className={`flex items-center justify-between ${p2Mine ? 'text-[var(--color-primary)] font-bold' : 'text-[var(--color-text)]'}`}>
            <span>{p2N}</span>
            {hasResult && <span className="text-sm tabular-nums">{scoreRest}</span>}
            {winner === 'p2' && <span className="text-xs text-green-600">Winner</span>}
          </div>
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

        {hasResult && (
          <Section title={t('tournamentBracket.sectionResult')}>
            {resultRecord && typeof resultRecord === 'object' ? (
              <ResultSummaryView record={resultRecord as any} />
            ) : (
              <div className="space-y-1 text-sm">
                <div>
                  <span className="font-semibold">{score}</span>
                  {scoreStructure && <span className="ml-2 text-xs text-[var(--color-text-muted)]">{t('tournamentBracket.scoreStructure', { structure: String(scoreStructure) })}</span>}
                </div>
                {winner !== 'none' && (
                  <div className="text-xs text-green-600">
                    {t('tournamentBracket.winner')}: {winner === 'p1' ? p1N : p2N}
                  </div>
                )}
              </div>
            )}
          </Section>
        )}

        {progression && Object.keys(progression).length > 0 && (
          <Section title={t('tournamentBracket.sectionProgression')}>
            <div className="text-xs text-[var(--color-text-muted)]">{JSON.stringify(progression)}</div>
          </Section>
        )}

        {!hasResult && !match.start_time && !match.resource_name && !match.referee_name && !progression && (
          <p className="text-sm text-[var(--color-text-muted)]">{t('tournamentBracket.noDetails')}</p>
        )}
      </div>
    </Modal>
  );
}