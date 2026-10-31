import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminRoute, ProtectedRoute } from '../app/routes/RouteGuards';
import { useAuthStore } from '../store/auth.store';
import { useWorkspaceStore } from '../store/workspace.store';
import { PLATFORM_ADMIN_PERMISSIONS } from './platformAccess';
import { getAdminRoutePermission } from './adminRoutePermissions';

/**
 * P3-05 — route guards are permission-driven, not role-string driven.
 *
 * The guards are rendered through a real router so these tests prove enforcement at
 * the route boundary, not merely hidden navigation. The role-string cases are
 * intentional: a user holding every legacy admin role string but no permission grant
 * must be denied, and a user with the permission but no admin role string must pass.
 */

const LEGACY_ADMIN_ROLES = ['super-admin', 'super_admin', 'admin', 'master-admin', 'accountant'];

type AuthUser = NonNullable<ReturnType<typeof useAuthStore.getState>['user']>;

function setUser(permissions: string[], roles: string[] = []) {
  act(() => {
    useAuthStore.setState({
      user: { id: 1, roles, permissions } as AuthUser,
      isAuthenticated: true,
      isLoading: false,
    });
  });
}

function renderAdminRoute(path = '/admin') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<div>admin-home</div>} />
          <Route path="/admin/finance" element={<div>admin-finance</div>} />
        </Route>
        <Route path="/" element={<div>public-home</div>} />
        <Route path="/login" element={<div>login-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderProtectedRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/app" element={<div>player-app</div>} />
          <Route path="/bookings" element={<div>bookings-page</div>} />
          <Route path="/notifications" element={<div>notifications-page</div>} />
          <Route path="/org/:orgId/dashboard" element={<div>org-dashboard</div>} />
        </Route>
        <Route path="/admin" element={<div>admin-home</div>} />
        <Route path="/login" element={<div>login-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  act(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
    localStorage.removeItem('cz_active_workspace');
    useWorkspaceStore.setState({ activeWorkspace: 'player' });
  });
});

describe('AdminRoute — permission-based /admin guard', () => {
  it('redirects unauthenticated visitors to /login', () => {
    renderAdminRoute();
    expect(screen.getByText('login-page')).toBeInTheDocument();
    expect(screen.queryByText('admin-home')).not.toBeInTheDocument();
  });

  it('renders the admin outlet for a user granted dashboard.view', () => {
    setUser(['dashboard.view']);
    renderAdminRoute();
    expect(screen.getByText('admin-home')).toBeInTheDocument();
  });

  it('renders a nested admin section for a user granted dashboard.view', () => {
    setUser(['dashboard.view']);
    renderAdminRoute('/admin/finance');
    expect(screen.getByText('admin-finance')).toBeInTheDocument();
  });

  it('accepts the platform.admin fallback key used by the backend adminGuard', () => {
    setUser(['platform.admin']);
    renderAdminRoute();
    expect(screen.getByText('admin-home')).toBeInTheDocument();
  });

  it('allows wildcard permission holders', () => {
    setUser(['*']);
    renderAdminRoute();
    expect(screen.getByText('admin-home')).toBeInTheDocument();
  });

  it('denies a user holding only legacy admin role strings', () => {
    setUser([], LEGACY_ADMIN_ROLES);
    renderAdminRoute();
    expect(screen.queryByText('admin-home')).not.toBeInTheDocument();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });

  it('allows a user with dashboard.view even without an admin role string', () => {
    setUser(['dashboard.view'], ['player']);
    renderAdminRoute();
    expect(screen.getByText('admin-home')).toBeInTheDocument();
  });

  it('denies a non-admin permission holder', () => {
    setUser(['bookings.view', 'player.dashboard.view'], ['player']);
    renderAdminRoute();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });

  it('re-evaluates access when the permission is revoked while mounted', () => {
    setUser(['dashboard.view']);
    renderAdminRoute();
    expect(screen.getByText('admin-home')).toBeInTheDocument();

    setUser([]);

    expect(screen.queryByText('admin-home')).not.toBeInTheDocument();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });
});

describe('ProtectedRoute — platform-staff detection uses permissions', () => {
  it('redirects unauthenticated visitors to /login', () => {
    renderProtectedRoute('/bookings');
    expect(screen.getByText('login-page')).toBeInTheDocument();
  });

  it('lets a player without the admin permission through to consumer routes', () => {
    setUser(['bookings.view', 'player.dashboard.view'], ['player']);
    renderProtectedRoute('/bookings');
    expect(screen.getByText('bookings-page')).toBeInTheDocument();
  });

  it('redirects a dashboard.view holder away from consumer routes to /admin', () => {
    setUser(['dashboard.view'], ['auditor']);
    renderProtectedRoute('/bookings');
    expect(screen.getByText('admin-home')).toBeInTheDocument();
  });

  it('does not treat legacy admin role strings as platform staff', () => {
    setUser([], LEGACY_ADMIN_ROLES);
    renderProtectedRoute('/bookings');
    expect(screen.getByText('bookings-page')).toBeInTheDocument();
  });

  it('keeps /notifications reachable for platform staff', () => {
    setUser(['dashboard.view'], ['accountant']);
    renderProtectedRoute('/notifications');
    expect(screen.getByText('notifications-page')).toBeInTheDocument();
  });

  it('keeps the organisation portal reachable for platform staff', () => {
    setUser(['dashboard.view'], ['master-admin']);
    renderProtectedRoute('/org/42/dashboard');
    expect(screen.getByText('org-dashboard')).toBeInTheDocument();
  });

  it('does not redirect-loop a platform role that lacks the admin permission', () => {
    // The workspace store derives `platform` for this role, whose home is /admin, but
    // the guard must not bounce /app → /admin when the permission is absent.
    setUser([], ['accountant']);
    renderProtectedRoute('/app');
    expect(screen.getByText('player-app')).toBeInTheDocument();
  });

  it('re-evaluates the redirect when the permission is granted while mounted', () => {
    setUser([], ['player']);
    renderProtectedRoute('/bookings');
    expect(screen.getByText('bookings-page')).toBeInTheDocument();

    setUser(['dashboard.view'], ['player']);
    expect(screen.getByText('admin-home')).toBeInTheDocument();
  });
});

describe('admin route permission model', () => {
  it('keeps the guard key aligned with the canonical /admin route permission', () => {
    expect(getAdminRoutePermission('/admin')).toBe('dashboard.view');
    expect(PLATFORM_ADMIN_PERMISSIONS).toContain(getAdminRoutePermission('/admin'));
  });
});
