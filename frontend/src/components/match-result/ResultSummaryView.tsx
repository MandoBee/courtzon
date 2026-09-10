import { useTranslation } from '../../i18n';
import type { MatchResultParticipant, MatchResultRecord } from '../../types/match-result';

interface Props {
  record: MatchResultRecord;
  participants?: MatchResultParticipant[];
  showRating?: boolean;
}

const statusStyles: Record<string, string> = {
  pending_confirmation: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  approved: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  disputed: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  withdrawn: 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]',
  no_result: 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]',
};

const statusKey: Record<string, string> = {
  pending_confirmation: 'matchResult.statusPending',
  approved: 'matchResult.statusApproved',
  disputed: 'matchResult.statusDisputed',
  withdrawn: 'matchResult.statusWithdrawn',
  no_result: 'matchResult.statusNoResult',
};

const outcomeKey: Record<string, string> = {
  win: 'matchResult.outcome.win',
  draw: 'matchResult.outcome.draw',
  loss: 'matchResult.outcome.loss',
};

export default function ResultSummaryView({ record, participants = [], showRating = false }: Props) {
  const { t } = useTranslation();
  const scoreSummary = record.finalResult?.scoreSummary || record.rawResult?.outcome || record.outcome;
  const winners = participants.filter((p) => p.outcome === 'win');
  const draw = participants.some((p) => p.outcome === 'draw');

  return (
    <div className="text-sm text-[var(--color-text)]">
      <div className="font-semibold">{scoreSummary}</div>
      {draw ? (
        <div className="text-xs text-[var(--color-text-muted)] mt-1">{t('matchResult.drawNoRating')}</div>
      ) : winners.length > 0 ? (
        <div className="text-xs text-[var(--color-text-muted)] mt-1">
          {t('matchResult.winner')}: {winners.map((w) => `#${w.userId}`).join(', ')} ({winners[0]?.side})
        </div>
      ) : null}
      {participants.length > 0 && (
        <ul className="mt-2 space-y-1">
          {participants.map((p) => (
            <li key={p.id} className="flex items-center justify-between text-xs">
              <span>
                {t('matchResult.playerLabel', { id: p.userId })}{' '}
                <span className="text-[var(--color-text-muted)]">({p.side})</span>
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-full ${
                    p.outcome === 'win'
                      ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]'
                      : p.outcome === 'draw'
                        ? 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]'
                        : 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]'
                  }`}
                >
                  {t(outcomeKey[p.outcome] || p.outcome)}
                </span>
                {showRating && p.ratingAfter != null && (
                  <span className="text-[var(--color-text-muted)]">{t('matchResult.rating')} {p.ratingAfter}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {record.disputeReason && (
        <p className="mt-2 text-xs text-[var(--color-error-text)]">{t('matchResult.disputeLabel')}: {record.disputeReason}</p>
      )}
      {record.autoApproved && (
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{t('matchResult.autoApprovedNotice')}</p>
      )}
      <div className="mt-2">
        <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${statusStyles[record.submissionStatus] || ''}`}>
          {t(statusKey[record.submissionStatus] || record.submissionStatus.replace('_', ' '))}
        </span>
      </div>
    </div>
  );
}