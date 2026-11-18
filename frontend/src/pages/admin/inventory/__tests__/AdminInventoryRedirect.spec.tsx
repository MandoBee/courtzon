import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import App from '../../../../App';
import { useAuthStore } from '../../../../store/auth.store';
import { ADMIN_NAV } from '../../../../navigation/admin.registry';

/**
 * `/admin/inventory` index-route redirect.
 *
 * The Inventory section has no index page of its own — only Stock Levels,
 * Warehouses, Suppliers and Purchase Orders. The bare URL used to render the
 * SPA 404 surface, so it now redirects to the canonical Stock Levels screen.
 *
 * The redirect lives INSIDE the admin route group, so it must not bypass the
 * admin guard: a non-admin still gets the access-denied surface, never the
 * Inventory page.
 */

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 20 } }),
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

function has404Surface(): boolean {
  return /page not found/i.test(document.body.textContent || '');
}

describe('/admin/inventory index redirect', () => {
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

  it('1. redirects /admin/inventory → /admin/inventory/stock for an admin', async () => {
    setCurrentPath('/admin/inventory');
    useAuthStore.setState({
      user: makeUser({ roles: ['super_admin'], permissions: ['*'] }),
      isAuthenticated: true,
    } as any);

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/admin/inventory/stock'), { timeout: 15000 });
    // The canonical screen renders — not the SPA 404 surface.
    expect(has404Surface()).toBe(false);
    expect((await screen.findAllByText(/Stock/i)).length).toBeGreaterThan(0);
  }, 30000);

  it('2. the destination is still guard-protected (non-admin is blocked)', async () => {
    setCurrentPath('/admin/inventory');
    useAuthStore.setState({
      user: makeUser({ roles: ['player'], permissions: [] }),
      isAuthenticated: true,
    } as any);

    render(<App />);

    // Wait for the guard's actual decision surface instead of a fixed sleep:
    // under worker load a lazy route can take longer than an arbitrary 1.5s.
    expect(await screen.findByText('Access denied')).toBeTruthy();
    expect(window.location.pathname).not.toBe('/admin/inventory/stock');
    expect(has404Surface()).toBe(false);
  }, 30000);

  it('3. no redirect loop — the destination does not bounce back', async () => {
    setCurrentPath('/admin/inventory');
    useAuthStore.setState({
      user: makeUser({ roles: ['super_admin'], permissions: ['*'] }),
      isAuthenticated: true,
    } as any);

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/admin/inventory/stock'), { timeout: 15000 });
    // Flush any queued navigation effects; a real bounce-back would happen
    // during this act() rather than after an arbitrary wall-clock delay.
    await act(async () => {});
    expect(window.location.pathname).toBe('/admin/inventory/stock');
  }, 30000);

  it('4. existing child routes are unchanged', async () => {
    for (const path of [
      '/admin/inventory/stock',
      '/admin/inventory/warehouses',
      '/admin/inventory/suppliers',
      '/admin/inventory/purchase-orders',
    ]) {
      setCurrentPath(path);
      useAuthStore.setState({
        user: makeUser({ roles: ['super_admin'], permissions: ['*'] }),
        isAuthenticated: true,
      } as any);

      const { unmount } = render(<App />);
      // Await the lazily-loaded route's heading rather than sleeping 800ms:
      // the old sleep could expire before the chunk rendered under load.
      expect((await screen.findAllByRole('heading', { level: 1 })).length).toBeGreaterThan(0);
      await waitFor(() => expect(window.location.pathname).toBe(path), { timeout: 15000 });
      expect(has404Surface()).toBe(false);
      unmount();
    }
  }, 60000);

  it('5. sidebar navigation still targets the canonical Stock Levels URL', () => {
    const paths: string[] = [];
    const walk = (nodes: any[]) => {
      for (const n of nodes) {
        if (n.path) paths.push(String(n.path));
        if (Array.isArray(n.children)) walk(n.children);
      }
    };
    walk(ADMIN_NAV);

    expect(paths).toContain('/admin/inventory/stock');
    // The bare section URL is a redirect, not a navigation target.
    expect(paths).not.toContain('/admin/inventory');
  });
});
