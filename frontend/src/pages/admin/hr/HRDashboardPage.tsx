import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { Skeleton } from '../../../components/ui/Skeleton';

interface HrDashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  pendingLeave: number;
  departments: number;
  openPayroll: number;
}

const quickLinks = [
  { label: 'Employees', path: '/admin/hr/employees', icon: '👥', permission: 'hr.employees.view', desc: 'Manage employee records' },
  { label: 'Departments', path: '/admin/hr/departments', icon: '🏛️', permission: 'hr.departments.view', desc: 'Department hierarchy' },
  { label: 'Leave Management', path: '/admin/hr/leave', icon: '🏖️', permission: 'hr.leave.view', desc: 'Leave requests and types' },
  { label: 'Attendance', path: '/admin/hr/attendance', icon: '⏰', permission: 'hr.attendance.view', desc: 'Attendance tracking' },
  { label: 'Payroll', path: '/admin/hr/payroll', icon: '💰', permission: 'hr.payroll.view', desc: 'Payroll runs and components' },
];

export default function HRDashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'hr', 'dashboard'],
    queryFn: () => api.get('/admin/hr/dashboard').then((r: any) => r.data?.data as HrDashboardStats),
  });

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  const fmt = (v: number | null | undefined) => (v != null ? Number(v).toLocaleString('en-GB') : '—');

  const cardColors = [
    { label: 'Total Employees', value: fmt(stats?.totalEmployees), icon: '👥', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { label: 'Active Employees', value: fmt(stats?.activeEmployees), icon: '✅', color: 'bg-green-50 text-green-700 border-green-200' },
    { label: 'Pending Leave', value: fmt(stats?.pendingLeave), icon: '📋', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    { label: 'Departments', value: fmt(stats?.departments), icon: '🏛️', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    { label: 'Open Payroll', value: fmt(stats?.openPayroll), icon: '💰', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  ];

  return (
    <Can permission="hr.dashboard.view">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">HR Dashboard</h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {cardColors.map((card) => (
            <div key={card.label} className={`rounded-[var(--radius-lg)] border p-4 ${card.color}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-lg">{card.icon}</span>
              </div>
              <p className="text-2xl font-bold">{card.value}</p>
              <p className="text-xs mt-0.5 opacity-80">{card.label}</p>
            </div>
          ))}
        </div>

        <h2 className="text-lg font-semibold text-[var(--color-text)] mb-3">Quick Links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickLinks.map((link) => (
            <Can key={link.path} permission={link.permission}>
              <Link to={link.path}
                className="flex items-center gap-4 p-4 bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] hover:shadow-md transition-shadow">
                <span className="text-2xl">{link.icon}</span>
                <div>
                  <p className="font-medium text-[var(--color-text)]">{link.label}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{link.desc}</p>
                </div>
              </Link>
            </Can>
          ))}
        </div>
      </div>
    </Can>
  );
}
