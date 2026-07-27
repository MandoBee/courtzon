import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { getErrorMessage } from '../../../utils/errors';
import { SkeletonRow } from '../../../components/ui/Skeleton';

interface Campaign {
  id: number;
  name: string;
  description: string;
  type: 'email' | 'sms' | 'push' | 'in_app' | 'multi_channel';
  status: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
  segment_id: number | null;
  segment_name: string | null;
  scheduled_at: string | null;
}

const statusBadge = (status: string) => {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    active: 'bg-green-100 text-green-700',
    paused: 'bg-amber-100 text-amber-700',
    completed: 'bg-teal-100 text-teal-700',
    cancelled: 'bg-red-100 text-red-700',
  };
  return colors[status] || 'bg-gray-100 text-gray-500';
};

const typeBadge = (type: string) => {
  const colors: Record<string, string> = {
    email: 'bg-blue-100 text-blue-700',
    sms: 'bg-purple-100 text-purple-700',
    push: 'bg-amber-100 text-amber-700',
    in_app: 'bg-teal-100 text-teal-700',
    multi_channel: 'bg-green-100 text-green-700',
  };
  return colors[type] || 'bg-gray-100 text-gray-500';
};

export default function CampaignsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<Campaign['type']>('email');
  const [segmentId, setSegmentId] = useState<number | null>(null);
  const [scheduledAt, setScheduledAt] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'crm', 'campaigns'],
    queryFn: () => api.get('/admin/crm/campaigns').then((r: any) => r.data?.data || []),
  });

  const { data: segments } = useQuery({
    queryKey: ['admin', 'crm', 'segments', 'list'],
    queryFn: () => api.get('/admin/crm/segments').then((r: any) => r.data?.data || []),
    staleTime: 60000,
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post('/admin/crm/campaigns', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'crm', 'campaigns'] }); resetForm(); showToast('Campaign created'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: any) => api.put(`/admin/crm/campaigns/${id}`, payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'crm', 'campaigns'] }); resetForm(); showToast('Campaign updated'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.put(`/admin/crm/campaigns/${id}/status`, { status }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'crm', 'campaigns'] }); showToast('Campaign status updated'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const resetForm = () => {
    setShowModal(false); setEditing(null); setName(''); setDescription(''); setType('email'); setSegmentId(null); setScheduledAt('');
  };

  const openEdit = (c: Campaign) => {
    setEditing(c); setName(c.name); setDescription(c.description || ''); setType(c.type);
    setSegmentId(c.segment_id); setScheduledAt(c.scheduled_at || ''); setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    const payload: any = { name, description, type, segment_id: segmentId || null, scheduled_at: scheduledAt || null };
    if (editing) updateMutation.mutate({ id: editing.id, payload });
    else createMutation.mutate(payload);
  };

  const campaigns: Campaign[] = Array.isArray(data) ? data : [];
  const segmentsList = Array.isArray(segments) ? segments : [];

  if (isLoading) return <SkeletonRow count={5} />;

  return (
    <Can permission="crm.campaigns.view">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Campaigns</h1>
          <Can permission="crm.campaigns.manage">
            <button onClick={() => { resetForm(); setShowModal(true); }}
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-[var(--radius-md)] hover:opacity-90">
              + New Campaign
            </button>
          </Can>
        </div>

        {showModal && (
          <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
            <h3 className="font-semibold text-[var(--color-text)] mb-4">{editing ? 'Edit Campaign' : 'New Campaign'}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label>
                <input value={name} onChange={(e: any) => setName(e.target.value)} required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Type</label>
                <select value={type} onChange={(e: any) => setType(e.target.value)}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                  <option value="push">Push</option>
                  <option value="in_app">In-App</option>
                  <option value="multi_channel">Multi-Channel</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Description</label>
                <textarea value={description} onChange={(e: any) => setDescription(e.target.value)} rows={2}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Segment</label>
                <select value={segmentId ?? ''} onChange={(e: any) => setSegmentId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                  <option value="">All Customers</option>
                  {segmentsList.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Scheduled Date</label>
                <input type="datetime-local" value={scheduledAt} onChange={(e: any) => setScheduledAt(e.target.value)}
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
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Type</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Status</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Segment</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Scheduled</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-[var(--color-bg)]/30">
                  <td className="px-4 py-3 font-medium text-[var(--color-text)]">{c.name}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${typeBadge(c.type)}`}>{c.type}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${statusBadge(c.status)}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{c.segment_name || 'All Customers'}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{c.scheduled_at ? new Date(c.scheduled_at).toLocaleDateString('en-GB') : '—'}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Can permission="crm.campaigns.manage">
                      <button onClick={() => openEdit(c)} className="text-xs text-[var(--color-primary)] mr-2 hover:underline">Edit</button>
                      {c.status === 'draft' && (
                        <button onClick={() => statusMutation.mutate({ id: c.id, status: 'active' })}
                          className="text-xs text-green-600 mr-2 hover:underline">Launch</button>
                      )}
                      {c.status === 'active' && (
                        <button onClick={() => statusMutation.mutate({ id: c.id, status: 'paused' })}
                          className="text-xs text-amber-600 mr-2 hover:underline">Pause</button>
                      )}
                      {(c.status === 'paused' || c.status === 'active') && (
                        <button onClick={() => statusMutation.mutate({ id: c.id, status: 'completed' })}
                          className="text-xs text-teal-600 mr-2 hover:underline">Complete</button>
                      )}
                    </Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!campaigns.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No campaigns found</p>}
        </div>
      </div>
    </Can>
  );
}
