import { useNavigate } from 'react-router-dom';
import { Can } from '../../permissions/Can';
import { useWorkspaceStore } from '../../store/workspace.store';
import { workspaceContent } from './workspace-content';

export default function SmartActions() {
  const navigate = useNavigate();
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const content = workspaceContent[activeWorkspace];

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">⚡</span>
        <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide">Quick Actions</h2>
      </div>
      <div className="grid grid-cols-4 gap-2 md:gap-3">
        {content.actions.map((action) => (
          <Can key={action.label} permission={action.permission ?? '__always__'}>
            <button
              onClick={() => navigate(action.to)}
              className="flex flex-col items-center gap-1.5 p-3 md:p-4 rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-border)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200 group"
            >
              <div
                className="w-10 h-10 md:w-12 md:h-12 rounded-[var(--radius-md)] flex items-center justify-center text-lg md:text-xl"
                style={{ backgroundColor: `${content.accentColor}12` }}
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
