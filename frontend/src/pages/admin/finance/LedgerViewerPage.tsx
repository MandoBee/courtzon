import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../services/api';
import { ExportButton } from '../../../components/ui/ExportButton';
import { SkeletonRow } from '../../../components/ui/Skeleton';

export default function LedgerViewerPage() {
  const today = new Date().toISOString().split('T')[0];
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]);
  const [to, setTo] = useState(today);
  const [accountType, setAccountType] = useState('');
  const [search, setSearch] = useState('');

  const params: any = { from, to };
  if (accountType) params.accountType = accountType;

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'ledger', from, to, accountType],
    queryFn: () => api.get('/admin/financial/ledger', { params }).then(r => r.data.data),
  });

  const entries = Array.isArray(data) ? data : [];
  const filtered = search ? entries.filter((e: any) =>
    (e.description || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.account_type || '').includes(search.toLowerCase()) ||
    (e.source_type || '').includes(search.toLowerCase())
  ) : entries;

  const totalDebit = filtered.filter((e: any) => e.side === 'debit').reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
  const totalCredit = filtered.filter((e: any) => e.side === 'credit').reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Ledger Viewer</h1>
        <ExportButton data={filtered} filename={`ledger-${from}-${to}`} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div><label className="text-xs text-[var(--color-text-muted)]">From</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
        <div><label className="text-xs text-[var(--color-text-muted)]">To</label><input type="date" value={to} onChange={e => setTo(e.target.value)} className="mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
        <div><label className="text-xs text-[var(--color-text-muted)]">Account</label>
          <select value={accountType} onChange={e => setAccountType(e.target.value)} className="mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg">
            <option value="">All</option>
            {['platform_revenue','club_revenue','wallet_liability','customer_balance','tax','discount','commission','receivable','payable','refund'].map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select></div>
        <div><label className="text-xs text-[var(--color-text-muted)]">Search</label><input type="text" placeholder="Search entries..." value={search} onChange={e => setSearch(e.target.value)} className="mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg w-48" /></div>
      </div>

      {/* Balance summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
          <p className="text-xs text-[var(--color-text-muted)]">Total Debits</p>
          <p className="text-lg font-bold text-red-600">EGP {totalDebit.toLocaleString()}</p>
        </div>
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
          <p className="text-xs text-[var(--color-text-muted)]">Total Credits</p>
          <p className="text-lg font-bold text-green-600">EGP {totalCredit.toLocaleString()}</p>
        </div>
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
          <p className="text-xs text-[var(--color-text-muted)]">Balance</p>
          <p className={`text-lg font-bold ${totalCredit - totalDebit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            EGP {(totalCredit - totalDebit).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Entries table */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
        {isLoading ? <SkeletonRow count={5} /> : filtered.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-text-muted)] text-center">No ledger entries found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
                <th className="text-left px-4 py-3">Date</th><th className="text-left px-4 py-3">Transaction ID</th>
                <th className="text-left px-4 py-3">Source</th><th className="text-left px-4 py-3">Account</th>
                <th className="text-left px-4 py-3">Side</th><th className="text-right px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Description</th>
              </tr></thead>
              <tbody>{filtered.map((e: any, i: number) => (
                <tr key={i} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)]">
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] whitespace-nowrap">{new Date(e.recorded_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs font-mono text-[var(--color-text-muted)]">{e.transaction_id}</td>
                  <td className="px-4 py-3 text-xs capitalize">{e.source_type?.replace(/_/g, ' ')} #{e.source_id}</td>
                  <td className="px-4 py-3 text-xs capitalize">{e.account_type?.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3"><span className={`text-xs font-medium px-1.5 py-0.5 rounded ${e.side === 'credit' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{e.side}</span></td>
                  <td className="px-4 py-3 text-right text-xs font-medium">{e.side === 'credit' ? '+' : '-'}EGP {Number(e.amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] max-w-[250px] truncate">{e.description || '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
