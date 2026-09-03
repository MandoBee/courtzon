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
      // Every org. Merchants (sellers) below are a SUBSET sharing the same ids.
      return Promise.resolve({ data: [
        { id: 7, name: 'Padel Edge' }, { id: 8, name: 'Org B' },
        { id: 95, name: 'Club 1' }, { id: 90, name: 'Club 9' },
        { id: 93, name: 'Shop 1' }, { id: 94, name: 'Shop 2' },
        { id: 91, name: 'Shop 3' }, { id: 92, name: 'Shop 5' },
        { id: 52, name: 'Shop 6' }, { id: 51, name: 'Shop 7' },
      ] });
    }
    if (url === '/marketplace/admin/sellers') {
      // Seller orgs — ids 7/51/52/90 overlap with the organisation source.
      return Promise.resolve({ data: { data: [
        { id: 7, name: 'Padel Edge' }, { id: 51, name: 'Shop 7' },
        { id: 52, name: 'Shop 6' }, { id: 90, name: 'Club 9' },
        { id: 88, name: 'Merchant A' }, { id: 89, name: 'Merchant B' },
      ], total: 6 } });
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
    // No option shows ONLY a bare internal id (entity names may legitimately
    // contain digits, e.g. "Club 1" / "Shop 7").
    for (const label of labels) {
      expect(label).not.toMatch(/^#?\d+$/);
    }
    // No nested optgroups rendered.
    expect(Array.from(select.querySelectorAll('optgroup'))).toHaveLength(0);
    // Order: CourtZon, organisations, merchants, All.
    const order = labels.map((l) => l);
    expect(order[0]).toBe('CourtZon');
    expect(order[order.length - 1]).toBe('All');
    expect(order.indexOf('Padel Edge')).toBeLessThan(order.indexOf('Merchant A'));
  });

  it('deduplicates entities returned by BOTH the organisation and merchant sources (one option per entity)', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    const select = screen.getByLabelText('Entity') as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent || '');
    const count = (name: string) => labels.filter((l) => l === name).length;

    // CourtZon / All appear exactly once.
    expect(count('CourtZon')).toBe(1);
    expect(count('All')).toBe(1);
    // Overlapping entities (present in both sources) appear exactly once.
    expect(count('Padel Edge')).toBe(1);
    expect(count('Shop 7')).toBe(1);
    expect(count('Shop 6')).toBe(1);
    expect(count('Club 9')).toBe(1);
    // Merchant-only entities appear exactly once.
    expect(count('Merchant A')).toBe(1);
    expect(count('Merchant B')).toBe(1);
    // Every organisation appears exactly once.
    for (const name of ['Org B', 'Club 1', 'Shop 1', 'Shop 2', 'Shop 3', 'Shop 5']) {
      expect(count(name)).toBe(1);
    }
    // No visible name is ever repeated.
    for (const label of labels) expect(count(label)).toBe(1);
  });

  it('a deduplicated entity keeps its canonical internal value (organisation preferred, merchant-only keeps merchant)', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    const select = screen.getByLabelText('Entity') as HTMLSelectElement;
    const opts = Array.from(select.options).filter((o) => o.value !== 'courtzon' && o.value !== 'all');
    const byLabel = new Map(opts.map((o) => [o.textContent || '', o.value]));

    // Entities in BOTH sources keep the organisation identity.
    expect(byLabel.get('Padel Edge')).toBe('organisation:7');
    expect(byLabel.get('Shop 7')).toBe('organisation:51');
    expect(byLabel.get('Shop 6')).toBe('organisation:52');
    expect(byLabel.get('Club 9')).toBe('organisation:90');
    // Merchant-only entities keep the merchant identity.
    expect(byLabel.get('Merchant A')).toBe('merchant:88');
    expect(byLabel.get('Merchant B')).toBe('merchant:89');
  });

  it('changing the Entity triggers a refetch IMMEDIATELY (no Apply click required)', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    const before = journalCalls().length;

    fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'organisation:7' } });

    // No Apply click — the entity-only request fires on its own.
    await waitFor(() => {
      const last: any = journalCalls().slice(-1)[0];
      expect(last[1].params.entityType).toBe('organisation');
      expect(last[1].params.entityId).toBe('7');
      expect(journalCalls().length).toBeGreaterThan(before);
    });
  });

  it('changing the Entity to All applies immediately and sends entityType=all (no entityId)', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'all' } });
    await waitFor(() => {
      const last: any = journalCalls().slice(-1)[0];
      expect(last[1].params.entityType).toBe('all');
      expect(last[1].params.entityId).toBeUndefined();
    });
  });

  it('selecting a merchant applies immediately with entityType=merchant&entityId', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'merchant:88' } });
    await waitFor(() => {
      const last: any = journalCalls().slice(-1)[0];
      expect(last[1].params.entityType).toBe('merchant');
      expect(last[1].params.entityId).toBe('88');
    });
  });

  it('changing From Date ALONE does NOT trigger a request', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    const before = journalCalls().length;
    fireEvent.change(screen.getByLabelText('From Date'), { target: { value: '2026-03-09' } });
    await waitFor(() => {});
    expect(journalCalls().length).toBe(before);
  });

  it('changing To Date ALONE does NOT trigger a request', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    const before = journalCalls().length;
    fireEvent.change(screen.getByLabelText('To Date'), { target: { value: '2026-03-05' } });
    await waitFor(() => {});
    expect(journalCalls().length).toBe(before);
  });

  it('changing BOTH dates alone does NOT trigger a request until Apply', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    const before = journalCalls().length;
    fireEvent.change(screen.getByLabelText('From Date'), { target: { value: '2026-03-09' } });
    fireEvent.change(screen.getByLabelText('To Date'), { target: { value: '2026-03-05' } });
    await waitFor(() => {});
    expect(journalCalls().length).toBe(before);
  });

  it('Apply after changing dates uses the selected Entity plus the newly applied dates (no entity re-apply needed)', async () => {
    renderPage();
    await screen.findByText('Entry 0');

    // Apply an entity first — applied immediately.
    fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'organisation:7' } });
    await waitFor(() => {
      const last: any = journalCalls().slice(-1)[0];
      expect(last[1].params.entityType).toBe('organisation');
      expect(last[1].params.entityId).toBe('7');
    });

    // Change both date inputs — no request.
    const beforeDates = journalCalls().length;
    fireEvent.change(screen.getByLabelText('From Date'), { target: { value: '2026-03-09' } });
    fireEvent.change(screen.getByLabelText('To Date'), { target: { value: '2026-05-09' } });
    await waitFor(() => {});
    expect(journalCalls().length).toBe(beforeDates);

    // Apply — request carries the entity + the newly applied dates.
    fireEvent.click(screen.getByText('Apply'));
    await waitFor(() => {
      expect(journalCalls().length).toBeGreaterThan(0);
      const last: any = journalCalls().slice(-1)[0];
      expect(last[1].params.entityType).toBe('organisation');
      expect(last[1].params.entityId).toBe('7');
      expect(last[1].params.dateFrom).toBe('2026-03-09');
      expect(last[1].params.dateTo).toBe('2026-05-09');
    });
  });

  it('entity filter combines with From/To dates', async () => {
    renderPage();
    await screen.findByText('Entry 0');
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
  });

  it('a single Entity change generates no duplicate request (one new journal fetch)', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    const before = journalCalls().length;

    fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'organisation:7' } });
    await waitFor(() => {
      const last: any = journalCalls().slice(-1)[0];
      expect(last[1].params.entityType).toBe('organisation');
    });

    // Buffer a tick to let any duplicate fire, then assert exactly one more call.
    await waitFor(() => {});
    const entityChangeCalls = journalCalls().slice(before);
    expect(entityChangeCalls.length).toBe(1);
    const singleCall: any = entityChangeCalls[0];
    expect(singleCall[1].params.entityType).toBe('organisation');
    expect(singleCall[1].params.entityId).toBe('7');
  });

  it('clicking Apply WITHOUT changing dates does NOT generate a duplicate request', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    const before = journalCalls().length;
    fireEvent.click(screen.getByText('Apply'));
    await waitFor(() => {});
    expect(journalCalls().length).toBe(before);
  });

  it('Clear removes the applied date range, refreshes, and PRESERVES the selected Entity', async () => {
    renderPage();
    await screen.findByText('Entry 0');

    // Pick an entity (applies immediately) and apply a date range.
    fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'organisation:7' } });
    fireEvent.change(screen.getByLabelText('From Date'), { target: { value: '2026-01-01' } });
    fireEvent.click(screen.getByText('Apply'));
    await waitFor(() => {
      const last: any = journalCalls().slice(-1)[0];
      expect(last[1].params.entityType).toBe('organisation');
      expect(last[1].params.dateFrom).toBe('2026-01-01');
    });

    // Clear — the date range is removed but the entity is preserved.
    fireEvent.click(screen.getByText('Clear'));
    await waitFor(() => {
      const last: any = journalCalls().slice(-1)[0];
      expect(last[1].params.dateFrom).toBeUndefined();
      expect(last[1].params.dateTo).toBeUndefined();
      expect(last[1].params.entityType).toBe('organisation');
      expect(last[1].params.entityId).toBe('7');
    });
    expect((screen.getByLabelText('Entity') as HTMLSelectElement).value).toBe('organisation:7');
    expect((screen.getByLabelText('From Date') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('To Date') as HTMLInputElement).value).toBe('');
  });

  it('Clear preserves a merchant entity selection too', async () => {
    renderPage();
    await screen.findByText('Entry 0');
    fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'merchant:88' } });
    await waitFor(() => {
      const last: any = journalCalls().slice(-1)[0];
      expect(last[1].params.entityType).toBe('merchant');
      expect(last[1].params.entityId).toBe('88');
    });
    fireEvent.click(screen.getByText('Clear'));
    await waitFor(() => {
      const last: any = journalCalls().slice(-1)[0];
      expect(last[1].params.entityType).toBe('merchant');
      expect(last[1].params.entityId).toBe('88');
    });
    expect((screen.getByLabelText('Entity') as HTMLSelectElement).value).toBe('merchant:88');
  });
});
