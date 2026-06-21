import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

export default function BankBranchesPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ bankId: undefined as number | undefined, name: '', address: '' });

  const { data: banks } = useQuery({ queryKey: ['banks-all'], queryFn: () => api.get('/banks').then((r: any) => r.data?.data ?? []), staleTime: 0 });
  const { data: branches, isLoading } = useQuery({ queryKey: ['bank-branches-all'], queryFn: () => api.get('/bank-branches').then((r: any) => r.data?.data ?? []), staleTime: 0 });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/bank-branches', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['bank-branches-all'] }); setShowForm(false); setForm({ bankId: undefined, name: '', address: '' }); showToast('Created successfully!'); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/bank-branches/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['bank-branches-all'] }); setEditingId(null); setShowForm(false); showToast('Updated successfully!'); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/bank-branches/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['bank-branches-all'] }); showToast('Deleted!'); },
  });
  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => api.put(`/bank-branches/${id}`, { isActive }),
    onSuccess: (_data: any, variables: any) => { queryClient.invalidateQueries({ queryKey: ['bank-branches-all'] }); showToast(variables.isActive ? 'Activated!' : 'Deactivated!'); },
  });

  if (isLoading) return <div className="flex items-center justify-center min-h-[40vh]"><div className="animate-spin h-8 w-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" /></div>;

  const bankName = (id: number) => (banks || []).find((b: any) => b.id === id)?.name || id;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Bank Branches</h1>
        <Can permission="bank-branches.create">
          <button onClick={() => { setShowForm(!showForm); setEditingId(null); }}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">{showForm ? 'Cancel' : '+ New Branch'}</button>
        </Can>
      </div>

      {showForm && (
        <form onSubmit={(e: any) => { e.preventDefault(); editingId ? updateMutation.mutate({ id: editingId, data: form }) : createMutation.mutate(form); }}
          className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 mb-6 space-y-3 border">
          <h3 className="font-semibold text-sm">{editingId ? 'Edit Branch' : 'New Branch'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Can permission="bank-branches.edit.bank">
              <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Bank *</label>
                <select value={form.bankId || ''} onChange={e => setForm({ ...form, bankId: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border text-sm" required>
                  <option value="">— Select —</option>
                  {(banks || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </Can>
            <Can permission="bank-branches.edit.name">
              <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Name *</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border text-sm" />
              </div>
            </Can>
            <Can permission="bank-branches.edit.address">
              <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Address</label>
                <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border text-sm" />
              </div>
            </Can>
          </div>
          <Can permission={editingId ? 'bank-branches.edit' : 'bank-branches.create'}>
            <button type="submit" className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
              {editingId ? 'Update' : 'Create'}
            </button>
          </Can>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto border">
        <table className="w-full"><thead><tr className="border-b bg-[var(--color-bg)]">
          <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Name</th>
          <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Bank</th>
          <th className="text-center px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Status</th>
          <th className="text-right px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Actions</th>
        </tr></thead><tbody>
          {branches?.map((b: any) => (
            <tr key={b.id} className={`border-b hover:bg-[var(--color-bg)] ${editingId === b.id ? 'bg-[var(--color-primary)]/10 border-l-2 border-[var(--color-primary)]' : 'border-l-2 border-transparent'}`}>
              <td className="px-4 py-3 text-sm font-medium text-[var(--color-text)]">{b.name}</td>
              <td className="px-4 py-3 text-sm text-[var(--color-text)]">{bankName(b.bank_id)}</td>
              <td className="px-4 py-3 text-center">
                <button onClick={() => toggleMutation.mutate({ id: b.id, isActive: !b.is_active })}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium ${b.is_active ? 'text-[var(--color-success-text)]' : 'text-[var(--color-error-text)]'}`}>
                  <span className={`w-2 h-2 rounded-full ${b.is_active ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'}`} />{b.is_active ? 'Active' : 'Inactive'}</button>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <Can permission="bank-branches.edit">
                    <button onClick={() => { setEditingId(b.id); setForm({ bankId: b.bank_id, name: b.name, address: b.address || '' }); setShowForm(true); }}
                      className="text-xs px-2 py-1 rounded bg-[var(--color-border)] text-[var(--color-text)] bg-[var(--color-surface)] text-[var(--color-text)]">Edit</button>
                  </Can>
                  <Can permission="bank-branches.delete">
                    <button onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(b.id); }}
                      className="text-xs px-2 py-1 rounded bg-[var(--color-error-bg)] text-[var(--color-error-text)] dark:bg-red-900/30 dark:text-red-400">Delete</button>
                  </Can>
                </div>
              </td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
}
