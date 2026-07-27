import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Modal, Spinner } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

const LEAVE_STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  completed: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
};

export default function LeaveManagementPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [tab, setTab] = useState<'requests' | 'types'>('requests');
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [editingType, setEditingType] = useState<any>(null);
  const [requestForm, setRequestForm] = useState({
    employee_id: '' as string | number, leave_type_id: '' as string | number,
    start_date: '', end_date: '', reason: '',
  });
  const [typeForm, setTypeForm] = useState({ name: '', default_days: 0, is_paid: true, requires_approval: true });
  const [selectedStatus, setSelectedStatus] = useState('');
  const [actionTarget, setActionTarget] = useState<{ id: number; action: string } | null>(null);

  const { data: requestsData, isLoading: loadingRequests } = useQuery({
    queryKey: ['admin', 'hr', 'leave', 'requests', selectedStatus],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedStatus) params.set('status', selectedStatus);
      return api.get(`/admin/hr/leave/requests?${params.toString()}`).then((r: any) => r.data.data || r.data);
    },
    enabled: tab === 'requests',
  });

  const { data: typesData, isLoading: loadingTypes } = useQuery({
    queryKey: ['admin', 'hr', 'leave', 'types'],
    queryFn: () => api.get('/admin/hr/leave/types').then((r: any) => r.data.data || r.data),
    enabled: tab === 'types',
  });

  const { data: employees } = useQuery({
    queryKey: ['admin', 'hr', 'employees-simple'],
    queryFn: () => api.get('/admin/hr/employees?limit=200').then((r: any) => r.data.data || []),
    staleTime: 60000,
  });

  const requests: any[] = requestsData || [];
  const types: any[] = typesData || [];
  const empList: any[] = employees || [];

  const createRequestMutation = useMutation({
    mutationFn: (payload: any) => api.post('/admin/hr/leave/requests', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'hr', 'leave'] }); setShowRequestForm(false); setRequestForm({ employee_id: '', leave_type_id: '', start_date: '', end_date: '', reason: '' }); showToast('Leave request created!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: any) => api.post(`/admin/hr/leave/requests/${id}/${action}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'hr', 'leave'] }); setActionTarget(null); showToast(`Request ${actionTarget?.action}ed!`); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const createTypeMutation = useMutation({
    mutationFn: (payload: any) => api.post('/admin/hr/leave/types', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'hr', 'leave', 'types'] }); setShowTypeForm(false); setEditingType(null); setTypeForm({ name: '', default_days: 0, is_paid: true, requires_approval: true }); showToast('Leave type created!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const updateTypeMutation = useMutation({
    mutationFn: ({ id, payload }: any) => api.put(`/admin/hr/leave/types/${id}`, payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'hr', 'leave', 'types'] }); setShowTypeForm(false); setEditingType(null); setTypeForm({ name: '', default_days: 0, is_paid: true, requires_approval: true }); showToast('Leave type updated!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const deleteTypeMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/hr/leave/types/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'hr', 'leave', 'types'] }); showToast('Leave type deleted!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  return (
    <Can permission="hr.leave.view">
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-1 bg-[var(--color-bg)] rounded-[var(--radius-lg)] p-1 border">
            <button onClick={() => setTab('requests')}
              className={`px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] transition-colors ${tab === 'requests' ? 'bg-[var(--color-surface)] shadow-sm text-[var(--color-text)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
              Requests
            </button>
            <button onClick={() => setTab('types')}
              className={`px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] transition-colors ${tab === 'types' ? 'bg-[var(--color-surface)] shadow-sm text-[var(--color-text)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
              Leave Types
            </button>
          </div>
          <Can permission="hr.leave.manage">
            {tab === 'requests' && <Button onClick={() => setShowRequestForm(true)}>+ New Request</Button>}
            {tab === 'types' && <Button onClick={() => { setEditingType(null); setTypeForm({ name: '', default_days: 0, is_paid: true, requires_approval: true }); setShowTypeForm(true); }}>+ New Type</Button>}
          </Can>
        </div>

        {tab === 'requests' && (
          <>
            <div className="flex gap-3 mb-4">
              <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}
                className="px-3 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-surface)]">
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            {loadingRequests ? <Spinner /> : (
              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                      <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Employee</th>
                      <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Leave Type</th>
                      <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Dates</th>
                      <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Days</th>
                      <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Reason</th>
                      <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {requests.map((r: any) => (
                      <tr key={r.id} className="hover:bg-[var(--color-bg)]/30">
                        <td className="px-4 py-3 text-[var(--color-text)]">{r.employee_name || r.employee_id}</td>
                        <td className="px-4 py-3 text-[var(--color-text-muted)]">{r.leave_type_name || '—'}</td>
                        <td className="px-4 py-3 text-[var(--color-text-muted)]">
                          {r.start_date ? new Date(r.start_date).toLocaleDateString('en-GB') : '—'} — {r.end_date ? new Date(r.end_date).toLocaleDateString('en-GB') : '—'}
                        </td>
                        <td className="px-4 py-3 text-[var(--color-text-muted)]">{r.days || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${LEAVE_STATUS_BADGE[r.status] || ''}`}>{r.status}</span>
                        </td>
                        <td className="px-4 py-3 text-[var(--color-text-muted)] max-w-[200px] truncate">{r.reason || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          {r.status === 'submitted' && (
                            <Can permission="hr.leave.manage">
                              <button onClick={() => setActionTarget({ id: r.id, action: 'approve' })} className="text-xs text-green-600 hover:underline mr-2">Approve</button>
                              <button onClick={() => setActionTarget({ id: r.id, action: 'reject' })} className="text-xs text-red-600 hover:underline mr-2">Reject</button>
                            </Can>
                          )}
                          {['draft', 'submitted'].includes(r.status) && (
                            <button onClick={() => setActionTarget({ id: r.id, action: 'cancel' })} className="text-xs text-gray-600 hover:underline">Cancel</button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!requests.length && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--color-text-muted)]">No leave requests found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'types' && (
          loadingTypes ? <Spinner /> : (
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Default Days</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Paid</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Requires Approval</th>
                    <Can permission="hr.leave.manage">
                      <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
                    </Can>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {types.map((t: any) => (
                    <tr key={t.id} className="hover:bg-[var(--color-bg)]/30">
                      <td className="px-4 py-3 text-sm text-[var(--color-text)]">{t.name}</td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">{t.default_days ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={t.is_paid ? 'text-green-600' : 'text-red-600'}>{t.is_paid ? 'Yes' : 'No'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={t.requires_approval ? 'text-green-600' : 'text-gray-500'}>{t.requires_approval ? 'Yes' : 'No'}</span>
                      </td>
                      <Can permission="hr.leave.manage">
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => { setEditingType(t); setTypeForm({ name: t.name, default_days: t.default_days ?? 0, is_paid: !!t.is_paid, requires_approval: !!t.requires_approval }); setShowTypeForm(true); }}
                            className="text-xs text-[var(--color-primary)] hover:underline mr-2">Edit</button>
                          <button onClick={() => { if (confirm('Delete this leave type?')) deleteTypeMutation.mutate(t.id); }}
                            className="text-xs text-[var(--color-error)] hover:underline">Delete</button>
                        </td>
                      </Can>
                    </tr>
                  ))}
                  {!types.length && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-[var(--color-text-muted)]">No leave types found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )
        )}

        <Modal open={showRequestForm} onClose={() => setShowRequestForm(false)} title="New Leave Request">
          <form onSubmit={(e) => { e.preventDefault(); if (!requestForm.employee_id || !requestForm.leave_type_id || !requestForm.start_date || !requestForm.end_date) return; createRequestMutation.mutate({ ...requestForm, employee_id: Number(requestForm.employee_id), leave_type_id: Number(requestForm.leave_type_id) }); }}>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Employee *</label>
                <select value={String(requestForm.employee_id)} onChange={e => setRequestForm({ ...requestForm, employee_id: e.target.value })} required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                  <option value="">Select Employee</option>
                  {empList.map((e: any) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Leave Type *</label>
                <select value={String(requestForm.leave_type_id)} onChange={e => setRequestForm({ ...requestForm, leave_type_id: e.target.value })} required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                  <option value="">Select Type</option>
                  {types.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">Start Date *</label>
                  <input value={requestForm.start_date} onChange={e => setRequestForm({ ...requestForm, start_date: e.target.value })} type="date" required
                    className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">End Date *</label>
                  <input value={requestForm.end_date} onChange={e => setRequestForm({ ...requestForm, end_date: e.target.value })} type="date" required
                    className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Reason</label>
                <textarea value={requestForm.reason} onChange={e => setRequestForm({ ...requestForm, reason: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="ghost" type="button" onClick={() => setShowRequestForm(false)}>Cancel</Button>
              <Button type="submit" loading={createRequestMutation.isPending}>Submit</Button>
            </div>
          </form>
        </Modal>

        <Modal open={showTypeForm} onClose={() => { setShowTypeForm(false); setEditingType(null); }} title={editingType ? 'Edit Leave Type' : 'New Leave Type'}>
          <form onSubmit={(e) => { e.preventDefault(); if (!typeForm.name) return; if (editingType) { updateTypeMutation.mutate({ id: editingType.id, payload: typeForm }); } else { createTypeMutation.mutate(typeForm); } }}>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label>
                <input value={typeForm.name} onChange={e => setTypeForm({ ...typeForm, name: e.target.value })} required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Default Days</label>
                <input value={typeForm.default_days} onChange={e => setTypeForm({ ...typeForm, default_days: Number(e.target.value) })} type="number" min={0}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={typeForm.is_paid} onChange={e => setTypeForm({ ...typeForm, is_paid: e.target.checked })}
                    className="rounded border-[var(--color-border)]" />
                  Paid
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={typeForm.requires_approval} onChange={e => setTypeForm({ ...typeForm, requires_approval: e.target.checked })}
                    className="rounded border-[var(--color-border)]" />
                  Requires Approval
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="ghost" type="button" onClick={() => { setShowTypeForm(false); setEditingType(null); }}>Cancel</Button>
              <Button type="submit" loading={createTypeMutation.isPending || updateTypeMutation.isPending}>
                {editingType ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Modal>

        <Modal open={actionTarget !== null} onClose={() => setActionTarget(null)}
          title={`${actionTarget?.action.charAt(0).toUpperCase() + (actionTarget?.action.slice(1) || '')} Leave Request`}>
          <p className="text-sm text-[var(--color-text-muted)] mb-6">
            Are you sure you want to {actionTarget?.action} this leave request?
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setActionTarget(null)}>Cancel</Button>
            <Button onClick={() => actionMutation.mutate({ id: actionTarget!.id, action: actionTarget!.action })}
              loading={actionMutation.isPending}
              className="bg-[var(--color-primary)] text-white">Confirm</Button>
          </div>
        </Modal>
      </div>
    </Can>
  );
}
