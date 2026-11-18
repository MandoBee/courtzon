import { useNavigate } from 'react-router-dom';

interface ActionItem {
  label: string;
  count?: number;
  path: string;
  color?: string;
  icon?: string;
  onClick?: () => void;
  /** Optional action-level key, checked in addition to the route predicate. */
  permission?: string;
}

interface QuickActionItem {
  label: string;
  icon: string;
  path: string;
  permission?: string;
}

interface ActionCenterProps {
  actions: ActionItem[];
  title?: string;
  /**
   * Route-level predicate and permission checker are supplied by the caller so
   * actions pointing at surfaces the actor cannot open are omitted entirely
   * (not CSS-hidden), and links cannot bypass authorization.
   */
  canAccess: (path: string) => boolean;
  can: (permission: string) => boolean;
}

export function ActionCenter({ actions, title = 'Action Center', canAccess, can }: ActionCenterProps) {
  const navigate = useNavigate();
  const visibleActions = actions.filter(
    (a) => canAccess(a.path) && (!a.permission || can(a.permission)),
  );
  return (
    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
      <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">{title}</h2>
      <div className="space-y-2">
        {visibleActions.map((a, i) => (
          <div
            key={`${a.path}-${a.label}-${i}`}
            role="button"
            tabIndex={0}
            onClick={() => { if (a.onClick) a.onClick(); else navigate(a.path); }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              if (a.onClick) a.onClick(); else navigate(a.path);
            }}
            className="flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer hover:bg-[var(--color-bg)] transition-colors"
          >
            <div className="flex items-center gap-2">
              {a.icon && <span>{a.icon}</span>}
              <span className="text-sm text-[var(--color-text)]">{a.label}</span>
            </div>
            {a.count !== undefined && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${a.color || 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'}`}>
                {a.count}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface QuickActionsProps {
  actions: QuickActionItem[];
  canAccess: (path: string) => boolean;
  can: (permission: string) => boolean;
  title?: string;
}

export function QuickActions({ actions, canAccess, can, title = 'Quick Actions' }: QuickActionsProps) {
  const navigate = useNavigate();
  const visibleActions = actions.filter(
    (a) => canAccess(a.path) && (!a.permission || can(a.permission)),
  );
  return (
    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
      <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">{title}</h2>
      <div className="grid grid-cols-2 gap-2">
        {visibleActions.map((a, i) => (
          <button
            key={`${a.path}-${a.label}-${i}`}
            onClick={() => navigate(a.path)}
            className="flex items-center gap-2 px-3 py-2 text-xs bg-[var(--color-bg)] rounded-xl hover:bg-[var(--color-primary)]/10 transition-colors text-left"
          >
            <span>{a.icon}</span>
            <span className="text-[var(--color-text)]">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
