import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReportsPage, { tournamentFinanceCsvRows } from './ReportsPage';

const mockGet = vi.fn();

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
  return render(
    <QueryClientProvider client={qc}>
      <ReportsPage />
    </QueryClientProvider>,
  );
}

describe('F-16 — ReportsPage export CSV no-op removed', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ data: { data: [] } });
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
    fireEvent.click(screen.getAllByRole('button').find(b => b.textContent?.includes('Financial'))!);
    expect(document.title).toBe('test-title');
    document.title = originalTitle;
  });

  it('still renders the Reports header and report tabs', () => {
    renderPage();
    expect(screen.getByText('Reports')).toBeTruthy();
    expect(screen.getByText('Financial')).toBeTruthy();
    expect(screen.getByText('Bookings')).toBeTruthy();
    expect(screen.getByText('Users')).toBeTruthy();
    expect(screen.getByText('Marketplace')).toBeTruthy();
  });

  it('renders report endpoint blocks when a date range is selected', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('date-range'));
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet.mock.calls.some((c: any) => String(c[0]).includes('/reports/financial/'))).toBe(true);
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
});