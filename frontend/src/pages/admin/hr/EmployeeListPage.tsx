import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Modal, Spinner } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  onboarding: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  on_leave: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  terminated: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  archived: 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};

export default function EmployeeListPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    employee_code: '', full_name: '', email: '', phone: '',
    department_id: '' as string | number, position: '', hire_date: '',
    user_id: '' as string | number,
  });
  const [lifecycleId, setLifecycleId] = useState<number | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'hr', 'employees', page, search, deptFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (search) params.set('search', search);
      if (deptFilter) params.set('department_id', deptFilter);
      if (statusFilter) params.set('status', statusFilter);
      return api.get(`/admin/hr/employees?${params.toString()}`).then((r: any) => r.data);
    },
  });

  const { data: departments } = useQuery({
    queryKey: ['admin', 'hr', 'departments-list'],
    queryFn: () => api.get('/admin/hr/departments').then((r: any) => r.data.data || r.data),
    staleTime: 60000,
  });

  const employees = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);
  const deptList: any[] = departments || [];

  const resetForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm({ employee_code: '', full_name: '', email: '', phone: '', department_id: '', position: '', hire_date: '', user_id: '' });
  };

  const openEdit = (e: any) => {
    setEditing(e);
    setForm({
      employee_code: e.employee_code || '',
      full_name: e.full_name || '',
      email: e.email || '',
      phone: e.phone || '',
      department_id: e.department_id ?? '',
      position: e.position || '',
      hire_date: e.hire_date ? e.hire_date.slice(0, 10) : '',
      user_id: e.user_id ?? '',
    });
    setShowForm(true);
  };

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      editing
        ? api.put(`/admin/hr/employees/${editing.id}`, payload)
        : api.post('/admin/hr/employees', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'hr', 'employees'] });
      resetForm();
      showToast(editing ? 'Employee updated!' : 'Employee created!');
    },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const lifecycleMutation = useMutation({
    mutationFn: ({ id, action }: any) => api.post(`/admin/hr/employees/${id}/${action}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'hr', 'employees'] });
      setLifecycleId(null);
      setLifecycleAction('');
      showToast(`Employee ${lifecycleAction}ed!`);
    },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name) return;
    const payload = {
      ...form,
      department_id: form.department_id === '' ? null : Number(form.department_id),
      user_id: form.user_id === '' ? null : Number(form.user_id),
    };
    saveMutation.mutate(payload);
  };

  const confirmLifecycle = (id: number, action: string) => {
    setLifecycleId(id);
    setLifecycleAction(action);
  };

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Employees</h1>
        <Can permission="hr.employees.manage">
          <Button onClick={() => { resetForm(); setShowForm(true); }}>+ New Employee</Button>
        </Can>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by name or code..."
          className="px-3 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-surface)] min-w-[200px]" />
        <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(1); }}
          className="px-3 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-surface)]">
          <option value="">All Departments</option>
          {deptList.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-surface)]">
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="onboarding">Onboarding</option>
          <option value="active">Active</option>
          <option value="on_leave">On Leave</option>
          <option value="suspended">Suspended</option>
          <option value="terminated">Terminated</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit}
          className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editing ? 'Edit Employee' : 'New Employee'}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Employee Code</label>
              <input value={form.employee_code} onChange={e => setForm({ ...form, employee_code: e.target.value })}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Full Name *</label>
              <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Email</label>
              <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email"
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Phone</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Department</label>
              <select value={String(form.department_id)} onChange={e => setForm({ ...form, department_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                <option value="">None</option>
                {deptList.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Position</label>
              <input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Hire Date</label>
              <input value={form.hire_date} onChange={e => setForm({ ...form, hire_date: e.target.value })} type="date"
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">User ID (optional)</label>
              <input value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })} type="number"
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Button type="submit" loading={saveMutation.isPending}>
              {editing ? 'Update' : 'Create'}
            </Button>
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
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Department</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Position</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Status</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Hire Date</th>
              <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {employees.map((emp: any) => (
              <tr key={emp.id} className="hover:bg-[var(--color-bg)]/30">
                <td className="px-4 py-3 text-xs font-mono text-[var(--color-text-muted)]">{emp.employee_code || '—'}</td>
                <td className="px-4 py-3">
                  <Link to={`/admin/hr/employees/${emp.id}`} className="font-medium text-[var(--color-text)] hover:text-[var(--color-primary)]">
                    {emp.full_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{emp.department_name || '—'}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{emp.position || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${STATUS_BADGE[emp.employment_status] || ''}`}>
                    {emp.employment_status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">
                  {emp.hire_date ? new Date(emp.hire_date).toLocaleDateString('en-GB') : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <Can permission="hr.employees.manage">
                    <button onClick={() => openEdit(emp)} className="text-xs text-[var(--color-primary)] hover:underline mr-2">Edit</button>
                    {emp.employment_status === 'draft' && (
                      <button onClick={() => confirmLifecycle(emp.id, 'activate')} className="text-xs text-green-600 hover:underline mr-1">Activate</button>
                    )}
                    {emp.employment_status === 'active' && (
                      <>
                        <button onClick={() => confirmLifecycle(emp.id, 'suspend')} className="text-xs text-amber-600 hover:underline mr-1">Suspend</button>
                        <button onClick={() => confirmLifecycle(emp.id, 'terminate')} className="text-xs text-red-600 hover:underline mr-1">Terminate</button>
                      </>
                    )}
                    {['terminated', 'suspended'].includes(emp.employment_status) && (
                      <button onClick={() => confirmLifecycle(emp.id, 'archive')} className="text-xs text-gray-500 hover:underline mr-1">Archive</button>
                    )}
                  </Can>
                </td>
              </tr>
            ))}
            {!employees.length && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--color-text-muted)]">No employees found</td></tr>
            )}
          </tbody>
        </table>
      </div>

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

      <Modal open={lifecycleId !== null} onClose={() => { setLifecycleId(null); setLifecycleAction(''); }}
        title={`${lifecycleAction.charAt(0).toUpperCase() + lifecycleAction.slice(1)} Employee`}>
        <p className="text-sm text-[var(--color-text-muted)] mb-6">
          Are you sure you want to {lifecycleAction} this employee?
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => { setLifecycleId(null); setLifecycleAction(''); }}>Cancel</Button>
          <Button onClick={() => lifecycleMutation.mutate({ id: lifecycleId!, action: lifecycleAction })}
            loading={lifecycleMutation.isPending}
            className="bg-[var(--color-primary)] text-white">
            Confirm
          </Button>
        </div>
      </Modal>
    </div>
  );
}
