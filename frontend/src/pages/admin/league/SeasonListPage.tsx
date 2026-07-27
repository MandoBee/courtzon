import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { getErrorMessage } from '../../../utils/errors';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { Pagination } from '../../../components/ui/Pagination';
import { leagueApi } from '../../../services/league';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  published: 'bg-blue-100 text-blue-700',
  running: 'bg-purple-100 text-purple-700',
  completed: 'bg-teal-100 text-teal-700',
  archived: 'bg-gray-100 text-gray-500',
};

export default function SeasonListPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ name?: string; code?: string }>({});

  const params: Record<string, any> = { page, limit };
  if (search) params.search = search;
  if (statusFilter) params.status = statusFilter;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-seasons', params],
    queryFn: () => leagueApi.getSeasons(params),
  });

  const createMutation = useMutation({
    mutationFn: () => leagueApi.createSeason({ name: 'New Season', code: '' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-seasons'] }); showToast(t('admin.league.season.created')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: { id: number; name?: string; code?: string }) => leagueApi.updateSeason(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-seasons'] }); setEditId(null); showToast(t('admin.league.season.updated')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const publishMutation = useMutation({
    mutationFn: (id: number) => leagueApi.publishSeason(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-seasons'] }); showToast(t('admin.league.season.published')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => leagueApi.archiveSeason(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-seasons'] }); showToast(t('admin.league.season.archived')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const seasons = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <Can permission="admin-seasons.view">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('admin.league.season.title')}</h1>
          <Can permission="seasons.create">
            <button onClick={() => createMutation.mutate()}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
              {t('admin.league.season.new')}
            </button>
          </Can>
        </div>

        <div className="flex flex-wrap gap-3">
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t('admin.league.season.search_placeholder')}
            className="px-3 py-2 border rounded-[var(--radius-md)] text-sm bg-[var(--color-surface)] min-w-[200px]" />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border rounded-[var(--radius-md)] text-sm bg-[var(--color-surface)]">
            <option value="">{t('common.all_statuses')}</option>
            {Object.keys(STATUS_COLORS).map((s) => (
              <option key={s} value={s}>{t(`admin.league.season.status.${s}`)}</option>
            ))}
          </select>
        </div>

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                <th className="text-left px-4 py-3">{t('admin.league.season.code')}</th>
                <th className="text-left px-4 py-3">{t('admin.league.season.name')}</th>
                <th className="text-left px-4 py-3">{t('admin.league.season.sport')}</th>
                <th className="text-left px-4 py-3">{t('admin.league.season.start_date')}</th>
                <th className="text-left px-4 py-3">{t('admin.league.season.end_date')}</th>
                <th className="text-left px-4 py-3">{t('admin.league.season.status')}</th>
                <th className="text-right px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7}><SkeletonRow count={5} /></td></tr>
              )}
              {!isLoading && seasons.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-sm text-[var(--color-text-muted)]">{t('common.no_results')}</td></tr>
              )}
              {seasons.map((s: any) => (
                <tr key={s.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)]/30">
                  <td className="px-4 py-3 font-mono text-xs">{s.code || '-'}</td>
                  <td className="px-4 py-3">
                    {editId === s.id ? (
                      <input value={editForm.name ?? s.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        className="w-full px-2 py-1 border rounded text-sm" />
                    ) : (
                      <span className="font-medium">{s.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{s.sport_name || s.sport?.name || '-'}</td>
                  <td className="px-4 py-3 text-xs">{s.start_date ? s.start_date.slice(0, 10) : '-'}</td>
                  <td className="px-4 py-3 text-xs">{s.end_date ? s.end_date.slice(0, 10) : '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[s.status] || ''}`}>
                      {t(`admin.league.season.status.${s.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      {s.status === 'draft' && (
                        <Can permission="seasons.edit">
                          <button onClick={() => publishMutation.mutate(s.id)}
                            className="text-[10px] px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                            {t('admin.league.season.publish')}
                          </button>
                        </Can>
                      )}
                      {s.status === 'published' && (
                        <Can permission="seasons.edit">
                          <button onClick={() => { if (window.confirm(t('admin.league.season.confirm_archive'))) archiveMutation.mutate(s.id); }}
                            className="text-[10px] px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50">
                            {t('admin.league.season.archive')}
                          </button>
                        </Can>
                      )}
                      {s.status !== 'archived' && s.status !== 'completed' && (
                        <Can permission="seasons.edit">
                          <button onClick={() => { if (window.confirm(t('admin.league.season.confirm_archive'))) archiveMutation.mutate(s.id); }}
                            className="text-[10px] px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50">
                            {t('admin.league.season.archive')}
                          </button>
                        </Can>
                      )}
                      <Can permission="seasons.edit">
                        <button onClick={() => { setEditId(s.id); setEditForm({ name: s.name, code: s.code }); }}
                          className="text-[10px] px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                          {t('common.edit')}
                        </button>
                      </Can>
                      {editId === s.id && (
                        <>
                          <button onClick={() => updateMutation.mutate({ id: s.id, ...editForm })}
                            className="text-[10px] px-2 py-1 rounded bg-[var(--color-primary)] text-white">
                            {t('common.save')}
                          </button>
                          <button onClick={() => setEditId(null)} className="text-[10px] px-2 py-1 rounded border">
                            {t('common.cancel')}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination total={total} page={page} pageSize={limit} onPageChange={setPage} />
      </div>
    </Can>
  );
}
