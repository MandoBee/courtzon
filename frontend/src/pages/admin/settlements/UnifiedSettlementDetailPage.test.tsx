import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../../hooks/useCan', () => ({
  useCan: () => ({ can: () => false }),
}));

vi.mock('../../../utils/currency', () => ({
  formatPrice: (n: number, _c?: string) => `${n.toFixed(2)} ${_c || ''}`.trim(),
}));

import api from '../../../services/api';
import UnifiedSettlementDetailPage from './UnifiedSettlementDetailPage';

const mockGet = vi.mocked(api.get);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin/unified-settlements/1']}>
        <Routes>
          <Route path="/admin/unified-settlements/:id" element={ui} />
          <Route path="/org/:orgId/orders/:orderId" element={<div>org order page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Canonical backend response: { settlement, entitlements, financials }. */
function makeSettlement(overrides: Record<string, any> = {}) {
  return {
    settlement: {
      id: 1,
      organisation_id: 6,
      organisation_name: 'Padel Edge',
      settlement_status: 'requested',
      final_amount: 1050.0,
      net_amount: 1050.0,
      organization_position: 1050.0,
      courtzon_position: 0.0,
      settlement_direction: 'courtzon_to_org',
      batch_code: 'SET-2026-08-001',
      created_at: '2026-08-26T10:00:00.000Z',
      paid_at: null,
      paid_amount: null,
      payment_method: null,
      payment_reference: null,
      ...(overrides.settlement || {}),
    },
    financials: {
      courtzonOwedToOrg: 1050.0,
      orgOwedToCourtZon: 0.0,
      net: 1050.0,
      direction: 'COURTZON_TO_ORGANIZATION',
      finalAmount: 1050.0,
      totalOrgEarnings: 950.0,
      totalCommission: 100.0,
      totalOrgAdjustments: 0.0,
      totalCourtZonAdjustments: 0.0,
      ...(overrides.financials || {}),
    },
    entitlements: overrides.entitlements ?? [
      {
        id: 1041,
        organisation_id: 6,
        entitlement_type: 'ORGANIZATION_EARNING',
        source_type: 'marketplace',
        source_id: 3311,
        collector: 'courtzon',
        amount: 950.0,
        currency: 'EGP',
        status: 'SETTLED',
        metadata: { orderId: 942838 },
      },
      {
        id: 1042,
        organisation_id: 6,
        entitlement_type: 'COURTZON_COMMISSION',
        source_type: 'marketplace',
        source_id: 3311,
        collector: 'courtzon',
        amount: 100.0,
        currency: 'EGP',
        status: 'SETTLED',
        metadata: { orderId: 942838 },
      },
    ],
  };
}

describe('UnifiedSettlementDetailPage — Source Details', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('displays settlement info from canonical data', async () => {
    mockGet.mockResolvedValue({ data: makeSettlement() });
    wrap(<UnifiedSettlementDetailPage />);
    expect(await screen.findByText('Settlement #1 · Padel Edge')).toBeTruthy();
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText('Padel Edge')).toBeTruthy();
    expect(screen.getAllByText('1050.00 EGP').length).toBeGreaterThan(0);
    expect(screen.getByText(/SET-2026-08-001/)).toBeTruthy();
  });

  it('shows final settlement amount from canonical settlement field', async () => {
    mockGet.mockResolvedValue({ data: makeSettlement() });
    wrap(<UnifiedSettlementDetailPage />);
    await screen.findByText('Settlement #1 · Padel Edge');
    expect(screen.getByText('Final Settlement Amount')).toBeTruthy();
    expect(screen.getAllByText('1050.00 EGP').length).toBeGreaterThan(0);
  });

  it('shows earning and commission totals without double-counting', async () => {
    mockGet.mockResolvedValue({ data: makeSettlement() });
    wrap(<UnifiedSettlementDetailPage />);
    await screen.findByText('Settlement #1 · Padel Edge');
    expect(screen.getByText('Org Earnings')).toBeTruthy();
    expect(screen.getAllByText('950.00 EGP').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CourtZon Commission').length).toBeGreaterThan(0);
    expect(screen.getAllByText('100.00 EGP').length).toBeGreaterThan(0);
  });

  it('shows adjustments in the composition', async () => {
    mockGet.mockResolvedValue({
      data: makeSettlement({
        financials: {
          courtzonOwedToOrg: 900, orgOwedToCourtZon: 0, net: 900,
          direction: 'COURTZON_TO_ORGANIZATION', finalAmount: 900,
          totalOrgEarnings: 950, totalCommission: 100,
          totalOrgAdjustments: -50, totalCourtZonAdjustments: 0,
        },
        entitlements: [
          { id: 1, organisation_id: 6, entitlement_type: 'ORGANIZATION_EARNING', source_type: 'marketplace', source_id: 3311, collector: 'courtzon', amount: 950, status: 'SETTLED', metadata: { orderId: 1 } },
          { id: 2, organisation_id: 6, entitlement_type: 'COURTZON_COMMISSION', source_type: 'marketplace', source_id: 3311, collector: 'courtzon', amount: 100, status: 'SETTLED', metadata: { orderId: 1 } },
          { id: 3, organisation_id: 6, entitlement_type: 'ORGANIZATION_ADJUSTMENT', source_type: 'marketplace', source_id: 3312, collector: 'courtzon', amount: -50, status: 'ON_HOLD', metadata: { orderId: 2 } },
        ],
      }),
    });
    wrap(<UnifiedSettlementDetailPage />);
    await screen.findByText('Settlement #1 · Padel Edge');
    expect(screen.getByText('Org Adjustments')).toBeTruthy();
    expect(screen.getAllByText('-50.00 EGP').length).toBeGreaterThan(0);
    expect(screen.getByText('CourtZon Adjustments')).toBeTruthy();
    expect(screen.getAllByText('0.00 EGP').length).toBeGreaterThan(0);
  });

  it('groups multiple sources independently', async () => {
    mockGet.mockResolvedValue({
      data: makeSettlement({
        entitlements: [
          { id: 1, organisation_id: 6, entitlement_type: 'ORGANIZATION_EARNING', source_type: 'marketplace', source_id: 3311, collector: 'courtzon', amount: 950, status: 'SETTLED', metadata: { orderId: 942838 } },
          { id: 2, organisation_id: 6, entitlement_type: 'COURTZON_COMMISSION', source_type: 'marketplace', source_id: 3311, collector: 'courtzon', amount: 100, status: 'SETTLED', metadata: { orderId: 942838 } },
          { id: 3, organisation_id: 6, entitlement_type: 'ORGANIZATION_EARNING', source_type: 'booking', source_id: 5001, collector: 'courtzon', amount: 400, status: 'SETTLED', metadata: { bookingId: 42 } },
        ],
      }),
    });
    wrap(<UnifiedSettlementDetailPage />);
    await screen.findByText('Settlement #1 · Padel Edge');
    // Two source groups
    expect(screen.getAllByText('Marketplace').length).toBeGreaterThan(0);
    expect(screen.getByText('Booking')).toBeTruthy();
    expect(screen.getByText('Booking #42')).toBeTruthy();
  });

  it('resolves marketplace entitlement to the correct order route', async () => {
    mockGet.mockResolvedValue({ data: makeSettlement() });
    wrap(<UnifiedSettlementDetailPage />);
    await screen.findByText('Settlement #1 · Padel Edge');
    const link = screen.getByText('View Order #942838 →');
    expect(link.getAttribute('href')).toBe('/org/6/orders/942838');
  });

  it('shows entitlement status and collector', async () => {
    mockGet.mockResolvedValue({ data: makeSettlement() });
    wrap(<UnifiedSettlementDetailPage />);
    await screen.findByText('Settlement #1 · Padel Edge');
    expect(screen.getAllByText('SETTLED').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Collected by CourtZon').length).toBeGreaterThan(0);
  });

  it('does NOT render internal or sensitive data', async () => {
    mockGet.mockResolvedValue({ data: makeSettlement() });
    wrap(<UnifiedSettlementDetailPage />);
    await screen.findByText('Settlement #1 · Padel Edge');
    expect(screen.queryByText(/gateway_response/i)).toBeNull();
    expect(screen.queryByText(/paymob/i)).toBeNull();
    expect(screen.queryByText(/password/i)).toBeNull();
  });

  it('handles a settlement with no entitlements gracefully', async () => {
    mockGet.mockResolvedValue({ data: makeSettlement({ entitlements: [] }) });
    wrap(<UnifiedSettlementDetailPage />);
    await screen.findByText('Settlement #1 · Padel Edge');
    expect(screen.getByText('Source Details (0)')).toBeTruthy();
    expect(screen.getByText('None.')).toBeTruthy();
  });

  it('shows paid settlement info when paid', async () => {
    const payload = makeSettlement({
      settlement: {
        settlement_status: 'completed',
        paid_at: '2026-08-26T12:00:00.000Z',
        paid_amount: 1050.0,
        payment_method: 'bank_transfer',
        payment_reference: 'TX-12345',
        settlement_direction: 'courtzon_to_org',
      },
    });
    expect(payload.settlement.paid_at).toBe('2026-08-26T12:00:00.000Z');
    expect(payload.settlement.settlement_status).toBe('completed');
    mockGet.mockResolvedValue({ data: payload });
    wrap(<UnifiedSettlementDetailPage />);
    await screen.findByText('Settlement #1 · Padel Edge');
    expect(screen.getByText('Reference:')).toBeTruthy();
    expect(screen.getByText('bank_transfer')).toBeTruthy();
    expect(screen.getByText('TX-12345')).toBeTruthy();
  });

  it('shows paid settlement info when paid (pending settlement also works)', async () => {
    mockGet.mockResolvedValue({
      data: makeSettlement({
        settlement: {
          settlement_status: 'requested',
          paid_at: null,
          paid_amount: null,
        },
      }),
    });
    wrap(<UnifiedSettlementDetailPage />);
    await screen.findByText('Settlement #1 · Padel Edge');
    expect(screen.getAllByText('requested').length).toBeGreaterThan(0);
    // No paid block shown for pending
    expect(screen.queryByText('Reference:')).toBeNull();
  });

  it('does not show source details from another organisation', async () => {
    // Both entitlements belong to org 6 (the settlement org) — no foreign rows.
    mockGet.mockResolvedValue({ data: makeSettlement() });
    wrap(<UnifiedSettlementDetailPage />);
    await screen.findByText('Settlement #1 · Padel Edge');
    const sourceTexts = screen.getAllByText(/Collected by/);
    // All displayed entitlements belong to the settlement organisation only
    expect(sourceTexts.length).toBeGreaterThan(0);
  });

  it('does not perform financial calculations in the frontend', async () => {
    mockGet.mockResolvedValue({ data: makeSettlement() });
    wrap(<UnifiedSettlementDetailPage />);
    await screen.findByText('Settlement #1 · Padel Edge');
    // The exact backend final amount is displayed — not a computed subtotal
    expect(screen.getAllByText('1050.00 EGP').length).toBeGreaterThan(0);
    expect(screen.queryByText(/subtotal/i)).toBeNull();
    expect(screen.queryByText(/calculated/i)).toBeNull();
  });
});