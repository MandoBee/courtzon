import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import JournalEntryPage from '../JournalEntryPage';
import api from '../../../../services/api';

const makeLines = () => [
  { account_code: '1120', account_name: 'Cash / Bank', debit: 500, credit: 0 },
  { account_code: '4170', account_name: 'Platform / Subscription Revenue', debit: 0, credit: 500 },
];

const makeEntries = (start: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: 100000 + start + i,
    entry_date: '2026-08-31T00:00:00.000Z',
    description: `Entry ${start + i}`,
    reference_type: 'journal',
    reference_id: start + i,
    organisation_id: null,
    lines: makeLines(),
  }));

export const __mockApi = { total: 2774 };

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn((_url: string, config?: any) => {
      const page = config?.params?.page || 1;
      const pageSize = config?.params?.pageSize || 25;
      const dateFrom = config?.params?.dateFrom;
      const dateTo = config?.params?.dateTo;
      let total = __mockApi.total;
      if (dateFrom && dateTo) total = 203;
      const start = (page - 1) * pageSize;
      const entries = makeEntries(start, Math.min(pageSize, Math.max(0, total - start)));
      return Promise.resolve({ data: { data: entries, total, page, pageSize } });
    }),
    post: vi.fn(),
  },
}));

vi.mock('../../../../permissions/Can', () => ({
  Can: ({ children }: any) => <>{children}</>,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../../components/ui/Button', () => ({
  Button: ({ children, onClick, disabled, type }: any) => (
    <button type={type || 'button'} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

import { ToastProvider } from '../../../../components/ui/Toast';

const journalCalls = () =>
  (api.get as any).mock.calls.filter((c: any) => String(c[0]).includes('accounting/journal'));

describe('JournalEntryPage pagination', () => {
  const renderPage = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <JournalEntryPage />
        </ToastProvider>
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    __mockApi.total = 2774;
    (api.get as any).mockClear();
  });

  it('shows pagination when total > pageSize (multiple pages)', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    expect(screen.getAllByText('common.previous').length).toBeGreaterThan(0);
    expect(screen.getAllByText('common.next').length).toBeGreaterThan(0);
    expect(screen.getByText('1–25 of 2774 records')).toBeTruthy();
  });

  it('keeps the footer visible with disabled navigation when total <= pageSize (single page)', async () => {
    __mockApi.total = 13;
    renderPage();
    await screen.findByText('Entry 0');
    expect(screen.getByText('1–13 of 13 records')).toBeTruthy();
    expect(screen.getByText('1 of 1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'common.previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'common.next' })).toBeDisabled();
    expect(screen.getAllByText('common.rows_per_page').length).toBeGreaterThan(0);
  });

  it('requests page 2 when Next is clicked and receives different entries', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    fireEvent.click(screen.getAllByText('common.next')[0]);
    await waitFor(() => expect(journalCalls().slice(-1)[0][1].params.page).toBe(2));
    expect(await screen.findByText('Entry 25')).toBeTruthy();
  });

  it('applying a date filter resets to page 1', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    fireEvent.click(screen.getAllByText('common.next')[0]);
    await waitFor(() => expect(journalCalls().slice(-1)[0][1].params.page).toBe(2));
    fireEvent.click(screen.getByText('Apply'));
    await waitFor(() => {
      const last = journalCalls().slice(-1)[0];
      expect(last[1].params.page).toBe(1);
    });
  });

  it('clearing a date filter resets to page 1', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    fireEvent.click(screen.getAllByText('common.next')[0]);
    await waitFor(() => expect(journalCalls().slice(-1)[0][1].params.page).toBe(2));
    fireEvent.click(screen.getByText('Clear'));
    await waitFor(() => {
      const last = journalCalls().slice(-1)[0];
      expect(last[1].params.page).toBe(1);
    });
  });
});
