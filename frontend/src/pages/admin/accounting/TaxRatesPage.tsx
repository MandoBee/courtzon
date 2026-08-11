import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Modal, Spinner } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

interface TaxRate {
  id: number;
  name: string;
  rate: number;
  type: 'sales' | 'vat' | 'gst' | 'withholding' | 'other';
  country_code: string;
  is_active: boolean;
}

const TAX_TYPE_LABELS: Record<string, string> = {
  sales: 'Sales Tax',
  vat: 'VAT',
  gst: 'GST',
  withholding: 'Withholding',
  other: 'Other',
};

const TYPE_BADGE: Record<string, string> = {
  sales: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  vat: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  gst: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  withholding: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

export default function TaxRatesPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TaxRate | null>(null);
  const [form, setForm] = useState({ name: '', rate: 0, type: 'vat', country_code: '' });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'tax-rates'],
    queryFn: () => api.get('/admin/accounting/tax-rates').then((r: any) => r.data.data || r.data),
  });

  const taxRates: TaxRate[] = data || [];

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post('/admin/accounting/tax-rates', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounting', 'tax-rates'] }); resetForm(); showToast('Tax rate created!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: any) => api.put(`/admin/accounting/tax-rates/${id}`, payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounting', 'tax-rates'] }); resetForm(); showToast('Tax rate updated!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/accounting/tax-rates/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounting', 'tax-rates'] }); setDeleteId(null); showToast('Tax rate deleted!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const resetForm = () => { setShowForm(false); setEditing(null); setForm({ name: '', rate: 0, type: 'vat', country_code: '' }); };

  const openEdit = (t: TaxRate) => {
    setEditing(t);
    setForm({ name: t.name, rate: t.rate, type: t.type, country_code: t.country_code || '' });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.rate) return;
    if (editing) { updateMutation.mutate({ id: editing.id, payload: form }); }
    else { createMutation.mutate(form); }
  };

  if (isLoading) return <Spinner />;

  return (
    <Can permission="accounting.tax.view">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Tax Rates</h1>
          <Can permission="accounting.tax.manage">
            <Button onClick={() => { resetForm(); setShowForm(true); }}>+ New Tax Rate</Button>
          </Can>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit}
            className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
            <h3 className="font-semibold text-[var(--color-text)] mb-4">{editing ? 'Edit Tax Rate' : 'New Tax Rate'}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Rate (%) *</label>
                <input type="number" step="0.01" min="0" value={form.rate} onChange={e => setForm({ ...form, rate: Number(e.target.value) })} required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Type</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                  {Object.entries(TAX_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Country Code</label>
                <input value={form.country_code} onChange={e => setForm({ ...form, country_code: e.target.value })}
                  placeholder="US, GB, AE..."
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
                {editing ? 'Update' : 'Create'}
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
            </div>
          </form>
        )}

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Name</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Rate</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Type</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Country</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Active</th>
                <Can permission="accounting.tax.manage">
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
                </Can>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {taxRates.map(t => (
                <tr key={t.id} className="hover:bg-[var(--color-bg)]/30">
                  <td className="px-4 py-3 text-[var(--color-text)]">{t.name}</td>
                  <td className="px-4 py-3 font-mono text-[var(--color-text)]">{t.rate}%</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${TYPE_BADGE[t.type] || ''}`}>{TAX_TYPE_LABELS[t.type] || t.type}</span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{t.country_code || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`w-2 h-2 rounded-full inline-block ${t.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                  </td>
                  <Can permission="accounting.tax.manage">
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(t)} className="text-xs text-[var(--color-primary)] hover:underline mr-2">Edit</button>
                      <button onClick={() => setDeleteId(t.id)} className="text-xs text-[var(--color-error)] hover:underline">Delete</button>
                    </td>
                  </Can>
                </tr>
              ))}
            </tbody>
          </table>
          {!taxRates.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No tax rates found</p>}
        </div>

        <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Tax Rate">
          <p className="text-sm text-[var(--color-text-muted)] mb-6">Are you sure? This cannot be undone.</p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button onClick={() => deleteMutation.mutate(deleteId!)} loading={deleteMutation.isPending}
              className="bg-[var(--color-error)] text-white">Delete</Button>
          </div>
        </Modal>
      </div>
    </Can>
  );
}
