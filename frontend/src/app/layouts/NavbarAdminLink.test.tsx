import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../../App';
import { useAuthStore } from '../../store/auth.store';

/**
 * P3-10 — the Navbar admin link must mirror the `/admin` route guard: the same
 * permission predicate (`hasPlatformAdminAccess`), never role strings.
 *
 * The P3-05 route-guard suite covers `AdminRoute`/`ProtectedRoute` in isolation;
 * the Navbar is private to `App.tsx`, so this exercises the full App instead.
 * The legacy-role case would fail against the pre-P3-05 implementation, which
 * showed the Admin link for `super-admin`/`admin`/`accountant` regardless of
 * granted permissions.
 */

vi.mock('../../services/api', () => ({
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

vi.mock('../../realtime/SocketContext', () => ({
  useSocketContext: () => ({ socket: null, isConnected: false, state: 'uninitialized', subscribe: () => () => {} }),
  SocketProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('../../components/pwa/PWAUpdatePrompt', () => ({ default: () => null }));
vi.mock('../../components/pwa/IOSInstallSheet', () => ({ default: () => null }));
vi.mock('../../components/InstallPrompt', () => ({ default: () => null }));

const LEGACY_ADMIN_ROLES = ['super-admin', 'super_admin', 'admin', 'master-admin', 'accountant'];

function setUser(permissions: string[], roles: string[] = []) {
  useAuthStore.setState({
    user: { id: 1, publicId: 'u1', fullName: 'Test User', email: 'u@example.com', roles, permissions },
    isAuthenticated: true,
    isLoading: false,
    checkAuth: async () => {},
  } as never);
}

async function renderAppAt(path: string) {
  window.history.pushState({}, '', path);
  render(<App />);
  // The consumer shell (Navbar) must be mounted before link assertions.
  await screen.findAllByRole('navigation');
}

const adminLink = () => document.querySelector('nav a[href="/admin"]');

describe('Navbar admin link mirrors the /admin permission guard', () => {
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
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false } as never);
  });

  it('shows the Admin link for a user granted dashboard.view (no admin role string)', async () => {
    setUser(['dashboard.view'], ['auditor']);
    await renderAppAt('/notifications');
    await waitFor(() => expect(adminLink()).not.toBeNull());
  });

  it('shows the Admin link for the platform.admin fallback key', async () => {
    setUser(['platform.admin'], ['super_admin']);
    await renderAppAt('/notifications');
    await waitFor(() => expect(adminLink()).not.toBeNull());
  });

  it('hides the Admin link for legacy admin role strings without the permission', async () => {
    setUser([], LEGACY_ADMIN_ROLES);
    await renderAppAt('/bookings');
    await waitFor(() => expect(screen.queryAllByRole('link').length).toBeGreaterThan(0));
    expect(adminLink()).toBeNull();
  });

  it('hides the Admin link for a player', async () => {
    setUser(['bookings.view', 'player.dashboard.view'], ['player']);
    await renderAppAt('/bookings');
    await waitFor(() => expect(screen.queryAllByRole('link').length).toBeGreaterThan(0));
    expect(adminLink()).toBeNull();
  });

  it('reacts while mounted when the permission is granted', async () => {
    setUser([], ['auditor']);
    await renderAppAt('/notifications');
    expect(adminLink()).toBeNull();

    setUser(['dashboard.view'], ['auditor']);
    await waitFor(() => expect(adminLink()).not.toBeNull());
    // /notifications is exempt from the /app → /admin bounce: no navigation occurs.
    expect(window.location.pathname).toBe('/notifications');
  });
});
