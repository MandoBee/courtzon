import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Modal, Spinner } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

interface Language {
  id: number;
  code: string;
  name: string;
  native_name: string;
  is_rtl: number;
  sort_order: number;
  is_active: number;
}

export default function LanguagesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Language | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [nativeName, setNativeName] = useState('');
  const [isRtl, setIsRtl] = useState(false);
  const [sortOrder, setSortOrder] = useState('0');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'languages'],
    queryFn: () => api.get('/languages').then((r: any) => r.data.data),
  });

  const languages: Language[] = data || [];

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/languages', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'languages'] }); resetForm(); showToast('Created successfully!'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/languages/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'languages'] }); resetForm(); showToast('Updated successfully!'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/languages/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'languages'] }); setDeleteId(null); showToast('Deleted successfully!'); },
  });

  const resetForm = () => { setShowForm(false); setEditing(null); setCode(''); setName(''); setNativeName(''); setIsRtl(false); setSortOrder('0'); };

  const openEdit = (l: Language) => {
    setEditing(l); setCode(l.code); setName(l.name); setNativeName(l.native_name);
    setIsRtl(!!l.is_rtl); setSortOrder(String(l.sort_order));
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name || !nativeName) return;
    const payload = { code, name, nativeName, isRtl, sortOrder: parseInt(sortOrder) || 0 };
    if (editing) { updateMutation.mutate({ id: editing.id, data: payload }); }
    else { createMutation.mutate(payload); }
  };

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Languages</h1>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>+ New Language</Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit}
          className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editing ? 'Edit Language' : 'New Language'}</h3>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Code *</label>
              <Can permission="languages.edit.code">
                <input value={code} onChange={(e: any) => setCode(e.target.value)}
                  placeholder="en" required maxLength={5}
                  className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm w-20" />
              </Can>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label>
              <Can permission="languages.edit.name">
                <input value={name} onChange={(e: any) => setName(e.target.value)}
                  placeholder="English" required
                  className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[140px]" />
              </Can>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Native Name *</label>
              <input value={nativeName} onChange={(e: any) => setNativeName(e.target.value)}
                placeholder="English" required
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[140px]" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Sort Order</label>
              <input type="number" value={sortOrder} onChange={(e: any) => setSortOrder(e.target.value)}
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm w-20" />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <input type="checkbox" id="isRtl" checked={isRtl} onChange={(e: any) => setIsRtl(e.target.checked)}
                className="rounded border-[var(--color-border)] text-[var(--color-primary)]" />
              <label htmlFor="isRtl" className="text-sm text-[var(--color-text-muted)]">RTL</label>
            </div>
            <Can permission={editing ? 'languages.edit' : 'languages.create'}>
              <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
                {editing ? 'Update' : 'Create'}
              </Button>
            </Can>
            <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Code</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Name</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Native Name</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">RTL</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Active</th>
              <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {languages.map((l: any) => (
              <tr key={l.id} className={`hover:bg-[var(--color-bg)]/30 ${editing?.id === l.id ? 'bg-[var(--color-primary)]/10 border-l-2 border-[var(--color-primary)]' : 'border-l-2 border-transparent'}`}>
                <td className="px-4 py-3 font-mono font-semibold text-[var(--color-text)]">{l.code}</td>
                <td className="px-4 py-3 text-[var(--color-text)]">{l.name}</td>
                <td className="px-4 py-3 text-[var(--color-text)]">{l.native_name}</td>
                <td className="px-4 py-3 text-center">
                  {l.is_rtl ? <span className="text-lg">⬅️</span> : <span className="text-[var(--color-text-muted)]">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 text-xs rounded-full ${l.is_active ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'}`}>
                    {l.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" onClick={() => openEdit(l)}>Edit</Button>
                    <Button variant="ghost" onClick={() => setDeleteId(l.id)}
                      className="text-[var(--color-error)]">Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!languages.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No languages found</p>}
      </div>

      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Language">
        <p className="text-sm text-[var(--color-text-muted)] mb-6">Are you sure? This cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={() => deleteMutation.mutate(deleteId!)} loading={deleteMutation.isPending}
            className="bg-[var(--color-error)] text-white">Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
