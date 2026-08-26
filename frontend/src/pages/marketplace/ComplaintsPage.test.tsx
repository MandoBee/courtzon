import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('../../hooks/useCan', () => ({
  useCan: () => ({ can: (k: string) => k === 'marketplace.complaints.view' || k === 'marketplace.complaints.submit' }),
}));
vi.mock('../../utils/currency', () => ({
  formatPrice: (n: number, _c?: string) => `${n.toFixed(2)} ${_c || ''}`.trim(),
}));

import api from '../../services/api';
import ComplaintsPage from './ComplaintsPage';

const mockGet = vi.mocked(api.get);

function renderComplaints(initialEntries = ['/marketplace/complaints']) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/marketplace/complaints" element={<ComplaintsPage />} />
          <Route path="/marketplace/complaints/:id" element={<div data-testid="detail">detail</div>} />
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
    complaint_type: 'defective',
    status: 'pending',
    reason: 'Product arrived defective',
    attempt_number: 1,
    created_at: '2026-08-26T10:00:00.000Z',
    refund_amount: null,
    order: { id: 942837, currency_code: 'EGP' },
    ...overrides,
  };
}

describe('ComplaintsPage — player complaint history (Step 10)', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('lists complaints with friendly status labels and order reference', async () => {
    mockGet.mockResolvedValue({ data: { data: [makeComplaint({ status: 'in_review' })], total: 1, page: 1, limit: 20 } });
    renderComplaints();
    await waitFor(() => expect(screen.getByText(/Complaint #1/)).toBeTruthy());
    expect(screen.getByText('Under Review')).toBeTruthy();
    expect(screen.getByText(/Order #942837/)).toBeTruthy();
  });

  it('shows refunded amount with currency when refunded', async () => {
    mockGet.mockResolvedValue({
      data: { data: [makeComplaint({ status: 'refunded', refund_amount: 1500 })], total: 1, page: 1, limit: 20 },
    });
    renderComplaints();
    await waitFor(() => expect(screen.getAllByText(/Refunded/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/1500\.00 EGP/).length).toBeGreaterThan(0);
  });

  it('maps all backend statuses to friendly labels', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          makeComplaint({ id: 1, status: 'pending' }),
          makeComplaint({ id: 2, status: 'in_review' }),
          makeComplaint({ id: 3, status: 'awaiting_return' }),
          makeComplaint({ id: 4, status: 'refund_pending_approval' }),
          makeComplaint({ id: 5, status: 'refunded' }),
          makeComplaint({ id: 6, status: 'awaiting_confirmation' }),
          makeComplaint({ id: 7, status: 'resolved' }),
          makeComplaint({ id: 8, status: 'rejected' }),
        ],
        total: 8, page: 1, limit: 20,
      },
    });
    renderComplaints();
    await waitFor(() => expect(screen.getAllByText(/Complaint #/).length).toBe(8));
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText('Under Review')).toBeTruthy();
    expect(screen.getByText('Awaiting Return')).toBeTruthy();
    expect(screen.getByText('Refund Pending Approval')).toBeTruthy();
    expect(screen.getByText('Refunded')).toBeTruthy();
    expect(screen.getByText('Awaiting Confirmation')).toBeTruthy();
    expect(screen.getByText('Resolved')).toBeTruthy();
    expect(screen.getByText('Rejected')).toBeTruthy();
  });

  it('prefills the form from order detail navigation query params', async () => {
    mockGet.mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 20 } });
    renderComplaints(['/marketplace/complaints?orderId=942837&orderItemId=3310&seller=Padel%20Edge']);
    await waitFor(() => expect(screen.getByText('New Complaint')).toBeTruthy());
    // Click New Complaint to open the prefilled form
    screen.getByText('New Complaint').click();
    await waitFor(() => expect(screen.getByText('Padel Edge')).toBeTruthy());
    expect((screen.getByPlaceholderText('Enter order number') as HTMLInputElement).value).toBe('942837');
    expect((screen.getByPlaceholderText('Item number shown on your order') as HTMLInputElement).value).toBe('3310');
  });

  it('explains the complaint is a request, not an instant refund', async () => {
    mockGet.mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 20 } });
    renderComplaints();
    await waitFor(() => expect(screen.getByText('New Complaint')).toBeTruthy());
    screen.getByText('New Complaint').click();
    await waitFor(() => expect(screen.getByText(/does not instantly refund your order/)).toBeTruthy());
  });

  it('submits a complaint through the existing API without executing a refund', async () => {
    mockGet.mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 20 } });
    const mockPost = vi.mocked(api.post);
    mockPost.mockResolvedValue({ data: makeComplaint() });
    renderComplaints();
    await waitFor(() => expect(screen.getByText('New Complaint')).toBeTruthy());
    screen.getByText('New Complaint').click();
    await waitFor(() => expect(screen.getByText('Submit Complaint')).toBeTruthy());
    // Fill required fields via change events
    fireEvent.change(screen.getByPlaceholderText('Enter order number'), { target: { value: '942837' } });
    fireEvent.change(screen.getByPlaceholderText('Item number shown on your order'), { target: { value: '3310' } });
    fireEvent.change(screen.getByPlaceholderText(/Describe the issue/), { target: { value: 'Product is defective' } });
    screen.getByText('Submit Complaint').click();
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    const callBody = mockPost.mock.calls[0][1] as any;
    expect(callBody.orderId).toBe(942837);
    expect(callBody.orderItemId).toBe(3310);
    // No refund endpoint is called — only /marketplace/complaints
    expect(mockPost.mock.calls.map((c) => c[0])).toContain('/marketplace/complaints');
    expect(mockPost.mock.calls.map((c) => c[0])).not.toContain('/refund');
  });
});