import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('../../hooks/useCan', () => ({
  useCan: () => ({ can: (k: string) => k === 'marketplace.complaints.approve' }),
}));
vi.mock('../../utils/currency', () => ({
  formatPrice: (n: number, _c?: string) => `${n.toFixed(2)} ${_c || ''}`.trim(),
}));

import api from '../../services/api';
import ComplaintDetailPage from './ComplaintDetailPage';

const mockGet = vi.mocked(api.get);

function renderDetail(_complaint: any) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/marketplace/complaints/1']}>
        <Routes>
          <Route path="/marketplace/complaints/:id" element={<ComplaintDetailPage />} />
          <Route path="/marketplace/orders/:id" element={<div data-testid="order-detail">order</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function makeComplaint(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    public_id: 'c-1',
    order_id: 942837,
    order_item_id: 3310,
    buyer_id: 100,
    viewerId: 100,
    complaint_type: 'defective',
    status: 'refunded',
    reason: 'Defective product',
    attempt_number: 1,
    created_at: '2026-08-26T10:00:00.000Z',
    disputed_value: 1500,
    refund_amount: 1500,
    refund_ratio: 1,
    resolution_type: 'refund',
    resolved_at: '2026-08-27T10:00:00.000Z',
    collection_status: 'not_required',
    approval_status: 'none',
    images: [],
    order: { id: 942837, currency_code: 'EGP' },
    ...overrides,
  };
}

describe('ComplaintDetailPage — status + refund result (Step 10)', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('shows friendly status label', async () => {
    mockGet.mockResolvedValue({ data: makeComplaint({ status: 'in_review' }) });
    renderDetail(makeComplaint({ status: 'in_review' }));
    await waitFor(() => expect(screen.getByText('Under Review')).toBeTruthy());
  });

  it('shows the approved refund amount from the backend for the buyer', async () => {
    mockGet.mockResolvedValue({ data: makeComplaint({ status: 'refunded', refund_amount: 1500 }) });
    renderDetail(makeComplaint({ status: 'refunded', refund_amount: 1500 }));
    await waitFor(() => expect(screen.getByText('Refund Result')).toBeTruthy());
    expect(screen.getAllByText('1500.00 EGP').length).toBeGreaterThan(0);
    expect(screen.getByText('Your wallet')).toBeTruthy();
  });

  it('shows refunded status and date', async () => {
    mockGet.mockResolvedValue({ data: makeComplaint() });
    renderDetail(makeComplaint());
    await waitFor(() => expect(screen.getAllByText('Refunded').length).toBeGreaterThan(0));
    expect(screen.getByText('27/08/2026')).toBeTruthy();
  });

  it('shows rejected status', async () => {
    mockGet.mockResolvedValue({ data: makeComplaint({ status: 'rejected', refund_amount: null }) });
    renderDetail(makeComplaint({ status: 'rejected', refund_amount: null }));
    await waitFor(() => expect(screen.getByText('Rejected')).toBeTruthy());
    expect(screen.queryByText('Refund Result')).toBeNull();
  });

  it('does NOT show refund result for non-refunded statuses', async () => {
    mockGet.mockResolvedValue({ data: makeComplaint({ status: 'pending', refund_amount: null }) });
    renderDetail(makeComplaint({ status: 'pending', refund_amount: null }));
    await waitFor(() => expect(screen.getByText('Pending')).toBeTruthy());
    expect(screen.queryByText('Refund Result')).toBeNull();
  });

  it('does not expose admin/internal decision data to the buyer', async () => {
    const complaint = makeComplaint({ status: 'pending', approval_status: 'none', approved_by: 999, approved_at: null });
    mockGet.mockResolvedValue({ data: complaint });
    renderDetail(complaint);
    await waitFor(() => expect(screen.getByText('Pending')).toBeTruthy());
    // Admin-only approve panel is not shown to a buyer without approve permission
    expect(screen.queryByText('CourtZon Admin Approval Required')).toBeNull();
  });
});