import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { leagueApi } from '../../../services/league';

const cardClass = 'bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5';
const labelClass = 'text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider';
const valueClass = 'text-2xl font-bold text-[var(--color-text)] mt-1';

export default function LeagueDashboardPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ['league-dashboard'],
    queryFn: () => leagueApi.getDashboard(),
  });

  if (error) {
    showToast(t('admin.league.dashboard.load_error'), 'error');
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('admin.league.dashboard.title')}</h1>
        <SkeletonRow count={4} />
      </div>
    );
  }

  const stats = [
    { key: 'total_leagues', label: t('admin.league.dashboard.total_leagues'), value: data?.total_leagues ?? 0 },
    { key: 'open_registrations', label: t('admin.league.dashboard.open_registrations'), value: data?.open_registrations ?? 0 },
    { key: 'running', label: t('admin.league.dashboard.running'), value: data?.running ?? 0 },
    { key: 'completed', label: t('admin.league.dashboard.completed'), value: data?.completed ?? 0 },
    { key: 'total_teams', label: t('admin.league.dashboard.total_teams'), value: data?.total_teams ?? 0 },
    { key: 'total_matches', label: t('admin.league.dashboard.total_matches'), value: data?.total_matches ?? 0 },
    { key: 'completed_matches', label: t('admin.league.dashboard.completed_matches'), value: data?.completed_matches ?? 0 },
  ];

  return (
    <Can permission="admin-leagues.view">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('admin.league.dashboard.title')}</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.key} className={cardClass}>
              <p className={labelClass}>{s.label}</p>
              <p className={valueClass}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    </Can>
  );
}
