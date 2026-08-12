import { useState, useEffect } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Modal, Spinner } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

interface TaxRate {
  id: number; name: string; rate: number;
  type: 'percentage' | 'fixed';
  tax_category: 'sales' | 'vat' | 'gst' | 'withholding' | 'other';
  organisation_id: number | null; is_global: number; is_active: boolean;
}

const CAT_LABELS: Record<string, string> = { sales:'Sales Tax', vat:'VAT', gst:'GST', withholding:'Withholding', other:'Other' };
const TYPE_LABELS: Record<string, string> = { percentage:'%', fixed:'Fixed' };

export default function TaxRatesPage() {
  const qc = useQueryClient(); const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false); const [editing, setEditing] = useState<TaxRate | null>(null);
  const [form, setForm] = useState({ name: '', rate: 0, type: 'percentage' as string, tax_category: 'vat' as string, organisation_id: '' as string });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [orgs, setOrgs] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => { api.get('/organisations?limit=200').then(r => { const d = r.data?.data ?? r.data ?? []; if (Array.isArray(d)) setOrgs(d.map((o: any) => ({ id: o.id, name: o.name ?? o.organisationName ?? '' }))); }).catch(() => {}); }, []);

  const { data, isLoading } = useQuery({ queryKey: ['accounting','tax-rates'], queryFn: () => api.get('/admin/accounting/tax-rates').then(r => r.data.data || r.data) });
  const taxRates: TaxRate[] = data || [];

  const createMut = useMutation({ mutationFn: (p: any) => api.post('/admin/accounting/tax-rates', { ...p, organisationId: p.organisation_id || null }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounting','tax-rates'] }); resetForm(); showToast('Tax rate created!'); }, onError: (e: any) => showToast(getErrorMessage(e), 'error') });
  const updateMut = useMutation({ mutationFn: ({ id, p }: any) => api.put(`/admin/accounting/tax-rates/${id}`, p), onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounting','tax-rates'] }); resetForm(); showToast('Updated!'); }, onError: (e: any) => showToast(getErrorMessage(e), 'error') });
  const deactivateMut = useMutation({ mutationFn: (id: number) => api.put(`/admin/accounting/tax-rates/${id}`, { is_active: false }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounting','tax-rates'] }); setDeleteId(null); showToast('Deactivated!'); }, onError: (e: any) => showToast(getErrorMessage(e), 'error') });

  const resetForm = () => { setShowForm(false); setEditing(null); setForm({ name: '', rate: 0, type: 'percentage', tax_category: 'vat', organisation_id: '' }); };
  const openEdit = (t: TaxRate) => { setEditing(t); setForm({ name: t.name, rate: t.rate, type: t.type, tax_category: t.tax_category, organisation_id: t.organisation_id ? String(t.organisation_id) : '' }); setShowForm(true); };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!form.name) return; const p = { name: form.name, rate: Number(form.rate), type: form.type, taxCategory: form.tax_category, isGlobal: !form.organisation_id, organisationId: form.organisation_id || undefined }; if (editing) updateMut.mutate({ id: editing.id, p }); else createMut.mutate(p); };

  if (isLoading) return <Spinner />;

  return (<Can permission="accounting.tax.view"><div>
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Tax Rates</h1>
      <Can permission="accounting.tax.manage"><Button onClick={() => { resetForm(); setShowForm(true); }}>+ New Tax Rate</Button></Can>
    </div>

    {showForm && (<form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
      <h3 className="font-semibold text-[var(--color-text)] mb-4">{editing ? 'Edit' : 'New'} Tax Rate</h3>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div><label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label><input value={form.name} onChange={e => setForm({...form, name:e.target.value})} required className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" /></div>
        <div><label className="block text-xs text-[var(--color-text-muted)] mb-1">Rate (%)</label><input type="number" step="0.01" value={form.rate} onChange={e => setForm({...form, rate: parseFloat(e.target.value) || 0})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" /></div>
        <div><label className="block text-xs text-[var(--color-text-muted)] mb-1">Rate Type</label><select value={form.type} onChange={e => setForm({...form, type:e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"><option value="percentage">Percentage</option><option value="fixed">Fixed</option></select></div>
        <div><label className="block text-xs text-[var(--color-text-muted)] mb-1">Category</label><select value={form.tax_category} onChange={e => setForm({...form, tax_category:e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">{Object.entries(CAT_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="block text-xs text-[var(--color-text-muted)] mb-1">Organization</label><select value={form.organisation_id} onChange={e => setForm({...form, organisation_id:e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"><option value="">Global (All Orgs)</option>{orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
      </div>
      <div className="flex gap-3 mt-4"><Button type="submit" loading={createMut.isPending || updateMut.isPending}>{editing ? 'Update' : 'Create'}</Button><Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button></div>
    </form>)}

    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
      <table className="w-full text-sm"><thead><tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
        <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Name</th>
        <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Rate</th>
        <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Type</th>
        <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Category</th>
        <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Scope</th>
        <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Active</th>
        <Can permission="accounting.tax.manage"><th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th></Can>
      </tr></thead><tbody className="divide-y divide-[var(--color-border)]">
        {taxRates.map(t => (<tr key={t.id} className="hover:bg-[var(--color-bg)]/30">
          <td className="px-4 py-3 text-[var(--color-text)]">{t.name}</td>
          <td className="px-4 py-3 font-mono text-[var(--color-text)]">{t.rate}{t.type==='percentage'?'%':''}</td>
          <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{TYPE_LABELS[t.type]||t.type}</td>
          <td className="px-4 py-3 text-xs"><span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400">{CAT_LABELS[t.tax_category]||t.tax_category}</span></td>
          <td className="px-4 py-3 text-xs"><span className={`px-1.5 py-0.5 rounded ${t.organisation_id ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'}`}>{t.organisation_id ? 'Org' : 'Global'}</span></td>
          <td className="px-4 py-3 text-center"><span className={`w-2 h-2 rounded-full inline-block ${t.is_active ? 'bg-green-500' : 'bg-red-500'}`} /></td>
          <Can permission="accounting.tax.manage"><td className="px-4 py-3 text-right">
            <button onClick={() => openEdit(t)} className="text-xs text-[var(--color-primary)] hover:underline mr-2">Edit</button>
            <button onClick={() => setDeleteId(t.id)} className="text-xs text-[var(--color-text-muted)] hover:underline">Deactivate</button>
          </td></Can>
        </tr>))}
      </tbody></table>
      {!taxRates.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No tax rates found</p>}
    </div>

    <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Deactivate Tax Rate">
      <p className="text-sm text-[var(--color-text-muted)] mb-6">Deactivate this tax rate?</p>
      <div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button><Button onClick={() => deactivateMut.mutate(deleteId!)} loading={deactivateMut.isPending}>Deactivate</Button></div>
    </Modal>
  </div></Can>);
}
