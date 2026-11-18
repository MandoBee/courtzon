import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

/**
 * UR-01 / UR-03 / UR-04 — dashboard data errors and quick-action permissions.
 */
const mockGet = vi.fn();
vi.mock('../../services/api', () => ({ default: { get: (...args: any[]) => mockGet(...args) } }));

const LABELS: Record<string, string> = {
  'admin.dashboard.title': 'System Dashboard',
  'admin.dashboard.welcome': 'Welcome',
  'admin.dashboard.admin': 'Admin',
  'admin.dashboard.total_users': 'Total Users',
  'admin.dashboard.organisations': 'Organisations',
  'admin.dashboard.total_bookings': 'Total Bookings',
  'admin.dashboard.revenue': 'Revenue',
  'admin.dashboard.products': 'Products',
  'admin.dashboard.coaches': 'Coaches',
  'admin.dashboard.no_revenue': 'No revenue data yet',
  'admin.dashboard.no_bookings': 'No bookings data yet',
  'admin.dashboard.no_activity': 'No recent activity',
  'admin.dashboard.quick_actions': 'Quick Actions',
  'admin.dashboard.create_org': 'Create Organisation',
  'admin.dashboard.manage_roles': 'Manage Roles',
  'admin.dashboard.subscriptions': 'Subscriptions',
  'admin.dashboard.view_reports': 'View Reports',
  'admin.dashboard.manage_users': 'Manage Users',
  'admin.dashboard.audit_log': 'Audit Log',
};
vi.mock('../../i18n', () => ({ useTranslation: () => ({ t: (key: string) => LABELS[key] ?? key }) }));
vi.mock('../../components/ui', () => ({ Sparkline: () => <div data-testid="sparkline" /> }));

const mockAuth: { user: { permissions: string[]; roles: string[]; fullName: string } | null } = {
  user: { permissions: [], roles: [], fullName: 'QA Accountant' },
};
vi.mock('../../store/auth.store', () => {
  const useAuthStore = (selector: (s: typeof mockAuth) => unknown) => selector(mockAuth);
  return { useAuthStore: Object.assign(useAuthStore, { getState: () => mockAuth }) };
});

import AdminDashboard from './AdminDashboard';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}><AdminDashboard /></QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: {} } });
  mockAuth.user = { permissions: ['platform.admin'], roles: [], fullName: 'QA Accountant' };
});

describe('AdminDashboard — 403 data handling', () => {
  it('shows access denied instead of an empty dashboard when a data API returns 403', async () => {
    mockGet.mockRejectedValue({ response: { status: 403 } });
    renderPage();

    await waitFor(() => expect(screen.getByText('Access denied')).toBeTruthy());
    expect(screen.queryByText('Total Users')).toBeNull();
    expect(screen.queryByText('No revenue data yet')).toBeNull();
    expect(screen.queryByText('Quick Actions')).toBeNull();
  });

  it('preserves the genuine empty state for a successful 200 with no data', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('No revenue data yet')).toBeTruthy());
    expect(screen.getByText('Quick Actions')).toBeTruthy();
    expect(screen.queryByText('Access denied')).toBeNull();
  });

  it('UR-07: shows all assigned roles instead of an arbitrary first role', async () => {
    mockAuth.user = { permissions: ['platform.admin'], roles: ['player', 'accountant'], fullName: 'QA Accountant' };
    renderPage();

    await waitFor(() => expect(screen.getByText('player · accountant')).toBeTruthy());
    expect(screen.getByText('player · accountant').getAttribute('title')).toBe('player · accountant');
  });
});

describe('AdminDashboard — quick actions follow route permissions', () => {
  beforeEach(() => {
    mockAuth.user = {
      permissions: ['platform.admin', 'users.view', 'roles.view', 'organisations.view', 'organisations.create', 'audit.view', 'sidebar.audit', 'subscription.view', 'sidebar.subscription', 'reports.view'],
      roles: [],
      fullName: 'Platform Admin',
    };
  });

  it('renders authorised quick actions', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Quick Actions')).toBeTruthy());

    expect(screen.getByText('Manage Users')).toBeTruthy();
    expect(screen.getByText('Manage Roles')).toBeTruthy();
    expect(screen.getByText('Create Organisation')).toBeTruthy();
    expect(screen.getByText('Audit Log')).toBeTruthy();
  });

  it('omits quick actions the actor cannot open (no CSS hiding)', async () => {
    mockAuth.user = {
      permissions: ['platform.admin', 'reports.view', 'settlements.view', 'bookings.view', 'admin.bookings.view'],
      roles: ['accountant'],
      fullName: 'QA Accountant',
    };
    renderPage();
    await waitFor(() => expect(screen.getByText('Quick Actions')).toBeTruthy());

    expect(screen.queryByText('Manage Users')).toBeNull();
    expect(screen.queryByText('Manage Roles')).toBeNull();
    expect(screen.queryByText('Create Organisation')).toBeNull();
    expect(screen.queryByText('Audit Log')).toBeNull();
    expect(screen.getAllByText('View Reports').length).toBeGreaterThan(0);
  });
});
