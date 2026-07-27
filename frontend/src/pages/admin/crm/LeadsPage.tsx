import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { getErrorMessage } from '../../../utils/errors';
import { SkeletonRow } from '../../../components/ui/Skeleton';

interface Lead {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  source: string;
  status: 'new' | 'qualified' | 'converted' | 'lost';
  assigned_to: string | null;
  created_at: string;
}

const statusBadge = (status: string) => {
  const colors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700',
    qualified: 'bg-green-100 text-green-700',
    converted: 'bg-teal-100 text-teal-700',
    lost: 'bg-red-100 text-red-700',
  };
  return colors[status] || 'bg-gray-100 text-gray-500';
};

export default function LeadsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState('');
  const [status, setStatus] = useState<'new' | 'qualified' | 'converted' | 'lost'>('new');
  const [assignedTo, setAssignedTo] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'crm', 'leads'],
    queryFn: () => api.get('/admin/crm/leads').then((r: any) => r.data?.data || []),
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post('/admin/crm/leads', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'crm', 'leads'] }); resetForm(); showToast('Lead created'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: any) => api.put(`/admin/crm/leads/${id}`, payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'crm', 'leads'] }); resetForm(); showToast('Lead updated'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/crm/leads/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'crm', 'leads'] }); showToast('Lead deleted'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const resetForm = () => {
    setShowModal(false); setEditing(null); setFullName(''); setEmail(''); setPhone(''); setSource(''); setStatus('new'); setAssignedTo('');
  };

  const openEdit = (l: Lead) => {
    setEditing(l); setFullName(l.full_name); setEmail(l.email); setPhone(l.phone);
    setSource(l.source); setStatus(l.status); setAssignedTo(l.assigned_to || ''); setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName) return;
    const payload = { full_name: fullName, email, phone, source, status, assigned_to: assignedTo || null };
    if (editing) updateMutation.mutate({ id: editing.id, payload });
    else createMutation.mutate(payload);
  };

  const leads: Lead[] = Array.isArray(data) ? data : [];

  if (isLoading) return <SkeletonRow count={5} />;

  return (
    <Can permission="crm.leads.view">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Leads</h1>
          <Can permission="crm.leads.manage">
            <button onClick={() => { resetForm(); setShowModal(true); }}
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-[var(--radius-md)] hover:opacity-90">
              + New Lead
            </button>
          </Can>
        </div>

        {showModal && (
          <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
            <h3 className="font-semibold text-[var(--color-text)] mb-4">{editing ? 'Edit Lead' : 'New Lead'}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Full Name *</label>
                <input value={fullName} onChange={(e: any) => setFullName(e.target.value)} required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Email</label>
                <input value={email} onChange={(e: any) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Phone</label>
                <input value={phone} onChange={(e: any) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Source</label>
                <input value={source} onChange={(e: any) => setSource(e.target.value)}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Status</label>
                <select value={status} onChange={(e: any) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                  <option value="new">New</option>
                  <option value="qualified">Qualified</option>
                  <option value="converted">Converted</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Assigned To</label>
                <input value={assignedTo} onChange={(e: any) => setAssignedTo(e.target.value)}
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
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Email</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Source</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Status</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Assigned To</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Created</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {leads.map((l) => (
                <tr key={l.id} className="hover:bg-[var(--color-bg)]/30">
                  <td className="px-4 py-3 font-medium text-[var(--color-text)]">{l.full_name}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{l.email || '—'}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{l.phone || '—'}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{l.source || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${statusBadge(l.status)}`}>{l.status}</span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{l.assigned_to || '—'}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{new Date(l.created_at).toLocaleDateString('en-GB')}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Can permission="crm.leads.manage">
                      <button onClick={() => openEdit(l)} className="text-xs text-[var(--color-primary)] mr-2 hover:underline">Edit</button>
                      <button onClick={() => { if (confirm('Delete this lead?')) deleteMutation.mutate(l.id); }}
                        className="text-xs text-red-500 hover:underline">Delete</button>
                    </Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!leads.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No leads found</p>}
        </div>
      </div>
    </Can>
  );
}
