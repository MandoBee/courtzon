import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { Skeleton } from '../../../components/ui/Skeleton';

const EMPLOYMENT_STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  onboarding: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  on_leave: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  terminated: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  archived: 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};

const LEAVE_STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  completed: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
};

const ATTENDANCE_BADGE: Record<string, string> = {
  present: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  absent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  late: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  early_leave: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  excused: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

type Tab = 'overview' | 'contracts' | 'leave' | 'attendance';

const tabs: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'leave', label: 'Leave' },
  { key: 'attendance', label: 'Attendance' },
];

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const { data: employee, isLoading: loadingEmp } = useQuery({
    queryKey: ['admin', 'hr', 'employees', id],
    queryFn: () => api.get(`/admin/hr/employees/${id}`).then((r: any) => r.data?.data),
    enabled: !!id,
  });

  const { data: contracts, isLoading: loadingContracts } = useQuery({
    queryKey: ['admin', 'hr', 'employees', id, 'contracts'],
    queryFn: () => api.get(`/admin/hr/employees/${id}/contracts`).then((r: any) => r.data?.data || []),
    enabled: !!id && activeTab === 'contracts',
  });

  const { data: leaveRequests, isLoading: loadingLeave } = useQuery({
    queryKey: ['admin', 'hr', 'employees', id, 'leave'],
    queryFn: () => api.get(`/admin/hr/employees/${id}/leave`).then((r: any) => r.data?.data || []),
    enabled: !!id && activeTab === 'leave',
  });

  const { data: attendance, isLoading: loadingAttendance } = useQuery({
    queryKey: ['admin', 'hr', 'employees', id, 'attendance'],
    queryFn: () => api.get(`/admin/hr/employees/${id}/attendance`).then((r: any) => r.data?.data || []),
    enabled: !!id && activeTab === 'attendance',
  });

  if (loadingEmp) {
    return (
      <div>
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-32 mb-4" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!employee) {
    return <div className="text-center py-12 text-[var(--color-text-muted)]">Employee not found</div>;
  }

  return (
    <Can permission="hr.employees.view">
      <div>
        <Link to="/admin/hr/employees" className="text-sm text-[var(--color-primary)] hover:underline mb-4 inline-block">&larr; Back to Employees</Link>

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text)]">{employee.full_name}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-[var(--color-text-muted)]">
                <span>{employee.employee_code}</span>
                {employee.department_name && <span>&middot; {employee.department_name}</span>}
                {employee.position && <span>&middot; {employee.position}</span>}
              </div>
            </div>
            <span className={`px-3 py-1 text-xs font-medium rounded-full ${EMPLOYMENT_STATUS_BADGE[employee.employment_status] || ''}`}>
              {employee.employment_status}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
            {employee.email && <div><span className="text-[var(--color-text-muted)]">Email:</span> {employee.email}</div>}
            {employee.phone && <div><span className="text-[var(--color-text-muted)]">Phone:</span> {employee.phone}</div>}
            {employee.hire_date && <div><span className="text-[var(--color-text-muted)]">Hire Date:</span> {new Date(employee.hire_date).toLocaleDateString('en-GB')}</div>}
          </div>
        </div>

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)]">
          <div className="flex border-b border-[var(--color-border)]">
            {tabs.map((tab) => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {activeTab === 'overview' && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div><span className="text-[var(--color-text-muted)]">Date of Birth:</span> {employee.date_of_birth ? new Date(employee.date_of_birth).toLocaleDateString('en-GB') : '—'}</div>
                <div><span className="text-[var(--color-text-muted)]">Gender:</span> {employee.gender || '—'}</div>
                <div><span className="text-[var(--color-text-muted)]">Address:</span> {employee.address || '—'}</div>
                <div><span className="text-[var(--color-text-muted)]">Nationality:</span> {employee.nationality || '—'}</div>
                <div><span className="text-[var(--color-text-muted)]">ID Number:</span> {employee.id_number || '—'}</div>
                <div><span className="text-[var(--color-text-muted)]">ID Type:</span> {employee.id_type || '—'}</div>
                <div><span className="text-[var(--color-text-muted)]">Bank Name:</span> {employee.bank_name || '—'}</div>
                <div><span className="text-[var(--color-text-muted)]">Bank Account:</span> {employee.bank_account_number || '—'}</div>
                <div><span className="text-[var(--color-text-muted)]">Tax ID:</span> {employee.tax_id || '—'}</div>
                <div><span className="text-[var(--color-text-muted)]">Emergency Contact:</span> {employee.emergency_contact_name || '—'}</div>
                <div><span className="text-[var(--color-text-muted)]">Emergency Phone:</span> {employee.emergency_contact_phone || '—'}</div>
              </div>
            )}

            {activeTab === 'contracts' && (
              loadingContracts ? <Skeleton className="h-48" /> : (
                <div className="space-y-3">
                  {(!contracts || contracts.length === 0) && <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No contracts found</p>}
                  {Array.isArray(contracts) && contracts.map((c: any) => (
                    <div key={c.id} className="border border-[var(--color-border)] rounded-[var(--radius-md)] p-4 text-sm flex items-center justify-between">
                      <div>
                        <p className="font-medium text-[var(--color-text)]">{c.contract_type || 'Contract'}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {c.start_date ? new Date(c.start_date).toLocaleDateString('en-GB') : '—'} — {c.end_date ? new Date(c.end_date).toLocaleDateString('en-GB') : 'Open'}
                        </p>
                        {c.salary && <p className="text-xs text-[var(--color-text-muted)]">{Number(c.salary).toLocaleString('en-GB')} {c.currency || ''}</p>}
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {c.status}
                      </span>
                    </div>
                  ))}
                </div>
              )
            )}

            {activeTab === 'leave' && (
              loadingLeave ? <Skeleton className="h-48" /> : (
                <div className="space-y-3">
                  {(!leaveRequests || leaveRequests.length === 0) && <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No leave requests</p>}
                  {Array.isArray(leaveRequests) && leaveRequests.map((l: any) => (
                    <div key={l.id} className="border border-[var(--color-border)] rounded-[var(--radius-md)] p-4 text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-[var(--color-text)]">{l.leave_type_name || 'Leave'}</p>
                        <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${LEAVE_STATUS_BADGE[l.status] || ''}`}>{l.status}</span>
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {l.start_date ? new Date(l.start_date).toLocaleDateString('en-GB') : '—'} — {l.end_date ? new Date(l.end_date).toLocaleDateString('en-GB') : '—'}
                        {l.days && <> &middot; {l.days} day(s)</>}
                      </p>
                      {l.reason && <p className="text-xs text-[var(--color-text-muted)] mt-1">{l.reason}</p>}
                    </div>
                  ))}
                </div>
              )
            )}

            {activeTab === 'attendance' && (
              loadingAttendance ? <Skeleton className="h-48" /> : (
                <div className="space-y-3">
                  {(!attendance || attendance.length === 0) && <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No attendance records</p>}
                  {Array.isArray(attendance) && (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--color-border)]">
                          <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">Date</th>
                          <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">Clock In</th>
                          <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">Clock Out</th>
                          <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">Status</th>
                          <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border)]">
                        {attendance.map((a: any) => (
                          <tr key={a.id} className="hover:bg-[var(--color-bg)]/30">
                            <td className="px-3 py-2 text-[var(--color-text)]">{a.date ? new Date(a.date).toLocaleDateString('en-GB') : '—'}</td>
                            <td className="px-3 py-2 text-[var(--color-text-muted)]">{a.clock_in || '—'}</td>
                            <td className="px-3 py-2 text-[var(--color-text-muted)]">{a.clock_out || '—'}</td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${ATTENDANCE_BADGE[a.status] || ''}`}>{a.status}</span>
                            </td>
                            <td className="px-3 py-2 text-[var(--color-text-muted)]">{a.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </Can>
  );
}
