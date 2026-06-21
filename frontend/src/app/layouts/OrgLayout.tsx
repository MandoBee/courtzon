import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import OrgSidebar from '../../components/layout/OrgSidebar';
import SiteLogo from '../../components/branding/SiteLogo';

export default function OrgLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      {drawerOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setDrawerOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 md:static md:translate-x-0 md:transform-none ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <OrgSidebar />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden sticky top-0 z-20 flex items-center gap-3 px-4 h-14 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
          <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="text-2xl leading-none text-[var(--color-text)]">☰</button>
          <SiteLogo to="/app" size="sm" variant="primary" className="min-w-0" />
        </header>
        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
