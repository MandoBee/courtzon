import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

const record1 = {
  id: 1,
  entry_date: '2026-08-30T21:00:00.000Z',
  account_code: '1161',
  account_name: 'Marketplace Receivable',
  debit: 810,
  credit: 0,
  description: 'Order #24 organization book (sales/commission/shipping)',
  reference_type: 'marketplace_marketplace_org_receivable',
  reference_id: 24,
};
const record2 = {
  id: 2,
  entry_date: '2026-09-01T10:00:00.000Z',
  account_code: '1120',
  account_name: 'Cash / Bank',
  debit: 0,
  credit: 100,
  description: 'Manual journal fixture',
  reference_type: 'journal',
  reference_id: null,
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

describe('OrgAccountingRecordsPage', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    grant('org.accounting.view');
    vi.mocked(api.get).mockResolvedValue({ data: { data: [record1, record2] } });
  });

  it('renders the organisation accounting records (automatic + manual)', async () => {
    renderPage();
    expect(await screen.findByText('Marketplace Receivable')).toBeTruthy();
    expect(screen.getByText('Cash / Bank')).toBeTruthy();
    expect(screen.getByText('810.00')).toBeTruthy();
    expect(screen.getByText('100.00')).toBeTruthy();
    // Reference labels distinguish automatic vs manual.
    expect(screen.getByText(/marketplace_org_receivable #24/)).toBeTruthy();
    expect(screen.getByText('Manual journal')).toBeTruthy();
  });

  it('returns null without the org.accounting.view permission', async () => {
    grant('org.sidebar.dashboard');
    renderPage();
    expect(screen.queryByText('Accounting Records')).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('shows an empty state when the backend returns no records', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [] } });
    renderPage();
    expect(await screen.findByText('No accounting records yet')).toBeTruthy();
  });
});