import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OrgFinancePage from './OrgFinancePage';
import api from '../../services/api';

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../permissions/Can', () => ({ Can: ({ children }: any) => <>{children}</> }));
vi.mock('../../components/ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../utils/walletTransactions', () => ({ getWalletTransactionLabel: () => 'tx' }));

const mockGet = vi.mocked(api.get);
const mockPost = vi.mocked(api.post);

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const outstanding = {
  entitlements: [
    { id: 1, entitlement_type: 'ORGANIZATION_EARNING', amount: 1000, source_type: 'marketplace', source_id: 90001, available_at: '2026-08-01' },
    { id: 2, entitlement_type: 'COURTZON_COMMISSION', amount: 50, source_type: 'booking', source_id: 123, available_at: '2026-08-02' },
  ],
  selectedIds: [1, 2],
  excludedIds: [],
  financials: { courtzonOwedToOrg: 1000, orgOwedToCourtZon: 50, net: 950, direction: 'COURTZON_TO_ORGANIZATION', finalAmount: 950, totalOrgEarnings: 1000, totalCommission: 50 },
  financialsAll: { courtzonOwedToOrg: 1000, orgOwedToCourtZon: 50, net: 950, direction: 'COURTZON_TO_ORGANIZATION', finalAmount: 950, totalOrgEarnings: 1000, totalCommission: 50 },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/org/6/finance']}>
      <Routes>
        <Route path="/org/:orgId/finance" element={
          <QueryClientProvider client={qc}>
            <OrgFinancePage />
          </QueryClientProvider>
        } />
      </Routes>
    </MemoryRouter>,
  );
}

async function openSettlementsTab() {
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Settlements' }));
  await screen.findByRole('heading', { name: /Outstanding/ });
}

describe('OrgFinancePage — canonical outstanding settlements (org-scoped)', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockGet.mockImplementation((url: string) => {
      if (url === '/org/6/settlements/outstanding') return Promise.resolve({ data: outstanding } as any);
      if (url === '/org/6/settlements') return Promise.resolve({ data: { data: [{ id: 50, final_amount: 950, commission_amount: 50, settlement_direction: 'courtzon_to_org', settlement_status: 'completed' }], total: 1 } } as any);
      if (url === '/org/6/transactions') return Promise.resolve({ data: { data: [], total: 0 } } as any);
      return Promise.resolve({ data: {} } as any);
    });
    mockPost.mockResolvedValue({ data: { settlement: { id: 60 } } } as any);
  });

  it('renders the canonical outstanding projection (earnings, commission, net, direction)', async () => {
    await openSettlementsTab();

    expect((await screen.findAllByText('Organization Earning')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('1000.00')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('CourtZon Commission')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('50.00')).length).toBeGreaterThan(0);
    expect(await screen.findByText('CourtZon pays Organization')).toBeTruthy();
    // Entitlement rows (source cell is "source #id")
    expect((await screen.findAllByText((c) => c.includes('marketplace'))).length).toBeGreaterThan(0);
    expect((await screen.findAllByText((c) => c.includes('booking'))).length).toBeGreaterThan(0);
  });

  it('still shows Settlement History below the outstanding section', async () => {
    await openSettlementsTab();
    expect(screen.getByText('Settlement History')).toBeTruthy();
    expect(await screen.findByText('#50')).toBeTruthy();
  });

  it('requests settlement through the org-scoped canonical endpoint (route orgId, no body orgId)', async () => {
    await openSettlementsTab();
    fireEvent.click(screen.getByRole('button', { name: '+ Request Settlement' }));
    fireEvent.click(screen.getByRole('button', { name: 'Request Settlement' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/org/6/settlements'));
    // No client-supplied orgId in the payload — the route is authoritative.
    const body = mockPost.mock.calls[0][1];
    expect(body && (body as any).orgId).toBeUndefined();
  });

  it('shows a clear empty state when there is nothing outstanding', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/org/6/settlements/outstanding') return Promise.resolve({ data: { entitlements: [], financials: {}, financialsAll: {} } } as any);
      if (url === '/org/6/settlements') return Promise.resolve({ data: { data: [], total: 0 } } as any);
      if (url === '/org/6/transactions') return Promise.resolve({ data: { data: [], total: 0 } } as any);
      return Promise.resolve({ data: {} } as any);
    });
    await openSettlementsTab();
    expect(await screen.findByText(/No outstanding settlements available/)).toBeTruthy();
  });
});