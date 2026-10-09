import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '../../../i18n';
import { Can } from '../../../permissions/Can';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { Button } from '../../../components/ui/Button';
import { tournamentApi } from '../../../services/tournament';

const cardClass = 'bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5';
const labelClass = 'text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider';
const valueClass = 'text-2xl font-bold text-[var(--color-text)] mt-1';

export default function TournamentDashboardPage() {
  const { t } = useTranslation();

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['tournament-dashboard'],
    queryFn: () => tournamentApi.getDashboard(),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('tournaments.dashboard.title')}</h1>
        <SkeletonRow count={4} />
      </div>
    );
  }

  // F-02 / TUX-01 — a failed fetch must never render the KPI grid with
  // fabricated zero values. Surface an explicit, recoverable error instead.
  // TUX-02 — the previous render-phase `showToast` side effect is removed;
  // the failure is communicated once through this panel, never duplicated.
  if (isError) {
    return (
      <Can permission="tournament.dashboard.view">
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('tournaments.dashboard.title')}</h1>
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <p className="text-sm text-[var(--color-error)]">{t('tournaments.dashboard.load_error')}</p>
            <Button onClick={() => refetch()} loading={isFetching} className="mt-4">
              {t('common.retry', 'Retry')}
            </Button>
          </div>
        </div>
      </Can>
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
    <Can permission="tournament.dashboard.view">
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
