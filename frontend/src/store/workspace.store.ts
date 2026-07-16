import { create } from 'zustand';
import { useAuthStore } from './auth.store';

export type Workspace = 'player' | 'coach' | 'resident_coach' | 'organization' | 'platform';

interface WorkspaceState {
  activeWorkspace: Workspace;
  setActiveWorkspace: (workspace: Workspace) => void;
  getAccessibleWorkspaces: () => Workspace[];
  canAccessWorkspace: (workspace: Workspace) => boolean;
}

const roleWorkspaceMap: Record<string, Workspace[]> = {
  player: ['player'],
  independent_coach: ['player', 'coach'],
  resident_coach: ['resident_coach'],
  'org-admin': ['organization'],
  'branch-mgr': ['organization'],
  super_admin: ['platform'],
  admin: ['platform'],
};

function deriveWorkspaces(roles: string[]): Workspace[] {
  const workspaces = new Set<Workspace>();
  for (const role of roles) {
    const mapped = roleWorkspaceMap[role];
    if (mapped) {
      for (const ws of mapped) workspaces.add(ws);
    }
  }
  return Array.from(workspaces);
}

function defaultWorkspace(workspaces: Workspace[]): Workspace {
  if (workspaces.includes('platform')) return 'platform';
  if (workspaces.includes('organization')) return 'organization';
  if (workspaces.includes('coach')) return 'coach';
  if (workspaces.includes('resident_coach')) return 'resident_coach';
  return 'player';
}

function loadPersistedWorkspace(): Workspace | null {
  try {
    const stored = localStorage.getItem('cz_active_workspace');
    if (stored && ['player', 'coach', 'resident_coach', 'organization', 'platform'].includes(stored)) {
      return stored as Workspace;
    }
  } catch { /* ignore */ }
  return null;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  activeWorkspace: loadPersistedWorkspace() || 'player',

  setActiveWorkspace: (workspace: Workspace) => {
    localStorage.setItem('cz_active_workspace', workspace);
    set({ activeWorkspace: workspace });
  },

  getAccessibleWorkspaces: () => {
    const user = useAuthStore.getState().user;
    return deriveWorkspaces(user?.roles || []);
  },

  canAccessWorkspace: (workspace: Workspace) => {
    const accessible = get().getAccessibleWorkspaces();
    return accessible.includes(workspace);
  },
}));

useAuthStore.subscribe((state) => {
  const user = state.user;
  if (!user) {
    localStorage.removeItem('cz_active_workspace');
    useWorkspaceStore.setState({ activeWorkspace: 'player' });
    return;
  }
  const accessible = deriveWorkspaces(user.roles || []);
  const current = useWorkspaceStore.getState().activeWorkspace;
  if (!accessible.includes(current)) {
    const next = defaultWorkspace(accessible);
    localStorage.setItem('cz_active_workspace', next);
    useWorkspaceStore.setState({ activeWorkspace: next });
  }
});
