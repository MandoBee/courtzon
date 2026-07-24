import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../../services/api';
import { ExportButton } from '../../../components/ui/ExportButton';
import { Skeleton, SkeletonRow } from '../../../components/ui/Skeleton';

export default function FinanceDashboardPage() {
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0];
  const monthStart = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const { data: revenue, isLoading } = useQuery({
    queryKey: ['finance', 'revenue', monthStart, today],
    queryFn: () => api.get('/admin/financial/revenue', { params: { from: monthStart, to: today } }).then(r => r.data.data),
  });

  const { data: ledger } = useQuery({
    queryKey: ['finance', 'ledger', monthStart, today],
    queryFn: () => api.get('/admin/financial/ledger', { params: { from: monthStart, to: today } }).then(r => r.data.data),
  });

  const { data: wallet } = useQuery({
    queryKey: ['wallet', 'me'],
    queryFn: () => api.get('/wallets/me').then(r => r.data),
  });

  const { data: settlements } = useQuery({
    queryKey: ['finance', 'settlements'],
    queryFn: () => api.get('/settlements').then(r => r.data?.data || r.data),
  });

  if (isLoading) return <div className="space-y-6"><Skeleton width={300} height={28} /><SkeletonRow count={8} /></div>;

  const totalRevenue = Array.isArray(revenue) ? revenue.reduce((s: number, r: any) => s + Number(r.total || 0), 0) : 0;
  const totalCredits = Array.isArray(ledger) ? ledger.filter((e: any) => e.side === 'credit').reduce((s: number, e: any) => s + Number(e.amount || 0), 0) : 0;
  const totalDebits = Array.isArray(ledger) ? ledger.filter((e: any) => e.side === 'debit').reduce((s: number, e: any) => s + Number(e.amount || 0), 0) : 0;
  const settlementList = Array.isArray(settlements) ? settlements : settlements?.data || [];
  const pendingSettlements = settlementList.filter((s: any) => s.settlement_status === 'pending_approval' || s.settlement_status === 'approved');
  const completedSettlements = settlementList.filter((s: any) => s.settlement_status === 'completed');

  const KPI = ({ label, value, sub, onClick, color }: { label: string; value: string; sub?: string; onClick?: () => void; color?: string }) => (
    <div onClick={onClick} className={`bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-1 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className={`text-2xl font-bold ${color || 'text-[var(--color-text)]'}`}>{value}</p>
      {sub && <p className="text-xs text-[var(--color-text-muted)]">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Finance Dashboard</h1>
        <div className="flex gap-2">
          <button onClick={() => navigate('/admin/finance/ledger')} className="text-xs text-[var(--color-primary)] hover:underline">Ledger</button>
          <button onClick={() => navigate('/admin/finance/reports')} className="text-xs text-[var(--color-primary)] hover:underline">Reports</button>
          <button onClick={() => navigate('/admin/settlements')} className="text-xs text-[var(--color-primary)] hover:underline">Settlements</button>
          <ExportButton data={ledger || revenue || []} filename="finance-export" />
        </div>
      </div>

      {/* Row 1: Revenue KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="Total Revenue (30d)" value={`EGP ${totalRevenue.toLocaleString()}`} sub="Click for details" onClick={() => navigate('/admin/finance/reports')} color="text-green-600" />
        <KPI label="Wallet Balance" value={wallet ? `EGP ${Number(wallet.balance).toLocaleString()}` : '—'} sub={wallet ? `${wallet.currencyCode || 'EGP'}` : ''} onClick={() => navigate('/profile')} />
        <KPI label="Pending Settlements" value={String(pendingSettlements.length)} sub={`${pendingSettlements.reduce((s: number, x: any) => s + Number(x.final_amount || 0), 0).toLocaleString()} EGP`} onClick={() => navigate('/admin/settlements')} color="text-yellow-600" />
        <KPI label="Completed Settlements" value={String(completedSettlements.length)} sub={`${completedSettlements.reduce((s: number, x: any) => s + Number(x.final_amount || 0), 0).toLocaleString()} EGP`} onClick={() => navigate('/admin/settlements')} color="text-green-600" />
      </div>

      {/* Row 2: Ledger summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="Total Credits" value={`EGP ${totalCredits.toLocaleString()}`} sub="30 day ledger" onClick={() => navigate('/admin/finance/ledger')} color="text-blue-600" />
        <KPI label="Total Debits" value={`EGP ${totalDebits.toLocaleString()}`} sub="30 day ledger" onClick={() => navigate('/admin/finance/ledger')} color="text-red-600" />
        <KPI label="Net Flow" value={`EGP ${(totalCredits - totalDebits).toLocaleString()}`} sub="Credits - Debits" />
        <KPI label="Withdrawal Requests" value="—" sub="Check finance admin" onClick={() => navigate('/admin/withdrawal-requests')} />
      </div>

      {/* Revenue by account type */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
        <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">Revenue by Account Type (30d)</h2>
        {!Array.isArray(revenue) || revenue.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-4">No revenue data yet.</p>
        ) : (
          <div className="space-y-3">
            {revenue.map((r: any, i: number) => (
              <div key={i} onClick={() => navigate(`/admin/finance/ledger?accountType=${r.account_type}`)} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0 cursor-pointer hover:bg-[var(--color-bg)] -mx-5 px-5">
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

      {/* Recent activity */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
        <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">Recent Ledger Activity</h2>
        {!Array.isArray(ledger) || ledger.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-4">No recent activity.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
              <th className="text-left px-2 py-2">Date</th><th className="text-left px-2 py-2">Type</th><th className="text-left px-2 py-2">Account</th><th className="text-right px-2 py-2">Amount</th><th className="text-left px-2 py-2">Description</th>
            </tr></thead>
            <tbody>{ledger.slice(0, 10).map((e: any, i: number) => (
              <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-2 py-2 text-xs text-[var(--color-text-muted)]">{new Date(e.recorded_at).toLocaleDateString()}</td>
                <td className="px-2 py-2"><span className="text-xs capitalize">{e.source_type?.replace(/_/g, ' ')}</span></td>
                <td className="px-2 py-2 text-xs capitalize">{e.account_type?.replace(/_/g, ' ')}</td>
                <td className={`px-2 py-2 text-right text-xs font-medium ${e.side === 'credit' ? 'text-green-600' : 'text-red-600'}`}>{e.side === 'credit' ? '+' : '-'}EGP {Number(e.amount).toLocaleString()}</td>
                <td className="px-2 py-2 text-xs text-[var(--color-text-muted)] truncate max-w-[200px]">{e.description}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
