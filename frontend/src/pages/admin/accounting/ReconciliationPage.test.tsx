import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReconciliationPage from './ReconciliationPage';

const mockGet = vi.fn();

vi.mock('../../../services/api', () => ({
  default: { get: (...a: any[]) => mockGet(...a) },
}));
vi.mock('../../../components/ui', () => ({
  Spinner: () => <div data-testid="spinner">Loading…</div>,
}));
vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('../../../permissions/Can', () => ({
  Can: ({ children }: { children: any }) => <>{children}</>,
}));
vi.mock('../../../i18n', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
    locale: 'en',
  }),
}));

const RECONCILED_REPORT = {
  organisationId: 1,
  organisationName: 'Court Alpha',
  entitlements: { payableToOrg: 100, receivableFromOrg: 0, net: 100, openCount: 2 },
  gl: { accounts: [{ code: '2100', accountId: 10, debits: 0, credits: 100, signedBalance: -100 }], payableToOrg: 100, receivableFromOrg: 0, net: 100 },
  difference: 0,
  direction: 'PAYABLE_TO_ORGANISATION',
  reconciled: true,
  sources: [
    { sourceType: 'booking', sourceId: 50, entitlementCount: 2, contributionToNet: 100, statuses: ['pending', 'available'] },
  ],
};

const DRIFTED_REPORT = {
  organisationId: 2,
  organisationName: 'Court Beta',
  entitlements: { payableToOrg: 200, receivableFromOrg: 50, net: 150, openCount: 3 },
  gl: { accounts: [{ code: '2100', accountId: 11, debits: 50, credits: 180, signedBalance: -130 }], payableToOrg: 180, receivableFromOrg: 50, net: 130 },
  difference: 20,
  direction: 'PAYABLE_TO_ORGANISATION',
  reconciled: false,
  sources: [
    { sourceType: 'booking', sourceId: 60, entitlementCount: 2, contributionToNet: 120, statuses: ['pending'] },
    { sourceType: 'coach_session', sourceId: 70, entitlementCount: 1, contributionToNet: 30, statuses: ['available'] },
  ],
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ReconciliationPage />
    </QueryClientProvider>,
  );
}

describe('ReconciliationPage', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('renders summary cards correctly', async () => {
    mockGet.mockResolvedValue({
      data: { data: { summary: { totalOrgs: 2, reconciled: 1, drifted: 1 }, reports: [RECONCILED_REPORT, DRIFTED_REPORT] } },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Total Organisations')).toBeTruthy();
    });
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Reconciled').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Drifted').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Total Difference')).toBeTruthy();
  });

  it('displays reconciled organisations correctly', async () => {
    mockGet.mockResolvedValue({
      data: { data: { summary: { totalOrgs: 1, reconciled: 1, drifted: 0 }, reports: [RECONCILED_REPORT] } },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Court Alpha')).toBeTruthy();
    });
    expect(screen.getAllByText('Reconciled').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('100.00').length).toBeGreaterThanOrEqual(1);
  });

  it('clearly identifies drifted organisations', async () => {
    mockGet.mockResolvedValue({
      data: { data: { summary: { totalOrgs: 1, reconciled: 0, drifted: 1 }, reports: [DRIFTED_REPORT] } },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Court Beta')).toBeTruthy();
    });
    const driftedBadges = screen.getAllByText('Drifted');
    expect(driftedBadges.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('20.00').length).toBeGreaterThanOrEqual(1);
  });

  it('renders drift details only from actual API data on expand', async () => {
    mockGet.mockResolvedValue({
      data: { data: { summary: { totalOrgs: 1, reconciled: 0, drifted: 1 }, reports: [DRIFTED_REPORT] } },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('recon-row-2')).toBeTruthy();
    });
    expect(screen.queryByTestId('recon-detail-2')).toBeNull();

    await userEvent.click(screen.getByTestId('recon-row-2'));
    await waitFor(() => {
      expect(screen.getByTestId('recon-detail-2')).toBeTruthy();
    });
    expect(screen.getByText('booking')).toBeTruthy();
    expect(screen.getByText('coach_session')).toBeTruthy();
    expect(screen.getAllByText('60').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('70').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Source Breakdown')).toBeTruthy();
    expect(screen.getByText('GL Control Accounts')).toBeTruthy();
  });

  it('supports status filtering', async () => {
    mockGet.mockResolvedValue({
      data: { data: { summary: { totalOrgs: 2, reconciled: 1, drifted: 1 }, reports: [RECONCILED_REPORT, DRIFTED_REPORT] } },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Court Alpha')).toBeTruthy();
    });
    expect(screen.getByText('Court Beta')).toBeTruthy();

    const filter = screen.getByLabelText('Filter by status');
    await userEvent.selectOptions(filter, 'drift');
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('/admin/accounting/reconciliation'),
        expect.objectContaining({ params: { status: 'drift' } }),
      );
    });
  });

  it('supports search filtering', async () => {
    mockGet.mockResolvedValue({
      data: { data: { summary: { totalOrgs: 2, reconciled: 1, drifted: 1 }, reports: [RECONCILED_REPORT, DRIFTED_REPORT] } },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Court Alpha')).toBeTruthy();
    });
    expect(screen.getByText('Court Beta')).toBeTruthy();

    const searchInput = screen.getByPlaceholderText('Search by name or ID…');
    await userEvent.type(searchInput, 'Beta');
    await waitFor(() => {
      expect(screen.queryByText('Court Alpha')).toBeNull();
      expect(screen.getByText('Court Beta')).toBeTruthy();
    });
  });

  it('renders correct empty state when zero open positions', async () => {
    mockGet.mockResolvedValue({
      data: { data: { summary: { totalOrgs: 0, reconciled: 0, drifted: 0 }, reports: [] } },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Reconciliation is clean')).toBeTruthy();
    });
    expect(
      screen.getByText('There are no open positions to compare. Entitlements and GL control accounts have no outstanding balances.'),
    ).toBeTruthy();
  });

  it('handles API errors gracefully', async () => {
    mockGet.mockRejectedValue(new Error('Network timeout'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Failed to load reconciliation data')).toBeTruthy();
    });
    expect(screen.getByText('Network timeout')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('refresh re-fetches the reconciliation endpoint', async () => {
    mockGet.mockResolvedValue({
      data: { data: { summary: { totalOrgs: 0, reconciled: 0, drifted: 0 }, reports: [] } },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Reconciliation is clean')).toBeTruthy();
    });
    expect(mockGet).toHaveBeenCalledTimes(1);

    const refreshBtn = screen.getByText('Refresh');
    await userEvent.click(refreshBtn);
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledTimes(2);
    });
  });

  it('does not perform any reconciliation calculation in frontend', async () => {
    mockGet.mockResolvedValue({
      data: { data: { summary: { totalOrgs: 0, reconciled: 0, drifted: 0 }, reports: [] } },
    });
    renderPage();
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled();
    });
    const pageSource = document.body.innerHTML;
    const noCalcPatterns = ['calculateReconciliation', 'reconcile(', 'computeDrift', 'positionService', 'glControlRepository'];
    for (const pattern of noCalcPatterns) {
      expect(pageSource).not.toContain(pattern);
    }
  });
});
