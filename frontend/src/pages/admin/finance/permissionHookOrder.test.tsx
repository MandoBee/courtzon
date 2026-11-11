import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';

/**
 * P3-03 regression coverage — conditional-hook gates in the finance/accounting
 * pages. Each page used to return early on a missing permission *before* its
 * `useQuery` hooks, so a runtime permission change altered the hook count.
 *
 * The wrappers below keep the real React Query implementation while letting the
 * tests prove that every hook still runs on the denied render (the old code
 * called none of them), and that granting the permission re-renders the page.
 */

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../../hooks/useCan', () => ({
  useCan: () => ({
    can: (permission: string) => allowed.has('*') || allowed.has(permission),
    permissions: [...allowed],
  }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: vi.fn(actual.useQuery),
    useMutation: vi.fn(actual.useMutation),
  };
});

let allowed = new Set<string>();
const setPerms = (...permissions: string[]) => { allowed = new Set(permissions); };

import api from '../../../services/api';
import AccountingDashboardPage from '../accounting/AccountingDashboardPage';
import FinanceDashboardPage from './FinanceDashboardPage';
import FinancialOpsDashboard from './FinancialOpsDashboard';
import LedgerViewerPage from './LedgerViewerPage';
import ReportCenterPage from './ReportCenterPage';

const useQueryMock = vi.mocked(useQuery);
const useMutationMock = vi.mocked(useMutation);

function Host({ Page }: { Page: React.ComponentType }) {
  const [, setEpoch] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setEpoch((n) => n + 1)}>force-rerender</button>
      <Page />
    </>
  );
}

function renderPage(Page: React.ComponentType) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <MemoryRouter initialEntries={['/']}>
      <QueryClientProvider client={qc}>
        <Host Page={Page} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/**
 * Denied render must still call the page's hooks (the old code returned before
 * them), must not fetch, and granting the permission must render the page.
 */
async function expectHookOrderSafe(
  Page: React.ComponentType,
  permission: string,
  heading: string,
) {
  setPerms();
  useQueryMock.mockClear();
  useMutationMock.mockClear();

  const view = renderPage(Page);
  // >0 proves the query hooks ran even though the UI is hidden. The old code
  // returned before any useQuery → 0 calls.
  expect(useQueryMock.mock.calls.length + useMutationMock.mock.calls.length).toBeGreaterThan(0);
  expect(screen.queryByText(heading)).toBeNull();
  expect(api.get).not.toHaveBeenCalled();

  setPerms(permission);
  fireEvent.click(screen.getByRole('button', { name: 'force-rerender' }));
  expect(await screen.findByText(heading)).toBeTruthy();
  view.unmount();
}

describe('P3-03 — permission gates run after every hook', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockResolvedValue({ data: { data: [], total: 0 } });
    setPerms();
  });

  it('AccountingDashboardPage', async () => {
    await expectHookOrderSafe(AccountingDashboardPage, 'sidebar.accounting', 'Accounting Dashboard');
  });

  it('FinanceDashboardPage', async () => {
    await expectHookOrderSafe(FinanceDashboardPage, 'financial.reports.view', 'Finance Dashboard');
  });

  it('FinancialOpsDashboard', async () => {
    await expectHookOrderSafe(FinancialOpsDashboard, 'financial.view', 'Financial Operations');
  });

  it('LedgerViewerPage', async () => {
    await expectHookOrderSafe(LedgerViewerPage, 'financial.reports.view', 'Ledger Viewer');
  });

  it('ReportCenterPage', async () => {
    await expectHookOrderSafe(ReportCenterPage, 'financial.reports.view', 'Report Center');
  });
});
