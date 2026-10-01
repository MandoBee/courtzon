import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FinancialPositionPage from './FinancialPositionPage';
import api from '../../services/api';

vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../../permissions/Can', () => ({ Can: ({ children }: any) => <>{children}</> }));
vi.mock('../../components/ui', () => ({ Spinner: () => <div data-testid="spinner">Loading…</div> }));

const mockGet = vi.mocked(api.get);

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const position = {
  organisationId: 6,
  balances: {
    pending: { amount: 0, count: 0 },
    available: { amount: 0, count: 0 },
    held: { amount: 0, count: 0 },
    reserved: { amount: 0, count: 0 },
    settled: { amount: 0, count: 0 },
  },
  earnings: { open: 0, lifetime: 0, courtzonCollected: 0, orgCollected: 0 },
  commission: { open: 0, lifetime: 0, courtzonCollected: 0, orgCollected: 0 },
  adjustments: { organisationAdjustments: 0, courtzonAdjustments: 0 },
  position: { owedToOrg: 0, owedByOrg: 0, net: 0, direction: 'SETTLED_UP', openCount: 0 },
};

const aggregateMultiCurrency = {
  organisationId: 6,
  totalTournaments: 2,
  currencies: {
    AED: { registrationRevenue: 1000, prizeExpense: 300, commissionExpense: 100, sponsorCash: 0, revenue: 1000, expenses: 400, net: 600, tournaments: 1, postings: 6 },
    EGP: { registrationRevenue: 800, prizeExpense: 500, commissionExpense: 50, sponsorCash: 0, revenue: 800, expenses: 550, net: -50, tournaments: 1, postings: 4 },
  },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/org/6/finance/position']}>
      <Routes>
        <Route path="/org/:orgId/finance/position" element={
          <QueryClientProvider client={qc}>
            <FinancialPositionPage />
          </QueryClientProvider>
        } />
      </Routes>
    </MemoryRouter>,
  );
}

describe('G11.9 — Org Financial Position Tournament P&L section', () => {
  beforeEach(() => {
    mockGet.mockReset();
    // Position always resolves; P&L aggregate per-test.
    mockGet.mockImplementation((url: string) => {
      if (String(url).includes('/position')) return Promise.resolve({ data: { data: position } } as any);
      if (String(url).includes('/tournaments/finances')) return Promise.resolve({ data: { data: aggregateMultiCurrency } } as any);
      return Promise.resolve({ data: { data: {} } } as any);
    });
  });

  it('renders the ledger-authoritative Tournament P&L section with independent currency buckets', async () => {
    renderPage();

    expect(await screen.findByText('Tournament P&L')).toBeTruthy();

    // The org aggregate endpoint is consumed from the route orgId (server-authoritative).
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/org/6/tournaments/finances'));

    // Independent currency buckets are rendered separately (never numerically combined).
    expect(screen.getByText('AED bucket')).toBeTruthy();
    expect(screen.getByText('EGP bucket')).toBeTruthy();

    expect(screen.getAllByText((c: string) => c.includes('1 tournament(s)')).length).toBeGreaterThan(0);
    expect((await screen.findByText((c: string) => c.includes('600.00')))).toBeTruthy();
    expect((await screen.findByText((c: string) => c.includes('-50.00')))).toBeTruthy();
  });

  it('shows a clear zero-ledger state (no inferred values) when nothing is posted', async () => {
    mockGet.mockImplementation((url: string) => {
      if (String(url).includes('/position')) return Promise.resolve({ data: { data: position } } as any);
      if (String(url).includes('/tournaments/finances'))
        return Promise.resolve({ data: { data: { organisationId: 6, totalTournaments: 0, currencies: {} } } } as any);
      return Promise.resolve({ data: { data: {} } } as any);
    });
    renderPage();

    const message = await screen.findByText(/No posted tournament accounting yet/);
    expect(message).toBeTruthy();
    // No buckets inferred from count/total or registration arithmetic.
    expect(screen.queryByText('AED bucket')).toBeNull();
    expect(screen.queryByText('EGP bucket')).toBeNull();
  });

  it('shows a dedicated error state with retry when the aggregate endpoint fails', async () => {
    mockGet.mockImplementation((url: string) => {
      if (String(url).includes('/position')) return Promise.resolve({ data: { data: position } } as any);
      if (String(url).includes('/tournaments/finances')) return Promise.reject(new Error('boom'));
      return Promise.resolve({ data: { data: {} } } as any);
    });
    renderPage();

    expect(await screen.findByText('Failed to load tournament P&L')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();

    // Retry re-issues the same authoritative aggregate request.
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => {
      const calls = (mockGet.mock.calls as any[]).filter((c) => String(c[0]).includes('/tournaments/finances'));
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});