import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import { useTranslation } from '../../i18n';
import { Can } from '../../permissions/Can';
import { useCan } from '../../hooks/useCan';
import api from '../../services/api';

const sportIcons: Record<string, string> = {
  football: '⚽', padel: '🎾', tennis: '🎾', basketball: '🏀', volleyball: '🏐', squash: '🏓',
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const refreshOrganisations = useAuthStore((s) => s.refreshOrganisations);
  const navigate = useNavigate();

  useEffect(() => {
    void refreshOrganisations();
  }, [refreshOrganisations]);
  const { t } = useTranslation();
  const { can } = useCan();
  const showRecentActivity = can('home.recent-activity');

  const actions = [
    { title: t('nav.tournaments'), description: t('home.tournaments_desc'), icon: '🏆', color: 'var(--color-warning)', to: '/tournaments' },
    { title: t('nav.coaches'), description: t('home.coaches_desc'), icon: '👨‍🏫', color: 'var(--color-info)', to: '/coaches' },
    { title: t('nav.academies'), description: t('home.academies_desc'), icon: '🏫', color: 'var(--color-primary)', to: '/academies' },
    { title: t('nav.community'), description: t('home.community_desc'), icon: '👥', color: 'var(--color-success)', to: '/community/events' },
  ];

  const { data: bookingsData } = useQuery({
    queryKey: ['my-bookings', 'recent'],
    queryFn: () => api.get('/bookings?status=&limit=5').then((r) => r.data),
    enabled: showRecentActivity,
  });

  const bookings = bookingsData?.data || [];
  const isSeller = user?.roles?.some(r => r === 'seller');

  const sellerActions = isSeller ? [
    { title: t('nav.my_shop'), description: t('home.my_shop_desc'), icon: '🏪', color: 'var(--color-primary)', to: '/marketplace/seller' },
    { title: t('home.my_products'), description: t('home.my_products_desc'), icon: '📦', color: 'var(--color-success)', to: '/marketplace/seller' },
    { title: t('home.my_orders'), description: t('home.my_orders_desc'), icon: '📋', color: 'var(--color-accent)', to: '/marketplace/orders' },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {actions.map((a) => (
          <QuickActionCard key={a.title} {...a} onClick={() => navigate(a.to)} />
        ))}
      </div>

      {isSeller && (
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">{t('home.seller_dashboard')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {sellerActions.map((a) => (
              <QuickActionCard key={a.title} {...a} onClick={() => navigate(a.to!)} />
            ))}
          </div>
        </div>
      )}

      <Can permission="home.recent-activity">
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] p-6">
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">{t('home.recent_activity')}</h2>
          <div className="space-y-3">
            {bookings.length === 0 && (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-4">{t('home.no_activity')}</p>
            )}
            {bookings.slice(0, 5).map((b: any) => (
              <div key={b.id} className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)]">
                <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-lg">
                  {sportIcons[b.sport_name?.toLowerCase()] || '🎯'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text)] truncate">
                    {b.resource_name} · {b.branch_name}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {new Date(b.booking_date).toLocaleDateString('en-GB')} · {b.start_time?.slice(0, 5)}–{b.end_time?.slice(0, 5)}
                  </p>
                </div>
                <span className={`shrink-0 px-2 py-0.5 text-xs rounded-full ${
                  b.booking_status === 'confirmed' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                  b.booking_status === 'checked_in' ? 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]' :
                  b.booking_status === 'completed' ? 'bg-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-surface)] text-[var(--color-text-muted)]' :
                  b.booking_status === 'cancelled' ? 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]' :
                  'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'
                }`}>{b.booking_status}</span>
              </div>
            ))}
          </div>
        </div>
      </Can>

      <div className="h-24 bg-gradient-to-r from-[var(--color-primary)]/5 to-[var(--color-secondary)]/5 rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--color-border)] flex items-center justify-center">
        <p className="text-sm text-[var(--color-text-muted)]">{t('home.ad_space')}</p>
      </div>
    </div>
  );
}

function QuickActionCard({ title, description, icon, color, onClick }: { title: string; description: string; icon: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-3 md:p-6 text-left hover:shadow-[var(--shadow-md)] transition-all hover:-translate-y-0.5 group h-full"
    >
      <div
        className="w-9 h-9 md:w-12 md:h-12 rounded-[var(--radius-md)] flex items-center justify-center text-xl md:text-2xl mb-2 md:mb-4"
        style={{ backgroundColor: `${color}15` }}
      >
        {icon}
      </div>
      <h3 className="font-semibold text-xs md:text-base text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors leading-snug">
        {title}
      </h3>
      <p className="text-sm text-[var(--color-text-muted)] mt-1 hidden md:block">{description}</p>
    </button>
  );
}
