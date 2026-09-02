import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OrgFinancialReportsPage from './OrgFinancialReportsPage';
import GeneralLedgerPage from '../admin/accounting/GeneralLedgerPage';
import api from '../../services/api';

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../permissions/Can', () => ({ Can: ({ children }: any) => <>{children}</> }));
vi.mock('../../components/ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const mockGet = vi.mocked(api.get);

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const tbRows = [
  { account_id: 10, code: '1120', name: 'Cash / Bank', type: 'asset', normal_side: 'debit', total_debits: 500, total_credits: 0, balance: 500, level: 1, parent_id: null, has_children: false },
  { account_id: 20, code: '4100', name: 'Revenue', type: 'revenue', normal_side: 'credit', total_debits: 0, total_credits: 800, balance: -800, level: 1, parent_id: null, has_children: false },
  { account_id: 30, code: '4900', name: 'Zero Balance', type: 'expense', normal_side: 'debit', total_debits: 0, total_credits: 0, balance: 0, level: 1, parent_id: null, has_children: false },
];

const isData = {
  lines: [
    { account_id: 20, code: '4100', name: 'Sales', type: 'revenue', normal_side: 'credit', total_debits: 0, total_credits: 1000, balance: 1000, level: 0, parent_id: null, has_children: false },
    { account_id: 21, code: '4120', name: 'Returns', type: 'contra_revenue', normal_side: 'debit', total_debits: 40, total_credits: 0, balance: -40, level: 0, parent_id: null, has_children: false },
    { account_id: 30, code: '5100', name: 'Rent', type: 'expense', normal_side: 'debit', total_debits: 300, total_credits: 0, balance: -300, level: 0, parent_id: null, has_children: false },
  ],
  net_revenue: 960,
  net_expense: 300,
  net_income: 660,
  total_revenue: 1000,
  total_expense: 300,
  contra_revenue: 40,
  contra_expense: 0,
};

const bsRows = [
  { account_id: 10, code: '1120', name: 'Cash / Bank', type: 'asset', normal_side: 'debit', total_debits: 500, total_credits: 0, balance: 500, level: 0, parent_id: null, has_children: false },
  { account_id: 40, code: '3100', name: 'Owner Equity', type: 'equity', normal_side: 'credit', total_debits: 0, total_credits: 500, balance: 500, level: 0, parent_id: null, has_children: false },
];

function renderOrg(reportType: string, orgId = '6') {
  return render(
    <MemoryRouter initialEntries={[`/org/${orgId}/accounting/reports/${reportType}`]}>
      <Routes>
        <Route path="/org/:orgId/accounting/reports/:reportType" element={
          <QueryClientProvider client={qc}>
            <OrgFinancialReportsPage />
          </QueryClientProvider>
        } />
      </Routes>
    </MemoryRouter>,
  );
}

function headerTexts(container: HTMLElement): string[] {
  const table = container.querySelector('table');
  if (!table) return [];
  return Array.from(table.querySelectorAll('th')).map((th) => th.textContent || '');
}

describe('OrgFinancialReportsPage — org-scoped accounting reports', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockImplementation((url: string) => {
      if (url.includes('trial-balance')) return Promise.resolve({ data: { data: tbRows } } as any);
      if (url.includes('income-statement')) return Promise.resolve({ data: { data: isData } } as any);
      if (url.includes('balance-sheet')) return Promise.resolve({ data: { data: bsRows } } as any);
      return Promise.resolve({ data: { data: [] } } as any);
    });
  });

  it('renders Trial Balance with the canonical Super Admin columns and scoped data', async () => {
    const { container } = renderOrg('trial-balance');
    expect(await screen.findByText('Cash / Bank')).toBeTruthy();
    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(headerTexts(container)).toEqual(['Code', 'Account', 'Type', 'Debit Total', 'Credit Total', 'Balance']);
    expect(screen.getByText('LE 500.00 DR')).toBeTruthy();
    expect(screen.getByText('LE 800.00 CR')).toBeTruthy();
    expect(screen.queryByText('Organization:')).toBeNull();
    expect(screen.queryByText('All Organizations')).toBeNull();
  });

  it('renders Income Statement with Net totals and the GL Net Income label', async () => {
    renderOrg('income-statement');
    expect(await screen.findByText('Revenue')).toBeTruthy();
    expect(screen.getByText('Expenses')).toBeTruthy();
    expect(screen.getByText('Contra Revenue')).toBeTruthy();
    expect(screen.getByText('Net Revenue:')).toBeTruthy();
    expect(screen.getByText('Net Expense:')).toBeTruthy();
    expect(screen.getByText('GL Net Income (Accounting):')).toBeTruthy();
    expect(screen.getByText((content) => content.includes('Not your settlement earnings'), { selector: 'p' })).toBeTruthy();
  });

  it('renders Balance Sheet with Assets + Liabilities & Equity sections', async () => {
    const { container } = renderOrg('balance-sheet');
    expect(await screen.findByText('Assets')).toBeTruthy();
    expect(screen.getByText('Liabilities & Equity')).toBeTruthy();
    expect(headerTexts(container)).toEqual(['Code', 'Account', 'Type', 'Balance']);
    expect(screen.getByText('Owner Equity')).toBeTruthy();
  });

  it('only calls the org-scoped endpoint — never admin or another organisation', async () => {
    renderOrg('trial-balance');
    await screen.findByText('Cash / Bank');
    const urls = mockGet.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain('/org/6/accounting/trial-balance');
    expect(urls.some((u) => u.startsWith('/admin/'))).toBe(false);
    expect(urls.some((u) => u.includes('/org/7/'))).toBe(false);
  });

  it('uses the route orgId and never fetches another organisation when on a different org route', async () => {
    renderOrg('trial-balance', '7');
    await screen.findByText('Cash / Bank');
    const urls = mockGet.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain('/org/7/accounting/trial-balance');
    expect(urls.some((u) => u.includes('/org/6/'))).toBe(false);
    expect(urls.some((u) => u.includes('/admin/'))).toBe(false);
  });

  it('passes From/To date filters to the trial balance endpoint and Reset clears them', async () => {
    const { container } = renderOrg('trial-balance');
    await screen.findByText('Cash / Bank');
    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBe(2);
    fireEvent.change(dateInputs[0], { target: { value: '2026-01-01' } });
    fireEvent.change(dateInputs[1], { target: { value: '2026-06-30' } });
    await waitFor(() => {
      const last = mockGet.mock.calls[mockGet.mock.calls.length - 1];
      expect(last[1]).toMatchObject({ params: { from: '2026-01-01', to: '2026-06-30' } });
    });
    fireEvent.click(screen.getByText('Reset'));
    await waitFor(() => {
      const last = mockGet.mock.calls[mockGet.mock.calls.length - 1];
      expect((last[1] as any).params.from).toBeUndefined();
      expect((last[1] as any).params.to).toBeUndefined();
    });
  });

  it('passes the As Of date filter to the balance sheet endpoint', async () => {
    const { container } = renderOrg('balance-sheet');
    await screen.findByText('Assets');
    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBe(1);
    fireEvent.change(dateInputs[0], { target: { value: '2026-12-31' } });
    await waitFor(() => {
      const last = mockGet.mock.calls[mockGet.mock.calls.length - 1];
      expect(last[1]).toMatchObject({ params: { asOf: '2026-12-31' } });
    });
  });

  it('hides zero-balance rows by default and shows them with Show Zero Balances', async () => {
    const { container } = renderOrg('trial-balance');
    await screen.findByText('Cash / Bank');
    expect(screen.queryByText('Zero Balance')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('Zero Balance')).toBeTruthy();
    void container;
  });

  it('opens the org-scoped account ledger modal from a Trial Balance row', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/org/6/accounting/trial-balance') return Promise.resolve({ data: { data: tbRows } } as any);
      if (url === '/org/6/accounting/ledger/10') {
        return Promise.resolve({ data: { data: { entries: [{ entry_date: '2026-08-01', debit: 500, credit: 0, description: 'Cash deposit', reference_type: 'journal', reference_id: 3 }] } } } as any);
      }
      return Promise.resolve({ data: { data: [] } } as any);
    });
    renderOrg('trial-balance');
    fireEvent.click(await screen.findByText('Cash / Bank'));
    expect(await screen.findByText('Account Ledger')).toBeTruthy();
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/org/6/accounting/ledger/10'));
    expect(await screen.findByText('Cash deposit')).toBeTruthy();
  });
});

describe('OrgFinancialReportsPage — parity with Super Admin rendering', () => {
  it('renders the same Trial Balance structure as the Super Admin General Ledger page', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/organisations?limit=200') return Promise.resolve({ data: { data: [{ id: 6, name: 'Test Org' }] } } as any);
      if (url === '/admin/accounting/periods') return Promise.resolve({ data: { data: [] } } as any);
      if (url === '/admin/accounting/journal') return Promise.resolve({ data: { data: [], total: 0 } } as any);
      if (url === '/admin/accounting/trial-balance') return Promise.resolve({ data: { data: tbRows } } as any);
      return Promise.resolve({ data: { data: [] } } as any);
    });

    const admin = render(
      <QueryClientProvider client={qc}>
        <GeneralLedgerPage />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Trial Balance' }));
    await waitFor(() => expect(admin.container.querySelector('table')).toBeTruthy());
    const adminHeaders = headerTexts(admin.container);

    const org = render(
      <MemoryRouter initialEntries={['/org/6/accounting/reports/trial-balance']}>
        <Routes>
          <Route path="/org/:orgId/accounting/reports/:reportType" element={
            <QueryClientProvider client={qc}>
              <OrgFinancialReportsPage />
            </QueryClientProvider>
          } />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText('Cash / Bank');
    const orgHeaders = headerTexts(org.container);

    expect(orgHeaders).toEqual(adminHeaders);
  });
});
