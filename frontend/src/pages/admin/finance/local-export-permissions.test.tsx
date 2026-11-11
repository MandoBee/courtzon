import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

/**
 * D4 — the finance dashboard and ledger viewer require financial.reports.view
 * for the global report data. The export control remains gated by financial.export.
 */

const mockGet = vi.fn();

vi.mock('../../../services/api', () => ({
  default: { get: (...args: any[]) => mockGet(...args) },
}));

const mockAuth: { user: { permissions: string[] } | null } = {
  user: { permissions: [] },
};
vi.mock('../../../store/auth.store', () => {
  const useAuthStore = (selector: (s: typeof mockAuth) => unknown) => selector(mockAuth);
  return { useAuthStore: Object.assign(useAuthStore, { getState: () => mockAuth }) };
});

import FinanceDashboardPage from './FinanceDashboardPage';
import LedgerViewerPage from './LedgerViewerPage';

function renderPage(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: [] } });
  mockAuth.user = { permissions: [] };
});

describe('D4 — finance page and local export permissions', () => {
  it('FinanceDashboardPage does not render or fetch with financial.view alone', () => {
    mockAuth.user = { permissions: ['financial.view'] };
    renderPage(<FinanceDashboardPage />);
    expect(screen.queryByText('Finance Dashboard')).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('FinanceDashboardPage hides the export without financial.export', async () => {
    mockAuth.user = { permissions: ['financial.reports.view'] };
    renderPage(<FinanceDashboardPage />);
    await waitFor(() => expect(screen.getByText('Finance Dashboard')).toBeTruthy());
    expect(screen.queryByText('Export ▾')).toBeNull();
  });

  it('FinanceDashboardPage shows the export with financial.reports.view + financial.export', async () => {
    mockAuth.user = { permissions: ['financial.reports.view', 'financial.export'] };
    renderPage(<FinanceDashboardPage />);
    await waitFor(() => expect(screen.getByText('Export ▾')).toBeTruthy());
  });

  it('FinanceDashboardPage shows an error instead of zero KPIs after a 403', async () => {
    mockAuth.user = { permissions: ['financial.reports.view'] };
    mockGet.mockRejectedValue({ response: { status: 403 } });
    renderPage(<FinanceDashboardPage />);
    await waitFor(() => expect(screen.getByText(/Financial reports are unavailable/i)).toBeTruthy());
    expect(screen.queryByText('Total Revenue (30d)')).toBeNull();
  });

  it('LedgerViewerPage does not render or fetch with financial.view alone', () => {
    mockAuth.user = { permissions: ['financial.view'] };
    renderPage(<LedgerViewerPage />);
    expect(screen.queryByText('Ledger Viewer')).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('LedgerViewerPage hides the export without financial.export', async () => {
    mockAuth.user = { permissions: ['financial.reports.view'] };
    renderPage(<LedgerViewerPage />);
    await waitFor(() => expect(screen.getByText('Ledger Viewer')).toBeTruthy());
    expect(screen.queryByText('Export ▾')).toBeNull();
  });

  it('LedgerViewerPage shows the export with financial.reports.view + financial.export', async () => {
    mockAuth.user = { permissions: ['financial.reports.view', 'financial.export'] };
    renderPage(<LedgerViewerPage />);
    await waitFor(() => expect(screen.getByText('Export ▾')).toBeTruthy());
  });

  it('LedgerViewerPage shows an error instead of an empty ledger after a 403', async () => {
    mockAuth.user = { permissions: ['financial.reports.view'] };
    mockGet.mockRejectedValue({ response: { status: 403 } });
    renderPage(<LedgerViewerPage />);
    await waitFor(() => expect(screen.getByText(/Ledger data is unavailable/i)).toBeTruthy());
    expect(screen.queryByText('No ledger entries found.')).toBeNull();
  });
});
