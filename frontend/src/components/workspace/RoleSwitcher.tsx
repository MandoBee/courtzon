import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore, type Workspace } from '../../store/workspace.store';
import { useAuthStore } from '../../store/auth.store';
import { useHaptics } from '../../hooks/useHaptics';

const workspaceMeta: Record<Workspace, { label: string; icon: string; homePath: string }> = {
  player: { label: 'Player', icon: '👤', homePath: '/app' },
  coach: { label: 'Coach', icon: '🏋️', homePath: '/coaches/sessions/me' },
  resident_coach: { label: 'Resident Coach', icon: '🏢', homePath: '/coaches/sessions/me' },
  organization: { label: 'Organization', icon: '🏛️', homePath: '/org' },
  platform: { label: 'Admin', icon: '⚙️', homePath: '/admin' },
};

export default function RoleSwitcher() {
  const [open, setOpen] = useState(false);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const getAccessibleWorkspaces = useWorkspaceStore((s) => s.getAccessibleWorkspaces);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { tap } = useHaptics();

  const accessible = getAccessibleWorkspaces();
  const userOrganisations = user?.organisations || [];

  if (accessible.length <= 1) return null;

  const handleSwitch = (ws: Workspace) => {
    tap();
    setActiveWorkspace(ws);
    const meta = workspaceMeta[ws];
    if (ws === 'organization' && userOrganisations.length > 0) {
      const org = userOrganisations[0];
      navigate(`/org/${org.id}/dashboard`);
    } else {
      navigate(meta.homePath);
    }
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] transition-colors"
        aria-label="Switch workspace"
      >
        <span>{workspaceMeta[activeWorkspace].icon}</span>
        <span className="hidden sm:inline">{workspaceMeta[activeWorkspace].label}</span>
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-64 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg z-[110] overflow-hidden">
            <div className="px-4 py-2 border-b border-[var(--color-border)]">
              <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Switch Workspace</p>
            </div>
            <div className="py-1">
              {accessible.map((ws) => {
                const meta = workspaceMeta[ws];
                const isActive = ws === activeWorkspace;
                const orgLabel = ws === 'organization' && userOrganisations.length > 0
                  ? userOrganisations[0].name
                  : meta.label;
                return (
                  <button
                    key={ws}
                    onClick={() => handleSwitch(ws)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isActive
                        ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                        : 'text-[var(--color-text)] hover:bg-[var(--color-primary-light)]'
                    }`}
                  >
                    <span className="text-lg">{meta.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{orgLabel}</p>
                      {ws === 'organization' && userOrganisations.length > 0 && (
                        <p className="text-xs text-[var(--color-text-muted)]">Organization</p>
                      )}
                    </div>
                    {isActive && (
                      <svg className="w-4 h-4 ml-auto text-[var(--color-primary)]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
