import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReportsPage from './ReportsPage';

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