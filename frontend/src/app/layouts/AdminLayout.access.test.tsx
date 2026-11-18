import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuthStore } from '../../store/auth.store';
import { getAdminRoutePermission } from '../../permissions/adminRoutePermissions';

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
          <Route path="/admin" element={<div>admin-home</div>} />
          <Route path="/admin/users" element={<div>users-page</div>} />
          <Route path="/admin/finance" element={<div>finance-page</div>} />
          <Route path="/admin/inventory/stock" element={<div>inventory-page</div>} />
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

  it('allows a global finance role on the finance section it is granted', () => {
    // D4 — /admin/finance is gated by financial.reports.view (global
    // super_admin / finance-manager policy), not by the broad financial.view.
    setUser(['financial.reports.view'], ['finance-manager']);
    renderAt('/admin/finance');
    expect(screen.getByText('finance-page')).toBeInTheDocument();
    expect(screen.queryByText('Access denied')).toBeNull();
  });

  it('denies the accountant role on /admin/finance even with financial.view', () => {
    // D4 — accountant keeps organisation-scoped finance but no longer reaches
    // the global Financial Dashboard.
    setUser(['financial.view', 'reports.view'], ['accountant']);
    renderAt('/admin/finance');
    expect(screen.queryByText('finance-page')).toBeNull();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });

  it('keeps the sidebar mounted while a section is denied (navigation stays usable)', () => {
    setUser(['financial.view'], ['accountant']);
    renderAt('/admin/users');
    expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });
});

// A1 (Inventory UAT 2026-11-16) — `/admin/inventory/*` is a platform
// administration surface on the backend (`requirePlatformAdmin`). The route gate
// must therefore require `platform.admin`, not the sidebar layout key, so a role
// holding `sidebar.inventory*` gets the explicit Access denied surface instead
// of a page whose every API call returns 403.
describe('A1 — admin Inventory route requires platform.admin', () => {
  const INVENTORY_NAV_KEYS = [
    'sidebar.inventory',
    'sidebar.inventory-stock',
    'sidebar.inventory-warehouses',
    'sidebar.inventory-suppliers',
    'sidebar.inventory-purchase-orders',
  ];

  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false } as never);
  });

  it('maps the inventory route to platform.admin', () => {
    expect(getAdminRoutePermission('/admin/inventory')).toBe('platform.admin');
    expect(getAdminRoutePermission('/admin/inventory/stock')).toBe('platform.admin');
    expect(getAdminRoutePermission('/admin/inventory/purchase-orders')).toBe('platform.admin');
  });

  it('denies a role that holds sidebar.inventory* + dashboard.view but not platform.admin', () => {
    setUser(['dashboard.view', ...INVENTORY_NAV_KEYS], ['auditor']);
    renderAt('/admin/inventory/stock');

    expect(screen.queryByText('inventory-page')).toBeNull();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });

  it('denies the same role the read-only-admin role set', () => {
    setUser(['dashboard.view', ...INVENTORY_NAV_KEYS], ['read-only-admin']);
    renderAt('/admin/inventory/stock');

    expect(screen.queryByText('inventory-page')).toBeNull();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });

  it('allows super_admin (platform.admin granted)', () => {
    setUser(['*'], ['super_admin']);
    renderAt('/admin/inventory/stock');

    expect(screen.getByText('inventory-page')).toBeInTheDocument();
    expect(screen.queryByText('Access denied')).toBeNull();
  });

  it('allows an explicit platform.admin holder', () => {
    setUser(['dashboard.view', 'platform.admin', ...INVENTORY_NAV_KEYS], ['auditor']);
    renderAt('/admin/inventory/stock');

    expect(screen.getByText('inventory-page')).toBeInTheDocument();
  });

  it('maps the /admin landing route to platform.admin (not the broader dashboard.view)', () => {
    expect(getAdminRoutePermission('/admin')).toBe('platform.admin');
  });

  it('reaches the /admin dashboard with platform.admin', () => {
    setUser(['platform.admin'], ['auditor']);
    renderAt('/admin');

    expect(screen.getByText('admin-home')).toBeInTheDocument();
    expect(screen.queryByText('Access denied')).toBeNull();
  });

  it('denies the /admin dashboard to a dashboard.view-only actor', () => {
    setUser(['dashboard.view'], ['auditor']);
    renderAt('/admin');

    expect(screen.queryByText('admin-home')).toBeNull();
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });
});
