import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { getErrorMessage } from '../../../utils/errors';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { Pagination } from '../../../components/ui/Pagination';
import { leagueApi } from '../../../services/league';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  registration_open: 'bg-green-100 text-green-700',
  registration_closed: 'bg-amber-100 text-amber-700',
  running: 'bg-purple-100 text-purple-700',
  completed: 'bg-teal-100 text-teal-700',
  cancelled: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-500',
};

const STATUS_ACTIONS: Record<string, { permission: string; labelKey: string; action: string }[]> = {
  draft: [{ permission: 'leagues.edit', labelKey: 'admin.league.action.publish', action: 'publishLeague' }],
  published: [
    { permission: 'leagues.edit', labelKey: 'admin.league.action.open_reg', action: 'openRegistration' },
    { permission: 'leagues.edit', labelKey: 'admin.league.action.cancel', action: 'cancelLeague' },
  ],
  registration_open: [
    { permission: 'leagues.edit', labelKey: 'admin.league.action.close_reg', action: 'closeRegistration' },
    { permission: 'leagues.edit', labelKey: 'admin.league.action.cancel', action: 'cancelLeague' },
  ],
  registration_closed: [
    { permission: 'leagues.edit', labelKey: 'admin.league.action.start', action: 'startLeague' },
    { permission: 'leagues.edit', labelKey: 'admin.league.action.cancel', action: 'cancelLeague' },
  ],
  running: [
    { permission: 'leagues.edit', labelKey: 'admin.league.action.complete', action: 'completeLeague' },
    { permission: 'leagues.edit', labelKey: 'admin.league.action.cancel', action: 'cancelLeague' },
  ],
  completed: [{ permission: 'leagues.edit', labelKey: 'admin.league.action.archive', action: 'archiveLeague' }],
  cancelled: [{ permission: 'leagues.edit', labelKey: 'admin.league.action.archive', action: 'archiveLeague' }],
};

export default function LeagueListPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ name?: string; status?: string }>({});

  const params: Record<string, any> = { page, limit };
  if (search) params.search = search;
  if (statusFilter) params.status = statusFilter;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-leagues', params],
    queryFn: () => leagueApi.getLeagues(params),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: { id: number; name?: string; status?: string }) => leagueApi.updateLeague(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-leagues'] }); setEditId(null); showToast(t('admin.league.updated')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) => {
      const fn = (leagueApi as any)[action];
      return fn(id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-leagues'] }); showToast(t('admin.league.status_updated')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const leagues = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <Can permission="admin-leagues.view">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('admin.league.title')}</h1>
          <Can permission="leagues.create">
            <button onClick={() => navigate('/admin/leagues/new')}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
              {t('admin.league.new')}
            </button>
          </Can>
        </div>

        <div className="flex flex-wrap gap-3">
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t('admin.league.search_placeholder')}
            className="px-3 py-2 border rounded-[var(--radius-md)] text-sm bg-[var(--color-surface)] min-w-[200px]" />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border rounded-[var(--radius-md)] text-sm bg-[var(--color-surface)]">
            <option value="">{t('common.all_statuses')}</option>
            {Object.keys(STATUS_COLORS).map((s) => (
              <option key={s} value={s}>{t(`admin.league.status.${s}`)}</option>
            ))}
          </select>
        </div>

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                <th className="text-left px-4 py-3">{t('admin.league.code')}</th>
                <th className="text-left px-4 py-3">{t('admin.league.name')}</th>
                <th className="text-left px-4 py-3">{t('admin.league.season')}</th>
                <th className="text-left px-4 py-3">{t('admin.league.format')}</th>
                <th className="text-center px-4 py-3">{t('admin.league.divisions')}</th>
                <th className="text-left px-4 py-3">{t('admin.league.status')}</th>
                <th className="text-center px-4 py-3">{t('admin.league.max_teams')}</th>
                <th className="text-right px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8}><SkeletonRow count={5} /></td></tr>
              )}
              {!isLoading && leagues.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-sm text-[var(--color-text-muted)]">{t('common.no_results')}</td></tr>
              )}
              {leagues.map((l: any) => (
                <tr key={l.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)]/30">
                  <td className="px-4 py-3 font-mono text-xs">{l.code || '-'}</td>
                  <td className="px-4 py-3">
                    {editId === l.id ? (
                      <input value={editForm.name ?? l.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        className="w-full px-2 py-1 border rounded text-sm" />
                    ) : (
                      <button onClick={() => navigate(`/admin/leagues/${l.id}`)} className="font-medium text-[var(--color-primary)] hover:underline">
                        {l.name}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{l.season_name || '-'}</td>
                  <td className="px-4 py-3 text-xs">{l.format || '-'}</td>
                  <td className="px-4 py-3 text-center text-xs">{l.division_count ?? l.divisions?.length ?? '-'}</td>
                  <td className="px-4 py-3">
                    {editId === l.id ? (
                      <select value={editForm.status ?? l.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                        className="px-2 py-1 border rounded text-xs">
                        {Object.keys(STATUS_COLORS).map((s) => (
                          <option key={s} value={s}>{t(`admin.league.status.${s}`)}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[l.status] || ''}`}>
                        {t(`admin.league.status.${l.status}`)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-xs">{l.max_teams ?? '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      {(STATUS_ACTIONS[l.status] || []).map((a) => (
                        <Can key={a.action} permission={a.permission}>
                          <button onClick={() => statusMutation.mutate({ id: l.id, action: a.action })}
                            className="text-[10px] px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                            {t(a.labelKey)}
                          </button>
                        </Can>
                      ))}
                      <Can permission="leagues.edit">
                        <button onClick={() => { setEditId(l.id); setEditForm({ name: l.name, status: l.status }); }}
                          className="text-[10px] px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                          {t('common.edit')}
                        </button>
                      </Can>
                      <Can permission="leagues.delete">
                        <button onClick={() => { if (window.confirm(t('admin.league.confirm_archive'))) statusMutation.mutate({ id: l.id, action: 'archiveLeague' }); }}
                          className="text-[10px] px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50">
                          {t('admin.league.action.archive')}
                        </button>
                      </Can>
                      {editId === l.id && (
                        <>
                          <button onClick={() => updateMutation.mutate({ id: l.id, ...editForm })}
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
