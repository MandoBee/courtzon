import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OrgAccountingRecordsPage from './OrgAccountingRecordsPage';
import api from '../../services/api';

vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../../hooks/useCan', () => ({
  useCan: () => ({ can: (permission: string) => mockPermissions.has('*') || mockPermissions.has(permission), permissions: [...mockPermissions] }),
}));
vi.mock('../../permissions/Can', () => ({ Can: ({ children }: any) => <>{children}</> }));

let mockPermissions = new Set<string>();
const grant = (...keys: string[]) => { mockPermissions = new Set(keys); };

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

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <MemoryRouter initialEntries={['/org/6/accounting/records']}>
      <Routes>
        <Route path="/org/:orgId/accounting/records" element={
          <QueryClientProvider client={qc}><OrgAccountingRecordsPage /></QueryClientProvider>
        } />
      </Routes>
    </MemoryRouter>
  );
};

describe('OrgAccountingRecordsPage — canonical journal-entry view', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    grant('org.accounting.view');
    vi.mocked(api.get).mockResolvedValue({ data: { data: [orgBookEntry, manualEntry], total: 2 } });
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
    // Reference badges + description.
    expect(await screen.findByText('Order #24 organization book (sales/commission/shipping)')).toBeTruthy();
    expect(screen.getByText(/marketplace_marketplace_org_receivable #24/)).toBeTruthy();
    expect(screen.getByText(/journal #999901/)).toBeTruthy();

    // DEBIT / CREDIT sections with account code + name + amounts.
    expect(screen.getAllByText('Debit').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Credit').length).toBeGreaterThan(0);
    expect(screen.getByText('Marketplace Receivable')).toBeTruthy();
    expect(screen.getByText('1161')).toBeTruthy();
    expect(screen.getByText('Marketplace Commission Expense')).toBeTruthy();
    expect(screen.getByText(/810\.00/)).toBeTruthy();
    expect(screen.getByText(/40\.00/)).toBeTruthy();
    expect(screen.getByText(/800\.00/)).toBeTruthy();
    expect(screen.getAllByText(/50\.00/).length).toBeGreaterThan(0);
    // Balanced totals (Debit total = Credit total = 850).
    expect(screen.getAllByText(/850\.00/).length).toBeGreaterThanOrEqual(2);
    // Manual entry lines too.
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
});