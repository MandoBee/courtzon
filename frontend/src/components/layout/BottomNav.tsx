import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { useTranslation } from '../../i18n';

export default function BottomNav() {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const { t } = useTranslation();

  const isSeller = user && user.isSeller;

  const tabs = [
    { label: t('nav.home'), icon: '🏠', path: '/app' },
    { label: t('nav.bookings'), icon: '📅', path: '/bookings' },
    { label: t('nav.matches'), icon: '🎯', path: '/matches' },
    { label: t('nav.marketplace'), icon: '🛒', path: '/marketplace' },

    ...(isSeller ? [{ label: t('nav.my_shop'), icon: '🏪', path: '/marketplace/seller' }] : []),
    { label: t('nav.profile'), icon: '👤', path: '/profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--color-surface)] border-t border-[var(--color-border)] md:hidden">
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const isActive =
            tab.path === '/app'
              ? location.pathname === '/app' || location.pathname === '/'
              : location.pathname === tab.path;
          return (
            <Link key={tab.path} to={tab.path}
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 min-w-0 transition-colors ${
                isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'
              }`}>
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
