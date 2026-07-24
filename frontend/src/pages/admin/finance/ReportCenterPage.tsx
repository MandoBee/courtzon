import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../../services/api';
import { ExportButton } from '../../../components/ui/ExportButton';

type ReportTab = 'revenue' | 'wallet' | 'settlements';

export default function ReportCenterPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<ReportTab>('revenue');
  const [range, setRange] = useState('30d');
  const today = new Date().toISOString().split('T')[0];

  const getFrom = () => {
    const d = new Date();
    if (range === '7d') d.setDate(d.getDate() - 7);
    else if (range === '30d') d.setDate(d.getDate() - 30);
    else if (range === '90d') d.setDate(d.getDate() - 90);
    else if (range === '1y') d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split('T')[0];
  };

  const from = getFrom();

  const { data: revenue } = useQuery({
    queryKey: ['finance', 'revenue', from, today],
    queryFn: () => api.get('/admin/financial/revenue', { params: { from, to: today } }).then(r => r.data.data),
    enabled: tab === 'revenue',
  });

  const { data: ledger } = useQuery({
    queryKey: ['finance', 'ledger', from, today],
    queryFn: () => api.get('/admin/financial/ledger', { params: { from, to: today } }).then(r => r.data.data),
    enabled: tab === 'revenue',
  });

  const { data: wallet } = useQuery({
    queryKey: ['wallet', 'me'],
    queryFn: () => api.get('/wallets/me').then(r => r.data),
    enabled: tab === 'wallet',
  });

  const { data: settlements } = useQuery({
    queryKey: ['finance', 'settlements'],
    queryFn: () => api.get('/settlements').then(r => r.data?.data || r.data),
    enabled: tab === 'settlements',
  });

  const settlementList = Array.isArray(settlements) ? settlements : [];

  const tabs = [
    { key: 'revenue' as ReportTab, label: 'Revenue' },
    { key: 'wallet' as ReportTab, label: 'Wallet' },
    { key: 'settlements' as ReportTab, label: 'Settlements' },
  ];

  const RANGE_OPTIONS = [
    { key: '7d', label: '7 Days' },
    { key: '30d', label: '30 Days' },
    { key: '90d', label: '90 Days' },
    { key: '1y', label: '1 Year' },
  ];

  const entries = Array.isArray(ledger) ? ledger : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Financial Reports</h1>
        <div className="flex gap-2">
          <ExportButton data={tab === 'revenue' ? (revenue || ledger || []) : tab === 'wallet' ? [wallet || {}] : settlementList}
            filename={`${tab}-report-${from}-${today}`} />
          <button onClick={() => navigate('/admin/finance')} className="text-xs text-[var(--color-primary)] hover:underline">Dashboard</button>
          <button onClick={() => navigate('/admin/finance/ledger')} className="text-xs text-[var(--color-primary)] hover:underline">Ledger</button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full ${tab === t.key ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'}`}>{t.label}</button>
        ))}
      </div>

      {/* Range selector */}
      <div className="flex gap-1">
        {RANGE_OPTIONS.map(r => (
          <button key={r.key} onClick={() => setRange(r.key)}
            className={`px-3 py-1 text-xs rounded-full ${range === r.key ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'}`}>{r.label}</button>
        ))}
      </div>

      {/* Revenue Report */}
      {tab === 'revenue' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
              <p className="text-xs text-[var(--color-text-muted)]">Total Revenue</p>
              <p className="text-2xl font-bold text-green-600">
                EGP {Array.isArray(revenue) ? revenue.filter((r: any) => r.side === 'credit').reduce((s: number, r: any) => s + Number(r.total || 0), 0).toLocaleString() : '0'}
              </p>
            </div>
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
              <p className="text-xs text-[var(--color-text-muted)]">Total Expenses</p>
              <p className="text-2xl font-bold text-red-600">
                EGP {Array.isArray(revenue) ? revenue.filter((r: any) => r.side === 'debit').reduce((s: number, r: any) => s + Number(r.total || 0), 0).toLocaleString() : '0'}
              </p>
            </div>
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
              <p className="text-xs text-[var(--color-text-muted)]">Net Income</p>
              <p className="text-2xl font-bold text-[var(--color-text)]">
                EGP {(Array.isArray(revenue) ? (revenue.filter((r: any) => r.side === 'credit').reduce((s: number, r: any) => s + Number(r.total || 0), 0) - revenue.filter((r: any) => r.side === 'debit').reduce((s: number, r: any) => s + Number(r.total || 0), 0)) : 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
              <p className="text-xs text-[var(--color-text-muted)]">Transactions</p>
              <p className="text-2xl font-bold text-[var(--color-text)]">{Array.isArray(revenue) ? revenue.reduce((s: number, r: any) => s + Number(r.count || 0), 0) : '0'}</p>
            </div>
          </div>

          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
            <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">Revenue Breakdown by Account</h2>
            {!Array.isArray(revenue) || revenue.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-4">No data for this period.</p>
            ) : (
              <div className="space-y-2">
                {revenue.map((r: any, i: number) => (
                  <div key={i} onClick={() => navigate(`/admin/finance/ledger?accountType=${r.account_type}`)}
                    className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0 cursor-pointer hover:bg-[var(--color-bg)] -mx-5 px-5">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)] capitalize">{r.account_type?.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{r.side} · {r.count} entries</p>
                    </div>
                    <p className={`text-sm font-bold ${r.side === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                      {r.side === 'credit' ? '+' : '-'}EGP {Number(r.total).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
            <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">Recent Ledger Entries</h2>
            {entries.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-4">No entries.</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
                  <th className="text-left px-2 py-2">Date</th><th className="text-left px-2 py-2">Account</th>
                  <th className="text-left px-2 py-2">Side</th><th className="text-right px-2 py-2">Amount</th>
                </tr></thead>
                <tbody>{entries.slice(0, 15).map((e: any, i: number) => (
                  <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-2 py-2 text-xs text-[var(--color-text-muted)]">{new Date(e.recorded_at).toLocaleDateString()}</td>
                    <td className="px-2 py-2 text-xs capitalize">{e.account_type?.replace(/_/g, ' ')}</td>
                    <td className="px-2 py-2"><span className={`text-xs px-1 py-0.5 rounded ${e.side === 'credit' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{e.side}</span></td>
                    <td className="px-2 py-2 text-right text-xs font-medium">{e.side === 'credit' ? '+' : '-'}EGP {Number(e.amount).toLocaleString()}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Wallet Report */}
      {tab === 'wallet' && (
        <div className="space-y-6">
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6">
            {wallet ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-2xl">💰</div>
                  <div>
                    <p className="text-lg font-bold text-[var(--color-text)]">EGP {Number(wallet.balance).toLocaleString()}</p>
                    <p className="text-sm text-[var(--color-text-muted)]">{wallet.currencyCode || 'EGP'} Wallet</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-xs text-[var(--color-text-muted)]">Wallet ID</p><p className="text-sm font-medium">{wallet.id}</p></div>
                  <div><p className="text-xs text-[var(--color-text-muted)]">Status</p><p className="text-sm font-medium">{wallet.isLocked ? '🔒 Locked' : '✅ Active'}</p></div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => navigate('/profile')} className="text-xs text-[var(--color-primary)] hover:underline">View Transactions</button>
                  <button onClick={() => navigate('/wallets/me')} className="text-xs text-[var(--color-primary)] hover:underline">Deposit</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No wallet data available.</p>
            )}
          </div>

          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
            <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">Wallet Ledger Entries</h2>
            {entries.filter((e: any) => e.account_type === 'wallet_liability').length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-4">No wallet ledger entries.</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
                  <th className="text-left px-2 py-2">Date</th><th className="text-left px-2 py-2">Side</th><th className="text-right px-2 py-2">Amount</th><th className="text-left px-2 py-2">Description</th>
                </tr></thead>
                <tbody>{entries.filter((e: any) => e.account_type === 'wallet_liability').slice(0, 20).map((e: any, i: number) => (
                  <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-2 py-2 text-xs text-[var(--color-text-muted)]">{new Date(e.recorded_at).toLocaleDateString()}</td>
                    <td className="px-2 py-2"><span className={`text-xs px-1 py-0.5 rounded ${e.side === 'credit' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{e.side}</span></td>
                    <td className="px-2 py-2 text-right text-xs font-medium">EGP {Number(e.amount).toLocaleString()}</td>
                    <td className="px-2 py-2 text-xs text-[var(--color-text-muted)]">{e.description || '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Settlement Report */}
      {tab === 'settlements' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
              <p className="text-xs text-[var(--color-text-muted)]">Total Settlements</p>
              <p className="text-2xl font-bold text-[var(--color-text)]">{settlementList.length}</p>
            </div>
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
              <p className="text-xs text-[var(--color-text-muted)]">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">{settlementList.filter((s: any) => s.settlement_status === 'pending_approval').length}</p>
            </div>
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
              <p className="text-xs text-[var(--color-text-muted)]">Completed</p>
              <p className="text-2xl font-bold text-green-600">{settlementList.filter((s: any) => s.settlement_status === 'completed').length}</p>
            </div>
          </div>
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
            <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">Settlement List</h2>
            {settlementList.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-4">No settlements found.</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
                  <th className="text-left px-3 py-2">ID</th><th className="text-left px-3 py-2">Org</th><th className="text-left px-3 py-2">Status</th><th className="text-right px-3 py-2">Gross</th><th className="text-right px-3 py-2">Net</th><th className="text-left px-3 py-2">Date</th>
                </tr></thead>
                <tbody>{settlementList.map((s: any, i: number) => (
                  <tr key={i} className="border-b border-[var(--color-border)] last:border-0 cursor-pointer hover:bg-[var(--color-bg)]" onClick={() => navigate(`/admin/settlements`)}>
                    <td className="px-3 py-2 text-xs">#{s.id}</td>
                    <td className="px-3 py-2 text-xs">{s.organisation_name || s.organisation_id}</td>
                    <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded capitalize ${s.settlement_status === 'completed' ? 'bg-green-100 text-green-700' : s.settlement_status === 'pending_approval' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>{s.settlement_status}</span></td>
                    <td className="px-3 py-2 text-right text-xs">EGP {Number(s.gross_amount || 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-xs font-medium">EGP {Number(s.final_amount || s.net_amount || 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{new Date(s.created_at || s.requested_at).toLocaleDateString()}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
