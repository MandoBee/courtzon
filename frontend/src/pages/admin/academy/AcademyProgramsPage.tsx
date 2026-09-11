import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { academyApi } from '../../../services/academy';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { useTranslation } from '../../../i18n';
import { getErrorMessage } from '../../../utils/errors';
import { Pagination } from '../../../components/ui/Pagination';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import AcademyConfirmationModal from '../../../components/academy/AcademyConfirmationModal';
import AcademyCapacityModal from '../../../components/academy/AcademyCapacityModal';

const STATUS_BADGES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  published: 'bg-blue-100 text-blue-700',
  open: 'bg-green-100 text-green-700',
  full: 'bg-amber-100 text-amber-700',
  running: 'bg-purple-100 text-purple-700',
  completed: 'bg-teal-100 text-teal-700',
  cancelled: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-500',
};

const LIFECYCLE_BADGES: Record<string, string> = {
  setup: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-green-100 text-green-700',
};

const PRICE_TYPES = ['FREE', 'FIXED', 'MEMBERS_ONLY'];

export default function AcademyProgramsPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [confirmProgramId, setConfirmProgramId] = useState<number | null>(null);
  const [capacityProgramId, setCapacityProgramId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({
    code: '', name: '', description: '', category: '', level: '', season: '',
    capacity: 0, price: 0, currency: 'USD', price_type: 'FIXED', is_public: true,
    organisation_id: '', branch_id: '', sport_id: '',
  });

  const { data: orgs } = useQuery({
    queryKey: ['admin', 'organisations', { limit: 500 }],
    queryFn: () => api.get('/organisations').then((r) => r.data?.data ?? []),
  });
  const { data: branches } = useQuery({
    queryKey: ['admin', 'branches', form.organisation_id],
    queryFn: () => api.get(`/organisations/${form.organisation_id}/branches`).then((r) => r.data?.data ?? []),
    enabled: !!form.organisation_id,
  });
  const { data: sports } = useQuery({
    queryKey: ['admin', 'sports'],
    queryFn: () => api.get('/sports').then((r) => r.data?.data ?? []),
  });

  const queryParams: Record<string, any> = { page, limit: 20 };
  if (search) queryParams.search = search;
  if (statusFilter !== 'all') queryParams.status = statusFilter;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'academy', 'programs', queryParams],
    queryFn: () => academyApi.getPrograms(queryParams),
  });

  const createMutation = useMutation({
    mutationFn: academyApi.createProgram,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'academy', 'programs'] }); setShowForm(false); resetForm(); showToast(t('admin.academy.program_created')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: any) => academyApi.updateProgram(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'academy', 'programs'] }); setEditId(null); setShowForm(false); resetForm(); showToast(t('admin.academy.program_updated')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const publishMutation = useMutation({
    mutationFn: (id: number) => academyApi.publishProgram(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'academy', 'programs'] }); showToast(t('admin.academy.program_published')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => academyApi.archiveProgram(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'academy', 'programs'] }); showToast(t('admin.academy.program_archived')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  function resetForm() {
    setForm({ code: '', name: '', description: '', category: '', level: '', season: '', capacity: 0, price: 0, currency: 'USD', price_type: 'FIXED', is_public: true, organisation_id: '', branch_id: '', sport_id: '' });
  }

  function openEdit(p: any) {
    setEditId(p.id);
    setForm({ code: p.code, name: p.name, description: p.description || '', category: p.category, level: p.level || '', season: p.season || '', capacity: p.capacity, price: p.price, currency: p.currency, price_type: p.price_type, is_public: !!p.is_public, organisation_id: p.organisation_id ?? '', branch_id: p.branch_id ?? '', sport_id: p.sport_id ?? '' });
    setShowForm(true);
  }

  function handleSubmit() {
    const data = {
      ...form,
      organisation_id: form.organisation_id ? Number(form.organisation_id) : undefined,
      branch_id: form.branch_id ? Number(form.branch_id) : null,
      sport_id: form.sport_id ? Number(form.sport_id) : null,
    };
    if (!data.organisation_id) { showToast(t('admin.academy.organisation_required'), 'error'); return; }
    if (editId) updateMutation.mutate({ id: editId, ...data });
    else createMutation.mutate(data);
  }

  const programs = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[var(--color-text)]">{t('admin.academy.programs')}</h1>
        <Can permission="academy.create">
          <button onClick={() => { setEditId(null); resetForm(); setShowForm(!showForm); }}
            className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">
            {showForm ? t('common.cancel') : `+ ${t('admin.academy.new_program')}`}
          </button>
        </Can>
      </div>

      {showForm && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.code')}</label>
              <input value={form.code} onChange={e => setForm((f: any) => ({ ...f, code: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.name')}</label>
              <input value={form.name} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.category')}</label>
              <input value={form.category} onChange={e => setForm((f: any) => ({ ...f, category: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.level')}</label>
              <input value={form.level} onChange={e => setForm((f: any) => ({ ...f, level: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.season')}</label>
              <input value={form.season} onChange={e => setForm((f: any) => ({ ...f, season: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.organisation')} *</label>
              <select value={form.organisation_id} onChange={e => setForm((f: any) => ({ ...f, organisation_id: e.target.value, branch_id: '' }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white">
                <option value="">{t('common.select')}</option>
                {(orgs || []).map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.branch')}</label>
              <select value={form.branch_id} onChange={e => setForm((f: any) => ({ ...f, branch_id: e.target.value }))}
                disabled={!form.organisation_id}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white disabled:opacity-50">
                <option value="">{t('common.select')}</option>
                {(branches || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.sport')}</label>
              <select value={form.sport_id} onChange={e => setForm((f: any) => ({ ...f, sport_id: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white">
                <option value="">{t('common.select')}</option>
                {(sports || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.capacity')}</label>
              <input type="number" value={form.capacity} onChange={e => setForm((f: any) => ({ ...f, capacity: Number(e.target.value) }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.price')}</label>
              <input type="number" step="0.01" value={form.price} onChange={e => setForm((f: any) => ({ ...f, price: Number(e.target.value) }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.price_type')}</label>
              <select value={form.price_type} onChange={e => setForm((f: any) => ({ ...f, price_type: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white">
                {PRICE_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.currency')}</label>
              <input value={form.currency} maxLength={3} onChange={e => setForm((f: any) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={form.is_public} onChange={e => setForm((f: any) => ({ ...f, is_public: e.target.checked }))} />
                {t('admin.academy.is_public')}
              </label>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.description')}</label>
              <textarea value={form.description} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))} rows={2}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={!form.code || !form.name || createMutation.isPending}
              className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">
              {editId ? t('common.update') : t('common.create')}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null); resetForm(); }}
              className="px-3 py-1.5 border rounded-[var(--radius-md)] text-xs">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder={t('admin.academy.search_placeholder')}
          className="flex-1 min-w-[150px] max-w-xs px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-[var(--color-surface)]" />
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-[var(--color-surface)]">
          <option value="all">{t('admin.academy.all_statuses')}</option>
          {Object.keys(STATUS_BADGES).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border overflow-x-auto">
        {isLoading ? <SkeletonRow count={5} /> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-[var(--color-text-muted)]">
                <th className="text-left px-3 py-2">{t('admin.academy.code')}</th>
                <th className="text-left px-3 py-2">{t('admin.academy.name')}</th>
                <th className="text-left px-3 py-2">{t('admin.academy.organisation')}</th>
                <th className="text-center px-3 py-2">{t('admin.academy.lifecycle')}</th>
                <th className="text-center px-3 py-2">{t('admin.academy.capacity')}</th>
                <th className="text-center px-3 py-2">{t('admin.academy.status')}</th>
                <th className="text-right px-3 py-2">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((p: any) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-[var(--color-bg)]">
                  <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2 text-xs">
                    <div>{p.organisation_name || p.organisation_id || '-'}</div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">
                      {[p.branch_name, p.sport_name].filter(Boolean).join(' · ') || '-'}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${LIFECYCLE_BADGES[p.lifecycle_state || 'setup'] || ''}`}>{t(`admin.academy.lifecycle_${p.lifecycle_state || 'setup'}`)}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {p.capacity === 0 ? t('admin.academy.capacity_unlimited') : p.capacity}
                    <Can permission="academy.view">
                      <button onClick={() => setCapacityProgramId(p.id)} className="ml-1 text-[10px] text-blue-600 hover:underline">{t('admin.academy.capacity_title')}</button>
                    </Can>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_BADGES[p.status] || ''}`}>{p.status}</span>
                  </td>
                  <td className="px-3 py-2 text-right space-x-1">
                    <Can permission="academy.update">
                      <button onClick={() => openEdit(p)} disabled={p.lifecycle_state === 'confirmed'} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-border)] hover:opacity-80 disabled:opacity-40">{t('common.edit')}</button>
                    </Can>
                    <Can permission="academy.capacity.override">
                      <button onClick={() => setCapacityProgramId(p.id)} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 hover:opacity-80">{t('admin.academy.capacity_override_button')}</button>
                    </Can>
                    {p.lifecycle_state === 'setup' && (
                      <Can permission="academy.manage">
                        <button onClick={() => setConfirmProgramId(p.id)} className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 hover:opacity-80">{t('admin.academy.confirm')}</button>
                      </Can>
                    )}
                    {p.status === 'draft' && (
                      <Can permission="academy.publish">
                        <button onClick={() => publishMutation.mutate(p.id)} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 hover:opacity-80">{t('admin.academy.publish')}</button>
                      </Can>
                    )}
                    {p.status !== 'archived' && p.status !== 'completed' && p.status !== 'cancelled' && (
                      <Can permission="academy.delete">
                        <button onClick={() => archiveMutation.mutate(p.id)} className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 hover:opacity-80">{t('admin.academy.archive')}</button>
                      </Can>
                    )}
                  </td>
                </tr>
              ))}
              {programs.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-xs text-[var(--color-text-muted)]">{t('admin.academy.no_programs')}</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {total > 20 && (
        <Pagination total={total} page={page} pageSize={20} onPageChange={setPage} onPageSizeChange={() => {}} />
      )}

      <AcademyConfirmationModal
        programId={confirmProgramId ?? 0}
        open={confirmProgramId !== null}
        onClose={() => setConfirmProgramId(null)}
      />
      <AcademyCapacityModal
        programId={capacityProgramId ?? 0}
        open={capacityProgramId !== null}
        onClose={() => setCapacityProgramId(null)}
      />
    </div>
  );
}
