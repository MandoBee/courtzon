import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuthStore } from '../../store/auth.store';

/**
 * P3-10 — per-section `/admin/*` authorization inside AdminLayout.
 *
 * Covers the two layers that sit behind the coarse `AdminRoute` gate:
 *   1. `getAdminRoutePermission()` — the route must hold its mapped key;
 *   2. the defensive accountant deny-list (B15) — a restricted finance role is
 *      refused on privileged sections even if a grant drift ever gave it the key.
 */

vi.mock('../../components/layout/AdminSidebar', () => ({ default: () => <div data-testid="admin-sidebar" /> }));
vi.mock('../../components/branding/SiteLogo', () => ({ default: () => <div data-testid="site-logo" /> }));
vi.mock('../../components/pwa/OfflineBanner', () => ({ default: () => null }));
vi.mock('../../components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function setUser(permissions: string[], roles: string[] = []) {
  useAuthStore.setState({
    user: { id: 1, roles, permissions },
    isAuthenticated: true,
    isLoading: false,
  } as never);
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/admin/users" element={<div>users-page</div>} />
          <Route path="/admin/finance" element={<div>finance-page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminLayout — per-section permission and accountant deny-list', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false } as never);
  });

  it('renders a section when its mapped permission is granted', () => {
    setUser(['*'], ['super_admin']);
    renderAt('/admin/users');
    expect(screen.getByText('users-page')).toBeInTheDocument();
  });

  it('denies a section when the mapped permission is missing', () => {
    setUser(['bookings.view'], ['auditor']);
    renderAt('/admin/users');
    expect(screen.queryByText('users-page')).toBeNull();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });

  it('denies a privileged section for the accountant role even with the key (defensive deny-list)', () => {
    setUser(['users.view'], ['accountant']);
    renderAt('/admin/users');
    expect(screen.queryByText('users-page')).toBeNull();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });

  it('allows the accountant role on a non-denied finance section it is granted', () => {
    setUser(['financial.view'], ['accountant']);
    renderAt('/admin/finance');
    expect(screen.getByText('finance-page')).toBeInTheDocument();
    expect(screen.queryByText('Access denied')).toBeNull();
  });

  it('keeps the sidebar mounted while a section is denied (navigation stays usable)', () => {
    setUser(['financial.view'], ['accountant']);
    renderAt('/admin/users');
    expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });
});
