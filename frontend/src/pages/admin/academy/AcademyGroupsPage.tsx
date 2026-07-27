import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { academyApi } from '../../../services/academy';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { useTranslation } from '../../../i18n';
import { getErrorMessage } from '../../../utils/errors';
import { Pagination } from '../../../components/ui/Pagination';
import { SkeletonRow } from '../../../components/ui/Skeleton';

export default function AcademyGroupsPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [programFilter, setProgramFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({ program_id: '', name: '', capacity: 0 });
  const [assignCoachId, setAssignCoachId] = useState<{ id: number; coachId: number | null } | null>(null);

  const queryParams: Record<string, any> = { page, limit: 20 };
  if (programFilter) queryParams.program_id = Number(programFilter);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'academy', 'groups', queryParams],
    queryFn: () => academyApi.getGroups(queryParams),
  });

  const { data: programs } = useQuery({
    queryKey: ['admin', 'academy', 'programs', { limit: 200 }],
    queryFn: () => academyApi.getPrograms({ limit: 200 }),
  });

  const createMutation = useMutation({
    mutationFn: academyApi.createGroup,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'academy', 'groups'] }); setShowForm(false); showToast(t('admin.academy.group_created')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: any) => academyApi.updateGroup(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'academy', 'groups'] }); setEditId(null); setShowForm(false); showToast(t('admin.academy.group_updated')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const assignCoachMutation = useMutation({
    mutationFn: ({ id, coachId }: { id: number; coachId: number | null }) => academyApi.assignCoach(id, coachId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'academy', 'groups'] }); setAssignCoachId(null); showToast(t('admin.academy.coach_assigned')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => academyApi.archiveGroup(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'academy', 'groups'] }); showToast(t('admin.academy.group_archived')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  function resetForm() { setForm({ program_id: '', name: '', capacity: 0 }); }

  function openEdit(g: any) {
    setEditId(g.id);
    setForm({ program_id: g.program_id, name: g.name, capacity: g.capacity });
    setShowForm(true);
  }

  function handleSubmit() {
    const data = { ...form, program_id: Number(form.program_id) };
    if (editId) updateMutation.mutate({ id: editId, ...data });
    else createMutation.mutate(data);
  }

  const groups = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[var(--color-text)]">{t('admin.academy.groups')}</h1>
        <Can permission="academy.create">
          <button onClick={() => { setEditId(null); resetForm(); setShowForm(!showForm); }}
            className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">
            {showForm ? t('common.cancel') : `+ ${t('admin.academy.new_group')}`}
          </button>
        </Can>
      </div>

      {showForm && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.program')}</label>
              <select value={form.program_id} onChange={e => setForm((f: any) => ({ ...f, program_id: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white">
                <option value="">{t('common.select')}</option>
                {programs?.data?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.name')}</label>
              <input value={form.name} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.capacity')}</label>
              <input type="number" value={form.capacity} onChange={e => setForm((f: any) => ({ ...f, capacity: Number(e.target.value) }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={!form.name || !form.program_id || createMutation.isPending}
              className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">
              {editId ? t('common.update') : t('common.create')}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null); resetForm(); }}
              className="px-3 py-1.5 border rounded-[var(--radius-md)] text-xs">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <select value={programFilter} onChange={e => { setProgramFilter(e.target.value); setPage(1); }}
          className="px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-[var(--color-surface)]">
          <option value="">{t('admin.academy.all_programs')}</option>
          {programs?.data?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border overflow-x-auto">
        {isLoading ? <SkeletonRow count={5} /> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-[var(--color-text-muted)]">
                <th className="text-left px-3 py-2">{t('admin.academy.name')}</th>
                <th className="text-left px-3 py-2">{t('admin.academy.program')}</th>
                <th className="text-left px-3 py-2">{t('admin.academy.coach')}</th>
                <th className="text-center px-3 py-2">{t('admin.academy.capacity')}</th>
                <th className="text-center px-3 py-2">{t('admin.academy.status')}</th>
                <th className="text-right px-3 py-2">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g: any) => (
                <tr key={g.id} className="border-b last:border-0 hover:bg-[var(--color-bg)]">
                  <td className="px-3 py-2 font-medium">{g.name}</td>
                  <td className="px-3 py-2 text-xs">{g.program_name || '-'}</td>
                  <td className="px-3 py-2 text-xs">{g.coach_name || '-'}
                    <Can permission="academy.manage">
                      <button onClick={() => setAssignCoachId(assignCoachId?.id === g.id ? null : { id: g.id, coachId: g.coach_id })}
                        className="ml-1 text-[10px] text-blue-600 hover:underline">{t('common.edit')}</button>
                    </Can>
                    {assignCoachId?.id === g.id && (
                      <div className="inline-flex ml-1 gap-1">
                        <input type="number" placeholder="Coach ID" className="w-16 px-1 py-0.5 text-[10px] border rounded"
                          defaultValue={assignCoachId!.coachId ?? ''}
                          onBlur={e => setAssignCoachId({ id: g.id, coachId: e.target.value ? Number(e.target.value) : null })} />
                        <button onClick={() => assignCoachMutation.mutate(assignCoachId!)}
                          className="text-[10px] px-1 py-0.5 bg-blue-100 text-blue-700 rounded">{t('common.save')}</button>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">{g.capacity}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${g.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{g.status}</span>
                  </td>
                  <td className="px-3 py-2 text-right space-x-1">
                    <Can permission="academy.update">
                      <button onClick={() => openEdit(g)} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-border)] hover:opacity-80">{t('common.edit')}</button>
                    </Can>
                    {g.status !== 'archived' && (
                      <Can permission="academy.delete">
                        <button onClick={() => archiveMutation.mutate(g.id)} className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 hover:opacity-80">{t('admin.academy.archive')}</button>
                      </Can>
                    )}
                  </td>
                </tr>
              ))}
              {groups.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-xs text-[var(--color-text-muted)]">{t('admin.academy.no_groups')}</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {total > 20 && (
        <Pagination total={total} page={page} pageSize={20} onPageChange={setPage} onPageSizeChange={() => {}} />
      )}
    </div>
  );
}
