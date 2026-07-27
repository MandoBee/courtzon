import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { Pagination } from '../../../components/ui/Pagination';
import { useTranslation } from '../../../i18n';
import { tournamentApi } from '../../../services/tournament';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  published: 'bg-blue-100 text-blue-700',
  registration_open: 'bg-green-100 text-green-700',
  registration_closed: 'bg-amber-100 text-amber-700',
  running: 'bg-purple-100 text-purple-700',
  completed: 'bg-teal-100 text-teal-700',
  cancelled: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-500',
};

export default function TournamentAdminPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<{ name?: string; status?: string }>({});

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tournaments', page, limit, statusFilter],
    queryFn: () => tournamentApi.getTournaments({ page, limit, status: statusFilter || undefined }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: { id: number; name?: string; status?: string }) => tournamentApi.updateTournament(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tournaments'] }); setEditId(null); showToast(t('tournaments.updated')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => tournamentApi.archive(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tournaments'] }); showToast(t('tournaments.archived')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const tournaments = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-[var(--color-text)]">{t('tournaments.admin.title')}</h1>
      <div className="flex gap-2">
        {['', 'draft', 'published', 'registration_open', 'registration_closed', 'running', 'completed', 'cancelled', 'archived'].map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1 text-xs rounded-[var(--radius-md)] border ${statusFilter === s ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)]'}`}>
            {s ? t(`tournaments.status.${s}`) : t('common.all')}
          </button>
        ))}
      </div>

      {editId && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('tournaments.status')}</label>
              <select value={form.status || ''} onChange={e => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border bg-white text-sm">
                <option value="">{t('common.no_change')}</option>
                {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{t(`tournaments.status.${s}`)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('tournaments.name')}</label>
              <input value={form.name || ''} onChange={e => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border bg-white text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => updateMutation.mutate({ id: editId, ...form })}
              className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">{t('common.update')}</button>
            <button onClick={() => setEditId(null)} className="px-3 py-1.5 border rounded-[var(--radius-md)] text-xs">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {isLoading ? <SkeletonRow count={5} /> : (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-[var(--color-text-muted)]">
                <th className="text-left px-3 py-2">{t('tournaments.name')}</th>
                <th className="text-left px-3 py-2">{t('tournaments.organisation')}</th>
                <th className="text-left px-3 py-2">{t('tournaments.sport')}</th>
                <th className="text-left px-3 py-2">{t('tournaments.status')}</th>
                <th className="text-left px-3 py-2">{t('tournaments.start_date')}</th>
                <th className="text-right px-3 py-2">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.length === 0 && (
                <tr><td colSpan={6} className="text-center py-4 text-xs text-[var(--color-text-muted)]">{t('common.no_results')}</td></tr>
              )}
              {tournaments.map((t: any) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-[var(--color-bg)]/30 text-[var(--color-text)]">
                  <td className="px-3 py-2 font-medium">{t.name}</td>
                  <td className="px-3 py-2 text-xs">{t.organisation_name || '-'}</td>
                  <td className="px-3 py-2 text-xs">{t.sport_name || '-'}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[t.status] || ''}`}>
                      {t(`tournaments.status.${t.status}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{t.start_date?.slice(0, 10) || '-'}</td>
                  <td className="px-3 py-2 text-right">
                    <Can permission="tournaments.edit">
                      <button onClick={() => { setEditId(t.id); setForm({ name: t.name, status: t.status }); }}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)] mr-1">
                        {t('common.edit')}
                      </button>
                    </Can>
                    <Can permission="tournaments.delete">
                      <button onClick={() => { if (window.confirm(t('tournaments.confirm_archive'))) archiveMutation.mutate(t.id); }}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-red-200 text-red-600 hover:bg-red-50">
                        {t('common.archive')}
                      </button>
                    </Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination total={total} page={page} pageSize={limit} onPageChange={setPage} />
    </div>
  );
}
