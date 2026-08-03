import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { useCan } from '../../hooks/useCan';
import { useTranslation } from '../../i18n';
import { REFEREE_NAV } from '../../pages/referee/referee-nav';
import RefereeBottomNav from './RefereeBottomNav';
import OfflineBanner from '../pwa/OfflineBanner';
import { ErrorBoundary } from '../ErrorBoundary';

export default function RefereeLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const { can } = useCan();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const visibleNav = REFEREE_NAV.filter((item) => !item.permission || can(item.permission));

  return (
    <div className="min-h-dvh bg-[var(--color-bg)]">
      <div className="hidden md:flex flex-col fixed inset-y-0 left-0 w-60 bg-[var(--color-surface)] border-r border-[var(--color-border)] z-40">
        <div className="flex items-center gap-2 px-4 h-16 border-b border-[var(--color-border)]">
          <span className="text-xl">🧾</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--color-text)] leading-tight truncate">Referee</p>
            <p className="text-[10px] text-[var(--color-text-muted)] leading-tight truncate">CourtZon Officiating</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
          {visibleNav.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-md)] text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)]/60'
                }`
              }
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-[var(--color-border)]">
          <p className="px-3 pb-2 text-xs text-[var(--color-text-muted)] truncate">{user?.fullName || user?.email}</p>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-[var(--radius-md)] text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--color-error)]/5 transition-colors"
          >
            <span className="text-base leading-none">🚪</span>
            <span>{t('common.logout', 'Logout')}</span>
          </button>
        </div>
      </div>

      <div className="md:ml-60 flex flex-col h-dvh">
        <OfflineBanner />
        <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">🧾</span>
            <p className="text-sm font-bold text-[var(--color-text)] truncate">Referee</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/referee/profile" className="flex items-center gap-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-sm">
              <span>👤</span>
              <span className="hidden xs:inline max-w-24 truncate">{user?.fullName?.split(' ')[0] || ''}</span>
            </Link>
            <button
              onClick={handleLogout}
              aria-label={t('common.logout', 'Logout')}
              className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
            >
              <span className="text-lg leading-none">🚪</span>
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto min-h-0 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-20 md:pb-6 overflow-x-hidden cz-scrollbar-hide">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
        <RefereeBottomNav />
      </div>
    </div>
  );
}
