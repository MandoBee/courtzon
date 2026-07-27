import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import api from '../../services/api';
import { formatISODate } from '../../utils/formatDate';
import { SkeletonRow } from '../../components/ui';
import { Can } from '../../permissions/Can';

export default function CoachRevenuePage() {
  const { t } = useTranslation();

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['coach-revenue-summary'],
    queryFn: () => api.get('/coach/revenue/summary').then((r) => r.data),
  });

  const { data: revenue, isLoading: revenueLoading } = useQuery({
    queryKey: ['coach-revenue'],
    queryFn: () => api.get('/coach/revenue').then((r) => r.data),
  });

  const monthlyData: { month: string; amount: number }[] = revenue?.monthlyData || revenue?.monthly_data || [];
  const maxAmount = Math.max(...monthlyData.map((d) => d.amount), 1);
  const transactions = Array.isArray(revenue?.transactions) ? revenue.transactions : [];

  if (summaryLoading || revenueLoading) return <div className="py-8"><SkeletonRow count={6} /></div>;

  return (
    <div className="space-y-5 md:space-y-6 pb-4 max-w-4xl">
      <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)]">
        {t('coach.revenue.title', 'Revenue')}
      </h1>

      <Can permission="coach.revenue.view">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
            <p className="text-xs text-[var(--color-text-muted)]">{t('coach.revenue.total', 'Total Revenue')}</p>
            <p className="text-2xl font-bold text-[var(--color-text)]">{summary?.totalRevenue ?? summary?.total_revenue ?? 0}</p>
          </div>
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
            <p className="text-xs text-[var(--color-text-muted)]">{t('coach.revenue.pending', 'Pending')}</p>
            <p className="text-2xl font-bold text-[var(--color-warning)]">{summary?.pendingAmount ?? summary?.pending_amount ?? 0}</p>
          </div>
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
            <p className="text-xs text-[var(--color-text-muted)]">{t('coach.revenue.paid_this_month', 'Paid This Month')}</p>
            <p className="text-2xl font-bold text-[var(--color-success)]">{summary?.paidThisMonth ?? summary?.paid_this_month ?? 0}</p>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">
            {t('coach.revenue.monthly_breakdown', 'Revenue Per Month')}
          </h2>
          {monthlyData.length === 0 && (
            <p className="text-sm text-[var(--color-text-muted)]">{t('coach.revenue.no_data', 'No revenue data yet')}</p>
          )}
          <div className="space-y-2">
            {monthlyData.map((d) => (
              <div key={d.month} className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-text-muted)] w-16 shrink-0">{d.month}</span>
                <div className="flex-1 h-5 bg-[var(--color-bg)] rounded-[var(--radius-sm)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-success)] rounded-[var(--radius-sm)] transition-all"
                    style={{ width: `${(d.amount / maxAmount) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-[var(--color-text)] w-16 text-right">{d.amount}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left p-2 font-medium text-[var(--color-text-muted)]">{t('coach.revenue.date', 'Date')}</th>
                <th className="text-left p-2 font-medium text-[var(--color-text-muted)]">{t('coach.revenue.player', 'Player')}</th>
                <th className="text-left p-2 font-medium text-[var(--color-text-muted)]">{t('coach.revenue.amount', 'Amount')}</th>
                <th className="text-left p-2 font-medium text-[var(--color-text-muted)]">{t('coach.revenue.earnings', 'Coach Earnings')}</th>
                <th className="text-left p-2 font-medium text-[var(--color-text-muted)]">{t('coach.revenue.status', 'Status')}</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx: any) => (
                <tr key={tx.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]/50">
                  <td className="p-2 text-[var(--color-text)]">{formatISODate(tx.date || tx.session_date)}</td>
                  <td className="p-2 text-[var(--color-text)]">{tx.playerName || tx.player_name || '—'}</td>
                  <td className="p-2 text-[var(--color-text)]">{tx.amount ?? '—'}</td>
                  <td className="p-2 text-[var(--color-text)]">{tx.coachEarnings ?? tx.coach_earnings ?? '—'}</td>
                  <td className="p-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                      tx.status === 'paid' ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]' :
                      tx.status === 'pending' ? 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]' :
                      'bg-[var(--color-info)]/15 text-[var(--color-info)]'
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Can>
    </div>
  );
}
