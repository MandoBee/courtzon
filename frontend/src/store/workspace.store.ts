import { create } from 'zustand';
import { useAuthStore } from './auth.store';

export type Workspace = 'player' | 'coach' | 'resident_coach' | 'referee' | 'organization' | 'platform';

export const WORKSPACE_KEYS: readonly Workspace[] = [
  'player',
  'coach',
  'resident_coach',
  'referee',
  'organization',
  'platform',
];

interface WorkspaceState {
  activeWorkspace: Workspace;
  setActiveWorkspace: (workspace: Workspace) => void;
  getAccessibleWorkspaces: () => Workspace[];
  canAccessWorkspace: (workspace: Workspace) => boolean;
}

/**
 * Central role → workspace mapping.
 *
 * Single source of truth for which workspaces each role may occupy. Roles not
 * listed here fall through to the player workspace (least privilege default).
 */
const roleWorkspaceMap: Record<string, Workspace[]> = {
  player: ['player'],
  coach: ['coach'],
  independent_coach: ['player', 'coach'],
  resident_coach: ['resident_coach'],
  referee: ['referee'],
  'org-admin': ['organization'],
  'branch-mgr': ['organization'],
  'resource-mgr': ['organization'],
  'shop-admin': ['organization'],
  accountant: ['platform'],
  super_admin: ['platform'],
  'super-admin': ['platform'],
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
  if (workspaces.includes('referee')) return 'referee';
  if (workspaces.includes('resident_coach')) return 'resident_coach';
  return 'player';
}

/**
 * Home path for a workspace. The organization workspace resolves to the user's
 * first org portal; falls back to `/app` when the user has no org scope.
 */
export function getWorkspaceHomePath(workspace: Workspace, orgs?: Array<{ id: number }>): string {
  switch (workspace) {
    case 'player':
      return '/app';
    case 'coach':
    case 'resident_coach':
      return '/coach/dashboard';
    case 'referee':
      return '/referee/dashboard';
    case 'organization':
      return orgs && orgs.length > 0 ? `/org/${orgs[0].id}/dashboard` : '/app';
    case 'platform':
      return '/admin';
  }
}

/**
 * Resolve the workspace + home path for the current authenticated user.
 * Used by login, landing, and route-guard redirects so every role lands in
 * its own workspace (never another role's).
 */
export function resolveUserHome(): { workspace: Workspace; path: string } {
  const user = useAuthStore.getState().user;
  const workspaces = deriveWorkspaces(user?.roles || []);
  const workspace = defaultWorkspace(workspaces);
  return { workspace, path: getWorkspaceHomePath(workspace, user?.organisations || []) };
}

function loadPersistedWorkspace(): Workspace | null {
  try {
    const stored = localStorage.getItem('cz_active_workspace');
    if (stored && (WORKSPACE_KEYS as readonly string[]).includes(stored)) {
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
