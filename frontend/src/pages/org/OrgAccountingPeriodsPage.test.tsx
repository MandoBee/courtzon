import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OrgAccountingPeriodsPage from './OrgAccountingPeriodsPage';
import api from '../../services/api';

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../permissions/Can', () => ({ Can: ({ children }: any) => <>{children}</> }));
vi.mock('../../components/ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const mockGet = vi.mocked(api.get);
const mockPost = vi.mocked(api.post);

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function makePeriods(mode: 'open' | 'p2-closed' | 'p1-11-closed'): any[] {
  return Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    let status = 'open';
    if (mode === 'p2-closed' && n === 2) status = 'closed';
    if (mode === 'p1-11-closed' && n !== 12) status = 'closed';
    return {
      id: 100 + n,
      fiscal_year: 2026,
      period_number: n,
      start_date: `2026-${String(n).padStart(2, '0')}-01`,
      end_date: `2026-${String(n).padStart(2, '0')}-28`,
      status,
    };
  });
}

const history = [{ id: 1, fiscal_year: 2026, net_income: 1200, status: 'completed', close_count: 1, cycle_count: 1, created_at: '2026-09-01' }];

function renderPage(orgId = '6') {
  return render(
    <MemoryRouter initialEntries={[`/org/${orgId}/accounting/periods`]}>
      <Routes>
        <Route path="/org/:orgId/accounting/periods" element={
          <QueryClientProvider client={qc}>
            <OrgAccountingPeriodsPage />
          </QueryClientProvider>
        } />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OrgAccountingPeriodsPage — org-scoped accounting periods & year close', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockPost.mockResolvedValue({ data: { data: {} } } as any);
  });

  it('renders only the organisation periods via the org-scoped endpoint', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/org/6/accounting/periods') return Promise.resolve({ data: { data: makePeriods('open') } } as any);
      if (url === '/org/6/accounting/year-close/history') return Promise.resolve({ data: { data: [] } } as any);
      return Promise.resolve({ data: { data: [] } } as any);
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Accounting Periods' });
    expect(await screen.findByText('1/1/2026')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/org/6/accounting/periods');
    expect(mockGet).toHaveBeenCalledWith('/org/6/accounting/year-close/history');
    // Never any admin period endpoint, never another organisation.
    const urls = mockGet.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith('/admin/'))).toBe(false);
    expect(urls.some((u) => u.includes('/org/7/'))).toBe(false);
  });

  it('closes and opens periods through the org-scoped endpoints', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/org/6/accounting/periods') return Promise.resolve({ data: { data: makePeriods('p2-closed') } } as any);
      if (url === '/org/6/accounting/year-close/history') return Promise.resolve({ data: { data: [] } } as any);
      return Promise.resolve({ data: { data: [] } } as any);
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Accounting Periods' });

    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]); // period 1 (id 101)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/org/6/accounting/periods/101/close'));

    fireEvent.click(screen.getByRole('button', { name: 'Open' })); // period 2 (id 102)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/org/6/accounting/periods/102/open'));
  });

  it('fetches a year-close preview and closes the year through the org-scoped endpoint', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/org/6/accounting/periods') return Promise.resolve({ data: { data: makePeriods('p1-11-closed') } } as any);
      if (url === '/org/6/accounting/year-close/history') return Promise.resolve({ data: { data: [] } } as any);
      if (url === '/org/6/accounting/year-close/preview') {
        return Promise.resolve({ data: { data: { fiscalYear: 2026, netIncome: 1200, totalRevenue: 2000, totalExpense: 800, estimatedClosingLines: 3, retainedEarningsAccount: { code: 'OPC-RE', name: 'Retained' }, affectedAccounts: 2 } } } as any);
      }
      return Promise.resolve({ data: { data: [] } } as any);
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Accounting Periods' });

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText('Closing Preview')).toBeTruthy();
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/org/6/accounting/year-close/preview', expect.anything()));

    const confirmStub = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmStub);
    fireEvent.click(screen.getByRole('button', { name: /Close Year 2026/ }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/org/6/accounting/year-close', expect.anything()));
    vi.unstubAllGlobals();
  });

  it('reopens a closed year through the org-scoped endpoint', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/org/6/accounting/periods') return Promise.resolve({ data: { data: makePeriods('open') } } as any);
      if (url === '/org/6/accounting/year-close/history') return Promise.resolve({ data: { data: history } } as any);
      return Promise.resolve({ data: { data: [] } } as any);
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Accounting Periods' });

    fireEvent.click(await screen.findByRole('button', { name: 'Reopen Year' }));
    fireEvent.change(screen.getByPlaceholderText(/Late adjustment/), { target: { value: 'late fix' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Reopen Year' }).slice(-1)[0]);
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/org/6/accounting/year-close/reopen', expect.objectContaining({ reason: 'late fix' })));
  });
});
