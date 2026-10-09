import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentDashboardPage from '../TournamentDashboardPage';

const __state = vi.hoisted(() => ({
  userPermissions: ['*'] as string[],
  dashboardApi: { getDashboard: vi.fn() },
  toast: { showToast: vi.fn() },
}));

vi.mock('../../../../services/tournament', () => ({
  tournamentApi: __state.dashboardApi,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string, d?: string) => d ?? k }),
}));

vi.mock('../../../../permissions/Can', () => ({
  Can: ({ permission, children }: { permission: string; children: ReactNode }) => {
    const perms = __state.userPermissions;
    if (perms.includes('*') || perms.includes(permission)) return <>{children}</>;
    return null;
  },
}));

vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => __state.toast,
}));

const payload = {
  total_tournaments: 7,
  open_registrations: 2,
  running: 3,
  completed: 11,
  registered_players: 128,
  scheduled_matches: 9,
  completed_matches: 42,
};

const zeroPayload = {
  total_tournaments: 0,
  open_registrations: 0,
  running: 0,
  completed: 0,
  registered_players: 0,
  scheduled_matches: 0,
  completed_matches: 0,
};

function dashboardTree(qc: QueryClient) {
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin/tournament/dashboard']}>
        <Routes>
          <Route path="/admin/tournament/dashboard" element={<TournamentDashboardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { qc, ...render(dashboardTree(qc)) };
}

beforeEach(() => {
  vi.clearAllMocks();
  __state.userPermissions = ['*'];
  __state.dashboardApi.getDashboard.mockReset();
  __state.toast.showToast.mockReset();
});

describe('TournamentDashboardPage — TUX-01 error vs genuine zero state', () => {
  it('shows an error + Retry (never the KPI grid or false zeros) when the query fails', async () => {
    __state.dashboardApi.getDashboard.mockRejectedValueOnce(new Error('network down'));
    renderPage();

    expect(await screen.findByText('tournaments.dashboard.load_error')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();

    // The KPI grid must not render fabricated zero values while errored.
    expect(screen.queryByText('tournaments.dashboard.total_tournaments')).toBeNull();
    expect(screen.queryByText('tournaments.dashboard.completed_matches')).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('recovers via Retry and renders the real returned KPI values', async () => {
    __state.dashboardApi.getDashboard
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(payload);
    renderPage();

    expect(await screen.findByText('tournaments.dashboard.load_error')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('tournaments.dashboard.total_tournaments')).toBeTruthy();
    expect(screen.queryByText('tournaments.dashboard.load_error')).toBeNull();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('128')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('renders genuine zero values from a successful response (no error)', async () => {
    __state.dashboardApi.getDashboard.mockResolvedValueOnce(zeroPayload);
    renderPage();

    expect(await screen.findByText('tournaments.dashboard.total_tournaments')).toBeTruthy();
    expect(screen.queryByText('tournaments.dashboard.load_error')).toBeNull();
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(7);
  });
});

describe('TournamentDashboardPage — TUX-02 removed render-phase toast', () => {
  it('never invokes the toast side effect on a persistent error, even across re-renders', async () => {
    __state.dashboardApi.getDashboard.mockRejectedValue(new Error('persistent failure'));
    const { qc, rerender } = renderPage();

    expect(await screen.findByText('tournaments.dashboard.load_error')).toBeTruthy();

    rerender(dashboardTree(qc));
    rerender(dashboardTree(qc));

    expect(__state.toast.showToast).not.toHaveBeenCalled();
    // The explicit error panel is still the single source of truth.
    expect(screen.getByText('tournaments.dashboard.load_error')).toBeTruthy();
  });
});

describe('TournamentDashboardPage — TUX-09 permission gate (tournament.dashboard.view)', () => {
  it('keeps the loading state while the request is in flight, then renders data', async () => {
    let resolveDashboard: (value: typeof payload) => void = () => {};
    __state.dashboardApi.getDashboard.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDashboard = resolve;
      }),
    );
    renderPage();

    // Loading: title + skeleton, no error, no KPI labels yet.
    expect(screen.getByText('tournaments.dashboard.title')).toBeTruthy();
    expect(screen.queryByText('tournaments.dashboard.load_error')).toBeNull();
    expect(screen.queryByText('tournaments.dashboard.total_tournaments')).toBeNull();

    resolveDashboard(payload);
    expect(await screen.findByText('tournaments.dashboard.total_tournaments')).toBeTruthy();
  });

  it('renders for the super-admin wildcard (*) permission (unchanged)', async () => {
    // beforeEach sets __state.userPermissions = ['*'].
    __state.dashboardApi.getDashboard.mockResolvedValueOnce(payload);
    renderPage();

    expect(await screen.findByText('tournaments.dashboard.total_tournaments')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('shows the dashboard to a user granted ONLY tournament.dashboard.view', async () => {
    __state.userPermissions = ['tournament.dashboard.view'];
    __state.dashboardApi.getDashboard.mockResolvedValueOnce(payload);
    renderPage();

    expect(await screen.findByText('tournaments.dashboard.total_tournaments')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.queryByText('tournaments.dashboard.load_error')).toBeNull();
  });

  it('hides the dashboard content from a user with only admin-tournaments.view (old gate key)', async () => {
    __state.userPermissions = ['admin-tournaments.view'];
    __state.dashboardApi.getDashboard.mockResolvedValueOnce(payload);
    renderPage();

    // Loading first renders the title (ungated), then the gated success branch must hide everything.
    await waitFor(() => expect(screen.queryByText('tournaments.dashboard.title')).toBeNull());
    expect(screen.queryByText('tournaments.dashboard.total_tournaments')).toBeNull();
  });

  it('hides the error panel from a user with only admin-tournaments.view (old gate key) on failure', async () => {
    __state.userPermissions = ['admin-tournaments.view'];
    __state.dashboardApi.getDashboard.mockRejectedValueOnce(new Error('network down'));
    renderPage();

    await waitFor(() => expect(screen.queryByText('tournaments.dashboard.title')).toBeNull());
    expect(screen.queryByText('tournaments.dashboard.load_error')).toBeNull();
  });

  it('stays hidden when tournament.dashboard.view is missing (permission denial intact)', async () => {
    __state.userPermissions = ['org.tournaments.view'];
    __state.dashboardApi.getDashboard.mockResolvedValueOnce(payload);
    renderPage();

    await waitFor(() => expect(screen.queryByText('tournaments.dashboard.title')).toBeNull());
    expect(screen.queryByText('tournaments.dashboard.total_tournaments')).toBeNull();
  });

  it('hides the error panel from an unauthorized user as well', async () => {
    __state.userPermissions = ['org.tournaments.view'];
    __state.dashboardApi.getDashboard.mockRejectedValueOnce(new Error('network down'));
    renderPage();

    await waitFor(() => expect(screen.queryByText('tournaments.dashboard.title')).toBeNull());
    expect(screen.queryByText('tournaments.dashboard.load_error')).toBeNull();
  });
});
