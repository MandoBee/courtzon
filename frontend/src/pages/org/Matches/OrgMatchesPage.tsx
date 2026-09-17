import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchOrgMatches, type MatchStatus, type AdminMatchRow } from '../../../services/match-result.api';
import { useTranslation } from '../../../i18n';
import { formatDateTime } from '../../../utils/formatDate';
import { Can } from '../../../permissions/Can';

const statuses: Array<{ value: '' | MatchStatus; labelKey: string }> = [
  { value: '', labelKey: 'orgMatches.statusAll' },
  { value: 'open', labelKey: 'orgMatches.statusOpen' },
  { value: 'full', labelKey: 'orgMatches.statusFull' },
  { value: 'closed', labelKey: 'orgMatches.statusClosed' },
  { value: 'in_progress', labelKey: 'orgMatches.statusInProgress' },
  { value: 'completed', labelKey: 'orgMatches.statusCompleted' },
  { value: 'cancelled', labelKey: 'orgMatches.statusCancelled' },
  { value: 'void', labelKey: 'orgMatches.statusVoid' },
];

const statusStyles: Record<string, string> = {
  open: 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]',
  full: 'bg-[var(--color-amber)]/10 text-[var(--color-amber)]',
  closed: 'bg-[var(--color-amber)]/10 text-[var(--color-amber)]',
  in_progress: 'bg-[var(--color-info)]/10 text-[var(--color-info)]',
  completed: 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
  cancelled: 'bg-[var(--color-error)]/10 text-[var(--color-error)]',
  void: 'bg-gray-200 text-gray-600',
};

const statusLabels: Record<string, string> = {
  open: 'orgMatches.statusOpen',
  full: 'orgMatches.statusFull',
  closed: 'orgMatches.statusClosed',
  in_progress: 'orgMatches.statusInProgress',
  completed: 'orgMatches.statusCompleted',
  cancelled: 'orgMatches.statusCancelled',
  void: 'orgMatches.statusVoid',
};

export default function OrgMatchesPage() {
  const { t } = useTranslation();
  const { orgId } = useParams<{ orgId: string }>();
  const [status, setStatus] = useState<'' | MatchStatus>('');

  const { data, isLoading } = useQuery({
    queryKey: ['org-matches', orgId, status],
    queryFn: () => fetchOrgMatches(orgId!, { status: status || undefined, limit: 100 }),
    enabled: !!orgId,
  });

  const matches = data?.matches ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('orgMatches.title')}</h1>
        <div className="flex items-center gap-3">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as '' | MatchStatus)}
            className="px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
          >
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>{t(s.labelKey)}</option>
            ))}
          </select>
          <Can permission="org.matches.results.view">
            <Link
              to={`/org/${orgId}/match-results`}
              className="px-3 py-2 text-sm font-medium border border-[var(--color-border)] text-[var(--color-text)] rounded-[var(--radius-md)] hover:bg-[var(--color-primary)]/10"
            >
              {t('orgMatches.resultsLink')}
            </Link>
          </Can>
        </div>
      </div>

      {isLoading ? (
        <p className="text-[var(--color-text-muted)]">{t('common.loading')}</p>
      ) : matches.length === 0 ? (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-8 text-center text-sm text-[var(--color-text-muted)]">
          {t('orgMatches.noMatches')}
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((m: AdminMatchRow) => (
            <div key={m.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-[var(--color-text)]">
                  {t('orgMatches.matchHeader', { id: m.id })}{m.sportName ? ` · ${m.sportName}` : ''}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyles[m.status] ?? ''}`}>
                  {t(statusLabels[m.status] ?? 'orgMatches.statusAll')}
                </span>
              </div>
              <div className="text-xs text-[var(--color-text-muted)] space-y-0.5">
                <p>{[m.branchName, m.resourceName].filter(Boolean).join(' · ')}</p>
                <p>
                  {m.bookingDate ? `${m.bookingDate} ${m.startTime ?? ''}` : m.playedAt ? formatDateTime(m.playedAt) : ''}
                  {typeof m.participantCount === 'number' ? ` · ${m.participantCount} ${t('orgMatches.players')}` : ''}
                  {m.creatorName ? ` · ${m.creatorName}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}