import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../services/api';
import { Spinner } from '../../../components/ui';
import { Can } from '../../../permissions/Can';

export default function TaxSummaryPage() {
  const [orgId, setOrgId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [orgs, setOrgs] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => { api.get('/organisations?limit=200').then(r => { const d = r.data?.data ?? r.data ?? []; if (Array.isArray(d)) setOrgs(d.map((o: any) => ({ id: o.id, name: o.name ?? '' }))); }).catch(() => {}); }, []);

  const params: any = { organisationId: orgId || undefined };
  if (from) params.from = from;
  if (to) params.to = to;

  const { data, isLoading } = useQuery({
    queryKey: ['accounting','tax-summary', orgId, from, to],
    queryFn: () => api.get('/admin/accounting/tax-summary', { params }).then(r => r.data.data || r.data),
  });

  if (isLoading) return <Spinner />;
  const d = data || { salesTaxStats: [], purchaseTaxStats: [], accountingTaxBalances: [] };
  const fmt = (n: number) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

  return (<Can permission="accounting.tax-report.view"><div>
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Tax Summary</h1>
    </div>

    <div className="flex items-center gap-3 mb-4 flex-wrap">
      <select value={orgId} onChange={e => setOrgId(e.target.value)} className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[180px]">
        <option value="">Platform (Global)</option>
        {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
      <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
    </div>

    {/* Sales Tax */}
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-4 mb-4">
      <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Sales Tax (Invoice Statistics)</h2>
      {d.salesTaxStats?.length > 0 ? (<div className="overflow-x-auto"><table className="w-full text-xs">
        <thead><tr className="border-b border-[var(--color-border)]"><th className="text-left px-2 py-1.5 text-[var(--color-text-muted)]">Treatment</th><th className="text-left px-2 py-1.5 text-[var(--color-text-muted)]">Type</th><th className="text-left px-2 py-1.5 text-[var(--color-text-muted)]">Rate</th><th className="text-right px-2 py-1.5 text-[var(--color-text-muted)]">Invoices</th><th className="text-right px-2 py-1.5 text-[var(--color-text-muted)]">Net</th><th className="text-right px-2 py-1.5 text-[var(--color-text-muted)]">Tax</th></tr></thead>
        <tbody className="divide-y divide-[var(--color-border)]">{d.salesTaxStats.map((s: any, i: number) => (<tr key={i}>
          <td className="px-2 py-1.5 text-[var(--color-text)] capitalize">{s.tax_treatment?.replace(/_/g,' ')}</td>
          <td className="px-2 py-1.5 text-[var(--color-text-muted)]">{s.price_type}</td>
          <td className="px-2 py-1.5 font-mono text-[var(--color-text)]">{s.tax_rate}%</td>
          <td className="px-2 py-1.5 text-right font-mono text-[var(--color-text)]">{s.invoice_count}</td>
          <td className="px-2 py-1.5 text-right font-mono text-[var(--color-text)]">{fmt(s.total_net)}</td>
          <td className="px-2 py-1.5 text-right font-mono text-[var(--color-text)]">{fmt(s.total_tax)}</td>
        </tr>))}</tbody>
      </table></div>) : <p className="text-xs text-[var(--color-text-muted)] py-2">No sales tax data</p>}
    </div>

    {/* Purchase Tax */}
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-4 mb-4">
      <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Purchase Tax (Invoice Statistics)</h2>
      {d.purchaseTaxStats?.length > 0 ? (<div className="overflow-x-auto"><table className="w-full text-xs">
        <thead><tr className="border-b border-[var(--color-border)]"><th className="text-left px-2 py-1.5 text-[var(--color-text-muted)]">Treatment</th><th className="text-right px-2 py-1.5 text-[var(--color-text-muted)]">Net</th><th className="text-right px-2 py-1.5 text-[var(--color-text-muted)]">Tax</th></tr></thead>
        <tbody className="divide-y divide-[var(--color-border)]">{d.purchaseTaxStats.map((s: any, i: number) => (<tr key={i}>
          <td className="px-2 py-1.5 text-[var(--color-text)] capitalize">{s.tax_treatment?.replace(/_/g,' ')}</td>
          <td className="px-2 py-1.5 text-right font-mono text-[var(--color-text)]">{fmt(s.total_net)}</td>
          <td className="px-2 py-1.5 text-right font-mono text-[var(--color-text)]">{fmt(s.total_tax)}</td>
        </tr>))}</tbody>
      </table></div>) : <p className="text-xs text-[var(--color-text-muted)] py-2">No purchase tax data</p>}
    </div>

    {/* Accounting Balances */}
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-4 mb-4">
      <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Accounting Tax Balances (General Ledger)</h2>
      {d.accountingTaxBalances?.length > 0 ? (<div className="overflow-x-auto"><table className="w-full text-xs">
        <thead><tr className="border-b border-[var(--color-border)]"><th className="text-left px-2 py-1.5 text-[var(--color-text-muted)]">Account</th><th className="text-left px-2 py-1.5 text-[var(--color-text-muted)]">Name</th><th className="text-left px-2 py-1.5 text-[var(--color-text-muted)]">Type</th><th className="text-right px-2 py-1.5 text-[var(--color-text-muted)]">Debits</th><th className="text-right px-2 py-1.5 text-[var(--color-text-muted)]">Credits</th></tr></thead>
        <tbody className="divide-y divide-[var(--color-border)]">{d.accountingTaxBalances.map((a: any, i: number) => (<tr key={i}>
          <td className="px-2 py-1.5 font-mono text-[var(--color-text)]">{a.code}</td>
          <td className="px-2 py-1.5 text-[var(--color-text)]">{a.name}</td>
          <td className="px-2 py-1.5 text-[var(--color-text-muted)] capitalize">{a.type}</td>
          <td className="px-2 py-1.5 text-right font-mono text-[var(--color-text)]">{fmt(a.total_debits)}</td>
          <td className="px-2 py-1.5 text-right font-mono text-[var(--color-text)]">{fmt(a.total_credits)}</td>
        </tr>))}</tbody>
      </table></div>) : <p className="text-xs text-[var(--color-text-muted)] py-2">No accounting tax data</p>}
    </div>
  </div></Can>);
}
