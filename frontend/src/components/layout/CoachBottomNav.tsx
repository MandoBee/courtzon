import { useNavigate, useLocation } from 'react-router-dom';
import { COACH_NAV } from '../../pages/coaches/coach-nav';

const MAIN_TABS = COACH_NAV.slice(0, 4);
const MORE_TABS = COACH_NAV.slice(4);

export default function CoachBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[60] bg-[var(--color-surface)] border-t border-[var(--color-border)] cz-pb-safe md:hidden">
      <div className="flex items-center justify-around h-14">
        {MAIN_TABS.map((tab) => (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
              isActive(tab.path)
                ? 'text-[var(--color-primary)]'
                : 'text-[var(--color-text-muted)]'
            }`}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
          </button>
        ))}
        <button
          onClick={() => navigate(MORE_TABS[0]?.path || '/coach/profile')}
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
            MORE_TABS.some((t) => isActive(t.path))
              ? 'text-[var(--color-primary)]'
              : 'text-[var(--color-text-muted)]'
          }`}
        >
          <span className="text-lg leading-none">•••</span>
          <span className="text-[10px] font-medium leading-tight">More</span>
        </button>
      </div>
    </nav>
  );
}
