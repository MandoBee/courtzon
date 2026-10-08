import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../../../../App';
import { useAuthStore } from '../../../../store/auth.store';
import { ADMIN_NAV } from '../../../../navigation/admin.registry';

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
  authApi: {
    login: vi.fn(),
    refresh: vi.fn().mockResolvedValue({ user: null }),
    me: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    checkUniqueness: vi.fn(),
    requestReactivation: vi.fn(),
  },
}));

vi.mock('../../../../realtime/SocketContext', () => ({
  useSocketContext: () => ({ socket: null, isConnected: false, state: 'uninitialized', subscribe: () => () => {} }),
  SocketProvider: ({ children }: any) => children,
}));

vi.mock('../../../../components/pwa/PWAUpdatePrompt', () => ({ default: () => null }));
vi.mock('../../../../components/pwa/IOSInstallSheet', () => ({ default: () => null }));
vi.mock('../../../../components/InstallPrompt', () => ({ default: () => null }));

const adminUser = {
  id: 1,
  publicId: 'u1',
  fullName: 'Admin',
  email: 'admin@example.com',
  isAdmin: true,
  roles: ['super_admin'],
  permissions: ['*'],
  organisations: [],
} as any;

/**
 * Step 5F — Release-N deprecation preparation for the legacy
 * `/admin/tournament/matches` screen:
 *  • the sidebar entry `nav.admin.tournament-matches` is REMOVED,
 *  • the route itself stays registered, URL-reachable and NOT redirected.
 */
describe('Legacy Tournament Matches sidebar deprecation (Step 5F)', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      checkAuth: async () => {},
    } as any);
  });

  it('1. the legacy sidebar item is no longer present in admin navigation', () => {
    const ids: string[] = [];
    const paths: string[] = [];
    const walk = (nodes: any[]) => {
      for (const n of nodes) {
        if (n.id) ids.push(String(n.id));
        if (n.path) paths.push(String(n.path));
        if (Array.isArray(n.children)) walk(n.children);
      }
    };
    walk(ADMIN_NAV);

    expect(ids).not.toContain('nav.admin.tournament-matches');
    expect(paths).not.toContain('/admin/tournament/matches');
  });

  it('2. Tournament Hub / List navigation remains present (canonical route to Hub → Matches)', () => {
    const all: any[] = [];
    const collect = (nodes: any[]) => {
      for (const n of nodes) {
        all.push(n);
        if (Array.isArray(n.children)) collect(n.children);
      }
    };
    collect(ADMIN_NAV);
    const list = all.find((n: any) => n.id === 'nav.admin.tournament-list');
    expect(list).toBeTruthy();
    expect(list.path).toBe('/admin/tournament/list');
  });

  it('3. other admin navigation remains unchanged (hub screens, monitoring, results)', () => {
    const ids: string[] = [];
    const collect = (nodes: any[]) => {
      for (const n of nodes) {
        ids.push(String(n.id));
        if (Array.isArray(n.children)) collect(n.children);
      }
    };
    collect(ADMIN_NAV);
    expect(ids).toContain('nav.admin.tournament-dashboard');
    expect(ids).toContain('nav.admin.tournament-list');
    expect(ids).toContain('nav.admin.tournament-bracket-types');
    expect(ids).toContain('nav.admin.match-results');
    expect(ids).toContain('nav.admin.matches');
  });

  it('4+5+6. route still exists, page renders on direct navigation, and NO redirect was introduced', async () => {
    window.history.pushState({}, '', '/admin/tournament/matches');
    useAuthStore.setState({ user: adminUser, isAuthenticated: true } as any);

    render(<App />);

    // The page renders (not redirected to anything else).
    expect(await screen.findByRole('heading', { level: 1, name: 'Tournament Matches' }, { timeout: 10000 })).toBeTruthy();
    // Confirm the URL is unchanged — no redirect element was added.
    await waitFor(() => expect(window.location.pathname).toBe('/admin/tournament/matches'));
    await new Promise((r) => setTimeout(r, 500));
    expect(window.location.pathname).toBe('/admin/tournament/matches');
  }, 30000);

  it('7a. /admin/tournaments still redirects to /admin/tournament/list (previous step intact)', async () => {
    window.history.pushState({}, '', '/admin/tournaments');
    useAuthStore.setState({ user: adminUser, isAuthenticated: true } as any);

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/admin/tournament/list'), { timeout: 15000 });
    expect(await screen.findByRole('heading', { level: 1, name: 'Tournaments' }, { timeout: 10000 })).toBeTruthy();
  }, 30000);

  it('7b. Tournament Hub remains accessible at its canonical URL', async () => {
    window.history.pushState({}, '', '/admin/tournament/list');
    useAuthStore.setState({ user: adminUser, isAuthenticated: true } as any);

    render(<App />);

    await screen.findByRole('heading', { level: 1, name: 'Tournaments' }, { timeout: 10000 });
    expect(window.location.pathname).toBe('/admin/tournament/list');
  }, 30000);
});