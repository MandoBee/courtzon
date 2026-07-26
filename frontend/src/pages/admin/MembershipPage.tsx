import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui';
import { Can } from '../../permissions/Can';
import { SkeletonRow } from '../../components/ui/Skeleton';

type Tab = 'plans' | 'assignments';

export default function MembershipPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('plans');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('membership.title')}</h1>
      <div className="flex gap-2 border-b border-[var(--color-border)] pb-2">
        {(['plans', 'assignments'] as Tab[]).map(tid => (
          <button key={tid} onClick={() => setTab(tid)} className={`px-4 py-2 text-sm font-medium rounded-t-lg ${tab === tid ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)]'}`}>{t(`membership.tab.${tid}`)}</button>
        ))}
      </div>
      {tab === 'plans' && <PlansPanel />}
      {tab === 'assignments' && <AssignmentsPanel />}
    </div>
  );
}

function PlansPanel() {
  const { t } = useTranslation(); const { showToast } = useToast(); const qc = useQueryClient();
  const [search, setSearch] = useState(''); const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const { data, isLoading } = useQuery({ queryKey: ['membership-plans', search], queryFn: () => api.get('/admin/membership/plans', { params: { q: search || undefined } }).then(r => r.data) });
  const createMut = useMutation({ mutationFn: (d: any) => api.post('/admin/membership/plans', d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['membership-plans'] }); setShowForm(false); showToast(t('membership.plan_created')); }, onError: (e: any) => showToast(e?.response?.data?.message || 'Error', 'error') });
  const updateMut = useMutation({ mutationFn: (d: any) => api.put(`/admin/membership/plans/${d.id}`, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['membership-plans'] }); setShowForm(false); setEditing(null); showToast(t('membership.plan_updated')); }, onError: (e: any) => showToast(e?.response?.data?.message || 'Error', 'error') });
  const plans = data?.data || [];
  if (isLoading) return <SkeletonRow count={5} />;
  return (
    <div className="space-y-4">
      <div className="flex justify-between"><input placeholder={t('membership.search_plans')} value={search} onChange={e => setSearch(e.target.value)} className="px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl w-64" />
        <Can permission="membership.create"><button onClick={() => { setEditing(null); setShowForm(true); }} className="px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-xl">{t('membership.create_plan')}</button></Can>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((p: any) => (
          <div key={p.id} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
            <div className="flex items-center justify-between"><span className="text-lg">{p.name}</span><span className={`px-2 py-0.5 text-xs rounded-full ${p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{p.status}</span></div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{p.code}</p>
            <p className="text-xl font-bold mt-2">{Number(p.price).toFixed(2)} {p.currency}</p>
            <p className="text-xs text-[var(--color-text-muted)]">{p.duration_value} {p.duration_type}</p>
            <Can permission="membership.update"><button onClick={() => { setEditing(p); setShowForm(true); }} className="mt-3 text-xs text-[var(--color-primary)] hover:underline">{t('common.edit')}</button></Can>
          </div>
        ))}
      </div>
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? t('membership.edit_plan') : t('membership.create_plan')}>
        <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget); const d = { code: fd.get('code'), name: fd.get('name'), description: fd.get('description'), plan_type: fd.get('plan_type'), duration_days: Number(fd.get('duration_days')), price: Number(fd.get('price')), currency: fd.get('currency'), status: fd.get('status'), is_public: fd.get('is_public') === 'on' }; if (editing) updateMut.mutate({ id: editing.id, ...d }); else createMut.mutate(d); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium">{t('membership.code')}</label><input name="code" defaultValue={editing?.code || ''} required className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl" /></div>
          <div><label className="text-xs font-medium">{t('membership.name')}</label><input name="name" defaultValue={editing?.name || ''} required className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl" /></div></div>
          <div><label className="text-xs font-medium">{t('membership.description')}</label><textarea name="description" defaultValue={editing?.description || ''} className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl" /></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium">{t('membership.plan_type')}</label><select name="plan_type" defaultValue={editing?.plan_type || 'monthly'} className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl"><option value="monthly">Monthly</option><option value="annual">Annual</option></select></div>
          <div><label className="text-xs font-medium">{t('membership.duration_days')}</label><input name="duration_days" type="number" defaultValue={editing?.duration_days || 30} className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl" /></div></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium">{t('membership.price')}</label><input name="price" type="number" step="0.01" defaultValue={editing?.price || 0} className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl" /></div>
          <div><label className="text-xs font-medium">{t('membership.currency')}</label><input name="currency" defaultValue={editing?.currency || 'EGP'} className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl" /></div></div>
          <div className="flex items-center gap-4"><label className="flex items-center gap-1 text-sm"><input type="checkbox" name="is_public" defaultChecked={editing?.is_public ?? true} className="rounded" /> {t('membership.is_public')}</label></div>
          <div className="flex justify-end gap-2 pt-2 border-t"><button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-[var(--color-border)] rounded-xl">{t('common.cancel')}</button>
          <button type="submit" className="px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-xl">{editing ? t('common.update') : t('common.create')}</button></div>
        </form>
      </Modal>
    </div>
  );
}

function AssignmentsPanel() {
  const { t } = useTranslation(); const { showToast } = useToast(); const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['membership-assignments'], queryFn: () => api.get('/admin/membership/assignments').then(r => r.data) });
  const { data: plans } = useQuery({ queryKey: ['membership-plans-dropdown'], queryFn: () => api.get('/admin/membership/plans', { params: { limit: 100 } }).then(r => r.data?.data || []) });
  const [assigning, setAssigning] = useState(false);
  const assignMut = useMutation({
    mutationFn: (d: any) => api.post('/admin/membership/assign', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['membership-assignments'] }); setAssigning(false); showToast(t('membership.assigned')); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Error', 'error'),
  });
  if (isLoading) return <SkeletonRow count={5} />;
  const assignments = data?.data || [];
  return (
    <div className="space-y-4">
      <Can permission="membership.assign"><button onClick={() => setAssigning(true)} className="px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-xl">{t('membership.assign')}</button></Can>
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
        <table className="w-full text-sm"><thead><tr className="border-b bg-[var(--color-bg)]"><th className="px-4 py-3 text-left text-[var(--color-text-muted)]">User ID</th><th className="px-4 py-3 text-left text-[var(--color-text-muted)]">Plan</th><th className="px-4 py-3 text-left text-[var(--color-text-muted)]">Status</th><th className="px-4 py-3 text-left text-[var(--color-text-muted)]">Start</th><th className="px-4 py-3 text-left text-[var(--color-text-muted)]">End</th><th className="px-4 py-3 text-center text-[var(--color-text-muted)]">{t('common.actions')}</th></tr></thead>
          <tbody>{assignments.map((a: any) => (
            <tr key={a.id} className="border-b last:border-0 hover:bg-[var(--color-bg)]">
              <td className="px-4 py-3">{a.user_id}</td><td className="px-4 py-3">{a.membership_plan_id}</td>
              <td className="px-4 py-3"><span className={`px-2 py-0.5 text-xs rounded-full ${a.status === 'active' ? 'bg-green-100 text-green-700' : a.status === 'frozen' ? 'bg-blue-100 text-blue-700' : a.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{a.status}</span></td>
              <td className="px-4 py-3">{a.start_date}</td><td className="px-4 py-3">{a.end_date || '-'}</td>
              <td className="px-4 py-3 text-center"><ManageActions membership={a} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Modal open={assigning} onClose={() => setAssigning(false)} title={t('membership.assign')}>
        <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget); assignMut.mutate({ user_id: Number(fd.get('user_id')), membership_plan_id: Number(fd.get('membership_plan_id')), start_date: fd.get('start_date'), renewal_type: fd.get('renewal_type') || 'manual' }); }} className="space-y-3">
          <div><label className="text-xs font-medium">User ID</label><input name="user_id" type="number" required className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl" /></div>
          <div><label className="text-xs font-medium">{t('membership.plan')}</label><select name="membership_plan_id" required className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl"><option value="">{t('membership.select_plan')}</option>{(plans || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label className="text-xs font-medium">Start Date</label><input name="start_date" type="date" defaultValue={new Date().toISOString().split('T')[0]} className="w-full px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl" /></div>
          <div className="flex justify-end gap-2 pt-2 border-t"><button type="button" onClick={() => setAssigning(false)} className="px-4 py-2 text-sm border border-[var(--color-border)] rounded-xl">{t('common.cancel')}</button>
          <button type="submit" className="px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-xl">{t('membership.assign')}</button></div>
        </form>
      </Modal>
    </div>
  );
}

function ManageActions({ membership }: { membership: any }) {
  const { showToast } = useToast(); const qc = useQueryClient();
  const action = (url: string, msg: string) => { api.post(url).then(() => { qc.invalidateQueries({ queryKey: ['membership-assignments'] }); showToast(msg); }).catch((e: any) => showToast(e?.response?.data?.message || 'Error', 'error')); };
  return (
    <div className="flex gap-1 justify-center">
      {membership.status === 'active' && <button onClick={() => action(`/admin/membership/${membership.id}/freeze`, 'Frozen')} className="text-xs text-blue-600 hover:underline">Freeze</button>}
      {membership.status === 'frozen' && <button onClick={() => action(`/admin/membership/${membership.id}/resume`, 'Resumed')} className="text-xs text-green-600 hover:underline">Resume</button>}
      {membership.status !== 'cancelled' && membership.status !== 'expired' && <button onClick={() => action(`/admin/membership/${membership.id}/cancel`, 'Cancelled')} className="text-xs text-red-600 hover:underline">Cancel</button>}
    </div>
  );
}
