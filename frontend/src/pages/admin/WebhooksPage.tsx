import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { ExportButton } from '../../components/ui/ExportButton';
import { SkeletonRow } from '../../components/ui/Skeleton';

export default function WebhooksPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', eventTypes: '' });

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ['admin', 'webhooks'],
    queryFn: () => api.get('/admin/notifications/webhooks').then(r => r.data?.data || []),
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => api.post('/admin/notifications/webhooks', d),
    onSuccess: () => { showToast('Webhook created!', 'success'); qc.invalidateQueries({ queryKey: ['admin', 'webhooks'] }); setShowForm(false); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/notifications/webhooks/${id}`),
    onSuccess: () => { showToast('Webhook deleted', 'info'); qc.invalidateQueries({ queryKey: ['admin', 'webhooks'] }); },
  });

  const list = Array.isArray(webhooks) ? webhooks : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Webhooks</h1>
        <div className="flex gap-2">
          <ExportButton data={list} filename="webhooks" />
          <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">{showForm ? 'Cancel' : 'Add Webhook'}</button>
        </div>
      </div>

      {showForm && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-[var(--color-text-muted)]">Name</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
            <div><label className="text-xs text-[var(--color-text-muted)]">URL</label><input value={form.url} onChange={e => setForm({...form, url: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
            <div className="col-span-2"><label className="text-xs text-[var(--color-text-muted)]">Event Types (comma separated)</label><input value={form.eventTypes} onChange={e => setForm({...form, eventTypes: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
          </div>
          <button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending || !form.name || !form.url} className="btn-primary text-sm">Create</button>
        </div>
      )}

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
        {isLoading ? <SkeletonRow count={4} /> : list.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-text-muted)] text-center">No webhooks configured.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
              <th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">URL</th><th className="text-left px-4 py-3">Events</th><th className="text-left px-4 py-3"></th>
            </tr></thead>
            <tbody>{list.map((w: any) => (
              <tr key={w.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-3 font-medium text-[var(--color-text)]">{w.name}</td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] font-mono">{w.url}</td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{w.event_types || w.eventTypes || 'All'}</td>
                <td className="px-4 py-3"><button onClick={() => deleteMutation.mutate(w.id)} className="text-xs text-[var(--color-error)] hover:underline">Delete</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
