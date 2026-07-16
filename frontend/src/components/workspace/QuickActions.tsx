import { Can } from '../../permissions/Can';

interface ActionItem {
  icon: string;
  label: string;
  onClick: () => void;
  permission?: string;
}

interface Props {
  actions: ActionItem[];
  accentColor?: string;
  title?: string;
  icon?: string;
  columns?: 2 | 4;
}

export default function QuickActions({
  actions, accentColor, title = 'Quick Actions', icon = '⚡', columns = 4,
}: Props) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide">{title}</h2>
      </div>
      <div className={`grid ${columns === 2 ? 'grid-cols-2' : 'grid-cols-4'} gap-2 md:gap-3`}>
        {actions.map((action) => (
          <Can key={action.label} permission={action.permission ?? '__always__'}>
            <button
              onClick={action.onClick}
              className="flex flex-col items-center gap-1.5 p-3 md:p-4 rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-border)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200 group"
            >
              <div
                className="w-10 h-10 md:w-12 md:h-12 rounded-[var(--radius-md)] flex items-center justify-center text-lg md:text-xl"
                style={accentColor ? { backgroundColor: `${accentColor}12` } : { backgroundColor: 'var(--color-primary-light)' }}
              >
                {action.icon}
              </div>
              <span className="text-[11px] md:text-xs font-semibold text-[var(--color-text)] text-center leading-tight group-hover:text-[var(--color-primary)] transition-colors">
                {action.label}
              </span>
            </button>
          </Can>
        ))}
      </div>
    </section>
  );
}
