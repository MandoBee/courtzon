import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BookingSettlementPage from './BookingSettlementPage';
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

// The 4-booking UAT fixture: 2 card + 2 COD, E£400 each, E£20 commission.
const CARD_BOOKING = {
  bookingId: 111, organisationId: 7, orgName: 'Cairo Padel Club', bookingType: 'private_match',
  paymentMethod: 'card', bookingDate: '2026-08-10', startTime: '09:00:00',
  cardOnlineNet: 380, codFee: 0, gross: 400, coachSettleable: 0, orgSettleable: 380,
  coachOutstandingRecovery: 0, orgOutstandingRecovery: 0, eligibility: 'ELIGIBLE', eligibilityReason: 'AVAILABLE booking entitlements',
};
const CARD_BOOKING_2 = {
  bookingId: 112, organisationId: 7, orgName: 'Cairo Padel Club', bookingType: 'public_match',
  paymentMethod: 'card', bookingDate: '2026-08-10', startTime: '11:00:00',
  cardOnlineNet: 380, codFee: 0, gross: 400, coachSettleable: 0, orgSettleable: 380,
  coachOutstandingRecovery: 0, orgOutstandingRecovery: 0, eligibility: 'ELIGIBLE', eligibilityReason: 'AVAILABLE booking entitlements',
};
const COD_BOOKING = {
  bookingId: 113, organisationId: 7, orgName: 'Cairo Padel Club', bookingType: 'private_match',
  paymentMethod: 'cash', bookingDate: '2026-08-10', startTime: '10:00:00',
  cardOnlineNet: 0, codFee: 20, gross: 400, coachSettleable: 0, orgSettleable: 0,
  coachOutstandingRecovery: 0, orgOutstandingRecovery: 0, eligibility: 'ELIGIBLE', eligibilityReason: 'AVAILABLE booking entitlements',
};
const COD_BOOKING_2 = {
  bookingId: 114, organisationId: 7, orgName: 'Cairo Padel Club', bookingType: 'public_match',
  paymentMethod: 'cash', bookingDate: '2026-08-10', startTime: '12:00:00',
  cardOnlineNet: 0, codFee: 20, gross: 400, coachSettleable: 0, orgSettleable: 0,
  coachOutstandingRecovery: 0, orgOutstandingRecovery: 0, eligibility: 'ELIGIBLE', eligibilityReason: 'AVAILABLE booking entitlements',
};

const PREVIEW = {
  gross: 1600, onlineNet: 760, codGross: 800, codFee: 40, commission: 80,
  direction: 'COURTZON_TO_ORGANIZATION', finalAmount: 720, eligibleBookings: 4,
};

vi.mocked(api.get).mockImplementation((url: string, config?: any) => {
  if (url === '/admin/organisations') {
    return Promise.resolve({ data: [{ id: 7, name: 'Cairo Padel Club' }, { id: 8, name: 'Giza Tennis Academy' }] });
  }
  if (url === '/settlements/bookings/eligible') {
    const orgFilter = config?.params?.organisationId;
    const data = orgFilter === undefined ? [CARD_BOOKING, CARD_BOOKING_2, COD_BOOKING, COD_BOOKING_2] : [CARD_BOOKING, COD_BOOKING];
    return Promise.resolve({ data: { data, total: data.length, preview: orgFilter === undefined ? PREVIEW : { ...PREVIEW, eligibleBookings: 2 } } });
  }
  return Promise.resolve({ data: { data: [] } });
});

vi.mocked(api.post).mockImplementation((url: string) => {
  if (url === '/unified-settlements') {
    return Promise.resolve({ data: { settlement: { id: 50 }, entitlements: [], financials: {} } });
  }
  return Promise.resolve({ data: {} });
});

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <MemoryRouter initialEntries={['/admin/settlements/bookings']}>
      <Routes>
        <Route path="/admin/settlements/bookings" element={
          <QueryClientProvider client={qc}>
            <ToastProvider>
              <BookingSettlementPage />
            </ToastProvider>
          </QueryClientProvider>
        } />
        <Route path="/admin/unified-settlements/:id" element={<div>DETAIL-PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('BookingSettlementPage — organisation dropdown + entitlement-driven settlement preview', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockClear();
    vi.mocked(api.post).mockClear();
    (api.get as any).mockImplementation(vi.mocked(api.get).getMockImplementation()!);
    (api.post as any).mockImplementation(vi.mocked(api.post).getMockImplementation()!);
    grant('settlements.view', 'settlements.request');
  });

  it('F1. renders a proper organisation dropdown (no manual ID input) with All Organisations default', async () => {
    renderPage();
    const select = await screen.findByRole('combobox', { name: /Organisation/ }) as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe(''); // All Organisations is the default
    // Organisation options load asynchronously from the API — wait for them.
    await screen.findByRole('option', { name: 'Cairo Padel Club (#7)' });
    const optionLabels = Array.from(select.options).map((o) => o.text);
    expect(optionLabels).toContain('All Organisations');
    expect(optionLabels).toContain('Cairo Padel Club (#7)');
    expect(optionLabels).toContain('Giza Tennis Academy (#8)');
    // No numeric ID input anywhere.
    expect(screen.queryByLabelText(/Organisation ID/)).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('shows the E£720 settlement preview for the 4-booking UAT dataset', async () => {
    renderPage();
    expect(await screen.findByText(/Booking Settlement Preview/)).toBeTruthy();
    // Gross 1600 / Online 760 / COD collected 800 / COD commission 40 / commission 80 / net 720.
    expect(screen.getAllByText(/1,600\.00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/760\.00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/800\.00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/40\.00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/CourtZon pays Organization/)).toBeTruthy();
    expect(screen.getAllByText(/720\.00/).length).toBeGreaterThan(0);
  });

  it('shows the eligible bookings with their card/COD split', async () => {
    renderPage();
    expect(await screen.findByText('#111')).toBeTruthy();
    expect(screen.getByText('#113')).toBeTruthy();
    // Card booking shows online net 380 / COD fee 0.
    const cardRow = screen.getByText('#111').closest('tr')!;
    expect(cardRow.textContent).toContain('380.00');
    // COD booking shows COD fee 20 / online net 0.
    const codRow = screen.getByText('#113').closest('tr')!;
    expect(codRow.textContent).toContain('20.00');
  });

  it('filters by organisation and refetches with the selected organisation id', async () => {
    renderPage();
    await screen.findByText('#111');
    fireEvent.change(screen.getByRole('combobox', { name: /Organisation/ }), { target: { value: '7' } });
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/settlements/bookings/eligible', { params: { page: 1, limit: 20, organisationId: '7' } });
    });
  });

  it('creates a unified settlement for the selected organisation', async () => {
    renderPage();
    await screen.findByText('#111');
    fireEvent.change(screen.getByRole('combobox', { name: /Organisation/ }), { target: { value: '7' } });
    await screen.findByText(/Showing only Cairo Padel Club/);
    // The preview refetches for the selected org — wait for the create button.
    const createBtn = await screen.findByRole('button', { name: 'Create Settlement' });
    fireEvent.click(createBtn);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/unified-settlements', { orgId: 7, excludeEntitlementIds: [] }));
    expect(await screen.findByText('DETAIL-PAGE')).toBeTruthy();
  });

  it('requires the settlements.view permission to render', () => {
    grant('financial.view');
    renderPage();
    expect(screen.queryByText('Booking Settlements')).toBeNull();
  });
});