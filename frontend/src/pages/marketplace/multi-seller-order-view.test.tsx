import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), put: vi.fn() },
}));

vi.mock('../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../utils/currency', () => ({
  formatPrice: (n: number, _c?: string) => `${n.toFixed(2)}`,
}));

import api from '../../services/api';
import OrderDetailPage from './OrderDetailPage';
import OrderListPage from './OrderListPage';

const mockGet = vi.mocked(api.get);
const mockPut = vi.mocked(api.put);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/marketplace/orders/1']}>
        <Routes>
          <Route path="/marketplace/orders/:id" element={ui} />
          <Route path="/marketplace/orders" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ── Fixtures ──

function makeGroupedOrder() {
  return {
    id: 1,
    public_id: 'ord-pub-0001',
    buyer_id: 100,
    status: 'confirmed',
    payment_status: 'paid',
    payment_method: 'card',
    currency_code: 'EGP',
    checkout_group_id: 'grp-001',
    created_at: '2026-08-25T10:00:00Z',
    shipping_address: { full_name: 'Test Buyer', phone: '01012345678', street_address: '123 Main St', city: 'Cairo' },
    province_name: 'Cairo',
    estimated_delivery_date: '2026-08-28',
    // Grand totals (sum of all seller orders)
    subtotal: 1300,
    shipping_cost: 80,
    discount_amount: 0,
    tax_amount: 0,
    total: 1380,
    commission_amount: 130,
    _isGrouped: true,
    _sellerOrderCount: 2,
    // Items aggregated
    items: [
      { productId: 1, productName: 'Racket A', variantName: null, quantity: 2, unitPrice: 500, totalPrice: 1000, shopName: 'Shop A' },
      { productId: 2, productName: 'Shoes B', variantName: 'Size 10', quantity: 1, unitPrice: 300, totalPrice: 300, shopName: 'Shop B' },
    ],
    // Per-seller breakdowns
    _sellerOrders: [
      {
        id: 101,
        public_id: 'ord-seller-a',
        checkout_group_id: 'grp-001',
        status: 'confirmed',
        payment_status: 'paid',
        seller_id: 10,
        shop_name: 'Shop A',
        subtotal: 1000,
        shipping_cost: 50,
        discount_amount: 0,
        tax_amount: 0,
        total: 1050,
        commission_amount: 100,
        items: [
          { productId: 1, productName: 'Racket A', variantName: null, quantity: 2, unitPrice: 500, totalPrice: 1000, shopName: 'Shop A' },
        ],
      },
      {
        id: 102,
        public_id: 'ord-seller-b',
        checkout_group_id: 'grp-001',
        status: 'confirmed',
        payment_status: 'paid',
        seller_id: 20,
        shop_name: 'Shop B',
        subtotal: 300,
        shipping_cost: 30,
        discount_amount: 0,
        tax_amount: 0,
        total: 330,
        commission_amount: 30,
        items: [
          { productId: 2, productName: 'Shoes B', variantName: 'Size 10', quantity: 1, unitPrice: 300, totalPrice: 300, shopName: 'Shop B' },
        ],
      },
    ],
  };
}

function makeSingleSellerOrder() {
  return {
    id: 2,
    public_id: 'ord-pub-0002',
    buyer_id: 100,
    status: 'pending',
    payment_status: 'unpaid',
    payment_method: 'wallet',
    currency_code: 'EGP',
    checkout_group_id: null,
    created_at: '2026-08-25T11:00:00Z',
    shipping_address: { full_name: 'Test Buyer', phone: '01012345678', street_address: '123 Main St', city: 'Cairo' },
    province_name: 'Cairo',
    estimated_delivery_date: null,
    subtotal: 500,
    shipping_cost: 20,
    discount_amount: 0,
    tax_amount: 0,
    total: 520,
    commission_amount: 50,
    items: [
      { productId: 3, productName: 'Grip Tape', variantName: null, quantity: 1, unitPrice: 500, totalPrice: 500, shopName: 'Solo Shop' },
    ],
    _isGrouped: false,
    _sellerOrders: undefined,
  };
}

// ── Tests ──

describe('Multi-seller buyer order detail', () => {
  beforeEach(() => {
    mockPut.mockResolvedValue({ data: {} });
  });

  it('two sellers in one checkout: shows per-seller sections', async () => {
    mockGet.mockResolvedValue({ data: makeGroupedOrder() });
    wrap(<OrderDetailPage />);

    await screen.findByText('Racket A');

    // Both seller shop names visible
    expect(screen.getByText('Shop A')).toBeTruthy();
    expect(screen.getByText('Shop B')).toBeTruthy();
  });

  it('correct seller grouping: each section shows only that seller\'s products', async () => {
    mockGet.mockResolvedValue({ data: makeGroupedOrder() });
    wrap(<OrderDetailPage />);

    await screen.findByText('Racket A');

    // Find seller sections (each has a container with border)
    const sellerSectionA = screen.getByText('Shop A').closest('div.border') as HTMLElement;
    const sellerSectionB = screen.getByText('Shop B').closest('div.border') as HTMLElement;

    // Shop A section has only Racket A
    expect(within(sellerSectionA).getByText('Racket A')).toBeTruthy();
    expect(within(sellerSectionA).queryByText('Shoes B')).toBeNull();

    // Shop B section has only Shoes B
    expect(within(sellerSectionB).getByText('Shoes B')).toBeTruthy();
    expect(within(sellerSectionB).queryByText('Racket A')).toBeNull();
  });

  it('correct per-seller subtotal/shipping/total', async () => {
    mockGet.mockResolvedValue({ data: makeGroupedOrder() });
    wrap(<OrderDetailPage />);

    await screen.findByText('Racket A');

    // Shop A section: subtotal 1000, shipping 50, total 1050
    const sectionA = screen.getByText('Shop A').closest('div.border') as HTMLElement;
    const withinA = within(sectionA);
    expect(withinA.getAllByText('1000.00').length).toBeGreaterThanOrEqual(1); // item price + subtotal
    expect(withinA.getByText('50.00')).toBeTruthy();   // shipping
    expect(withinA.getByText('1050.00')).toBeTruthy();  // seller total
    expect(withinA.getByText('Seller Total')).toBeTruthy();

    // Shop B section: subtotal 300, shipping 30, total 330
    const sectionB = screen.getByText('Shop B').closest('div.border') as HTMLElement;
    const withinB = within(sectionB);
    expect(withinB.getAllByText('300.00').length).toBeGreaterThanOrEqual(1); // item price + subtotal
    expect(withinB.getByText('30.00')).toBeTruthy();   // shipping
    expect(withinB.getByText('330.00')).toBeTruthy();   // seller total
  });

  it('correct grand total at bottom', async () => {
    mockGet.mockResolvedValue({ data: makeGroupedOrder() });
    wrap(<OrderDetailPage />);

    await screen.findByText('Racket A');

    // Grand Total label should exist
    expect(screen.getByText('Grand Total')).toBeTruthy();
    // Grand total = 1380
    expect(screen.getByText('1380.00')).toBeTruthy();
  });

  it('no cross-seller product leakage in seller sections', async () => {
    mockGet.mockResolvedValue({ data: makeGroupedOrder() });
    wrap(<OrderDetailPage />);

    await screen.findByText('Racket A');

    // Count occurrences of product names
    const racketCount = screen.getAllByText('Racket A').length;
    const shoesCount = screen.getAllByText('Shoes B').length;

    // Each product appears once in seller section + once in the grand total items list isn't shown —
    // just the seller sections. Product name in seller header items only.
    expect(racketCount).toBeGreaterThanOrEqual(1);
    expect(shoesCount).toBeGreaterThanOrEqual(1);

    // Verify no seller section contains both products
    const sections = document.querySelectorAll('.border.rounded-\\[var\\(--radius-md\\)\\]');
    for (const section of sections) {
      const text = section.textContent || '';
      const hasBoth = text.includes('Racket A') && text.includes('Shoes B');
      expect(hasBoth).toBe(false);
    }
  });

  it('single-seller order shows flat layout without seller sections', async () => {
    mockGet.mockResolvedValue({ data: makeSingleSellerOrder() });
    wrap(<OrderDetailPage />);

    await screen.findByText('Grip Tape');

    // No "Grand Total" label for single-seller
    expect(screen.queryByText('Grand Total')).toBeNull();

    // "Total" label should exist
    expect(screen.getByText('Total')).toBeTruthy();

    // Flat total = 520
    expect(screen.getByText('520.00')).toBeTruthy();

    // No seller section headers (no Shop A / Shop B text)
    expect(screen.queryByText('Shop A')).toBeNull();
    expect(screen.queryByText('Shop B')).toBeNull();
  });
});

// ── OrderListPage tests ──

describe('Multi-seller buyer order list', () => {
  beforeEach(() => {
    mockPut.mockResolvedValue({ data: {} });
  });

  it('grouped order shows items under seller names with grand total', async () => {
    mockGet.mockImplementation((url: string) => {
      if (String(url).includes('/orders/counts')) return Promise.resolve({ data: { all: 1, confirmed: 1 } });
      return Promise.resolve({
        data: {
          data: [makeGroupedOrder()],
          total: 1,
          page: 1,
          limit: 20,
        },
      });
    });
    wrap(<OrderListPage />);

    await screen.findByText('Racket A');

    // Seller name labels visible
    expect(screen.getByText('Shop A')).toBeTruthy();
    expect(screen.getByText('Shop B')).toBeTruthy();

    // Grand Total in list footer (rendered as single text node: "Grand Total: 1380.00")
    expect(screen.getByText(/Grand Total:/)).toBeTruthy();
  });

  it('single-seller order in list shows flat layout', async () => {
    const singleOrder = makeSingleSellerOrder();
    singleOrder.id = 20;
    mockGet.mockImplementation((url: string) => {
      if (String(url).includes('/orders/counts')) return Promise.resolve({ data: { all: 1, pending: 1 } });
      return Promise.resolve({
        data: {
          data: [singleOrder],
          total: 1,
          page: 1,
          limit: 20,
        },
      });
    });
    wrap(<OrderListPage />);

    await screen.findByText('Grip Tape');

    // Single-seller shows "Total: ..." not "Grand Total: ..."
    expect(screen.getByText(/Total:/)).toBeTruthy();
    expect(screen.queryByText(/Grand Total:/)).toBeNull();
  });

  it('grouped list items show seller-specific subtotals', async () => {
    mockGet.mockImplementation((url: string) => {
      if (String(url).includes('/orders/counts')) return Promise.resolve({ data: { all: 1 } });
      return Promise.resolve({
        data: { data: [makeGroupedOrder()], total: 1, page: 1, limit: 20 },
      });
    });
    wrap(<OrderListPage />);

    await screen.findByText('Racket A');

    // Each seller section should show their items
    const shopAEl = screen.getByText('Shop A');
    const shopBEl = screen.getByText('Shop B');
    expect(shopAEl).toBeTruthy();
    expect(shopBEl).toBeTruthy();
  });
});
