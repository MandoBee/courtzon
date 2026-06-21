import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

type Tab = 'campaigns' | 'placements';

export default function AdsPage() {
  const [tab, setTab] = useState<Tab>('campaigns');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Ad Manager</h1>
      </div>
      <div className="flex gap-1 mb-6 bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-1 w-fit shadow-[var(--shadow-sm)]">
        <button onClick={() => setTab('campaigns')}
          className={`px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] ${
            tab === 'campaigns' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)]'
          }`}>Campaigns</button>
        <button onClick={() => setTab('placements')}
          className={`px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] ${
            tab === 'placements' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)]'
          }`}>Placements</button>
      </div>
      {tab === 'campaigns' ? <CampaignsManager /> : <PlacementsManager />}
    </div>
  );
}

const statusColors: Record<string, string> = {
  draft: 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
  active: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  paused: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  ended: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  cancelled: 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
};

function CampaignsManager() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({
    name: '', placementId: '', startDate: '', endDate: '',
    dailyBudget: '', totalBudget: '', currencyCode: 'EGP', status: 'draft',
    imageUrl: '', clickUrl: '', altText: '',
  });

  const { data: campaigns } = useQuery({
    queryKey: ['admin', 'ads-campaigns'],
    queryFn: () => api.get('/ads/admin/campaigns').then(r => r.data.data),
  });

  const { data: placements } = useQuery({
    queryKey: ['admin', 'ads-placements-all'],
    queryFn: () => api.get('/ads/admin/placements').then(r => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => api.post('/ads/campaigns', d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'ads-campaigns'] }); resetForm(); showToast('Created successfully!'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/ads/admin/campaigns/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'ads-campaigns'] }); resetForm(); showToast('Updated successfully!'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/ads/admin/campaigns/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'ads-campaigns'] }); showToast('Deleted!'); },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.patch(`/ads/admin/campaigns/${id}/status`, { status }),
    onSuccess: (_data: any, variables: any) => { queryClient.invalidateQueries({ queryKey: ['admin', 'ads-campaigns'] }); showToast(`Status changed to "${variables.status}"!`); },
  });

  const resetForm = () => { setShowForm(false); setEditingId(null); setForm({ name: '', placementId: '', startDate: '', endDate: '', dailyBudget: '', totalBudget: '', currencyCode: 'EGP', status: 'draft', imageUrl: '', clickUrl: '', altText: '' }); };

  const openEdit = (c: any) => {
    setEditingId(c.id);
    setForm({
      name: c.name, placementId: String(c.placement_id), startDate: c.start_date?.slice(0, 16) || '', endDate: c.end_date?.slice(0, 16) || '',
      dailyBudget: c.daily_budget || '', totalBudget: c.total_budget || '', currencyCode: c.currency_code, status: c.status,
      imageUrl: '', clickUrl: '', altText: '',
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      name: form.name, placementId: Number(form.placementId),
      startDate: form.startDate, endDate: form.endDate,
      currencyCode: form.currencyCode, status: form.status,
    };
    if (form.dailyBudget) payload.dailyBudget = Number(form.dailyBudget);
    if (form.totalBudget) payload.totalBudget = Number(form.totalBudget);
    if (!editingId) { payload.imageUrl = form.imageUrl; payload.clickUrl = form.clickUrl || undefined; payload.altText = form.altText || undefined; }
    if (editingId) updateMutation.mutate({ id: editingId, data: payload });
    else createMutation.mutate(payload);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[var(--color-text-muted)]">{campaigns?.length || 0} campaign(s)</p>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">+ New Campaign</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border border-[var(--color-border)]">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editingId ? 'Edit Campaign' : 'New Campaign'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name</label>
              <Can permission="ads.edit.title">
                <input value={form.name} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </Can>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Placement</label>
              <Can permission="ads.edit.placement">
                <select value={form.placementId} onChange={e => setForm((f: any) => ({ ...f, placementId: e.target.value }))} required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                  <option value="">Select...</option>
                  {placements?.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.placement_key})</option>)}
                </select>
              </Can>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Status</label>
              <Can permission="ads.edit.status">
                <select value={form.status} onChange={e => setForm((f: any) => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </select>
              </Can>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Start Date</label>
              <Can permission="ads.edit.start-date">
                <input type="datetime-local" value={form.startDate} onChange={e => setForm((f: any) => ({ ...f, startDate: e.target.value }))} required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </Can>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">End Date</label>
              <Can permission="ads.edit.end-date">
                <input type="datetime-local" value={form.endDate} onChange={e => setForm((f: any) => ({ ...f, endDate: e.target.value }))} required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </Can>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Daily Budget</label>
              <input type="number" step="0.01" value={form.dailyBudget} onChange={e => setForm((f: any) => ({ ...f, dailyBudget: e.target.value }))}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Total Budget</label>
              <input type="number" step="0.01" value={form.totalBudget} onChange={e => setForm((f: any) => ({ ...f, totalBudget: e.target.value }))}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Currency</label>
              <input value={form.currencyCode} onChange={e => setForm((f: any) => ({ ...f, currencyCode: e.target.value }))} maxLength={3}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm uppercase" />
            </div>
          </div>
          {!editingId && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)]">
              <p className="text-xs text-[var(--color-text-muted)] col-span-3 font-medium">Creative (for new campaigns)</p>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Image URL</label>
                <Can permission="ads.edit.image">
                <input value={form.imageUrl} onChange={e => setForm((f: any) => ({ ...f, imageUrl: e.target.value }))} required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-white text-sm" />
              </Can>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Click URL</label>
                <Can permission="ads.edit.link">
                  <input value={form.clickUrl} onChange={e => setForm((f: any) => ({ ...f, clickUrl: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-white text-sm" />
                </Can>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Alt Text</label>
                <input value={form.altText} onChange={e => setForm((f: any) => ({ ...f, altText: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-white text-sm" />
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Can permission={editingId ? 'ads.edit' : 'ads.create'}>
              <button type="submit" disabled={createMutation.isPending || updateMutation.isPending}
                className="px-5 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">
                {editingId ? 'Update' : 'Create'}
              </button>
            </Can>
            <button type="button" onClick={resetForm} className="px-5 py-2 border rounded-[var(--radius-md)] text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Placement</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Dates</th>
              <th className="px-4 py-3 font-medium">Budget</th>
              <th className="px-4 py-3 font-medium w-44"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {campaigns?.map((c: any) => (
              <tr key={c.id} className={`hover:bg-[var(--color-bg)]/30 ${editingId === c.id ? 'bg-[var(--color-primary)]/10 border-l-2 border-[var(--color-primary)]' : 'border-l-2 border-transparent'}`}>
                <td className="px-4 py-3 font-medium text-[var(--color-text)]">{c.name}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{c.placement_name}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[c.status] || 'bg-[var(--color-border)]'}`}>{c.status}</span>
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
                  {new Date(c.start_date).toLocaleDateString('en-GB')} — {new Date(c.end_date).toLocaleDateString('en-GB')}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
                  {c.daily_budget && <div>{Number(c.daily_budget).toFixed(0)} EGP/day</div>}
                  {c.total_budget && <div>{Number(c.total_budget).toFixed(0)} EGP total</div>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 flex-wrap">
                    <button onClick={() => openEdit(c)}
                      className="text-xs px-2 py-1 border rounded-[var(--radius-md)] hover:bg-[var(--color-bg)]">Edit</button>
                    <select value={c.status} onChange={e => statusMutation.mutate({ id: c.id, status: e.target.value })}
                      className="text-xs px-1 py-1 border rounded-[var(--radius-md)] bg-transparent">
                      <option value="draft">→ Draft</option>
                      <option value="active">→ Active</option>
                      <option value="paused">→ Paused</option>
                      <option value="ended">→ Ended</option>
                      <option value="cancelled">→ Cancelled</option>
                    </select>
                    <button onClick={() => { if (confirm(`Delete "${c.name}"?`)) deleteMutation.mutate(c.id); }}
                      className="text-xs px-2 py-1 border rounded-[var(--radius-md)] text-[var(--color-error)]">Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlacementsManager() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ placementKey: '', name: '', description: '', dimensions: '', maxAds: '1' });

  const { data: placements } = useQuery({
    queryKey: ['admin', 'ads-placements-all'],
    queryFn: () => api.get('/ads/admin/placements').then(r => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => api.post('/ads/admin/placements', d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'ads-placements-all'] }); resetForm(); showToast('Created successfully!'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/ads/admin/placements/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'ads-placements-all'] }); resetForm(); showToast('Updated successfully!'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/ads/admin/placements/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'ads-placements-all'] }); showToast('Deleted!'); },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/ads/admin/placements/${id}/toggle`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'ads-placements-all'] }); showToast('Toggled!'); },
  });

  const resetForm = () => { setShowForm(false); setEditingId(null); setForm({ placementKey: '', name: '', description: '', dimensions: '', maxAds: '1' }); };

  const openEdit = (p: any) => {
    setEditingId(p.id);
    setForm({ placementKey: p.placement_key, name: p.name, description: p.description || '', dimensions: p.dimensions || '', maxAds: String(p.max_ads) });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { placementKey: form.placementKey, name: form.name, description: form.description || undefined, dimensions: form.dimensions || undefined, maxAds: Number(form.maxAds) };
    if (editingId) updateMutation.mutate({ id: editingId, data: payload });
    else createMutation.mutate(payload);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[var(--color-text-muted)]">{placements?.length || 0} placement(s)</p>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">+ New Placement</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border border-[var(--color-border)]">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editingId ? 'Edit Placement' : 'New Placement'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Placement Key</label>
              <Can permission="ads.edit.placement">
                <input value={form.placementKey} onChange={e => setForm((f: any) => ({ ...f, placementKey: e.target.value }))} required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </Can>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name</label>
              <Can permission="ads.edit.title">
                <input value={form.name} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </Can>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Max Ads</label>
              <input type="number" min="1" value={form.maxAds} onChange={e => setForm((f: any) => ({ ...f, maxAds: e.target.value }))}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Description</label>
              <Can permission="ads.edit.content">
                <input value={form.description} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </Can>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Dimensions (e.g. 728x90)</label>
              <input value={form.dimensions} onChange={e => setForm((f: any) => ({ ...f, dimensions: e.target.value }))}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Can permission={editingId ? 'ads.edit' : 'ads.create'}>
              <button type="submit" disabled={createMutation.isPending || updateMutation.isPending}
                className="px-5 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">
                {editingId ? 'Update' : 'Create'}
              </button>
            </Can>
            <button type="button" onClick={resetForm} className="px-5 py-2 border rounded-[var(--radius-md)] text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Key</th>
              <th className="px-4 py-3 font-medium">Dimensions</th>
              <th className="px-4 py-3 font-medium">Max Ads</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium w-36"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {placements?.map((p: any) => (
              <tr key={p.id} className={`hover:bg-[var(--color-bg)]/30 ${editingId === p.id ? 'bg-[var(--color-primary)]/10 border-l-2 border-[var(--color-primary)]' : 'border-l-2 border-transparent'}`}>
                <td className="px-4 py-3 font-medium text-[var(--color-text)]">{p.name}</td>
                <td className="px-4 py-3 text-xs font-mono text-[var(--color-text-muted)]">{p.placement_key}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{p.dimensions || '—'}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{p.max_ads}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.is_active ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]'}`}>
                    {p.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(p)}
                      className="text-xs px-2 py-1 border rounded-[var(--radius-md)] hover:bg-[var(--color-bg)]">Edit</button>
                    <button onClick={() => toggleMutation.mutate(p.id)}
                      className={`text-xs px-2 py-1 border rounded-[var(--radius-md)] ${p.is_active ? 'text-[var(--color-warning-text)]' : 'text-[var(--color-success-text)]'}`}>
                      {p.is_active ? 'Deact.' : 'Act.'}
                    </button>
                    <button onClick={() => { if (confirm(`Delete "${p.name}"?`)) deleteMutation.mutate(p.id); }}
                      className="text-xs px-2 py-1 border rounded-[var(--radius-md)] text-[var(--color-error)]">Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
