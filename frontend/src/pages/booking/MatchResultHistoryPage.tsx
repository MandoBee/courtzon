import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchMyResults } from '../../services/match-result.api';
import { useTranslation } from '../../i18n';
import { formatDateTime } from '../../utils/formatDate';

const statusFilterOptions = [
  { value: '', labelKey: 'matchResult.statusAll' },
  { value: 'pending_confirmation', labelKey: 'matchResult.statusPending' },
  { value: 'approved', labelKey: 'matchResult.statusApproved' },
  { value: 'disputed', labelKey: 'matchResult.statusDisputed' },
  { value: 'withdrawn', labelKey: 'matchResult.statusWithdrawn' },
  { value: 'no_result', labelKey: 'matchResult.statusNoResult' },
];

export default function MatchResultHistoryPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['my-results', status],
    queryFn: () => fetchMyResults(status || undefined),
  });

  const records = data?.records ?? [];
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

  return (
    <div className="max-w-3xl mx-auto pb-24 md:pb-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-4">{t('matchResult.historyTitle')}</h1>

      <div className="mb-4">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full sm:w-64 px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
        >
          {statusFilterOptions.map((o) => (
            <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="text-[var(--color-text-muted)]">{t('common.loading')}</p>
      ) : records.length === 0 ? (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-8 text-center text-sm text-[var(--color-text-muted)]">
          {t('matchResult.noResults')}
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((r) => (
            <button
              key={r.id}
              onClick={() => navigate(`/matches/${r.matchId}/result`)}
              className="w-full text-left bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 hover:shadow-[var(--shadow-md)] transition-shadow"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--color-text)]">
                  {r.finalResult?.scoreSummary || r.rawResult.outcome}
                </span>
                <span className={`px-2 py-0.5 text-xs rounded-full ${statusStyles[r.submissionStatus] || ''}`}>
                  {t(statusKey[r.submissionStatus] || r.submissionStatus.replace('_', ' '))}
                </span>
              </div>
              <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                {t('matchResult.matchNo', { id: r.matchId })} • {t('matchResult.playedAt')} {formatDateTime(r.playedAt)}
              </div>
              {r.disputeReason && (
                <div className="mt-1 text-xs text-[var(--color-error-text)]">{t('matchResult.disputeLabel')}: {r.disputeReason}</div>
              )}
              {r.autoApproved && (
                <div className="mt-1 text-xs text-[var(--color-text-muted)]">{t('matchResult.autoApprovedShort')}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}