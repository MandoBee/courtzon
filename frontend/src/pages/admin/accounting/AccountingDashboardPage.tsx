import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../../services/api';
import { Spinner } from '../../../components/ui';

interface DashboardStats {
  total_accounts: number;
  open_periods: number;
  draft_invoices: number;
  issued_invoices: number;
  paid_invoices: number;
  cancelled_invoices: number;
  tax_rates: number;
}

const QUICK_LINKS = [
  { label: 'Chart of Accounts', path: '/admin/accounting/accounts', desc: 'Manage account codes and types', icon: '📊' },
  { label: 'Journal Entries', path: '/admin/accounting/journal', desc: 'Create and view journal entries', icon: '📝' },
  { label: 'General Ledger', path: '/admin/accounting/ledger', desc: 'View ledger, trial balance, and reports', icon: '📒' },
  { label: 'Invoices', path: '/admin/accounting/invoices', desc: 'Manage sales and purchase invoices', icon: '🧾' },
  { label: 'Accounting Periods', path: '/admin/accounting/periods', desc: 'Open, close, and generate periods', icon: '📅' },
  { label: 'Tax Rates', path: '/admin/accounting/tax-rates', desc: 'Configure tax rates', icon: '🏷️' },
];

export default function AccountingDashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['accounting', 'dashboard'],
    queryFn: () => api.get('/admin/accounting/dashboard').then((r: any) => r.data.data || r.data),
  });

  const s: DashboardStats = stats || {
    total_accounts: 0, open_periods: 0, draft_invoices: 0, issued_invoices: 0,
    paid_invoices: 0, cancelled_invoices: 0, tax_rates: 0,
  };

  if (isLoading) return <Spinner />;

  const cards = [
    { label: 'Total Accounts', value: s.total_accounts, color: 'bg-blue-500' },
    { label: 'Open Periods', value: s.open_periods, color: 'bg-green-500' },
    { label: 'Draft Invoices', value: s.draft_invoices, color: 'bg-gray-400' },
    { label: 'Issued Invoices', value: s.issued_invoices, color: 'bg-blue-400' },
    { label: 'Paid Invoices', value: s.paid_invoices, color: 'bg-green-400' },
    { label: 'Cancelled Invoices', value: s.cancelled_invoices, color: 'bg-red-400' },
    { label: 'Tax Rates', value: s.tax_rates, color: 'bg-purple-500' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">Accounting Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
        {cards.map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 border">
            <div className={`w-3 h-3 rounded-full ${c.color} mb-2`} />
            <p className="text-2xl font-bold text-[var(--color-text)]">{c.value}</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Quick Links</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {QUICK_LINKS.map(link => (
          <Link key={link.path} to={link.path}
            className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 border hover:border-[var(--color-primary)]/40 transition-colors">
            <div className="flex items-start gap-3">
              <span className="text-2xl">{link.icon}</span>
              <div>
                <h3 className="text-sm font-medium text-[var(--color-text)]">{link.label}</h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">{link.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
