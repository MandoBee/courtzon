import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import JournalEntryPage from '../JournalEntryPage';
import api from '../../../../services/api';

vi.mock('../../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../../../permissions/Can', () => ({ Can: ({ children }: any) => <>{children}</> }));
vi.mock('../../../../i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('../../../../components/ui/Button', () => ({
  Button: ({ children, onClick, disabled, type }: any) => (
    <button type={type || 'button'} onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));
vi.mock('../../../../components/ui/Toast', () => ({
  ToastProvider: ({ children }: any) => <>{children}</>,
  useToast: () => ({ showToast: vi.fn() }),
}));

const mockGet = vi.mocked(api.get);

const journalCalls = () =>
  mockGet.mock.calls.filter((c) => String(c[0]) === '/admin/accounting/journal');

const makeEntry = (i: number, orgId: number | null) => ({
  id: 1000 + i,
  entry_date: '2026-08-31T00:00:00.000Z',
  description: `Entry ${i}`,
  reference_type: 'journal',
  reference_id: i,
  organisation_id: orgId,
  lines: [
    { account_code: '1120', account_name: 'Cash / Bank', debit: 500, credit: 0 },
    { account_code: '4170', account_name: 'Platform Revenue', debit: 0, credit: 500 },
  ],
});

function mockDefault() {
  mockGet.mockImplementation((url: string, config?: any) => {
    if (url === '/admin/accounting/journal') {
      const page = config?.params?.page || 1;
      const pageSize = config?.params?.pageSize || 25;
      const orgId = config?.params?.entityId ? Number(config.params.entityId) : null;
      const start = (page - 1) * pageSize;
      return Promise.resolve({ data: { data: [makeEntry(start, orgId)], total: 1, page, pageSize } });
    }
    if (url === '/admin/organisations') {
      return Promise.resolve({ data: [{ id: 7, name: 'Padel Edge' }, { id: 8, name: 'Org B' }] });
    }
    if (url === '/marketplace/admin/sellers') {
      return Promise.resolve({ data: { data: [{ id: 88, name: 'Merchant A' }, { id: 89, name: 'Merchant B' }], total: 2 } });
    }
    if (url === '/admin/accounting/accounts') {
      return Promise.resolve({ data: { data: [] } });
    }
    return Promise.resolve({ data: {} });
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <JournalEntryPage />
    </QueryClientProvider>,
  );
}

describe('JournalEntryPage — entity filter (CourtZon / Organisation / Merchant / All)', () => {
  beforeEach(() => {
    mockGet.mockClear();
    mockDefault();
  });

  it('defaults to CourtZon — the first journal request carries entityType=courtzon', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    const last: any = journalCalls().slice(-1)[0];
    expect(last[1].params.entityType).toBe('courtzon');
    expect(last[1].params.entityId).toBeUndefined();
  });

  it('renders a flat list of entity names (no groups, no headings, no type suffixes)', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    const select = screen.getByLabelText('Entity') as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent || '');
    // Plain entity names only.
    expect(labels).toContain('CourtZon');
    expect(labels).toContain('Padel Edge');
    expect(labels).toContain('Org B');
    expect(labels).toContain('Merchant A');
    expect(labels).toContain('Merchant B');
    expect(labels).toContain('All');
    // No category headings / pseudo options.
    for (const forbidden of ['Organizations', 'All Organizations', 'Merchants', 'All Merchants']) {
      expect(labels).not.toContain(forbidden);
    }
    // No visible type suffixes.
    for (const label of labels) {
      expect(label).not.toContain('— Organisation');
      expect(label).not.toContain('— Merchant');
    }
    // No internal ids visible in the labels.
    for (const label of labels) {
      expect(label).not.toMatch(/\b\d{1,6}\b/);
    }
    // No nested optgroups rendered.
    expect(Array.from(select.querySelectorAll('optgroup'))).toHaveLength(0);
    // Order: CourtZon, organisations, merchants, All.
    const order = labels.map((l) => l);
    expect(order[0]).toBe('CourtZon');
    expect(order[order.length - 1]).toBe('All');
    expect(order.indexOf('Padel Edge')).toBeLessThan(order.indexOf('Merchant A'));
  });

  it('selecting an organisation + Apply sends entityType=organisation&entityId', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'organisation:7' } });
    fireEvent.click(screen.getByText('Apply'));
    await waitFor(() => {
      const last: any = journalCalls().slice(-1)[0];
      expect(last[1].params.entityType).toBe('organisation');
      expect(last[1].params.entityId).toBe('7');
    });
  });

  it('selecting a merchant + Apply sends entityType=merchant&entityId', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'merchant:88' } });
    fireEvent.click(screen.getByText('Apply'));
    await waitFor(() => {
      const last: any = journalCalls().slice(-1)[0];
      expect(last[1].params.entityType).toBe('merchant');
      expect(last[1].params.entityId).toBe('88');
    });
  });

  it('entity filter combines with From/To dates', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    const dateInputs = screen.getAllByLabelText(/From Date|To Date/);
    fireEvent.change(screen.getByLabelText('From Date'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('To Date'), { target: { value: '2026-12-31' } });
    fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'organisation:7' } });
    fireEvent.click(screen.getByText('Apply'));
    await waitFor(() => {
      const last: any = journalCalls().slice(-1)[0];
      expect(last[1].params.entityType).toBe('organisation');
      expect(last[1].params.entityId).toBe('7');
      expect(last[1].params.dateFrom).toBe('2026-01-01');
      expect(last[1].params.dateTo).toBe('2026-12-31');
    });
    void dateInputs;
  });

  it('All sends entityType=all (no entityId)', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'all' } });
    fireEvent.click(screen.getByText('Apply'));
    await waitFor(() => {
      const last: any = journalCalls().slice(-1)[0];
      expect(last[1].params.entityType).toBe('all');
      expect(last[1].params.entityId).toBeUndefined();
    });
  });

  it('Clear resets dates and returns the entity to CourtZon', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    fireEvent.change(screen.getByLabelText('From Date'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'organisation:7' } });
    fireEvent.click(screen.getByText('Apply'));
    await waitFor(() => {
      const last: any = journalCalls().slice(-1)[0];
      expect(last[1].params.entityType).toBe('organisation');
    });
    fireEvent.click(screen.getByText('Clear'));
    await waitFor(() => {
      const last: any = journalCalls().slice(-1)[0];
      expect(last[1].params.entityType).toBe('courtzon');
      expect(last[1].params.dateFrom).toBeUndefined();
      expect(last[1].params.dateTo).toBeUndefined();
      expect(last[1].params.entityId).toBeUndefined();
    });
    expect((screen.getByLabelText('Entity') as HTMLSelectElement).value).toBe('courtzon');
  });
});