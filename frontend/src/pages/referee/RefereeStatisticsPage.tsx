import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import api from '../../services/api';
import { SkeletonRow } from '../../components/ui';
import { Can } from '../../permissions/Can';

export default function RefereeStatisticsPage() {
  const { t } = useTranslation();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['referee-statistics'],
    queryFn: () => api.get('/referee/statistics').then((r) => r.data),
  });

  if (isLoading) return <div className="py-8"><SkeletonRow count={4} /></div>;

  const byType = stats?.byType || stats?.by_type || { tournament: 0, league: 0 };
  const monthlyData: { month: string; count: number }[] = stats?.monthlyData || stats?.monthly_data || [];
  const maxMonthly = Math.max(...monthlyData.map((d) => d.count), 1);

  return (
    <div className="space-y-5 md:space-y-6 pb-4 max-w-3xl">
      <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)]">
        {t('referee.statistics.title', 'Statistics')}
      </h1>

      <Can permission="referee.statistics.view">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
            <p className="text-xs text-[var(--color-text-muted)]">{t('referee.statistics.tournament_matches', 'Tournament Matches')}</p>
            <p className="text-2xl font-bold text-[var(--color-text)]">{byType.tournament ?? 0}</p>
          </div>
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
            <p className="text-xs text-[var(--color-text-muted)]">{t('referee.statistics.league_matches', 'League Matches')}</p>
            <p className="text-2xl font-bold text-[var(--color-text)]">{byType.league ?? 0}</p>
          </div>
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
            <p className="text-xs text-[var(--color-text-muted)]">{t('referee.statistics.avg_rating', 'Average Rating')}</p>
            <p className="text-2xl font-bold text-[var(--color-warning)]">{stats?.averageRating ?? stats?.average_rating ?? '—'}</p>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">
            {t('referee.statistics.monthly_trend', 'Monthly Match Count (Last 6 Months)')}
          </h2>
          {monthlyData.length === 0 && (
            <p className="text-sm text-[var(--color-text-muted)]">{t('referee.statistics.no_data', 'No data yet')}</p>
          )}
          <div className="space-y-2">
            {monthlyData.map((d) => (
              <div key={d.month} className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-text-muted)] w-16 shrink-0">{d.month}</span>
                <div className="flex-1 h-5 bg-[var(--color-bg)] rounded-[var(--radius-sm)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-primary)] rounded-[var(--radius-sm)] transition-all"
                    style={{ width: `${(d.count / maxMonthly) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-[var(--color-text)] w-8 text-right">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      </Can>
    </div>
  );
}
