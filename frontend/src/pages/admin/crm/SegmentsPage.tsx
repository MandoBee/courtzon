import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { getErrorMessage } from '../../../utils/errors';
import { SkeletonRow } from '../../../components/ui/Skeleton';

interface Segment {
  id: number;
  name: string;
  description: string;
  member_count: number;
  is_active: boolean;
}

export default function SegmentsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Segment | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'crm', 'segments'],
    queryFn: () => api.get('/admin/crm/segments').then((r: any) => r.data?.data || []),
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post('/admin/crm/segments', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'crm', 'segments'] }); resetForm(); showToast('Segment created'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: any) => api.put(`/admin/crm/segments/${id}`, payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'crm', 'segments'] }); resetForm(); showToast('Segment updated'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/crm/segments/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'crm', 'segments'] }); showToast('Segment deleted'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const refreshMutation = useMutation({
    mutationFn: (id: number) => api.post(`/admin/crm/segments/${id}/refresh`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'crm', 'segments'] }); showToast('Segment refreshed'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const resetForm = () => {
    setShowModal(false); setEditing(null); setName(''); setDescription('');
  };

  const openEdit = (s: Segment) => {
    setEditing(s); setName(s.name); setDescription(s.description || ''); setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    const payload = { name, description };
    if (editing) updateMutation.mutate({ id: editing.id, payload });
    else createMutation.mutate(payload);
  };

  const segments: Segment[] = Array.isArray(data) ? data : [];

  if (isLoading) return <SkeletonRow count={4} />;

  return (
    <Can permission="crm.segments.view">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Segments</h1>
          <Can permission="crm.segments.manage">
            <button onClick={() => { resetForm(); setShowModal(true); }}
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-[var(--radius-md)] hover:opacity-90">
              + New Segment
            </button>
          </Can>
        </div>

        {showModal && (
          <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
            <h3 className="font-semibold text-[var(--color-text)] mb-4">{editing ? 'Edit Segment' : 'New Segment'}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label>
                <input value={name} onChange={(e: any) => setName(e.target.value)} required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Description</label>
                <textarea value={description} onChange={(e: any) => setDescription(e.target.value)} rows={2}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-[var(--radius-md)] hover:opacity-90"
                disabled={createMutation.isPending || updateMutation.isPending}>
                {editing ? 'Update' : 'Create'}
              </button>
              <button type="button" onClick={resetForm} className="px-4 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Cancel</button>
            </div>
          </form>
        )}

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-[var(--color-bg)]/50">
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Name</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Description</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Members</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Active</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {segments.map((s) => (
                <tr key={s.id} className="hover:bg-[var(--color-bg)]/30">
                  <td className="px-4 py-3 font-medium text-[var(--color-text)]">{s.name}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)] max-w-xs truncate">{s.description || '—'}</td>
                  <td className="px-4 py-3 text-center font-mono text-[var(--color-text)]">{s.member_count ?? 0}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {s.is_active ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Can permission="crm.segments.manage">
                      <button onClick={() => openEdit(s)} className="text-xs text-[var(--color-primary)] mr-3 hover:underline">Edit</button>
                      <button onClick={() => refreshMutation.mutate(s.id)} className="text-xs text-[var(--color-primary)] mr-3 hover:underline"
                        disabled={refreshMutation.isPending}>Refresh</button>
                      <button onClick={() => { if (confirm('Delete this segment?')) deleteMutation.mutate(s.id); }}
                        className="text-xs text-red-500 hover:underline">Delete</button>
                    </Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!segments.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No segments found</p>}
        </div>
      </div>
    </Can>
  );
}
