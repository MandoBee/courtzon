import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { FlagImage } from '../../../components/ui';

export default function BanksPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ countryId: 1, name: '', swift: '' });

  const { data: countries } = useQuery({
    queryKey: ['countries'],
    queryFn: () => api.get('/countries').then((r: any) => r.data.data),
  });

  const { data: banks, isLoading } = useQuery({
    queryKey: ['banks-all'],
    queryFn: () => api.get('/banks').then((r: any) => r.data?.data ?? []),
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/banks', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['banks-all'] }); setShowForm(false); setForm({ countryId: 1, name: '', swift: '' }); showToast('Created successfully!'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/banks/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['banks-all'] }); setEditingId(null); setShowForm(false); showToast('Updated successfully!'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/banks/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['banks-all'] }); showToast('Deleted!'); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => api.put(`/banks/${id}`, { isActive }),
    onSuccess: (_data: any, variables: any) => { queryClient.invalidateQueries({ queryKey: ['banks-all'] }); showToast(variables.isActive ? 'Activated!' : 'Deactivated!'); },
  });

  if (isLoading) return <div className="flex items-center justify-center min-h-[40vh]"><div className="animate-spin h-8 w-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" /></div>;

  const countryName = (id: number) => {
    const c = (countries || []).find((c: any) => c.id === id);
    if (!c) return String(id);
    return <span className="inline-flex items-center gap-1"><FlagImage iso={c.iso_code} countryName={c.name} className="w-4 h-3 rounded-sm" />{c.name}</span>;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Banks</h1>
        <Can permission="banks.create">
          <button onClick={() => { setShowForm(!showForm); setEditingId(null); }}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">{showForm ? 'Cancel' : '+ New Bank'}</button>
        </Can>
      </div>

      {showForm && (
        <form onSubmit={(e: any) => { e.preventDefault(); editingId ? updateMutation.mutate({ id: editingId, data: form }) : createMutation.mutate(form); }}
          className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 mb-6 space-y-3 border">
          <h3 className="font-semibold text-sm">{editingId ? 'Edit Bank' : 'New Bank'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Can permission="banks.edit.code">
              <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Country</label>
                <select value={form.countryId} onChange={e => setForm({ ...form, countryId: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border text-sm">
                  {(countries || []).filter((c: any) => c.is_active).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </Can>
            <Can permission="banks.edit.name">
              <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Name *</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border text-sm" />
              </div>
            </Can>
            <Can permission="banks.edit.code">
              <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">SWIFT/BIC</label>
                <input type="text" value={form.swift} onChange={e => setForm({ ...form, swift: e.target.value })}
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border text-sm font-mono" />
              </div>
            </Can>
          </div>
          <Can permission={editingId ? 'banks.edit' : 'banks.create'}>
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
              {editingId ? 'Update' : 'Create'}
            </button>
          </Can>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto border">
        <table className="w-full"><thead><tr className="border-b bg-[var(--color-bg)]">
          <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Name</th>
          <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Country</th>
          <th className="text-center px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">SWIFT</th>
          <th className="text-center px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Status</th>
          <th className="text-right px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">Actions</th>
        </tr></thead><tbody>
          {banks?.map((b: any) => (
            <tr key={b.id} className={`border-b hover:bg-[var(--color-bg)] ${editingId === b.id ? 'bg-[var(--color-primary)]/10 border-l-2 border-[var(--color-primary)]' : 'border-l-2 border-transparent'}`}>
              <td className="px-4 py-3 text-sm font-medium text-[var(--color-text)]">{b.name}</td>
              <td className="px-4 py-3 text-sm text-[var(--color-text)]">{countryName(b.country_id)}</td>
              <td className="px-4 py-3 text-center text-sm font-mono text-[var(--color-text)]">{b.swift || '—'}</td>
              <td className="px-4 py-3 text-center">
                <button onClick={() => toggleMutation.mutate({ id: b.id, isActive: !b.is_active })}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium ${b.is_active ? 'text-[var(--color-success-text)]' : 'text-[var(--color-error-text)]'}`}>
                  <span className={`w-2 h-2 rounded-full ${b.is_active ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'}`} />{b.is_active ? 'Active' : 'Inactive'}</button>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <Can permission="banks.edit">
                    <button onClick={() => { setEditingId(b.id); setForm({ countryId: b.country_id, name: b.name, swift: b.swift || '' }); setShowForm(true); }}
                      className="text-xs px-2 py-1 rounded bg-[var(--color-border)] text-[var(--color-text)] bg-[var(--color-surface)] text-[var(--color-text)]">Edit</button>
                  </Can>
                  <Can permission="banks.delete">
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
