import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

export default function PaymentGatewaysPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ paymentMethodId: 0, gatewayProvider: 'paymob', isActive: true, config: '{}' });

  const { data } = useQuery<any[]>({ queryKey: ['admin','payment-gateways'], queryFn: () => api.get('/admin/payment-gateways').then(r => r.data.data) });
  const createMut = useMutation({ mutationFn: (d: any) => api.post('/admin/payment-gateways', d), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin','payment-gateways'] }); resetForm(); showToast('Created successfully!'); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }: any) => api.put(`/admin/payment-gateways/${id}`, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin','payment-gateways'] }); resetForm(); showToast('Updated successfully!'); } });
  const deleteMut = useMutation({ mutationFn: (id: number) => api.delete(`/admin/payment-gateways/${id}`), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin','payment-gateways'] }); showToast('Deleted!'); } });
  const { data: methods } = useQuery<any[]>({ queryKey: ['admin','payment-methods'], queryFn: () => api.get('/admin/payment-methods').then(r => r.data.data) });

  const resetForm = () => { setShowForm(false); setEditingId(null); setForm({ paymentMethodId: 0, gatewayProvider: 'paymob', isActive: true, config: '{}' }); };

  const openEdit = (c: any) => {
    setEditingId(c.id);
    setForm({
      paymentMethodId: c.payment_method_id || 0,
      gatewayProvider: c.gateway_provider || 'paymob',
      isActive: !!c.is_active,
      config: typeof c.config === 'string' ? c.config : JSON.stringify(c.config || {}, null, 2),
    });
    setShowForm(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Payment Gateway Config</h1>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">+ Add Config</button>
      </div>

      {showForm && (
        <form onSubmit={e => { e.preventDefault(); try { JSON.parse(form.config); } catch { return alert('Invalid JSON in config field'); } const payload = { paymentMethodId: form.paymentMethodId, gatewayProvider: form.gatewayProvider, isActive: form.isActive, config: JSON.parse(form.config) }; if (editingId) updateMut.mutate({ id: editingId, data: payload }); else createMut.mutate(payload); }}

          className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border border-[var(--color-border)]">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editingId ? 'Edit Gateway Config (ID: ' + editingId + ')' : 'New Gateway Config'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <Can permission="payment-gateways.edit.name">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Payment Method *</label>
                <select value={form.paymentMethodId} onChange={e => setForm(f => ({ ...f, paymentMethodId: Number(e.target.value) }))} required className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                  <option value={0}>Select method...</option>
                  {methods?.map(m => <option key={m.id} value={m.id}>{m.icon} {m.name}</option>)}
                </select>
              </div>
            </Can>
            <Can permission="payment-gateways.edit.code">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Gateway Provider *</label>
                <select value={form.gatewayProvider} onChange={e => setForm(f => ({ ...f, gatewayProvider: e.target.value }))} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                  <option value="paymob">Paymob</option>
                  <option value="stripe">Stripe</option>
                  <option value="fawry">Fawry</option>
                  <option value="moyasar">Moyasar</option>
                  <option value="mock">Mock (Testing)</option>
                </select>
              </div>
            </Can>
          </div>
          <Can permission="payment-gateways.edit.public-key">
            <div className="mb-4">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Gateway Config (JSON) — API keys, secrets, endpoints</label>
              <textarea value={form.config} onChange={e => setForm(f => ({ ...f, config: e.target.value }))} rows={8} placeholder={`{
  "api_key": "your_api_key_here",
  "secret": "your_secret_here",
  "integration_id": "your_integration_id",
  "iframe_id": "your_iframe_id",
  "hmac_secret": "your_hmac_secret",
  "base_url": "https://accept.paymob.com/api"
}`} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm font-mono" spellCheck={false} />
            </div>
          </Can>
          <Can permission="payment-gateways.edit.status">
            <div className="flex items-center gap-4 mb-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} /><span className="text-xs text-[var(--color-text-muted)]">Active</span></label>
            </div>
          </Can>
          <div className="flex items-center gap-3">
            <Can permission={editingId ? 'payment-gateways.edit' : 'payment-gateways.create'}>
              <button type="submit" disabled={createMut.isPending || updateMut.isPending} className="px-5 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">{editingId ? 'Update' : 'Create'}</button>
            </Can>
            <button type="button" onClick={resetForm} className="px-5 py-2 border rounded-[var(--radius-md)] text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
            <th className="px-4 py-3 font-medium">ID</th>
            <th className="px-4 py-3 font-medium">Payment Method</th>
            <th className="px-4 py-3 font-medium">Provider</th>
            <th className="px-4 py-3 font-medium">Config</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium w-28"></th>
          </tr></thead>
          <tbody className="divide-y dark:divide-gray-700">
            {data?.map((c: any) => (
              <tr key={c.id} className={`hover:bg-[var(--color-bg)]/30 ${editingId === c.id ? 'bg-[var(--color-primary)]/10 border-l-2 border-[var(--color-primary)]' : 'border-l-2 border-transparent'}`}>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] font-mono">{c.id}</td>
                <td className="px-4 py-3 font-medium text-[var(--color-text)]">{c.payment_method_name || '—'} <span className="text-xs text-[var(--color-text-muted)]">({c.payment_method_slug})</span></td>
                <td className="px-4 py-3 text-[var(--color-text)] capitalize">{c.gateway_provider}</td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] max-w-[200px] truncate font-mono">
                  {typeof c.config === 'string' ? c.config.slice(0, 40) + (c.config.length > 40 ? '...' : '') : JSON.stringify(c.config || {}).slice(0, 40)}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.is_active ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-surface)] text-[var(--color-text-muted)]'}`}>{c.is_active ? 'Active' : 'Inactive'}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(c)} className="text-xs px-2.5 py-1 border rounded-[var(--radius-md)] hover:bg-[var(--color-bg)] text-blue-600">Edit</button>
                    <button onClick={() => { if (confirm(`Delete config #${c.id}?`)) deleteMut.mutate(c.id); }} className="text-xs px-2.5 py-1 border rounded-[var(--radius-md)] text-[var(--color-error)]">Del</button>
                  </div>
                </td>
              </tr>
            ))}
            {(!data || data.length === 0) && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--color-text-muted)]">No gateway configs yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
