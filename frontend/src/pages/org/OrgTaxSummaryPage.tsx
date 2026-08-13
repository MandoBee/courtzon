import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import api from '../../services/api';
import { Spinner } from '../../components/ui';
import { Can } from '../../permissions/Can';

const fmt = (n: number) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

export default function OrgTaxSummaryPage() {
  const { orgId } = useParams<{ orgId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['org', 'accounting', 'tax-summary', orgId],
    queryFn: () => api.get(`/org/${orgId}/accounting/tax-summary`).then((r) => r.data.data || r.data),
    enabled: !!orgId,
  });

  if (isLoading) return <Spinner />;
  const d = data || { salesTaxStats: [], purchaseTaxStats: [], accountingTaxBalances: [] };

  return (
    <Can permission="org.accounting.view">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">Tax Summary</h1>

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-4 mb-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Sales Tax</h2>
          {d.salesTaxStats?.length > 0 ? (
            <table className="w-full text-xs">
              <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                <th className="text-left px-2 py-1.5">Treatment</th><th className="text-left px-2 py-1.5">Type</th><th className="text-right px-2 py-1.5">Rate</th>
                <th className="text-right px-2 py-1.5">Invoices</th><th className="text-right px-2 py-1.5">Net</th><th className="text-right px-2 py-1.5">Tax</th>
              </tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {d.salesTaxStats.map((s: any, i: number) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5 text-[var(--color-text)] capitalize">{s.tax_treatment?.replace(/_/g, ' ')}</td>
                    <td className="px-2 py-1.5 text-[var(--color-text-muted)]">{s.price_type}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-[var(--color-text)]">{s.tax_rate}%</td>
                    <td className="px-2 py-1.5 text-right font-mono text-[var(--color-text)]">{s.invoice_count}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-[var(--color-text)]">{fmt(s.total_net)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-[var(--color-text)]">{fmt(s.total_tax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-xs text-[var(--color-text-muted)] py-2">No sales tax data</p>}
        </div>

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-4 mb-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Purchase Tax (Input Tax)</h2>
          {d.purchaseTaxStats?.length > 0 ? (
            <table className="w-full text-xs">
              <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                <th className="text-left px-2 py-1.5">Treatment</th><th className="text-right px-2 py-1.5">Net</th><th className="text-right px-2 py-1.5">Tax</th>
              </tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {d.purchaseTaxStats.map((s: any, i: number) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5 text-[var(--color-text)] capitalize">{s.tax_treatment?.replace(/_/g, ' ')}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-[var(--color-text)]">{fmt(s.total_net)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-[var(--color-text)]">{fmt(s.total_tax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-xs text-[var(--color-text-muted)] py-2">No purchase tax data</p>}
        </div>

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Accounting Tax Balances</h2>
          {d.accountingTaxBalances?.length > 0 ? (
            <table className="w-full text-xs">
              <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                <th className="text-left px-2 py-1.5">Account</th><th className="text-left px-2 py-1.5">Name</th>
                <th className="text-right px-2 py-1.5">Debits</th><th className="text-right px-2 py-1.5">Credits</th>
              </tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {d.accountingTaxBalances.map((a: any, i: number) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5 font-mono text-[var(--color-text)]">{a.code}</td>
                    <td className="px-2 py-1.5 text-[var(--color-text)]">{a.name}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-[var(--color-text)]">{fmt(a.total_debits)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-[var(--color-text)]">{fmt(a.total_credits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-xs text-[var(--color-text-muted)] py-2">No accounting tax data</p>}
        </div>
      </div>
    </Can>
  );
}
