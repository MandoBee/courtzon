import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import api from '../../services/api';
import { Spinner } from '../../components/ui';
import { Can } from '../../permissions/Can';

export default function OrgAccountingDashboardPage() {
  const { orgId } = useParams<{ orgId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['org', 'accounting', 'dashboard', orgId],
    queryFn: () => api.get(`/org/${orgId}/accounting/dashboard`).then((r) => r.data.data || r.data),
    enabled: !!orgId,
  });

  if (isLoading) return <Spinner />;
  const s = data || { visible_accounts: 0, draft_invoices: 0, issued_invoices: 0, paid_invoices: 0, cancelled_invoices: 0, net_income: 0 };
  const fmt = (n: number) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Can permission="org.accounting.view">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">Accounting Dashboard</h1>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {[
            { label: 'Visible Accounts', value: s.visible_accounts, color: 'bg-blue-500' },
            { label: 'Draft Invoices', value: s.draft_invoices, color: 'bg-gray-400' },
            { label: 'Issued Invoices', value: s.issued_invoices, color: 'bg-blue-400' },
            { label: 'Paid Invoices', value: s.paid_invoices, color: 'bg-green-400' },
            { label: 'Cancelled Invoices', value: s.cancelled_invoices, color: 'bg-red-400' },
            { label: 'Net Income (FY)', value: fmt(s.net_income), color: 'bg-purple-500' },
          ].map((c) => (
            <div key={c.label} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 border">
              <div className={`w-3 h-3 rounded-full ${c.color} mb-2`} />
              <p className="text-2xl font-bold text-[var(--color-text)]">{c.value}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">{c.label}</p>
            </div>
          ))}
        </div>

        <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Quick Links</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Chart of Accounts', path: `/org/${orgId}/accounting/coa`, desc: 'View and customise your accounts' },
            { label: 'Financial Reports', path: `/org/${orgId}/accounting/reports/trial-balance`, desc: 'Trial balance, income statement & balance sheet' },
            { label: 'Tax Summary', path: `/org/${orgId}/accounting/tax-summary`, desc: 'Your tax liabilities and input tax' },
          ].map((l) => (
            <Link key={l.path} to={l.path}
              className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 border hover:border-[var(--color-primary)]/40 transition-colors">
              <h3 className="text-sm font-medium text-[var(--color-text)]">{l.label}</h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">{l.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </Can>
  );
}
