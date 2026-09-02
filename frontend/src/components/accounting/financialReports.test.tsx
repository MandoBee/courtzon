import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  TrialBalanceTable,
  IncomeStatementTable,
  BalanceSheetTable,
  AccountLedgerModal,
  financialFmt,
  type ReportLine,
} from './financialReports';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function row(overrides: Partial<ReportLine>): ReportLine {
  return {
    account_id: 1,
    code: '4100',
    name: 'Revenue',
    type: 'revenue',
    normal_side: 'credit',
    total_debits: 0,
    total_credits: 100,
    balance: 100,
    level: 0,
    parent_id: null,
    has_children: false,
    ...overrides,
  };
}

describe('financialReports — shared Super Admin / org rendering', () => {
  it('TrialBalanceTable renders the canonical columns and DR/CR balances', () => {
    const rows = [
      row({ account_id: 10, code: '1120', name: 'Cash / Bank', type: 'asset', normal_side: 'debit', total_debits: 500, total_credits: 0, balance: 500 }),
      row({ account_id: 20, code: '4100', name: 'Revenue', type: 'revenue', normal_side: 'credit', total_debits: 0, total_credits: 800, balance: -800 }),
    ];
    render(
      <QueryClientProvider client={qc}>
        <TrialBalanceTable rows={rows} showZeroBalances={false} />
      </QueryClientProvider>,
    );
    for (const h of ['Code', 'Account', 'Type', 'Debit Total', 'Credit Total', 'Balance']) {
      expect(screen.getByText(h)).toBeTruthy();
    }
    expect(screen.getByText('Cash / Bank')).toBeTruthy();
    expect(screen.getByText('LE 500.00 DR')).toBeTruthy();
    expect(screen.getByText('LE 800.00 CR')).toBeTruthy();
  });

  it('TrialBalanceTable hides zero-balance rows unless Show Zero Balances is on', () => {
    const rows = [
      row({ account_id: 10, code: '1120', name: 'Cash / Bank', balance: 0, total_debits: 0, total_credits: 0 }),
      row({ account_id: 20, code: '4100', name: 'Revenue', balance: 100 }),
    ];
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <TrialBalanceTable rows={rows} showZeroBalances={false} />
      </QueryClientProvider>,
    );
    expect(screen.queryByText('Cash / Bank')).toBeNull();
    rerender(
      <QueryClientProvider client={qc}>
        <TrialBalanceTable rows={rows} showZeroBalances={true} />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Cash / Bank')).toBeTruthy();
  });

  it('TrialBalanceTable fires onSelectAccount for leaf rows only', () => {
    const onSelect = vi.fn();
    const rows = [
      row({ account_id: 10, code: '1120', name: 'Cash / Bank', has_children: true }),
      row({ account_id: 20, code: '4100', name: 'Revenue' }),
    ];
    render(
      <QueryClientProvider client={qc}>
        <TrialBalanceTable rows={rows} showZeroBalances={false} onSelectAccount={onSelect} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByText('Cash / Bank'));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Revenue'));
    expect(onSelect).toHaveBeenCalledWith({ id: 20, code: '4100', name: 'Revenue' });
  });

  it('IncomeStatementTable renders sections, contra sections and Net totals', () => {
    const data = {
      lines: [
        row({ account_id: 1, code: '4100', name: 'Sales', type: 'revenue', balance: 1000 }),
        row({ account_id: 2, code: '4120', name: 'Returns', type: 'contra_revenue', balance: -40 }),
        row({ account_id: 3, code: '5100', name: 'Rent', type: 'expense', balance: -300 }),
        row({ account_id: 4, code: '5120', name: 'Refund', type: 'contra_expense', balance: 10 }),
      ],
      net_revenue: 960,
      net_expense: 290,
      net_income: 670,
    };
    render(
      <QueryClientProvider client={qc}>
        <IncomeStatementTable data={data as any} showZeroBalances={false} netIncomeLabel="GL Net Income (Accounting):" footerNote={<p>Not your settlement earnings</p>} />
      </QueryClientProvider>,
    );
    for (const s of ['Revenue', 'Contra Revenue', 'Expenses', 'Contra Expense', 'Net Revenue:', 'Net Expense:', 'GL Net Income (Accounting):']) {
      expect(screen.getByText(s)).toBeTruthy();
    }
    expect(screen.getByText((content) => content.includes('Not your settlement earnings'), { selector: 'p' })).toBeTruthy();
    // net_income = 960 - 290 = 670
    expect(screen.getByText(financialFmt(670))).toBeTruthy();
  });

  it('BalanceSheetTable renders Assets and Liabilities & Equity sections with Type column', () => {
    const rows = [
      row({ account_id: 10, code: '1120', name: 'Cash / Bank', type: 'asset', balance: 500 }),
      row({ account_id: 30, code: '3100', name: 'Owner Equity', type: 'equity', balance: 500 }),
    ];
    render(
      <QueryClientProvider client={qc}>
        <BalanceSheetTable rows={rows} showZeroBalances={false} />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Assets')).toBeTruthy();
    expect(screen.getByText('Liabilities & Equity')).toBeTruthy();
    expect(screen.getByText('Type')).toBeTruthy();
    expect(screen.getByText('Cash / Bank')).toBeTruthy();
    expect(screen.getByText('Owner Equity')).toBeTruthy();
  });

  it('AccountLedgerModal fetches the scoped endpoint and lists entries', async () => {
    const { default: api } = await import('../../services/api');
    const get = vi.mocked(api.get);
    get.mockImplementation((url: string) => {
      if (url === '/org/6/accounting/ledger/20') {
        return Promise.resolve({ data: { data: { entries: [{ entry_date: '2026-08-01', debit: 100, credit: 0, description: 'Initial', reference_type: 'journal', reference_id: 9 }] } } } as any);
      }
      return Promise.resolve({ data: { data: { entries: [] } } } as any);
    });
    render(
      <QueryClientProvider client={qc}>
        <AccountLedgerModal account={{ id: 20, code: '4100', name: 'Revenue' }} endpoint={(id) => `/org/6/accounting/ledger/${id}`} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Account Ledger')).toBeTruthy();
    expect(screen.getByText('[4100] Revenue')).toBeTruthy();
    await waitFor(() => expect(get).toHaveBeenCalledWith('/org/6/accounting/ledger/20'));
    expect(await screen.findByText('Initial')).toBeTruthy();
  });
});
