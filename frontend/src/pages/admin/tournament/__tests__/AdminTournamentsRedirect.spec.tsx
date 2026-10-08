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

const baseUser = {
  id: 1,
  publicId: 'u1',
  fullName: 'Admin',
  email: 'admin@example.com',
  isAdmin: true,
  organisations: [],
} as any;

function makeUser(overrides: Record<string, unknown>) {
  return { ...baseUser, ...overrides };
}

function setCurrentPath(path: string) {
  window.history.pushState({}, '', path);
}

/**
 * Step 5D + 5G — legacy tournament admin redirects, exercised against the FULL
 * App (real router + real i18n), matching the org journal redirect test pattern:
 *   • Step 5D — `/admin/tournaments` (legacy list) → `/admin/tournament/list`
 *   • Step 5G — `/admin/tournament/matches` (legacy matches surface, now deleted)
 *     → `/admin/tournament/list`
 * The destination screen's own permission gate stays authoritative — the redirect
 * must not bypass authorization (verified for admin and non-admin users).
 */
describe('Legacy /admin/tournaments redirect', () => {
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

  it('1. redirects /admin/tournaments → /admin/tournament/list for an admin', async () => {
    setCurrentPath('/admin/tournaments');
    useAuthStore.setState({
      user: makeUser({ roles: ['super_admin'], permissions: ['*'] }),
      isAuthenticated: true,
    } as any);

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/admin/tournament/list'), { timeout: 15000 });
    // The canonical list screen actually renders (heading + search placeholder).
    expect(await screen.findByRole('heading', { level: 1, name: 'Tournaments' })).toBeTruthy();
    expect(await screen.findByPlaceholderText('Search tournaments...')).toBeTruthy();
  }, 30000);

  it('2. destination stays protected: a non-admin is blocked by the admin guard (no redirect bypass)', async () => {
    setCurrentPath('/admin/tournaments');
    useAuthStore.setState({
      user: makeUser({ roles: ['player'], permissions: [] }),
      isAuthenticated: true,
    } as any);

    render(<App />);

    await new Promise((r) => setTimeout(r, 1500));
    expect(window.location.pathname).not.toBe('/admin/tournament/list');
    expect(screen.queryByRole('heading', { level: 1, name: 'Tournaments' })).toBeNull();
  }, 30000);

  it('3. no redirect loop — the destination does not bounce back to the legacy path', async () => {
    setCurrentPath('/admin/tournaments');
    useAuthStore.setState({
      user: makeUser({ roles: ['super_admin'], permissions: ['*'] }),
      isAuthenticated: true,
    } as any);

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/admin/tournament/list'), { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 500));
    expect(window.location.pathname).toBe('/admin/tournament/list');
  }, 30000);

  it('4. existing /admin/tournament/list behavior is unchanged', async () => {
    setCurrentPath('/admin/tournament/list');
    useAuthStore.setState({
      user: makeUser({ roles: ['super_admin'], permissions: ['*'] }),
      isAuthenticated: true,
    } as any);

    render(<App />);

    await screen.findByRole('heading', { level: 1, name: 'Tournaments' });
    expect(window.location.pathname).toBe('/admin/tournament/list');
    expect(await screen.findByPlaceholderText('Search tournaments...')).toBeTruthy();
  }, 30000);

  it('5. sidebar navigation is unchanged (canonical list entry; no legacy /admin/tournaments item)', () => {
    const paths: string[] = [];
    const walk = (nodes: any[]) => {
      for (const n of nodes) {
        if (n.path) paths.push(String(n.path));
        if (Array.isArray(n.children)) walk(n.children);
      }
    };
    walk(ADMIN_NAV);

    // The sidebar still points admin users at the canonical workbench list.
    expect(paths).toContain('/admin/tournament/list');
    expect(paths).toContain('/admin/tournament/dashboard');
    // No navigation entry references the legacy UI paths.
    expect(paths).not.toContain('/admin/tournaments');
    expect(paths).not.toContain('/admin/tournament/matches');
  });

  it('6. /admin/tournament/matches now redirects to /admin/tournament/list (Step 5G)', async () => {
    setCurrentPath('/admin/tournament/matches');
    useAuthStore.setState({
      user: makeUser({ roles: ['super_admin'], permissions: ['*'] }),
      isAuthenticated: true,
    } as any);

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/admin/tournament/list'), { timeout: 15000 });
    // The canonical list screen renders (heading), not the deleted matches page.
    expect(await screen.findByRole('heading', { level: 1, name: 'Tournaments' }, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1, name: 'Tournament Matches' })).toBeNull();
  }, 30000);

  it('7. matches redirect does not bypass authorization (non-admin is blocked)', async () => {
    setCurrentPath('/admin/tournament/matches');
    useAuthStore.setState({
      user: makeUser({ roles: ['player'], permissions: [] }),
      isAuthenticated: true,
    } as any);

    render(<App />);

    await new Promise((r) => setTimeout(r, 1500));
    expect(window.location.pathname).not.toBe('/admin/tournament/list');
    expect(screen.queryByRole('heading', { level: 1, name: 'Tournaments' })).toBeNull();
  }, 30000);
});