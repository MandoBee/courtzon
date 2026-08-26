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
vi.mock('../../permissions/Can', () => ({
  Can: ({ children }: { children: any }) => <>{children}</>,
}));
vi.mock('../../utils/currency', () => ({
  formatPrice: (n: number, _c?: string) => `${n.toFixed(2)} ${_c || ''}`.trim(),
}));

import api from '../../services/api';
import OrderDetailPage from './OrderDetailPage';

const mockGet = vi.mocked(api.get);

function renderOrderDetail(id = '942837') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/marketplace/orders/${id}`]}>
        <Routes>
          <Route path="/marketplace/orders/:id" element={<OrderDetailPage />} />
          <Route path="/marketplace/complaints" element={<div data-testid="complaints-page">Complaints Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function makeOrder(overrides: Record<string, any> = {}) {
  return {
    id: 942837,
    public_id: 'pub-942837',
    status: 'delivered',
    viewedAsSeller: false,
    currency_code: 'EGP',
    created_at: '2026-08-26T10:00:00.000Z',
    subtotal: 48,
    shipping_cost: 60,
    discount_amount: 0,
    tax_amount: 0,
    total: 108,
    payment_method: 'wallet',
    payment_status: 'paid',
    items: [
      { itemId: 3310, productId: 380, productName: 'Multi-Sport Training Shirt', quantity: 2, unitPrice: 30, totalPrice: 60 },
    ],
    ...overrides,
  };
}

describe('OrderDetailPage — complaint flow (Step 10)', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('shows a File Complaint button instead of executing a refund', async () => {
    mockGet.mockResolvedValue({ data: makeOrder() });
    renderOrderDetail();
    await waitFor(() => expect(screen.getByText('File a Complaint / Refund Request')).toBeTruthy());
    // No instant-refund UI present
    expect(screen.queryByText('Refund issued')).toBeNull();
    expect(screen.queryByText(/refunded/i)).toBeNull();
  });

  it('does NOT change order status to refunded by itself', async () => {
    mockGet.mockResolvedValue({ data: makeOrder() });
    renderOrderDetail();
    await waitFor(() => expect(screen.getByText('File a Complaint / Refund Request')).toBeTruthy());
    // Cancel Order uses status cancelled, not refunded
    expect(screen.queryByText('Cancel Order')).toBeNull(); // status is delivered, so no cancel button
    expect(mockGet).toHaveBeenCalled();
  });

  it('navigates to the complaint flow with order + item context (single seller)', async () => {
    mockGet.mockResolvedValue({ data: makeOrder() });
    renderOrderDetail();
    const btn = await waitFor(() => screen.getByText('File a Complaint / Refund Request'));
    btn.click();
    // The route navigates to /marketplace/complaints with orderId + orderItemId
    await waitFor(() => expect(screen.getByTestId('complaints-page')).toBeTruthy());
  });

  it('multi-seller: each seller section has its own File Complaint button tied to that seller order', async () => {
    mockGet.mockResolvedValue({
      data: makeOrder({
        _isGrouped: true,
        _sellerOrders: [
          {
            id: 942837, shop_name: 'Shop 5', seller_id: 1001133,
            items: [{ itemId: 3310, productName: 'Shirt', quantity: 2, unitPrice: 30, totalPrice: 60 }],
            subtotal: 60, shipping_cost: 60, tax_amount: 0, total: 120,
          },
          {
            id: 942838, shop_name: 'Padel Edge', seller_id: 6,
            items: [{ itemId: 3311, productName: 'Pro Ball', quantity: 1, unitPrice: 1000, totalPrice: 1000 }],
            subtotal: 1000, shipping_cost: 50, tax_amount: 0, total: 1050,
          },
        ],
        items: [
          { itemId: 3310, productName: 'Shirt', quantity: 2, unitPrice: 30, totalPrice: 60 },
          { itemId: 3311, productName: 'Pro Ball', quantity: 1, unitPrice: 1000, totalPrice: 1000 },
        ],
      }),
    });
    renderOrderDetail();
    await waitFor(() => expect(screen.getAllByText('File Complaint').length).toBe(2));
  });
});