import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UnifiedSettlementCreatePage from './UnifiedSettlementCreatePage';
import api from '../../../services/api';
import { ToastProvider } from '../../../components/ui/Toast';

vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../../../hooks/useCan', () => ({
  useCan: () => ({ can: (permission: string) => mockPermissions.has('*') || mockPermissions.has(permission), permissions: [...mockPermissions] }),
}));

vi.mock('../../../permissions/Can', () => ({
  Can: ({ children }: any) => <>{children}</>,
}));

let mockPermissions = new Set<string>();
const grant = (...keys: string[]) => { mockPermissions = new Set(keys); };
const REQUEST_KEY = 'settlements.request';
const PAY_KEY = 'settlements.pay';

const ent24 = { id: 24, source_type: 'marketplace', source_id: 100, entitlement_type: 'ORGANIZATION_EARNING', amount: 850, currency: 'EGP', available_at: '2026-09-01T00:00:00.000Z' };
const ent25 = { id: 25, source_type: 'marketplace', source_id: 101, entitlement_type: 'ORGANIZATION_EARNING', amount: 1200, currency: 'EGP', available_at: '2026-09-02T00:00:00.000Z' };
const ent26 = { id: 26, source_type: 'booking', source_id: 55, entitlement_type: 'ORGANIZATION_EARNING', amount: 450, currency: 'EGP', available_at: '2026-09-02T00:00:00.000Z' };
const ORG_7_POOL = [ent24, ent25, ent26];

function financials(pool: any[]) {
  const sum = pool.reduce((s, e) => s + Number(e.amount), 0);
  return { courtzonOwedToOrg: sum, orgOwedToCourtZon: 0, net: sum, direction: 'COURTZON_TO_ORGANIZATION', finalAmount: sum, totalOrgEarnings: sum, totalCommission: 0, totalOrgAdjustments: 0, totalCourtZonAdjustments: 0 };
}

vi.mocked(api.get).mockImplementation((url: string, config?: any) => {
  if (url === '/admin/organisations') {
    return Promise.resolve({ data: [{ id: 7, name: 'Cairo Padel Club' }, { id: 8, name: 'Giza Tennis Academy' }] });
  }
  if (url === '/unified-settlements/preview') {
    const params = config?.params || {};
    const orgId = Number(params.orgId);
    const exclude = String(params.exclude || '').split(',').filter(Boolean).map(Number);
    const pool = orgId === 7 ? ORG_7_POOL : [];
    const selected = pool.filter((e) => !exclude.includes(e.id));
    return Promise.resolve({ data: { entitlements: pool, selectedIds: selected.map((e) => e.id), excludedIds: exclude, financials: financials(selected) } });
  }
  return Promise.resolve({ data: { data: [] } });
});

vi.mocked(api.post).mockImplementation((url: string) => {
  if (url === '/unified-settlements') {
    return Promise.resolve({ data: { settlement: { id: 50 }, entitlements: [], financials: {} } });
  }
  if (url === '/unified-settlements/50/pay') {
    return Promise.resolve({ data: { settlement: { id: 50, settlement_status: 'completed' }, entitlements: [], financials: {} } });
  }
  return Promise.resolve({ data: {} });
});

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <MemoryRouter initialEntries={['/admin/unified-settlements/new']}>
      <Routes>
        <Route path="/admin/unified-settlements/new" element={
          <QueryClientProvider client={qc}>
            <ToastProvider>
              <UnifiedSettlementCreatePage />
            </ToastProvider>
          </QueryClientProvider>
        } />
        <Route path="/admin/unified-settlements/:id" element={<div>DETAIL-PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
};

async function selectCairo() {
  fireEvent.click(screen.getByText('Select organisation…'));
  const search = await screen.findByLabelText('Search organisations');
  fireEvent.change(search, { target: { value: 'Cairo' } });
  const option = await screen.findByText('Cairo Padel Club');
  fireEvent.mouseDown(option);
  // Selecting immediately loads the canonical preview (name-first, no manual ID entry).
  await screen.findByText(/Settlement #24/);
}

describe('UnifiedSettlementCreatePage — organisation-first finance workflow', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockClear();
    vi.mocked(api.post).mockClear();
    (api.get as any).mockImplementation(vi.mocked(api.get).getMockImplementation()!);
    (api.post as any).mockImplementation(vi.mocked(api.post).getMockImplementation()!);
    grant(REQUEST_KEY, PAY_KEY, 'settlements.view');
  });

  it('renders a dropdown/select organisation selector (no manual ID entry)', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /Select organisation…/ })).toBeTruthy();
    expect(screen.getByText('Select Organisation')).toBeTruthy();
    // No numeric ID input anywhere.
    expect(screen.queryByLabelText('Organization ID')).toBeNull();
  });

  it('lists organisations by name (ID secondary), filters by name, and selects', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Select organisation…'));
    // The dropdown lists accessible organisations by name, #id as secondary info.
    expect(await screen.findByText('Cairo Padel Club')).toBeTruthy();
    expect(screen.getByText('Giza Tennis Academy')).toBeTruthy();
    expect(screen.getAllByText('#7').length).toBeGreaterThan(0);

    // Search/filter inside the dropdown by name.
    const search = screen.getByLabelText('Search organisations');
    fireEvent.change(search, { target: { value: 'Giza' } });
    expect(await screen.findByText('Giza Tennis Academy')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Cairo Padel Club')).toBeNull());

    // Reset the filter and select Cairo by name.
    fireEvent.change(search, { target: { value: 'Cairo' } });
    const option = await screen.findByText('Cairo Padel Club');
    fireEvent.mouseDown(option);
    // Selecting immediately loads the canonical preview for that organisation.
    expect(await screen.findByText(/Settlement #24/)).toBeTruthy();
    expect(screen.getAllByText('Cairo Padel Club').length).toBeGreaterThan(0);
  });

  it('shows a no-results state inside the dropdown when filtering matches nothing', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Select organisation…'));
    await screen.findByText('Cairo Padel Club');
    fireEvent.change(screen.getByLabelText('Search organisations'), { target: { value: 'zzz' } });
    expect(await screen.findByText('No organisations match.')).toBeTruthy();
  });

  it('shows NO settlement items before an organisation is selected', () => {
    renderPage();
    expect(screen.queryByText('Outstanding Settlements')).toBeNull();
    expect(screen.queryByText(/Settlement #24/)).toBeNull();
    expect(screen.queryByText(/Select an organisation to load/)).toBeTruthy();
  });

  it('shows the empty-eligibility state only when the backend returns no eligible items', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Select organisation…'));
    // Giza Tennis Academy (org 8) has no eligible entitlements in the mock backend.
    const option = await screen.findByText('Giza Tennis Academy');
    fireEvent.mouseDown(option);
    expect(await screen.findByText('No eligible settlements for this organisation.')).toBeTruthy();
    expect(screen.queryByText('Outstanding Settlements')).toBeNull();
    expect(screen.queryByText(/Settlement #24/)).toBeNull();
  });

  it('loads ONLY the selected organisation eligible items after selection', async () => {
    renderPage();
    await selectCairo();
    expect(await screen.findByText(/Settlement #24/)).toBeTruthy();
    expect(screen.getByText(/Settlement #25/)).toBeTruthy();
    expect(screen.getByText(/Settlement #26/)).toBeTruthy();
    // Items belong to org 7 only.
    expect(api.get).toHaveBeenCalledWith('/unified-settlements/preview', { params: { orgId: 7, exclude: '' } });
  });

  it('selects multiple items and shows the correct available + selected totals', async () => {
    renderPage();
    await selectCairo();
    await screen.findByText(/Settlement #24/);
    // Available = 2500 (all 3); Selected = 2500 (all default).
    expect(screen.getByText(/Available to settle:/)).toBeTruthy();
    expect(screen.getAllByText(/2,500\.00/).length).toBeGreaterThan(0);
    expect(screen.getByText('3')).toBeTruthy();

    // Uncheck Settlement #26 (450) → selected = 2, total = 2050.
    const row26 = screen.getByText(/Settlement #26/).closest('label')!;
    fireEvent.click(row26.querySelector('input[type="checkbox"]')!);
    await waitFor(() => expect(screen.getByText('2')).toBeTruthy());
    expect(screen.getAllByText(/2,050\.00/).length).toBeGreaterThan(0);
  });

  it('passes the correct organisation and excluded items to the canonical preview', async () => {
    renderPage();
    await selectCairo();
    await screen.findByText(/Settlement #24/);

    const row26 = screen.getByText(/Settlement #26/).closest('label')!;
    fireEvent.click(row26.querySelector('input[type="checkbox"]')!);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/unified-settlements/preview', { params: { orgId: 7, exclude: '26' } });
    });
  });

  it('creates then pays with Bank Transfer via the canonical endpoints', async () => {
    renderPage();
    await selectCairo();
    await screen.findByText(/Settlement #24/);

    fireEvent.change(screen.getByLabelText('Payment reference'), { target: { value: 'BNK-001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Settlement & Pay' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/unified-settlements', { orgId: 7, excludeEntitlementIds: [] }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/unified-settlements/50/pay', { paymentMethod: 'bank_transfer', paymentReference: 'BNK-001' }));
    expect(await screen.findByText('DETAIL-PAGE')).toBeTruthy();
  });

  it('persists Cash as the payment method', async () => {
    renderPage();
    await selectCairo();
    await screen.findByText(/Settlement #24/);

    fireEvent.click(screen.getByRole('radio', { name: 'Cash' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Settlement & Pay' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/unified-settlements/50/pay', { paymentMethod: 'cash', paymentReference: undefined }));
  });

  it('does not submit when the request permission is missing', () => {
    grant('settlements.view');
    renderPage();
    expect(screen.queryByText('New Unified Settlement')).toBeNull();
  });

  it('creates without paying when the pay permission is missing (request-only role)', async () => {
    grant(REQUEST_KEY, 'settlements.view');
    renderPage();
    await selectCairo();
    await screen.findByText(/Settlement #24/);
    expect(screen.queryByText('Payment method')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Create Settlement' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/unified-settlements', { orgId: 7, excludeEntitlementIds: [] }));
    expect(api.post).not.toHaveBeenCalledWith('/unified-settlements/50/pay', expect.anything());
    expect(await screen.findByText('DETAIL-PAGE')).toBeTruthy();
  });

  it('prevents duplicate submission while the create request is in flight', async () => {
    let resolveCreate: (v: unknown) => void = () => {};
    (api.post as any).mockImplementation((url: string) => {
      if (url === '/unified-settlements') {
        return new Promise((res) => { resolveCreate = res; });
      }
      if (url === '/unified-settlements/50/pay') {
        return Promise.resolve({ data: { settlement: { id: 50, settlement_status: 'completed' }, entitlements: [], financials: {} } });
      }
      return Promise.resolve({ data: {} });
    });

    renderPage();
    await selectCairo();
    await screen.findByText(/Settlement #24/);

    const btn = screen.getByRole('button', { name: 'Create Settlement & Pay' });
    fireEvent.click(btn);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    fireEvent.click(btn);
    expect(api.post).toHaveBeenCalledTimes(1);

    resolveCreate({ data: { settlement: { id: 50 }, entitlements: [], financials: {} } });
    await waitFor(() => expect(screen.queryByText('DETAIL-PAGE')).toBeTruthy());
  });
});