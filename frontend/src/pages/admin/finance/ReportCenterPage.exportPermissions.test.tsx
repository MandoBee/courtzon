import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const mockGet = vi.fn();

vi.mock('../../../services/api', () => ({
  default: { get: (...a: any[]) => mockGet(...a) },
}));
vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// D4 — ReportCenterPage + Can + ExportButton/ExportCsvButton all read the auth
// store, so a single mutable mock drives every permission gate.
const mockAuth: { user: { permissions: string[] } | null } = {
  user: { permissions: [] },
};
vi.mock('../../../store/auth.store', () => ({
  useAuthStore: (selector: (s: typeof mockAuth) => unknown) => selector(mockAuth),
}));

import ReportCenterPage from './ReportCenterPage';

function renderPage(existing?: QueryClient) {
  const qc = existing ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <MemoryRouter initialEntries={['/admin/finance/reports']}>
      <QueryClientProvider client={qc}>
        <ReportCenterPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { ...result, qc };
}

async function openSettlementsTab() {
  const user = userEvent.setup();
  renderPage();
  await user.click(screen.getByRole('button', { name: 'settlements' }));
  await waitFor(() => expect(screen.getByText('Settlement List')).toBeTruthy());
}

describe('D4 — ReportCenterPage export permissions', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ data: { data: [] } });
    mockAuth.user = { permissions: [] };
  });

  it('does not render the page with reports.view alone', () => {
    mockAuth.user = { permissions: ['reports.view'] };
    renderPage();
    expect(screen.queryByText('Report Center')).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('renders the page with financial.reports.view', () => {
    mockAuth.user = { permissions: ['financial.reports.view'] };
    renderPage();
    expect(screen.getByText('Report Center')).toBeInTheDocument();
  });

  it('hides the revenue/wallet Export control without reports.export', () => {
    mockAuth.user = { permissions: ['financial.reports.view'] };
    renderPage();
    expect(screen.getByText('Report Center')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Export/ })).toBeNull();
  });

  it('shows the revenue/wallet Export control with financial.reports.view + reports.export', () => {
    mockAuth.user = { permissions: ['financial.reports.view', 'reports.export'] };
    renderPage();
    expect(screen.getByRole('button', { name: /^Export/ })).toBeInTheDocument();
  });

  it('hides the settlements export when settlements.export is missing', async () => {
    mockAuth.user = { permissions: ['financial.reports.view', 'settlements.view'] };
    await openSettlementsTab();
    expect(screen.queryByText('Export CSV')).toBeNull();
  });

  it('hides the settlements export when settlements.view is missing', async () => {
    mockAuth.user = { permissions: ['financial.reports.view', 'settlements.export'] };
    await openSettlementsTab();
    expect(screen.queryByText('Export CSV')).toBeNull();
  });

  it('shows the settlements export when settlements.view + settlements.export are held', async () => {
    mockAuth.user = { permissions: ['financial.reports.view', 'settlements.view', 'settlements.export'] };
    await openSettlementsTab();
    expect(screen.getByText('Export CSV')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/unified-settlements');
  });

  it('does NOT require reports.export for the settlements export', async () => {
    mockAuth.user = { permissions: ['financial.reports.view', 'settlements.view', 'settlements.export'] };
    await openSettlementsTab();
    expect(screen.getByText('Export CSV')).toBeInTheDocument();
  });
});

describe('Phase 2J.3 — ReportCenter fail-closed error handling', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockAuth.user = { permissions: ['financial.reports.view'] };
  });

  it('shows the unavailable state on 403 and renders no financial values', async () => {
    mockGet.mockRejectedValue({ response: { status: 403 } });
    renderPage();

    await waitFor(() => expect(screen.getByText(/Financial reports are unavailable/i)).toBeTruthy());
    expect(screen.getByText('Report Center')).toBeInTheDocument();
    expect(screen.queryByText('Total Revenue')).toBeNull();
    expect(screen.queryByText(/EGP /)).toBeNull();
  });

  it('shows the unavailable state when a 401 reaches the query', async () => {
    mockGet.mockRejectedValue({ response: { status: 401 } });
    renderPage();

    await waitFor(() => expect(screen.getByText(/Financial reports are unavailable/i)).toBeTruthy());
    expect(screen.queryByText('Total Revenue')).toBeNull();
  });

  it('removes previously displayed values when a later request fails', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockGet.mockResolvedValue({
      data: { data: { revenue: 999999, expenses: 0, netIncome: 0, transactions: 1 } },
    });
    renderPage(qc);
    await waitFor(() => expect(screen.getByText(/EGP 999,999/)).toBeTruthy());

    // The grant is revoked / the service starts failing after a successful load.
    mockGet.mockRejectedValue({ response: { status: 403 } });
    await qc.invalidateQueries({ queryKey: ['finance'] });

    await waitFor(() => expect(screen.getByText(/Financial reports are unavailable/i)).toBeTruthy());
    expect(screen.queryByText(/EGP 999,999/)).toBeNull();
    expect(screen.queryByText('Total Revenue')).toBeNull();
  });

  it('keeps rendering successful data with no false error state', async () => {
    mockGet.mockResolvedValue({
      data: { data: { revenue: 1234, expenses: 10, netIncome: 1224, transactions: 3 } },
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Total Revenue')).toBeTruthy());
    expect(screen.queryByText(/Financial reports are unavailable/i)).toBeNull();
  });
});
