import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OrgAccountingRecordsPage from './OrgAccountingRecordsPage';
import api from '../../services/api';
import { ToastProvider } from '../../components/ui/Toast';

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../hooks/useCan', () => ({
  useCan: () => ({ can: (permission: string) => mockPermissions.has('*') || mockPermissions.has(permission), permissions: [...mockPermissions] }),
}));
vi.mock('../../permissions/Can', () => ({ Can: ({ children }: any) => <>{children}</> }));

let mockPermissions = new Set<string>();
const grant = (...keys: string[]) => { mockPermissions = new Set(keys); };

const VIEW = 'org.accounting.view';
const CREATE = 'org.accounting.journal.create';

const orgBookEntry = {
  id: 110,
  entry_date: '2026-08-30',
  description: 'Order #24 organization book (sales/commission/shipping)',
  reference_type: 'marketplace_marketplace_org_receivable',
  reference_id: 24,
  organisation_id: 6,
  lines: [
    { account_code: '1161', account_name: 'Marketplace Receivable', debit: 810, credit: 0 },
    { account_code: 'MKT-COMM-EXP', account_name: 'Marketplace Commission Expense', debit: 40, credit: 0 },
    { account_code: 'MKT-SALES', account_name: 'Marketplace Sales Revenue', debit: 0, credit: 800 },
    { account_code: 'MKT-SHIP-LIAB', account_name: 'Shipping Liability', debit: 0, credit: 50 },
  ],
};
const manualEntry = {
  id: 201,
  entry_date: '2026-09-01',
  description: 'Manual journal fixture',
  reference_type: 'journal',
  reference_id: 999901,
  organisation_id: 6,
  lines: [
    { account_code: '1120', account_name: 'Cash / Bank', debit: 100, credit: 0 },
    { account_code: '4100', account_name: 'Revenue', debit: 0, credit: 100 },
  ],
};
const coaAccounts = {
  data: {
    data: {
      global: [
        { id: 50, code: '1120', name: 'Cash / Bank', is_postable: true, customization: null, effective_name: 'Cash / Bank' },
        { id: 60, code: '4100', name: 'Revenue', is_postable: true, customization: null, effective_name: 'Revenue' },
      ],
      org: [],
    },
  },
};

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <MemoryRouter initialEntries={['/org/6/accounting/records']}>
      <Routes>
        <Route path="/org/:orgId/accounting/records" element={
          <QueryClientProvider client={qc}>
            <ToastProvider><OrgAccountingRecordsPage /></ToastProvider>
          </QueryClientProvider>
        } />
      </Routes>
    </MemoryRouter>
  );
};

async function openForm() {
  fireEvent.click(screen.getByRole('button', { name: '+ New Manual Journal' }));
  await screen.findByText('New Manual Journal');
}

describe('OrgAccountingRecordsPage — canonical journal-entry view', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    grant(VIEW, CREATE);
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/org/6/accounting/journal-entries') return Promise.resolve({ data: { data: [orgBookEntry, manualEntry], total: 2 } });
      if (url === '/org/6/accounting/coa') return Promise.resolve(coaAccounts);
      return Promise.resolve({ data: {} });
    });
    vi.mocked(api.post).mockResolvedValue({ data: { data: { ids: [1, 2] } } });
  });

  it('fetches the canonical grouped journal-entries endpoint (no client-side flat query)', async () => {
    renderPage();
    await screen.findByText('Order #24 organization book (sales/commission/shipping)');
    expect(api.get).toHaveBeenCalledWith('/org/6/accounting/journal-entries', {
      params: { grouped: true, page: 1, pageSize: 25, dateFrom: undefined, dateTo: undefined },
    });
  });

  it('renders journal-entry cards with DEBIT / CREDIT sections and balanced totals (same as Super Admin)', async () => {
    renderPage();
    await screen.findByText('Order #24 organization book (sales/commission/shipping)');
    expect(screen.getByText(/marketplace_marketplace_org_receivable #24/)).toBeTruthy();
    expect(screen.getByText(/journal #999901/)).toBeTruthy();
    expect(screen.getAllByText('Debit').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Credit').length).toBeGreaterThan(0);
    expect(screen.getByText('Marketplace Receivable')).toBeTruthy();
    expect(screen.getByText(/810\.00/)).toBeTruthy();
    expect(screen.getAllByText(/850\.00/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Cash / Bank')).toBeTruthy();
    expect(screen.getAllByText(/100\.00/).length).toBeGreaterThanOrEqual(2);
  });

  it('date filters call Apply/Clear on the same endpoint', async () => {
    renderPage();
    await screen.findByText('Order #24 organization book (sales/commission/shipping)');
    const dates = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dates[0], { target: { value: '2026-08-01' } });
    fireEvent.change(dates[1], { target: { value: '2026-08-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/org/6/accounting/journal-entries', {
      params: { grouped: true, page: 1, pageSize: 25, dateFrom: '2026-08-01', dateTo: '2026-08-31' },
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/org/6/accounting/journal-entries', {
      params: { grouped: true, page: 1, pageSize: 25, dateFrom: undefined, dateTo: undefined },
    }));
  });

  it('shows a loading state while the request is pending', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('shows an empty state when the backend returns no entries', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [], total: 0 } });
    renderPage();
    expect(await screen.findByText('No journal entries found')).toBeTruthy();
  });

  it('shows an error state when the request fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByText(/Failed to load accounting records/)).toBeTruthy();
  });

  it('returns null without the org.accounting.view permission', async () => {
    grant('org.sidebar.dashboard');
    renderPage();
    expect(screen.queryByText('Accounting Records')).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });

  // ── New Manual Journal ──

  it('shows "+ New Manual Journal" only when the create permission is held', async () => {
    renderPage();
    await screen.findByText('Order #24 organization book (sales/commission/shipping)');
    expect(screen.getByRole('button', { name: '+ New Manual Journal' })).toBeTruthy();
  });

  it('hides "+ New Manual Journal" without the create permission', async () => {
    grant(VIEW);
    renderPage();
    await screen.findByText('Order #24 organization book (sales/commission/shipping)');
    expect(screen.queryByRole('button', { name: '+ New Manual Journal' })).toBeNull();
  });

  it('opens the manual journal form with no organisation selector', async () => {
    renderPage();
    await screen.findByText('Order #24 organization book (sales/commission/shipping)');
    await openForm();
    expect(screen.getByLabelText('Entry Date')).toBeTruthy();
    expect(screen.getByLabelText('Description')).toBeTruthy();
    expect(screen.getByText('Line Items')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Post Entry' })).toBeTruthy();
    // The organisation is derived server-side — never a user-selectable field.
    expect(screen.queryByText(/Organisation/)).toBeNull();
    expect(screen.queryByLabelText(/Organisation ID/i)).toBeNull();
  });

  it('lists only the organisation\'s allowed postable accounts and supports add/remove lines', async () => {
    renderPage();
    await screen.findByText('Order #24 organization book (sales/commission/shipping)');
    await openForm();

    // Org COA drives the account picker (scoped to the form's line table).
    const form = screen.getByText('Line Items').closest('form')!;
    const lineSelects = () => Array.from(form.querySelectorAll('select'));
    await waitFor(() => expect(lineSelects().length).toBe(1));
    await waitFor(() => expect(lineSelects()[0].textContent).toContain('1120 - Cash / Bank'));
    expect(lineSelects()[0].textContent).toContain('4100 - Revenue');

    // Add a second line.
    fireEvent.click(screen.getByRole('button', { name: '+ Add Line' }));
    await waitFor(() => expect(lineSelects().length).toBe(2));
    // Remove line 2 back to one.
    const removeButtons = Array.from(form.querySelectorAll('button')).filter((b) => b.textContent === '✕');
    fireEvent.click(removeButtons[removeButtons.length - 1]);
    await waitFor(() => expect(lineSelects().length).toBe(1));
  });

  it('submits a balanced journal to the canonical org endpoint WITHOUT an organisation id, then refreshes', async () => {
    renderPage();
    await screen.findByText('Order #24 organization book (sales/commission/shipping)');
    await openForm();
    await waitFor(() => expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2));

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Org manual entry' } });
    fireEvent.change(screen.getByLabelText('Entry Date'), { target: { value: '2026-09-01' } });

    fireEvent.click(screen.getByRole('button', { name: '+ Add Line' }));
    const selects = screen.getAllByRole('combobox');
    const numbers = document.querySelectorAll('input[type="number"]');
    // Line 1: Cash (1120) debit 100.
    fireEvent.change(selects[0], { target: { value: '50' } });
    fireEvent.change(numbers[0], { target: { value: '100' } });
    // Line 2: Revenue (4100) credit 100.
    fireEvent.change(selects[1], { target: { value: '60' } });
    fireEvent.change(numbers[3], { target: { value: '100' } });

    const post = screen.getByRole('button', { name: 'Post Entry' });
    expect((post as HTMLButtonElement).disabled).toBe(false);

    const journalGetCalls = vi.mocked(api.get).mock.calls.filter((c) => c[0] === '/org/6/accounting/journal-entries').length;
    fireEvent.click(post);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/org/6/accounting/journal', {
        entryDate: '2026-09-01',
        description: 'Org manual entry',
        entries: [
          { accountId: 50, debit: 100, credit: 0 },
          { accountId: 60, debit: 0, credit: 100 },
        ],
      });
    });
    // No organisationId is ever sent by the client.
    const body = vi.mocked(api.post).mock.calls[0][1] as any;
    expect(body.organisationId).toBeUndefined();

    // Successful creation refreshes the list (journal-entries refetch).
    await waitFor(() => {
      expect(vi.mocked(api.get).mock.calls.filter((c) => c[0] === '/org/6/accounting/journal-entries').length).toBeGreaterThan(journalGetCalls);
    });
  });

  it('blocks submission when the entry is unbalanced', async () => {
    renderPage();
    await screen.findByText('Order #24 organization book (sales/commission/shipping)');
    await openForm();

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Unbalanced' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Add Line' }));
    const selects = screen.getAllByRole('combobox');
    const numbers = document.querySelectorAll('input[type="number"]');
    fireEvent.change(selects[0], { target: { value: '50' } });
    fireEvent.change(numbers[0], { target: { value: '100' } });
    fireEvent.change(selects[1], { target: { value: '60' } });
    fireEvent.change(numbers[3], { target: { value: '50' } });

    const post = screen.getByRole('button', { name: 'Post Entry' });
    expect((post as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(post);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('shows a server validation error toast when creation fails', async () => {
    vi.mocked(api.post).mockRejectedValue({
      isAxiosError: true,
      message: 'request failed',
      response: { data: { message: 'Journal entry is not balanced' } },
    });
    renderPage();
    await screen.findByText('Order #24 organization book (sales/commission/shipping)');
    await openForm();

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Will fail' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Add Line' }));
    const selects = screen.getAllByRole('combobox');
    const numbers = document.querySelectorAll('input[type="number"]');
    fireEvent.change(selects[0], { target: { value: '50' } });
    fireEvent.change(numbers[0], { target: { value: '100' } });
    fireEvent.change(selects[1], { target: { value: '60' } });
    fireEvent.change(numbers[3], { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post Entry' }));

    expect(await screen.findByText('Journal entry is not balanced')).toBeTruthy();
  });
});