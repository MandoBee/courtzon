import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { academyApi, academyCapacityApi } from '../../../services/academy';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { useTranslation } from '../../../i18n';
import { getErrorMessage } from '../../../utils/errors';
import { Pagination } from '../../../components/ui/Pagination';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { Modal } from '../../../components/ui/Modal';

const ENROLLMENT_BADGES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-green-100 text-green-700',
  waiting: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-teal-100 text-teal-700',
};

export default function AcademyEnrollmentsPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [programFilter, setProgramFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [moveId, setMoveId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({ player_id: '', program_id: '', group_id: '' });
  const [replaceTarget, setReplaceTarget] = useState<{ id: number; name: string | null } | null>(null);
  const [replaceReason, setReplaceReason] = useState('');

  const queryParams: Record<string, any> = { page, limit: 20 };
  if (statusFilter !== 'all') queryParams.status = statusFilter;
  if (programFilter) queryParams.program_id = Number(programFilter);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'academy', 'enrollments', queryParams],
    queryFn: () => academyApi.getEnrollments(queryParams),
  });

  const { data: programs } = useQuery({
    queryKey: ['admin', 'academy', 'programs', { limit: 200 }],
    queryFn: () => academyApi.getPrograms({ limit: 200 }),
  });

  const { data: groups } = useQuery({
    queryKey: ['admin', 'academy', 'groups', { limit: 200 }],
    queryFn: () => academyApi.getGroups({ limit: 200 }),
  });

  const createMutation = useMutation({
    mutationFn: academyApi.createEnrollment,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'academy', 'enrollments'] }); setShowForm(false); showToast(t('admin.academy.enrollment_created')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => academyApi.cancelEnrollment(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'academy', 'enrollments'] }); showToast(t('admin.academy.enrollment_cancelled')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: number) => academyApi.confirmEnrollment(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'academy', 'enrollments'] }); showToast(t('admin.academy.enrollment_confirmed')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const completeMutation = useMutation({
    mutationFn: (id: number) => academyApi.completeEnrollment(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'academy', 'enrollments'] }); showToast(t('admin.academy.enrollment_completed')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, groupId }: { id: number; groupId: number }) => academyApi.moveEnrollment(id, groupId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'academy', 'enrollments'] }); setMoveId(null); showToast(t('admin.academy.enrollment_moved')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const promoteMutation = useMutation({
    mutationFn: (id: number) => academyCapacityApi.promote(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'academy', 'enrollments'] }); showToast(t('admin.academy.waitlist_promoted')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const replaceMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => academyCapacityApi.replace(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'academy', 'enrollments'] });
      setReplaceTarget(null); setReplaceReason('');
      showToast(t('admin.academy.waitlist_replaced'));
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const { data: capacityStatus } = useQuery({
    queryKey: ['admin', 'academy', 'capacity', programFilter],
    queryFn: () => academyCapacityApi.getStatus(Number(programFilter)),
    enabled: !!programFilter,
    retry: false,
  });

  function handleSubmit() {
    createMutation.mutate({
      player_id: Number(form.player_id),
      program_id: Number(form.program_id),
      group_id: form.group_id ? Number(form.group_id) : undefined,
    });
  }

  const enrollments = data?.data ?? [];
  // Waitlist rows first, ordered by waiting_order (FIFO); others by recency.
  const ordered = [...enrollments].sort((a, b) => {
    const aW = a.status === 'waiting' && a.waiting_order != null;
    const bW = b.status === 'waiting' && b.waiting_order != null;
    if (aW && bW) return Number(a.waiting_order) - Number(b.waiting_order);
    if (aW) return -1;
    if (bW) return 1;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[var(--color-text)]">{t('admin.academy.enrollments')}</h1>
        <Can permission="academy.enroll">
          <button onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">
            {showForm ? t('common.cancel') : `+ ${t('admin.academy.enroll_player')}`}
          </button>
        </Can>
      </div>

      {showForm && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.player_id')}</label>
              <input type="number" value={form.player_id} onChange={e => setForm((f: any) => ({ ...f, player_id: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.program')}</label>
              <select value={form.program_id} onChange={e => setForm((f: any) => ({ ...f, program_id: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white">
                <option value="">{t('common.select')}</option>
                {programs?.data?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.group')}</label>
              <select value={form.group_id} onChange={e => setForm((f: any) => ({ ...f, group_id: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white">
                <option value="">{t('common.none')}</option>
                {groups?.data?.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
          <button onClick={handleSubmit} disabled={!form.player_id || !form.program_id || createMutation.isPending}
            className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">
            {t('admin.academy.enroll')}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-[var(--color-surface)]">
          <option value="all">{t('admin.academy.all_statuses')}</option>
          {Object.keys(ENROLLMENT_BADGES).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={programFilter} onChange={e => { setProgramFilter(e.target.value); setPage(1); }}
          className="px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-[var(--color-surface)]">
          <option value="">{t('admin.academy.all_programs')}</option>
          {programs?.data?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {capacityStatus && (
          <span className="px-2 py-1 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
            {t('admin.academy.capacity_confirmed')} {capacityStatus.confirmedCount}/{capacityStatus.effectiveCapacity === 0 ? '∞' : capacityStatus.effectiveCapacity}
            {capacityStatus.override.active && <span className="ml-1">+{capacityStatus.override.amount}</span>}
          </span>
        )}
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border overflow-x-auto">
        {isLoading ? <SkeletonRow count={5} /> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-[var(--color-text-muted)]">
                <th className="text-left px-3 py-2">{t('admin.academy.player')}</th>
                <th className="text-left px-3 py-2">{t('admin.academy.program')}</th>
                <th className="text-left px-3 py-2">{t('admin.academy.group')}</th>
                <th className="text-center px-3 py-2">{t('admin.academy.status')}</th>
                <th className="text-center px-3 py-2">{t('admin.academy.waiting_order')}</th>
                <th className="text-right px-3 py-2">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((e: any) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-[var(--color-bg)]">
                  <td className="px-3 py-2">
                    <span className="font-medium">{e.player_name || `#${e.player_id}`}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">{e.program_name || '-'}</td>
                  <td className="px-3 py-2 text-xs">
                    {e.group_name || '-'}
                    <Can permission="academy.manage">
                      <button onClick={() => setMoveId(moveId === e.id ? null : e.id)}
                        className="ml-1 text-[10px] text-blue-600 hover:underline">{t('common.edit')}</button>
                    </Can>
                    {moveId === e.id && (
                      <div className="inline-flex ml-1 gap-1">
                        <select className="w-24 px-1 py-0.5 text-[10px] border rounded"
                          onChange={e2 => moveMutation.mutate({ id: e.id, groupId: Number(e2.target.value) })}>
                          <option value="">{t('common.select')}</option>
                          {groups?.data?.filter((g: any) => g.program_id === e.program_id).map((g: any) => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ENROLLMENT_BADGES[e.status] || ''}`}>{e.status}</span>
                  </td>
                  <td className="px-3 py-2 text-center text-xs">{e.waiting_order ?? '-'}</td>
                  <td className="px-3 py-2 text-right space-x-1">
                    {e.status === 'pending' && (
                      <Can permission="academy.enroll">
                        <button onClick={() => confirmMutation.mutate(e.id)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 hover:opacity-80">{t('admin.academy.confirm')}</button>
                      </Can>
                    )}
                    {e.status === 'waiting' && (
                      <>
                        <Can permission="academy.waitlist.promote">
                          <button onClick={() => promoteMutation.mutate(e.id)} disabled={promoteMutation.isPending}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 hover:opacity-80">{t('admin.academy.waitlist_promote')}</button>
                        </Can>
                        <Can permission="academy.waitlist.replace">
                          <button onClick={() => { setReplaceTarget({ id: e.id, name: e.player_name ?? null }); setReplaceReason(''); }}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 hover:opacity-80">{t('admin.academy.waitlist_replace')}</button>
                        </Can>
                      </>
                    )}
                    {(e.status === 'confirmed' || e.status === 'waiting') && (
                      <>
                        <Can permission="academy.enroll">
                          <button onClick={() => completeMutation.mutate(e.id)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 hover:opacity-80">{t('admin.academy.complete')}</button>
                        </Can>
                        <Can permission="academy.enroll">
                          <button onClick={() => cancelMutation.mutate(e.id)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 hover:opacity-80">{t('admin.academy.cancel')}</button>
                        </Can>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {enrollments.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-xs text-[var(--color-text-muted)]">{t('admin.academy.no_enrollments')}</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {total > 20 && (
        <Pagination total={total} page={page} pageSize={20} onPageChange={setPage} onPageSizeChange={() => {}} />
      )}

      <Modal
        open={replaceTarget !== null}
        onClose={() => { setReplaceTarget(null); setReplaceReason(''); }}
        title={t('admin.academy.waitlist_replace')}
        size="sm"
        footer={
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => { setReplaceTarget(null); setReplaceReason(''); }} className="px-3 py-1.5 border rounded-[var(--radius-md)] text-xs">{t('common.cancel')}</button>
            <button
              onClick={() => replaceTarget && replaceMutation.mutate({ id: replaceTarget.id, reason: replaceReason.trim() })}
              disabled={!replaceReason.trim() || replaceMutation.isPending}
              className="px-3 py-1.5 bg-purple-600 text-white rounded-[var(--radius-md)] text-xs font-medium disabled:opacity-50">
              {t('admin.academy.waitlist_replace')}
            </button>
          </div>
        }
      >
        {replaceTarget && (
          <div className="space-y-2">
            <p className="text-xs text-[var(--color-text-muted)]">
              {replaceTarget.name ? `${t('admin.academy.player')}: ${replaceTarget.name}` : `#${replaceTarget.id}`}
            </p>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.waitlist_replace_reason')}</label>
            <input value={replaceReason} onChange={(e) => setReplaceReason(e.target.value)}
              className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
          </div>
        )}
      </Modal>
    </div>
  );
}
