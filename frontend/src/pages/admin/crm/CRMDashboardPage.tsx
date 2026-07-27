import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { Skeleton } from '../../../components/ui/Skeleton';

interface CrmDashboardStats {
  totalCustomers: number;
  activeSegments: number;
  leadsByStatus: { new: number; qualified: number; converted: number; lost: number };
  activeCampaigns: number;
}

const quickLinks = [
  { label: 'Customers', path: '/admin/crm/customers', icon: '👥', permission: 'crm.customers.view', desc: 'Customer 360 profiles' },
  { label: 'Segments', path: '/admin/crm/segments', icon: '🏷️', permission: 'crm.segments.view', desc: 'Manage customer segments' },
  { label: 'Leads', path: '/admin/crm/leads', icon: '🎯', permission: 'crm.leads.view', desc: 'Track and convert leads' },
  { label: 'Campaigns', path: '/admin/crm/campaigns', icon: '📢', permission: 'crm.campaigns.view', desc: 'Marketing campaigns' },
  { label: 'Communications', path: '/admin/crm/communications', icon: '✉️', permission: 'crm.communications.view', desc: 'Communication log' },
];

export default function CRMDashboardPage() {

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'crm', 'dashboard'],
    queryFn: () => api.get('/admin/crm/dashboard').then((r: any) => r.data?.data as CrmDashboardStats),
  });

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  const fmt = (v: number | null | undefined) => (v != null ? Number(v).toLocaleString('en-GB') : '—');

  const statCards = [
    { label: 'Total Customers', value: fmt(stats?.totalCustomers), icon: '👥', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { label: 'Active Segments', value: fmt(stats?.activeSegments), icon: '🏷️', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    { label: 'New Leads', value: fmt(stats?.leadsByStatus?.new), icon: '🆕', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
    { label: 'Qualified Leads', value: fmt(stats?.leadsByStatus?.qualified), icon: '✅', color: 'bg-green-50 text-green-700 border-green-200' },
    { label: 'Converted', value: fmt(stats?.leadsByStatus?.converted), icon: '🎉', color: 'bg-teal-50 text-teal-700 border-teal-200' },
    { label: 'Lost Leads', value: fmt(stats?.leadsByStatus?.lost), icon: '❌', color: 'bg-red-50 text-red-700 border-red-200' },
    { label: 'Active Campaigns', value: fmt(stats?.activeCampaigns), icon: '📢', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  ];

  return (
    <Can permission="crm.dashboard.view">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">CRM Dashboard</h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {statCards.map((card) => (
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
