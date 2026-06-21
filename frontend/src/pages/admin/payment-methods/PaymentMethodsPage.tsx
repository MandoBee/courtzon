import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

export default function PaymentMethodsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ slug: '', name: '', icon: '', description: '', processingFeePct: 0, processingFeeFixed: 0, requiresApproval: false, isActive: true, sortOrder: 0 });

  const { data } = useQuery<any[]>({ queryKey: ['admin','payment-methods'], queryFn: () => api.get('/admin/payment-methods').then(r => r.data.data) });
  const createMut = useMutation({ mutationFn: (d: any) => api.post('/admin/payment-methods', d), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin','payment-methods'] }); resetForm(); showToast('Created successfully!'); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }: any) => api.put(`/admin/payment-methods/${id}`, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin','payment-methods'] }); resetForm(); showToast('Updated successfully!'); } });
  const deleteMut = useMutation({ mutationFn: (id: number) => api.delete(`/admin/payment-methods/${id}`), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin','payment-methods'] }); showToast('Deleted!'); } });

  const resetForm = () => { setShowForm(false); setEditingId(null); setForm({ slug: '', name: '', icon: '', description: '', processingFeePct: 0, processingFeeFixed: 0, requiresApproval: false, isActive: true, sortOrder: 0 }); };
  const openEdit = (m: any) => {
    setEditingId(m.id);
    setForm({ slug: m.slug || '', name: m.name || '', icon: m.icon || '', description: m.description || '', processingFeePct: m.processingFeePct ?? 0, processingFeeFixed: m.processingFeeFixed ?? 0, requiresApproval: m.requiresApproval ?? false, isActive: m.isActive ?? true, sortOrder: m.sortOrder ?? 0 });
    setShowForm(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Payment Methods</h1>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">+ Add Method</button>
      </div>

      {showForm && (
        <form onSubmit={e => { e.preventDefault(); const newSlug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, ''); const payload = { ...form, slug: newSlug || form.slug }; if (editingId) updateMut.mutate({ id: editingId, data: payload }); else createMut.mutate(payload); }}
          className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border border-[var(--color-border)]">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editingId ? 'Edit Method' : 'New Payment Method'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <Can permission="payment-methods.edit.name"><div><label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label><input value={form.name} onChange={e => { const s = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, ''); setForm(f => ({ ...f, name: e.target.value, slug: s })); }} required className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" /></div></Can>
            <div><label className="block text-xs text-[var(--color-text-muted)] mb-1">Icon (emoji/class)</label><input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} placeholder="💳" className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" /></div>
          </div>
          <Can permission="payment-methods.edit.instructions">
            <div className="mb-3">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
          </Can>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <div><label className="block text-xs text-[var(--color-text-muted)] mb-1">Fee %</label><input type="number" step="0.01" value={form.processingFeePct} onChange={e => setForm(f => ({ ...f, processingFeePct: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" /></div>
            <div><label className="block text-xs text-[var(--color-text-muted)] mb-1">Fixed Fee</label><input type="number" step="0.01" value={form.processingFeeFixed} onChange={e => setForm(f => ({ ...f, processingFeeFixed: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" /></div>
            <Can permission="payment-methods.edit.sort-order"><div><label className="block text-xs text-[var(--color-text-muted)] mb-1">Sort Order</label><input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" /></div></Can>
            <div className="flex items-end gap-4 pb-1">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.requiresApproval} onChange={e => setForm(f => ({ ...f, requiresApproval: e.target.checked }))} /><span className="text-xs text-[var(--color-text-muted)]">Requires Approval</span></label>
              <Can permission="payment-methods.edit.status"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} /><span className="text-xs text-[var(--color-text-muted)]">Active</span></label></Can>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Can permission={editingId ? 'payment-methods.edit' : 'payment-methods.create'}>
              <button type="submit" disabled={createMut.isPending || updateMut.isPending} className="px-5 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">{editingId ? 'Update' : 'Create'}</button>
            </Can>
            <button type="button" onClick={resetForm} className="px-5 py-2 border rounded-[var(--radius-md)] text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
          <th className="px-4 py-3 font-medium">Icon</th><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Slug</th><th className="px-4 py-3 font-medium">Fees</th><th className="px-4 py-3 font-medium">Approval</th><th className="px-4 py-3 font-medium">Active</th><th className="px-4 py-3 font-medium w-24"></th>
        </tr></thead><tbody className="divide-y dark:divide-gray-700">
          {data?.map((m: any) => (
            <tr key={m.id} className={`hover:bg-[var(--color-bg)]/30 ${editingId === m.id ? 'bg-[var(--color-primary)]/10 border-l-2 border-[var(--color-primary)]' : 'border-l-2 border-transparent'}`}>
              <td className="px-4 py-3 text-lg">{m.icon || '💳'}</td>
              <td className="px-4 py-3 font-medium text-[var(--color-text)]">{m.name}</td>
              <td className="px-4 py-3 text-[var(--color-text-muted)]">{m.slug}</td>
              <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{m.processingFeePct}% + ${m.processingFeeFixed}</td>
              <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.requiresApproval ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]' : 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]'}`}>{m.requiresApproval ? 'Yes' : 'No'}</span></td>
              <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.isActive ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'}`}>{m.isActive ? 'Yes' : 'No'}</span></td>
              <td className="px-4 py-3"><div className="flex items-center gap-1">
                <button onClick={() => openEdit(m)} className="text-xs px-2.5 py-1 border rounded-[var(--radius-md)] hover:bg-[var(--color-bg)]">Edit</button>
                <button onClick={() => { if (confirm(`Delete "${m.name}"?`)) deleteMut.mutate(m.id); }} className="text-xs px-2.5 py-1 border rounded-[var(--radius-md)] text-[var(--color-error)]">Del</button>
              </div></td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
}
