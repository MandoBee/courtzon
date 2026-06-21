import { useState, useEffect } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { formatPrice } from '../../../utils/currency';
import { EntityImage } from '../../../components/ui';

export default function ResourceListPage() {
  const { branchId } = useParams();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [formTab, setFormTab] = useState<'basic' | 'pricing' | 'maintenance' | 'peakHours'>('basic');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState({
    name: '', resourceTypeId: 1, sportId: undefined as number | undefined,
    description: '', capacity: 1, hourlyPrice: 0, slotDuration: undefined as number | undefined,
    pricingType: 'per_hour' as 'per_hour' | 'fixed',
    peakHourValue: undefined as number | undefined,
    images: [] as string[],
    openingTime: '', closingTime: '',
  });
  const [peakHours, setPeakHours] = useState<any[]>(
    [0,1,2,3,4,5,6].map(d => ({ dayOfWeek: d, hasPeak: false, startTime: '', endTime: '' }))
  );
  const [maintenanceRecords, setMaintenanceRecords] = useState<any[]>([]);
  const [maintenanceForm, setMaintenanceForm] = useState({ title: '', description: '', startDate: '', endDate: '', startTime: '', endTime: '', reason: '', status: 'scheduled' });
  const [editingMaintId, setEditingMaintId] = useState<number | null>(null);

  const { data: types } = useQuery({
    queryKey: ['resource-types'],
    queryFn: () => api.get('/resource-types').then((r: any) => r.data.data),
  });

  const { data: sports } = useQuery({
    queryKey: ['sports'],
    queryFn: () => api.get('/sports').then((r: any) => r.data).catch(() => []),
  });

  const { data: resources, isLoading } = useQuery({
    queryKey: ['resources', branchId],
    queryFn: () => api.get(`/branches/${branchId}/resources`).then((r: any) => r.data.data),
    enabled: !!branchId,
  });

  const { data: branch } = useQuery({
    queryKey: ['branch', branchId],
    queryFn: () => api.get(`/branches/${branchId}`).then((r: any) => r.data),
    enabled: !!branchId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/resources', { ...data, branchId: Number(branchId) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources', branchId] });
      resetForm();
      showToast('Resource created successfully!');
    },
    onError: (err: any) => { showToast('Failed to create resource: ' + getErrorMessage(err), 'error'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/resources/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources', branchId] });
      resetForm();
      showToast('Resource updated successfully!');
    },
    onError: (err: any) => { showToast('Failed to update resource: ' + getErrorMessage(err), 'error'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/resources/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['resources', branchId] }); showToast('Resource deleted!'); },
    onError: (err: any) => { showToast('Failed to delete resource: ' + getErrorMessage(err), 'error'); },
  });

  const { data: maintData } = useQuery({
    queryKey: ['resource-maintenance', editingId],
    queryFn: () => api.get(`/resources/${editingId}/maintenance`).then((r: any) => r.data.data),
    enabled: !!editingId && formTab === 'maintenance',
  });

  useEffect(() => {
    if (maintData) setMaintenanceRecords(maintData);
  }, [maintData]);

  const createMaintMutation = useMutation({
    mutationFn: (data: any) => api.post(`/resources/${editingId}/maintenance`, data),
    onSuccess: (res: any) => {
      setMaintenanceRecords(res.data.data);
      setMaintenanceForm({ title: '', description: '', startDate: '', endDate: '', startTime: '', endTime: '', reason: '', status: 'scheduled' });
      setEditingMaintId(null);
      showToast('Maintenance record created!');
    },
    onError: (err: any) => showToast('Failed to create maintenance: ' + getErrorMessage(err), 'error'),
  });

  const updateMaintMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/resources/maintenance/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resource-maintenance', editingId] });
      setMaintenanceForm({ title: '', description: '', startDate: '', endDate: '', startTime: '', endTime: '', reason: '', status: 'scheduled' });
      setEditingMaintId(null);
      showToast('Maintenance record updated!');
    },
    onError: (err: any) => showToast('Failed to update maintenance: ' + getErrorMessage(err), 'error'),
  });

  const deleteMaintMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/resources/maintenance/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resource-maintenance', editingId] });
      showToast('Maintenance record deleted!');
    },
    onError: (err: any) => showToast('Failed to delete maintenance: ' + getErrorMessage(err), 'error'),
  });

  const peakHoursMutation = useMutation({
    mutationFn: ({ id, peakHours: ph }: { id: number; peakHours: any[] }) => api.put(`/resources/${id}/peak-hours`, { peakHours: ph }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources', branchId] });
      showToast('Peak hours updated!');
    },
    onError: (err: any) => showToast('Failed to update peak hours: ' + getErrorMessage(err), 'error'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => api.put(`/resources/${id}`, { isActive }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['resources', branchId] }); showToast('Resource status toggled!'); },
    onError: (err: any) => { showToast('Failed to toggle resource status: ' + getErrorMessage(err), 'error'); },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormTab('basic');
    setForm({ name: '', resourceTypeId: 1, sportId: undefined, description: '', capacity: 1, hourlyPrice: 0, slotDuration: undefined, pricingType: 'per_hour', peakHourValue: undefined, images: [], openingTime: '', closingTime: '' });
    setPeakHours([0,1,2,3,4,5,6].map(d => ({ dayOfWeek: d, hasPeak: false, startTime: '', endTime: '' })));
    setMaintenanceRecords([]);
    setMaintenanceForm({ title: '', description: '', startDate: '', endDate: '', startTime: '', endTime: '', reason: '', status: 'scheduled' });
    setEditingMaintId(null);
  };

  const handleEditStart = (r: any) => {
    setEditingId(r.id);
    setFormTab('basic');
    setForm({
      name: r.name,
      resourceTypeId: r.resource_type_id,
      sportId: r.sport_id ?? undefined,
      description: r.description || '',
      capacity: r.capacity || 1,
      hourlyPrice: r.hourly_price || 0,
      slotDuration: r.slot_duration ?? undefined,
      pricingType: r.pricing_type || 'per_hour',
      peakHourValue: r.peak_hour_value ?? undefined,
      images: (typeof r.images === 'string' ? JSON.parse(r.images) : r.images) || [],
      openingTime: r.opening_time || '',
      closingTime: r.closing_time || '',
    });
    const phs = r.peak_hours || [];
    if (phs.length) {
      setPeakHours([0,1,2,3,4,5,6].map(d => {
        const found = phs.find((ph: any) => ph.dayOfWeek === d);
        return found || { dayOfWeek: d, hasPeak: false, startTime: '', endTime: '' };
      }));
    } else {
      setPeakHours([0,1,2,3,4,5,6].map(d => ({ dayOfWeek: d, hasPeak: false, startTime: '', endTime: '' })));
    }
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form, peakHours };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const filtered = resources?.filter((r: any) =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) || (r.resource_type_name || '').toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="animate-spin h-8 w-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Resources</h1>
          <Link to="/admin/organisations" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors">← Back to Organisations</Link>
        </div>
        <Can permission="resources.create">
          <button onClick={() => { showForm ? resetForm() : (resetForm(), setShowForm(true)); }}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:opacity-90 transition-opacity">
            {showForm && !editingId ? 'Cancel' : '+ New Resource'}
          </button>
        </Can>
      </div>

      <div className="mb-4 relative max-w-sm">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] text-sm">🔍</span>
        <input type="text" value={search} onChange={(e: any) => setSearch(e.target.value)} placeholder="Search resources..."
          className="w-full pl-9 pr-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" />
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 mb-6 space-y-3 border border-[var(--color-border)]">
          <h3 className="font-semibold text-[var(--color-text)] text-sm">{editingId ? `Edit Resource — ${form.name}` : 'New Resource'}</h3>
          <div className="flex gap-1 border-b border-[var(--color-border)]">
            {(['basic', 'pricing', 'maintenance', 'peakHours'] as const).map((t: any) => (
              <Can key={t} permission={`resources.edit.${t}`}>
              <button key={t} type="button" onClick={() => setFormTab(t)}
                className={`px-4 py-2 text-sm font-medium rounded-t-[var(--radius-md)] transition-colors ${formTab === t ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
                {t === 'basic' ? 'Basic' : t === 'pricing' ? 'Pricing' : t === 'maintenance' ? 'Maintenance' : 'Peak Hours'}
              </button>
              </Can>
            ))}
          </div>

          {formTab === 'basic' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Can permission="resources.edit.name">
                <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" /></div>
                </Can>
                <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Type</label>
                  <select value={form.resourceTypeId} onChange={e => setForm(f => ({ ...f, resourceTypeId: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]">
                    {(types || []).map((t: any) => <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>)}
                  </select></div>
              </div>
              <Can permission="resources.edit.description">
              <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Description (optional)</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" rows={2} /></div>
              </Can>
              <div className="grid grid-cols-2 gap-3">
                <Can permission="resources.edit.sport">
                <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Sport (optional)</label>
                  <select value={form.sportId || ''} onChange={e => setForm(f => ({ ...f, sportId: e.target.value ? Number(e.target.value) : undefined }))}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]">
                    <option value="">None</option>
                    {(Array.isArray(sports) ? sports : [])?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select></div>
                </Can>
                <Can permission="resources.edit.capacity">
                <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Capacity (optional)</label>
                  <input type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" min={1} /></div>
                </Can>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Opening Time</label>
                  <input type="time" value={form.openingTime} onChange={e => setForm(f => ({ ...f, openingTime: e.target.value }))}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" />
                  {branch?.opening_time && <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Must be ≥ branch: {branch.opening_time}</p>}</div>
                <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Closing Time</label>
                  <input type="time" value={form.closingTime} onChange={e => setForm(f => ({ ...f, closingTime: e.target.value }))}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" />
                  {branch?.closing_time && <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Must be ≤ branch: {branch.closing_time}</p>}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Images</label>
                <input type="file" accept="image/*" multiple onChange={async (e: any) => {
                  const files = e.target.files; if (!files) return;
                  const urls: string[] = [];
                  for (const f of Array.from(files) as File[]) {
                    const fd = new FormData(); fd.append('file', f);
                    try { const res = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }); urls.push(res.data.url); } catch { /* skip */ }
                  }
                  setForm(f => ({ ...f, images: [...f.images, ...urls] }));
                }} className="w-full" />
                {form.images.length > 0 && (
                  <div className="flex gap-2 mt-1">
                    {form.images.map((url: string, i: number) => (
                      <div key={i} className="relative w-12 h-12 rounded border overflow-hidden">
                        <EntityImage src={url} name={form.name || 'Resource'} className="w-full h-full rounded-none text-xs" />
                        <button type="button" onClick={() => setForm(f => ({ ...f, images: f.images.filter((_: string, j: number) => j !== i) }))}
                          className="absolute top-0 right-0 bg-[var(--color-error)] text-white text-[9px] px-1 leading-tight">&times;</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {formTab === 'pricing' && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                <Can permission="resources.edit.price">
                <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Hourly Price (EGP)</label>
                  <input type="number" value={form.hourlyPrice} onChange={e => setForm(f => ({ ...f, hourlyPrice: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" min={0} /></div>
                </Can>
                <Can permission="resources.edit.duration">
                <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Slot (min)</label>
                  <select value={form.slotDuration ?? ''} onChange={e => setForm(f => ({ ...f, slotDuration: e.target.value ? Number(e.target.value) : undefined }))}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]">
                    <option value="">Default</option>
                    {[10,15,30,60,90,120].map(v => <option key={v} value={v}>{v} min</option>)}
                  </select></div>
                </Can>
                <Can permission="resources.edit.pricing-type">
                <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Peak Pricing Type</label>
                  <select value={form.pricingType} onChange={e => setForm(f => ({ ...f, pricingType: e.target.value as 'per_hour' | 'fixed' }))}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]">
                    <option value="per_hour">% Percent</option>
                    <option value="fixed">Fixed</option>
                  </select></div>
                </Can>
                <div><label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Peak Hour Value</label>
                  <input type="number" value={form.peakHourValue || ''} onChange={e => setForm(f => ({ ...f, peakHourValue: e.target.value ? Number(e.target.value) : undefined }))}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" min={0} />
                  {form.pricingType === 'per_hour' && (
                    <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Insert 10% as 10, not 0.10</p>
                  )}</div>
              </div>
            </div>
          )}

          {formTab === 'maintenance' && editingId && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-3 border rounded-[var(--radius-md)] bg-[var(--color-bg)] bg-[var(--color-surface)]/30">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Title</label>
                  <input value={maintenanceForm.title} onChange={e => setMaintenanceForm(f => ({ ...f, title: e.target.value }))}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Start Date</label>
                  <input type="date" value={maintenanceForm.startDate} onChange={e => setMaintenanceForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">End Date</label>
                  <input type="date" value={maintenanceForm.endDate} onChange={e => setMaintenanceForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Start Time</label>
                  <input type="time" value={maintenanceForm.startTime} onChange={e => setMaintenanceForm(f => ({ ...f, startTime: e.target.value }))}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">End Time</label>
                  <input type="time" value={maintenanceForm.endTime} onChange={e => setMaintenanceForm(f => ({ ...f, endTime: e.target.value }))}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Reason</label>
                  <input value={maintenanceForm.reason} onChange={e => setMaintenanceForm(f => ({ ...f, reason: e.target.value }))}
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm text-[var(--color-text)]" />
                </div>
                <div className="flex items-end">
                  <button type="button" onClick={() => {
                    if (editingMaintId) {
                      updateMaintMutation.mutate({ id: editingMaintId, data: maintenanceForm });
                    } else {
                      createMaintMutation.mutate(maintenanceForm);
                    }
                  }}
                    className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:opacity-90 transition-opacity">
                    {editingMaintId ? 'Update' : 'Add Record'}
                  </button>
                </div>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {maintenanceRecords.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-[var(--color-bg)]">
                    <div>
                      <span className="font-medium text-[var(--color-text)]">{m.title}</span>
                      <span className="text-[var(--color-text-muted)] ml-2">
                        {m.start_date?.slice(0, 10)}{m.end_date ? ` → ${m.end_date.slice(0, 10)}` : ''}
                        {m.status && <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          m.status === 'completed' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                          m.status === 'in_progress' ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]' :
                          m.status === 'cancelled' ? 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]' : 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]'
                        }`}>{m.status.replace(/_/g, ' ')}</span>}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => {
                        setEditingMaintId(m.id);
                        setMaintenanceForm({
                          title: m.title, description: m.description || '', reason: m.reason || '',
                          startDate: m.start_date?.slice(0, 10) || '', endDate: m.end_date?.slice(0, 10) || '',
                          startTime: m.start_time || '', endTime: m.end_time || '', status: m.status || 'scheduled',
                        });
                      }}
                        className="text-xs px-2 py-1 rounded bg-[var(--color-border)] text-[var(--color-text)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-border)] transition-colors">Edit</button>
                      <button type="button" onClick={() => { if (confirm('Delete this maintenance record?')) deleteMaintMutation.mutate(m.id); }}
                        className="text-xs px-2 py-1 rounded bg-[var(--color-error-bg)] text-[var(--color-error-text)] dark:bg-red-900/30 dark:text-red-400 hover:opacity-80 transition-opacity">Delete</button>
                    </div>
                  </div>
                ))}
                {!maintenanceRecords.length && <p className="text-xs text-[var(--color-text-muted)]">No maintenance records.</p>}
              </div>
            </div>
          )}

          {formTab === 'peakHours' && editingId && (
            <div className="space-y-3">
              <div className="space-y-1 border rounded-[var(--radius-md)] p-2">
                {peakHours.map((ph: any) => (
                  <div key={ph.dayOfWeek} className="flex items-center gap-2 text-xs">
                    <label className="flex items-center gap-1.5 min-w-[100px] cursor-pointer">
                      <input type="checkbox" checked={ph.hasPeak}
                        onChange={() => setPeakHours(p => p.map((ph2: any) => ph2.dayOfWeek === ph.dayOfWeek ? { ...ph2, hasPeak: !ph2.hasPeak } : ph2))}
                        className="w-3 h-3 rounded border-[var(--color-border)]" />
                      <span className="text-[var(--color-text)]">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][ph.dayOfWeek]}</span>
                    </label>
                    {ph.hasPeak && (<>
                      <input type="time" value={ph.startTime} onChange={e => setPeakHours(p => p.map((ph2: any) => ph2.dayOfWeek === ph.dayOfWeek ? { ...ph2, startTime: e.target.value } : ph2))}
                        className="px-1.5 py-0.5 text-xs rounded border text-[var(--color-text)]" />
                      <span className="text-[var(--color-text-muted)]">to</span>
                      <input type="time" value={ph.endTime} onChange={e => setPeakHours(p => p.map((ph2: any) => ph2.dayOfWeek === ph.dayOfWeek ? { ...ph2, endTime: e.target.value } : ph2))}
                        className="px-1.5 py-0.5 text-xs rounded border text-[var(--color-text)]" />
                    </>)}
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => peakHoursMutation.mutate({ id: editingId, peakHours })}
                className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:opacity-90 transition-opacity">
                Save Peak Hours
              </button>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Can permission={editingId ? 'resources.edit' : 'resources.create'}>
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
              {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editingId ? 'Update Resource' : 'Create Resource'}
            </button>
            </Can>
            <button type="button" onClick={resetForm}
              className="px-4 py-2 border border-[var(--color-border)] text-[var(--color-text)] rounded-[var(--radius-md)] text-sm hover:bg-[var(--color-bg)] transition-colors">Cancel</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered?.map((r: any) => (
          <div key={r.id} className={`bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 border border-[var(--color-border)] hover:shadow-md transition-shadow ${editingId === r.id ? 'bg-[var(--color-primary)]/10 border-l-2 border-[var(--color-primary)]' : 'border-l-2 border-transparent'}`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-[var(--color-text)] truncate">{r.name}</h3>
                  <Can permission="resources.edit.status">
                  <button
                    onClick={() => toggleActiveMutation.mutate({ id: r.id, isActive: !r.is_active })}
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${r.is_active ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'}`}
                    title={r.is_active ? 'Active' : 'Inactive'}
                  />
                  </Can>
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {r.resource_type_name || 'Unknown type'}
                  {r.sport_name ? ` — ${r.sport_name}` : ''}
                </p>
                {r.description && <p className="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">{r.description}</p>}
              </div>
              <div className="flex gap-1.5 ml-2 flex-shrink-0">
                <Can permission="resources.edit">
                  <button onClick={() => handleEditStart(r)}
                    className="text-xs px-2 py-1 rounded bg-[var(--color-border)] text-[var(--color-text)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-border)] hover:bg-[var(--color-border)] transition-colors">Edit</button>
                </Can>
                <Can permission="resources.delete">
                  <button onClick={() => { if (confirm('Delete this resource?')) { deleteMutation.mutate(r.id); } }}
                    className="text-xs px-2 py-1 rounded bg-[var(--color-error-bg)] text-[var(--color-error-text)] dark:bg-red-900/30 dark:text-red-400 hover:opacity-80 transition-opacity">Delete</button>
                </Can>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[var(--color-info-bg)] text-[var(--color-info-text)] text-[var(--color-info-text)]">👥 {r.capacity}</span>
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400">⏱ {r.slot_duration || r.default_slot_duration || 60}min</span>
              {r.hourly_price > 0 && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[var(--color-success-bg)] text-[var(--color-success-text)] text-[var(--color-success-text)] font-medium">{formatPrice(Number(r.hourly_price))}/hr</span>
              )}
              {r.pricing_type === 'per_hour' && r.peak_hour_value != null && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400">{r.peak_hour_value}% peak</span>
              )}
              {r.pricing_type === 'fixed' && r.peak_hour_value != null && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400">{formatPrice(Number(r.peak_hour_value))} peak</span>
              )}
            </div>
          </div>
        ))}
        {(!filtered || filtered.length === 0) && (
          <div className="col-span-full text-center py-12 text-sm text-[var(--color-text-muted)]">
            {search ? 'No resources match your search.' : 'No resources found for this branch.'}
          </div>
        )}
      </div>
    </div>
  );
}
