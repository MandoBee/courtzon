import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Modal, Spinner } from '../../../components/ui';
import { useToast } from '../../../components/ui/Toast';

const ATTENDANCE_BADGE: Record<string, string> = {
  present: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  absent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  late: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  early_leave: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  excused: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [empFilter, setEmpFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showClockModal, setShowClockModal] = useState(false);
  const [clockForm, setClockForm] = useState({ employee_id: '' as string | number, type: 'in' as string, timestamp: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'hr', 'attendance', page, dateFrom, dateTo, empFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (empFilter) params.set('employee_id', empFilter);
      if (statusFilter) params.set('status', statusFilter);
      return api.get(`/admin/hr/attendance?${params.toString()}`).then((r: any) => r.data);
    },
  });

  const { data: employees } = useQuery({
    queryKey: ['admin', 'hr', 'employees-simple'],
    queryFn: () => api.get('/admin/hr/employees?limit=200').then((r: any) => r.data.data || []),
    staleTime: 60000,
  });

  const records: any[] = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);
  const empList: any[] = employees || [];

  const clockMutation = useMutation({
    mutationFn: (payload: any) => api.post('/admin/hr/attendance/clock', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'hr', 'attendance'] }); setShowClockModal(false); setClockForm({ employee_id: '', type: 'in', timestamp: '' }); showToast('Clock recorded!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Attendance</h1>
        <Button onClick={() => setShowClockModal(true)}>+ Clock In/Out</Button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">From</label>
          <input value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} type="date"
            className="px-3 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-surface)]" />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">To</label>
          <input value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} type="date"
            className="px-3 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-surface)]" />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">Employee</label>
          <select value={empFilter} onChange={e => { setEmpFilter(e.target.value); setPage(1); }}
            className="px-3 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-surface)]">
            <option value="">All</option>
            {empList.map((e: any) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">Status</label>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-surface)]">
            <option value="">All</option>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="late">Late</option>
            <option value="early_leave">Early Leave</option>
            <option value="excused">Excused</option>
          </select>
        </div>
      </div>

      {isLoading ? <Spinner /> : (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Employee</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Date</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Clock In</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Clock Out</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Status</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {records.map((r: any) => (
                <tr key={r.id} className="hover:bg-[var(--color-bg)]/30">
                  <td className="px-4 py-3 text-[var(--color-text)]">{r.employee_name || r.employee_id}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{r.date ? new Date(r.date).toLocaleDateString('en-GB') : '—'}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{r.clock_in || '—'}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{r.clock_out || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${ATTENDANCE_BADGE[r.status] || ''}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)] max-w-[200px] truncate">{r.notes || '—'}</td>
                </tr>
              ))}
              {!records.length && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--color-text-muted)]">No attendance records found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between mt-4">
        <span className="text-xs text-[var(--color-text-muted)]">{total} total</span>
        <div className="flex items-center gap-3">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border disabled:opacity-30">Previous</button>
          <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {totalPages || 1}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border disabled:opacity-30">Next</button>
        </div>
      </div>

      <Modal open={showClockModal} onClose={() => setShowClockModal(false)} title="Record Clock In / Out">
        <form onSubmit={(e) => { e.preventDefault(); if (!clockForm.employee_id) return; clockMutation.mutate({ ...clockForm, employee_id: Number(clockForm.employee_id) }); }}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Employee *</label>
              <select value={String(clockForm.employee_id)} onChange={e => setClockForm({ ...clockForm, employee_id: e.target.value })} required
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                <option value="">Select Employee</option>
                {empList.map((e: any) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Type</label>
              <select value={clockForm.type} onChange={e => setClockForm({ ...clockForm, type: e.target.value })}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                <option value="in">Clock In</option>
                <option value="out">Clock Out</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Timestamp</label>
              <input value={clockForm.timestamp} onChange={e => setClockForm({ ...clockForm, timestamp: e.target.value })} type="datetime-local"
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" type="button" onClick={() => setShowClockModal(false)}>Cancel</Button>
            <Button type="submit" loading={clockMutation.isPending}>Record</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
