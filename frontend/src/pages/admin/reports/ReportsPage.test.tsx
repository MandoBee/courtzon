import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReportsPage, { tournamentFinanceCsvRows } from './ReportsPage';

const mockGet = vi.fn();

// D4 — export gating reads permissions from the auth store (via useCan).
// D4-A1 — the Financial tab is gated by the dedicated `financial.reports.view`.
const mockAuth: { user: { permissions: string[] } | null } = {
  user: { permissions: ['reports.view', 'reports.export'] },
};
vi.mock('../../../store/auth.store', () => ({
  useAuthStore: (selector: (s: typeof mockAuth) => unknown) => selector(mockAuth),
}));

vi.mock('../../../services/api', () => ({
  default: { get: (...a: any[]) => mockGet(...a) },
}));
vi.mock('../../../components/ui', () => ({
  Spinner: () => <div data-testid="spinner">Loading…</div>,
}));
vi.mock('../../../components/reports/DateRangePicker', () => ({
  default: ({ onChange }: any) => (
    <button data-testid="date-range" onClick={() => onChange('2026-08-01', '2026-08-27')}>Set Range</button>
  ),
}));
vi.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="chart">{children}</div>,
  Line: () => null,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: any) => <>{children}</>,
}));
vi.mock('../../../theme/chart-colors', () => ({
  getChartPalette: () => ['#000', '#111', '#222'],
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // A fresh element per render: `rerender()` bails out when handed the exact
  // same element reference, which would hide permission changes while mounted.
  const build = () => (
    <QueryClientProvider client={qc}>
      <ReportsPage />
    </QueryClientProvider>
  );
  const result = render(build());
  return { ...result, rerenderPage: () => result.rerender(build()) };
}

const tabButton = (label: string) =>
  screen.queryAllByRole('button').find((b) => b.textContent?.trim().endsWith(label));

const FINANCIAL_VIEW = 'financial.reports.view';

describe('F-16 — ReportsPage export CSV no-op removed', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ data: { data: [] } });
    mockAuth.user = { permissions: ['reports.view', 'reports.export'] };
  });

  it('does NOT render a misleading "Export CSV" control', () => {
    renderPage();
    expect(screen.queryByText('Export CSV')).toBeNull();
    expect(screen.queryByText(/📥 Export CSV/)).toBeNull();
  });

  it('does NOT mutate document.title (the old no-op behavior is gone)', () => {
    const originalTitle = document.title;
    document.title = 'test-title';
    renderPage();
    // A general tab is used here: the Financial tab is not offered to a
    // reports.view-only user (D4-A1).
    fireEvent.click(tabButton('Bookings')!);
    expect(document.title).toBe('test-title');
    document.title = originalTitle;
  });

  it('still renders the Reports header and the general report tabs', () => {
    renderPage();
    expect(screen.getByText('Reports')).toBeTruthy();
    expect(screen.getByText('Bookings')).toBeTruthy();
    expect(screen.getByText('Users')).toBeTruthy();
    expect(screen.getByText('Marketplace')).toBeTruthy();
  });

  it('renders report endpoint blocks when a date range is selected', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('date-range'));
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    // reports.view only → the default tab is a general (non-financial) report.
    expect(mockGet.mock.calls.some((c: any) => String(c[0]).includes('/reports/bookings/'))).toBe(true);
    expect(mockGet.mock.calls.some((c: any) => String(c[0]).includes('/reports/financial/'))).toBe(false);
  });
});

describe('D4-A1 — Financial tab requires financial.reports.view', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ data: { data: [] } });
    mockAuth.user = { permissions: ['reports.view'] };
  });

  it('shows the Financial tab for an authorized user and uses it as the default', async () => {
    mockAuth.user = { permissions: ['reports.view', FINANCIAL_VIEW] };
    renderPage();

    expect(screen.getByText('Financial')).toBeTruthy();
    fireEvent.click(screen.getByTestId('date-range'));
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet.mock.calls.some((c: any) => String(c[0]).includes('/reports/financial/summary'))).toBe(true);
  });

  it('hides the Financial tab for a reports.view-only user (accountant profile)', () => {
    mockAuth.user = { permissions: ['reports.view', 'financial.view', 'settlements.view', 'settlements.export'] };
    renderPage();

    expect(screen.queryByText('Financial')).toBeNull();
    expect(tabButton('Bookings')).toBeTruthy();
  });

  it.each([
    ['auditor', ['reports.view', 'reports.export', 'financial.view', 'accounting.gl.view', 'settlements.view']],
    ['master-admin', ['reports.view', 'reports.export', 'financial.view']],
    ['read-only-admin', ['reports.view', 'financial.view', 'accounting.gl.view', 'settlements.view']],
    ['accountant', ['reports.view', 'financial.view', 'settlements.view']],
  ])('hides the Financial tab for %s', (_role, permissions) => {
    mockAuth.user = { permissions };
    renderPage();
    expect(screen.queryByText('Financial')).toBeNull();
  });

  it('defaults an unauthorized user to an accessible general tab', async () => {
    renderPage();

    // No financial button exists, and the first general tab is what renders.
    expect(screen.queryByText('Financial')).toBeNull();
    fireEvent.click(screen.getByTestId('date-range'));
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    const urls = mockGet.mock.calls.map((c: any) => String(c[0]));
    expect(urls.some((u) => u.startsWith('/reports/bookings/'))).toBe(true);
    expect(urls.some((u) => u.includes('/reports/financial/'))).toBe(false);
  });

  it('cannot reveal financial content by selecting every visible tab', async () => {
    renderPage();
    const labels = ['Bookings', 'Users', 'Orgs', 'Marketplace', 'Tournaments', 'Ads', 'Audit'];
    for (const label of labels) {
      const button = tabButton(label);
      expect(button, label).toBeTruthy();
      fireEvent.click(button!);
    }
    fireEvent.click(screen.getByTestId('date-range'));
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet.mock.calls.some((c: any) => String(c[0]).includes('/reports/financial/'))).toBe(false);
  });

  it('falls back when the permission is revoked while the Financial tab is active', async () => {
    // Authorized on first render: Financial is the default tab.
    mockAuth.user = { permissions: ['reports.view', FINANCIAL_VIEW] };
    const { rerenderPage } = renderPage();
    expect(screen.getByText('Financial')).toBeTruthy();

    // Permission revoked while mounted: activeTab is still 'financial'.
    mockAuth.user = { permissions: ['reports.view'] };
    rerenderPage();

    expect(screen.queryByText('Financial')).toBeNull();
    expect(tabButton('Bookings')).toBeTruthy();

    fireEvent.click(screen.getByTestId('date-range'));
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet.mock.calls.some((c: any) => String(c[0]).includes('/reports/financial/'))).toBe(false);
  });

  it('keeps every general report available under reports.view', () => {
    renderPage();
    for (const label of ['Bookings', 'Users', 'Orgs', 'Marketplace', 'Tournaments', 'Ads', 'Audit']) {
      expect(tabButton(label), label).toBeTruthy();
    }
  });
});

describe('G11.9 — Tournament finance overview block & client-side CSV', () => {
  const overview = {
    total_tournaments: 2,
    completed: 1,
    in_progress: 1,
    total_registrations: 40,
    currencies: {
      AED: { revenue: 1000, prizeExpense: 300, commissionExpense: 100, platformCommission: 25, net: 600, tournaments: 1 },
      EGP: { revenue: 800, prizeExpense: 500, commissionExpense: 50, platformCommission: 20, net: -50, tournaments: 1 },
    },
  };

  beforeEach(() => {
    mockGet.mockReset();
    mockAuth.user = { permissions: ['reports.view', 'reports.export'] };
    mockGet.mockImplementation((url: string) => {
      if (String(url).includes('/reports/tournaments/overview')) return Promise.resolve({ data: { data: overview } } as any);
      return Promise.resolve({ data: { data: [] } } as any);
    });
  });

  async function openTournamentFinance() {
    renderPage();
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('Tournaments'))!);
    fireEvent.click(screen.getByTestId('date-range'));
    await screen.findByText('Tournament Finances (ledger-authoritative)');
  }

  it('renders the ledger-authoritative tournament finance overview with separate currency buckets', async () => {
    await openTournamentFinance();

    expect(mockGet.mock.calls.some((c: any) => String(c[0]).includes('/reports/tournaments/overview'))).toBe(true);

    // Independent per-currency buckets — values are never combined.
    expect(screen.getByText('AED bucket')).toBeTruthy();
    expect(screen.getByText('EGP bucket')).toBeTruthy();
    expect((await screen.findByText((c) => c.includes('600.00')))).toBeTruthy();
    expect((await screen.findByText((c) => c.includes('-50.00')))).toBeTruthy();

    // Client-side Export control is present on the same JSON report.
    expect(screen.getByText(/^Export/)).toBeTruthy();
  });

  it('distinguishes zero-ledger from missing data (no inferred values)', async () => {
    mockGet.mockImplementation((url: string) => {
      if (String(url).includes('/reports/tournaments/overview'))
        return Promise.resolve({ data: { data: { total_tournaments: 2, completed: 0, in_progress: 2, total_registrations: 10, currencies: {} } } } as any);
      return Promise.resolve({ data: { data: [] } } as any);
    });
    await openTournamentFinance();

    expect(await screen.findByText(/No posted tournament accounting for the selected period/)).toBeTruthy();
    expect(screen.queryByText('AED bucket')).toBeNull();
  });

  it('builds client-side CSV rows from the exact fields returned by the API (never mixes currencies)', () => {
    const rows = tournamentFinanceCsvRows(overview);
    expect(rows).toEqual([
      { currency: 'AED', tournaments: '1', revenue: '1000.00', prize_expense: '300.00', commission_expense: '100.00', platform_commission: '25.00', net: '600.00' },
      { currency: 'EGP', tournaments: '1', revenue: '800.00', prize_expense: '500.00', commission_expense: '50.00', platform_commission: '20.00', net: '-50.00' },
    ]);
    // No synthetic cross-currency totals.
    const currencies = rows.map((r) => r.currency);
    expect(currencies).toEqual(['AED', 'EGP']);
  });

  it('returns an empty row set for a zero-ledger payload', () => {
    expect(tournamentFinanceCsvRows({ total_tournaments: 2, currencies: {} })).toEqual([]);
    expect(tournamentFinanceCsvRows(null)).toEqual([]);
  });

  // ── D4 — report export requires reports.export ────────────────────────────
  it('hides the Export control when the user has reports.view only', async () => {
    mockAuth.user = { permissions: ['reports.view'] };
    await openTournamentFinance();
    expect(screen.queryByText(/^Export/)).toBeNull();
  });

  it('shows the Export control when the user has reports.view + reports.export', async () => {
    mockAuth.user = { permissions: ['reports.view', 'reports.export'] };
    await openTournamentFinance();
    expect(screen.getByText(/^Export/)).toBeTruthy();
  });
});
