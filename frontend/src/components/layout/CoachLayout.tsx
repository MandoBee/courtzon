import { Outlet } from 'react-router-dom';
import CoachBottomNav from './CoachBottomNav';
import OfflineBanner from '../pwa/OfflineBanner';
import { ErrorBoundary } from '../ErrorBoundary';

export default function CoachLayout() {
  return (
    <div className="flex flex-col h-dvh bg-[var(--color-bg)]">
      <OfflineBanner />
      <main className="flex-1 overflow-y-auto min-h-0 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-20 md:pb-6 overflow-x-hidden cz-scrollbar-hide">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <CoachBottomNav />
    </div>
  );
}
