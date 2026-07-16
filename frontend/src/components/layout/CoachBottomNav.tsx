import { useLocation, Link } from 'react-router-dom';
import { useCan } from '../../hooks/useCan';
import { useHaptics } from '../../hooks/useHaptics';
import { COACH_NAV } from '../../pages/coaches/coach-nav';

const MAIN_TABS = COACH_NAV.slice(0, 4);

export default function CoachBottomNav() {
  const location = useLocation();
  const { can } = useCan();
  const { tap } = useHaptics();

  const visible = MAIN_TABS.filter((tab) => !tab.permission || can(tab.permission));

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[60] bg-[var(--color-surface)] border-t border-[var(--color-border)] cz-pb-safe md:hidden">
      <div className="flex items-center justify-around h-14">
        {visible.map((tab) => (
          <Link
            key={tab.path}
            to={tab.path}
            onClick={tap}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
              isActive(tab.path) ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'
            }`}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
