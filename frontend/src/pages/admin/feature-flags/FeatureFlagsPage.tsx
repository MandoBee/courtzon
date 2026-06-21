import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

export default function FeatureFlagsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ flagKey: '', label: '', description: '', module: 'general' });
  const { showToast } = useToast();

  const { data: flags } = useQuery({
    queryKey: ['admin', 'feature-flags'],
    queryFn: () => api.get('/feature-flags').then((r: any) => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => api.post('/feature-flags', d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'feature-flags'] }); resetForm(); showToast('Created successfully!'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/feature-flags/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'feature-flags'] }); resetForm(); showToast('Updated successfully!'); },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/feature-flags/${id}/toggle`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'feature-flags'] }); showToast('Toggled!'); },
    onError: (err) => { showToast(getErrorMessage(err, 'Toggle failed'), 'error'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/feature-flags/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'feature-flags'] }); showToast('Deleted successfully!'); },
  });

  const resetForm = () => { setShowForm(false); setEditingId(null); setForm({ flagKey: '', label: '', description: '', module: 'general' }); };

  const openEdit = (f: any) => {
    setEditingId(f.id);
    setForm({ flagKey: f.flag_key, label: f.label, description: f.description || '', module: f.module });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { flagKey: form.flagKey, label: form.label, description: form.description, module: form.module };
    if (editingId) updateMutation.mutate({ id: editingId, data: payload });
    else createMutation.mutate(payload);
  };

  const groupedFlags = (flags || []).reduce((acc: Record<string, any[]>, f: any) => {
    const mod = f.module || 'general';
    if (!acc[mod]) acc[mod] = [];
    acc[mod].push(f);
    return acc;
  }, {} as Record<string, any[]>);

  const moduleOrder = ['player', 'seller', 'organization', 'admin', 'system', 'general', 'marketplace', 'bookings', 'financial', 'tournaments', 'academies', 'community'];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Feature Flags</h1>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
          + New Flag
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border border-[var(--color-border)]">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editingId ? 'Edit Flag' : 'New Flag'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Flag Key</label>
              <input value={form.flagKey} onChange={e => setForm(f => ({ ...f, flagKey: e.target.value }))}
                placeholder="e.g. player.chat" required
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Label</label>
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Chat/Messaging" required
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Module</label>
              <select value={form.module} onChange={e => setForm(f => ({ ...f, module: e.target.value }))}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                <option value="player">Player</option>
                <option value="seller">Seller</option>
                <option value="organization">Organization</option>
                <option value="admin">Admin</option>
                <option value="system">System</option>
                <option value="general">General</option>
                <option value="marketplace">Marketplace</option>
                <option value="bookings">Bookings</option>
                <option value="financial">Financial</option>
                <option value="tournaments">Tournaments</option>
                <option value="academies">Academies</option>
                <option value="community">Community</option>
              </select>
            </div>
            <div className="self-end flex gap-2">
              <Can permission={editingId ? 'feature-flags.edit' : 'feature-flags.create'}>
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-5 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">
                  {editingId ? 'Update' : 'Create'}
                </button>
              </Can>
              <button type="button" onClick={resetForm}
                className="px-5 py-2 border rounded-[var(--radius-md)] text-sm">Cancel</button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Description</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What does this flag control?"
              className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
          </div>
        </form>
      )}

      <div className="space-y-6">
        {moduleOrder.map(mod => {
          const modFlags = groupedFlags[mod];
          if (!modFlags?.length) return null;
          const enabledCount = modFlags.filter((f: any) => f.is_enabled).length;
          return (
            <div key={mod} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
              <div className="px-5 py-3 border-b bg-[var(--color-bg)]/50 flex items-center justify-between">
                <h2 className="font-semibold text-[var(--color-text)] capitalize">{mod}
                  <span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">{enabledCount}/{modFlags.length} enabled</span>
                </h2>
              </div>
              <div className="divide-y">
                {modFlags.map((flag: any) => (
                  <div key={flag.id} className={`px-5 py-3 flex items-center justify-between hover:bg-[var(--color-bg)]/30 ${editingId === flag.id ? 'bg-[var(--color-primary)]/10 border-l-2 border-[var(--color-primary)]' : 'border-l-2 border-transparent'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--color-text)]">{flag.label}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                          flag.is_enabled ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'
                        }`}>
                          {flag.is_enabled ? 'ON' : 'OFF'}
                        </span>
                      </div>
                      <code className="text-xs font-mono text-[var(--color-text-muted)]">{flag.flag_key}</code>
                      {flag.description && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{flag.description}</p>}
                    </div>
                    <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={!!flag.is_enabled}
                          onChange={() => toggleMutation.mutate(flag.id)}
                          disabled={toggleMutation.isPending}
                          className="sr-only peer" />
                        <div className="w-9 h-5 bg-[var(--color-border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-[var(--color-border)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
                      </label>
                      <button onClick={() => openEdit(flag)}
                        className="text-xs px-2.5 py-1 border rounded-[var(--radius-md)] hover:bg-[var(--color-bg)]">Edit</button>
                      <button onClick={() => { if (confirm(`Delete "${flag.label}"?`)) deleteMutation.mutate(flag.id); }}
                        className="text-xs px-2.5 py-1 border rounded-[var(--radius-md)] text-[var(--color-error)] hover:bg-red-50">Del</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
