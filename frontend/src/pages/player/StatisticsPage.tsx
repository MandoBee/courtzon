import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import { SkeletonRow } from '../../components/ui/Skeleton';
import api from '../../services/api';

function StatCard({ label, value, icon, sub }: { label: string; value: string | number | undefined | null; icon: string; sub?: string }) {
  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] p-4 flex items-center gap-3">
      <span className="text-2xl shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-[var(--color-text-muted)] truncate">{label}</p>
        <p className="text-lg font-bold text-[var(--color-text)]">{value ?? '—'}</p>
        {sub && <p className="text-xs text-[var(--color-text-muted)] truncate">{sub}</p>}
      </div>
    </div>
  );
}

export default function StatisticsPage() {
  const { t } = useTranslation();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['my', 'statistics'],
    queryFn: () => api.get('/my/statistics').then((r) => r.data?.data || r.data || {}),
  });

  const s: any = stats || {};

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 bg-[var(--color-border)] rounded animate-pulse" />
        <SkeletonRow count={4} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-[var(--color-text)]">{t('player.statistics')}</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label={t('player.total_bookings')} value={s.totalBookings ?? s.total_bookings ?? 0} icon="📅" />
        <StatCard label={t('player.matches_played')} value={s.matchesPlayed ?? s.matches_played ?? 0} icon="🤝" />
        <StatCard label={t('player.academy_sessions')} value={s.academySessions ?? s.academy_sessions ?? 0} icon="🎓" />
        <StatCard label={t('player.tournaments_joined')} value={s.tournamentsJoined ?? s.tournaments_joined ?? 0} icon="🏆" />
        <StatCard label={t('player.followers')} value={s.followers ?? s.totalFollowers ?? 0} icon="👥" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {s.membershipTier || s.membership_tier ? (
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
            <p className="text-xs text-[var(--color-text-muted)]">{t('player.membership_tier')}</p>
            <p className="text-lg font-bold text-[var(--color-text)]">{s.membershipTier ?? s.membership_tier}</p>
          </div>
        ) : null}

        {s.walletBalance != null || s.wallet_balance != null ? (
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
            <p className="text-xs text-[var(--color-text-muted)]">{t('player.wallet_balance')}</p>
            <p className="text-lg font-bold text-[var(--color-primary)]">
              {Number(s.walletBalance ?? s.wallet_balance).toFixed(2)} {s.currency || s.walletCurrency || ''}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
