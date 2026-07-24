import { useNavigate } from 'react-router-dom';

interface ActionItem {
  label: string;
  count?: number;
  path: string;
  color?: string;
  icon?: string;
}

interface QuickActionItem {
  label: string;
  icon: string;
  path: string;
}

export function ActionCenter({ actions, title = 'Action Center' }: { actions: ActionItem[]; title?: string }) {
  const navigate = useNavigate();
  return (
    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
      <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">{title}</h2>
      <div className="space-y-2">
        {actions.map((a, i) => (
          <div key={i} onClick={() => navigate(a.path)}
            className="flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer hover:bg-[var(--color-bg)] transition-colors">
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

export function QuickActions({ actions, title = 'Quick Actions' }: { actions: QuickActionItem[]; title?: string }) {
  const navigate = useNavigate();
  return (
    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
      <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">{title}</h2>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((a, i) => (
          <button key={i} onClick={() => navigate(a.path)}
            className="flex items-center gap-2 px-3 py-2 text-xs bg-[var(--color-bg)] rounded-xl hover:bg-[var(--color-primary)]/10 transition-colors text-left">
            <span>{a.icon}</span>
            <span className="text-[var(--color-text)]">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
