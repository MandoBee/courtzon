import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { getErrorMessage } from '../../../utils/errors';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { Pagination } from '../../../components/ui/Pagination';
import { tournamentApi, orgTournamentApi } from '../../../services/tournament';

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

const STATUS_ACTIONS: Record<string, { permission: 'edit' | 'delete'; labelKey: string; action: string }[]> = {
  draft: [{ permission: 'edit', labelKey: 'tournaments.action.publish', action: 'publish' }],
  published: [
    { permission: 'edit', labelKey: 'tournaments.action.open_reg', action: 'openRegistration' },
    { permission: 'edit', labelKey: 'tournaments.action.cancel', action: 'cancel' },
  ],
  registration_open: [
    { permission: 'edit', labelKey: 'tournaments.action.close_reg', action: 'closeRegistration' },
    { permission: 'edit', labelKey: 'tournaments.action.cancel', action: 'cancel' },
  ],
  registration_closed: [
    { permission: 'edit', labelKey: 'tournaments.action.start', action: 'start' },
    { permission: 'edit', labelKey: 'tournaments.action.cancel', action: 'cancel' },
  ],
  running: [
    { permission: 'edit', labelKey: 'tournaments.action.complete', action: 'complete' },
    { permission: 'edit', labelKey: 'tournaments.action.cancel', action: 'cancel' },
  ],
  completed: [{ permission: 'edit', labelKey: 'tournaments.action.archive', action: 'archive' }],
  cancelled: [{ permission: 'edit', labelKey: 'tournaments.action.archive', action: 'archive' }],
};

export type TournamentListContextMode = 'admin' | 'org';

interface Props {
  mode?: TournamentListContextMode;
  orgId?: string;
}

/**
 * ONE SHARED tournament list screen. The same component renders in the Super
 * Admin workbench (`mode="admin"`, platform-wide endpoint) and the Org Admin
 * portal (`mode="org"` + `orgId`, tenant-scoped endpoint). Only the API,
 * permissions and navigation change; the business logic stays single-source.
 */
export default function TournamentListPage({ mode = 'admin', orgId }: Props) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const isOrg = mode === 'org';
  const basePath = isOrg ? `/org/${orgId}/tournaments` : '/admin/tournament/list';
  const queryKeyRoot = isOrg ? `org-${orgId}-tournaments` : 'admin-tournaments';

  const perms = isOrg
    ? { page: 'org.tournaments.view' as string, create: 'org.tournaments.create' as string, edit: 'org.tournaments.update' as string, delete: 'org.tournaments.delete' as string }
    : { page: 'admin-tournaments.view' as string, create: 'tournaments.create' as string, edit: 'tournaments.edit' as string, delete: 'tournaments.delete' as string };

  const api = (isOrg && orgId ? orgTournamentApi : tournamentApi) as any;
  const listTournaments = (p: Record<string, any>) =>
    isOrg && orgId ? api.getTournaments(orgId, p) : api.getTournaments(p);
  const updateTournament = (id: number, d: Record<string, any>) =>
    isOrg && orgId ? api.updateTournament(orgId, id, d) : api.updateTournament(id, d);
  const runAction = (action: string, id: number) =>
    isOrg && orgId ? api[action](orgId, id) : api[action](id);

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
    queryKey: [queryKeyRoot, params],
    queryFn: () => listTournaments(params),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: { id: number; name?: string; status?: string }) => updateTournament(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [queryKeyRoot] }); setEditId(null); showToast(t('tournaments.updated')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => runAction('archive', id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [queryKeyRoot] }); showToast(t('tournaments.archived')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) => runAction(action, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [queryKeyRoot] }); showToast(t('tournaments.status_updated')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const tournaments = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <Can permission={perms.page}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('tournaments.list.title')}</h1>
          <Can permission={perms.create}>
            <button onClick={() => navigate(`${basePath}/new`)}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
              {t('tournaments.new')}
            </button>
          </Can>
        </div>

        <div className="flex flex-wrap gap-3">
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t('tournaments.search')}
            className="px-3 py-2 border rounded-[var(--radius-md)] text-sm bg-[var(--color-surface)] min-w-[200px]" />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border rounded-[var(--radius-md)] text-sm bg-[var(--color-surface)]">
            <option value="">{t('common.all_statuses')}</option>
            {Object.keys(STATUS_COLORS).map((s) => (
              <option key={s} value={s}>{t(`tournaments.status.${s}`)}</option>
            ))}
          </select>
        </div>

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                <th className="text-left px-4 py-3">{t('tournaments.code')}</th>
                <th className="text-left px-4 py-3">{t('tournaments.name')}</th>
                <th className="text-left px-4 py-3">{t('tournaments.format')}</th>
                <th className="text-left px-4 py-3">{t('tournaments.category')}</th>
                <th className="text-left px-4 py-3">{t('tournaments.status')}</th>
                <th className="text-left px-4 py-3">{t('tournaments.max_players')}</th>
                <th className="text-left px-4 py-3">{t('tournaments.start_date')}</th>
                <th className="text-right px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8}><SkeletonRow count={5} /></td></tr>
              )}
              {!isLoading && tournaments.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-sm text-[var(--color-text-muted)]">{t('common.no_results')}</td></tr>
              )}
              {tournaments.map((tourn: any) => (
                <tr key={tourn.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)]/30">
                  <td className="px-4 py-3 font-mono text-xs">{tourn.code || '-'}</td>
                  <td className="px-4 py-3">
                    {editId === tourn.id ? (
                      <input value={editForm.name ?? tourn.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        className="w-full px-2 py-1 border rounded text-sm" />
                    ) : (
                      <button onClick={() => navigate(`${basePath}/${tourn.id}`)} className="font-medium text-[var(--color-primary)] hover:underline">
                        {tourn.name}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{tourn.format || '-'}</td>
                  <td className="px-4 py-3 text-xs">{tourn.category || '-'}</td>
                  <td className="px-4 py-3">
                    {editId === tourn.id ? (
                      <select value={editForm.status ?? tourn.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                        className="px-2 py-1 border rounded text-xs">
                        {Object.keys(STATUS_COLORS).map((s) => (
                          <option key={s} value={s}>{t(`tournaments.status.${s}`)}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[tourn.status] || ''}`}>
                        {t(`tournaments.status.${tourn.status}`)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{tourn.max_players ?? '-'}</td>
                  <td className="px-4 py-3 text-xs">{tourn.start_date ? tourn.start_date.slice(0, 10) : '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      {(STATUS_ACTIONS[tourn.status] || []).map((a) => (
                        <Can key={a.action} permission={a.permission === 'edit' ? perms.edit : perms.delete}>
                          <button onClick={() => statusMutation.mutate({ id: tourn.id, action: a.action })}
                            className="text-[10px] px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                            {t(a.labelKey)}
                          </button>
                        </Can>
                      ))}
                      <Can permission={perms.edit}>
                        <button onClick={() => { setEditId(tourn.id); setEditForm({ name: tourn.name, status: tourn.status }); }}
                          className="text-[10px] px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                          {t('common.edit')}
                        </button>
                      </Can>
                      <Can permission={perms.delete}>
                        <button onClick={() => { if (window.confirm(t('tournaments.confirm_archive'))) archiveMutation.mutate(tourn.id); }}
                          className="text-[10px] px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50">
                          {t('common.archive')}
                        </button>
                      </Can>
                      {editId === tourn.id && (
                        <>
                          <button onClick={() => updateMutation.mutate({ id: tourn.id, ...editForm })}
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