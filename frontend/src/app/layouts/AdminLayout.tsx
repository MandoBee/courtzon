import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AdminSidebar from '../../components/layout/AdminSidebar';
import SiteLogo from '../../components/branding/SiteLogo';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import OfflineBanner from '../../components/pwa/OfflineBanner';
import { useCan } from '../../hooks/useCan';
import { useAuthStore } from '../../store/auth.store';
import { getAdminRoutePermission, isAdminDeniedRoute } from '../../permissions/adminRoutePermissions';

export default function AdminLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const { can } = useCan();
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const [lastPath, setLastPath] = useState(location.pathname);
  if (location.pathname !== lastPath) {
    setLastPath(location.pathname);
    setDrawerOpen(false);
  }

  const isRestrictedFinanceRole = roles.includes('accountant');
  const denied = isRestrictedFinanceRole && isAdminDeniedRoute(location.pathname);
  const required = getAdminRoutePermission(location.pathname);
  const forbidden = denied || (required !== null && !can(required));

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg)] contain-paint">
      <OfflineBanner />
      <div className="flex flex-1 min-h-0">
        {drawerOpen && (
          <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setDrawerOpen(false)} />
        )}
        <div className={`fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 md:static md:translate-x-0 md:transform-none cz-pt-safe cz-pb-safe ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <AdminSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="md:hidden sticky top-0 z-20 flex items-center gap-3 px-4 h-14 bg-[var(--color-surface)] border-b border-[var(--color-border)] cz-pt-safe cz-px-safe">
            <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="text-2xl leading-none text-[var(--color-text)]">☰</button>
            <SiteLogo to="/admin" size="sm" />
          </header>
          <main className="flex-1 min-h-0 p-4 sm:p-6 overflow-auto">
            {forbidden ? (
              <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
                <span className="text-3xl">🔒</span>
                <p className="text-lg font-semibold text-[var(--color-text)]">Access denied</p>
                <p className="text-sm text-[var(--color-muted)]">
                  You don&apos;t have permission to view this page.
                </p>
                <a href="/admin" className="mt-2 text-sm font-medium text-[var(--color-primary)]">
                  Go to dashboard
                </a>
              </div>
            ) : (
              <ErrorBoundary>
                <Outlet />
              </ErrorBoundary>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
