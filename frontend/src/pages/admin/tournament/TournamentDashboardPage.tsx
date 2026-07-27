import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { tournamentApi } from '../../../services/tournament';

const cardClass = 'bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5';
const labelClass = 'text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider';
const valueClass = 'text-2xl font-bold text-[var(--color-text)] mt-1';

export default function TournamentDashboardPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ['tournament-dashboard'],
    queryFn: () => tournamentApi.getDashboard(),
  });

  if (error) {
    showToast(t('tournaments.dashboard.load_error'), 'error');
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('tournaments.dashboard.title')}</h1>
        <SkeletonRow count={4} />
      </div>
    );
  }

  const stats = [
    { key: 'total_tournaments', label: t('tournaments.dashboard.total_tournaments'), value: data?.total_tournaments ?? 0 },
    { key: 'open_registrations', label: t('tournaments.dashboard.open_registrations'), value: data?.open_registrations ?? 0 },
    { key: 'running', label: t('tournaments.dashboard.running'), value: data?.running ?? 0 },
    { key: 'completed', label: t('tournaments.dashboard.completed'), value: data?.completed ?? 0 },
    { key: 'registered_players', label: t('tournaments.dashboard.registered_players'), value: data?.registered_players ?? 0 },
    { key: 'scheduled_matches', label: t('tournaments.dashboard.scheduled_matches'), value: data?.scheduled_matches ?? 0 },
    { key: 'completed_matches', label: t('tournaments.dashboard.completed_matches'), value: data?.completed_matches ?? 0 },
  ];

  return (
    <Can permission="admin-tournaments.view">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('tournaments.dashboard.title')}</h1>
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
