import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import api from '../../services/api';
import { formatISODate } from '../../utils/formatDate';
import { SkeletonRow } from '../../components/ui';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';

export default function RefereeAssignmentsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [tab, setTab] = useState<'upcoming' | 'completed'>('upcoming');

  const { data: assignments, isLoading } = useQuery({
    queryKey: ['referee-assignments'],
    queryFn: () => api.get('/referee/assignments').then((r) => r.data),
  });

  const respondMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'accept' | 'decline' }) =>
      api.post(`/referee/assignments/${id}/${action}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referee-assignments'] });
      showToast(t('referee.assignments.responded', 'Assignment updated'));
    },
    onError: (err: any) => showToast(err?.response?.data?.message || t('common.error', 'Something went wrong'), 'error'),
  });

  const list = Array.isArray(assignments?.data)
    ? assignments.data
    : Array.isArray(assignments)
      ? assignments
      : [];

  const upcoming = list.filter((a: any) => ['scheduled', 'in_progress', 'pending'].includes(a.status));
  const completed = list.filter((a: any) => ['completed', 'cancelled'].includes(a.status));

  const rows = tab === 'upcoming' ? upcoming : completed;

  return (
    <div className="space-y-5 md:space-y-6 pb-4">
      <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)]">
        {t('referee.assignments.title', 'Assignments')}
      </h1>

      <div className="flex gap-1 bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-1 w-fit border border-[var(--color-border)]">
        <button
          onClick={() => setTab('upcoming')}
          className={`px-4 py-1.5 text-sm font-medium rounded-[var(--radius-md)] transition-colors ${
            tab === 'upcoming' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          {t('referee.assignments.upcoming', 'Upcoming')}
        </button>
        <button
          onClick={() => setTab('completed')}
          className={`px-4 py-1.5 text-sm font-medium rounded-[var(--radius-md)] transition-colors ${
            tab === 'completed' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          {t('referee.assignments.completed', 'Completed')}
        </button>
      </div>

      {isLoading && <SkeletonRow count={5} />}

      {!isLoading && rows.length === 0 && (
        <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">
          {t('referee.assignments.empty', 'No assignments found')}
        </p>
      )}

      <Can permission="referee.assignments.view">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left p-2 font-medium text-[var(--color-text-muted)]">{t('referee.assignments.type', 'Type')}</th>
                <th className="text-left p-2 font-medium text-[var(--color-text-muted)]">{t('referee.assignments.competition', 'Competition')}</th>
                <th className="text-left p-2 font-medium text-[var(--color-text-muted)]">{t('referee.assignments.date', 'Date')}</th>
                <th className="text-left p-2 font-medium text-[var(--color-text-muted)]">{t('referee.assignments.time', 'Time')}</th>
                <th className="text-left p-2 font-medium text-[var(--color-text-muted)]">{t('referee.assignments.status', 'Status')}</th>
                <th className="text-left p-2 font-medium text-[var(--color-text-muted)]">{t('common.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a: any) => (
                <tr key={a.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]/50">
                  <td className="p-2 text-[var(--color-text)] capitalize">{a.matchType || a.match_type || '—'}</td>
                  <td className="p-2 text-[var(--color-text)]">{a.competitionName || a.competition_name || '—'}</td>
                  <td className="p-2 text-[var(--color-text)]">{formatISODate(a.date || a.scheduled_at)}</td>
                  <td className="p-2 text-[var(--color-text-muted)]">
                    {new Date(a.date || a.scheduled_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="p-2">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-info)]/15 text-[var(--color-info)] capitalize">
                      {a.status?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="p-2">
                    <Can permission="referee.assignments.manage">
                      {a.status === 'pending' && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => respondMutation.mutate({ id: a.id, action: 'accept' })}
                            disabled={respondMutation.isPending}
                            className="px-3 py-1 text-xs font-medium text-white bg-[var(--color-success)] rounded-[var(--radius-sm)] hover:opacity-90"
                          >
                            {t('referee.assignments.accept', 'Accept')}
                          </button>
                          <button
                            onClick={() => respondMutation.mutate({ id: a.id, action: 'decline' })}
                            disabled={respondMutation.isPending}
                            className="px-3 py-1 text-xs font-medium text-white bg-red-500 rounded-[var(--radius-sm)] hover:opacity-90"
                          >
                            {t('referee.assignments.decline', 'Decline')}
                          </button>
                        </div>
                      )}
                    </Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Can>
    </div>
  );
}
