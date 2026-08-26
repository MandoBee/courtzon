import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../utils/currency', () => ({
  formatPrice: (n: number, _c?: string) => `${n.toFixed(2)} ${_c || ''}`.trim(),
}));

vi.mock('../../permissions/Can', () => ({
  Can: ({ children }: any) => children,
}));

import api from '../../services/api';
import PaymentsPage from './PaymentsPage';

const mockGet = vi.mocked(api.get);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/my/payments']}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Real payment_transactions columns only (matches the backend projection). */
function makePayment(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    user_id: 100,
    booking_id: null,
    order_id: null,
    reference_id: null,
    reference_type: 'order',
    payment_method: 'card',
    gateway_provider: 'paymob',
    gateway_reference: 'paymob_ref_001',
    amount: 250.0,
    currency: 'EGP',
    payment_status: 'paid',
    paid_at: '2026-08-26T10:00:00.000Z',
    cancelled_at: null,
    expired_at: null,
    created_at: '2026-08-26T09:00:00.000Z',
    updated_at: '2026-08-26T10:00:00.000Z',
    ...overrides,
  };
}

async function waitForRow(amount = 250, currency = 'EGP') {
  return screen.findByText(`${amount.toFixed(2)} ${currency}`.trim());
}

async function openRow(amount = 250, currency = 'EGP') {
  const amountNode = await waitForRow(amount, currency);
  const row = amountNode.closest('button');
  if (!row) throw new Error('row button not found');
  row.click();
  return row;
}

describe('PaymentsPage — history', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 20 } });
  });

  it('loads payment history from real payment_transactions fields', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [makePayment({ reference_type: 'order', payment_method: 'card', payment_status: 'paid', amount: 250, currency: 'EGP' })],
        total: 1, page: 1, limit: 20,
      },
    });
    wrap(<PaymentsPage />);
    await waitForRow(250, 'EGP');
    expect(screen.getByText('paid')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/payments/transactions', expect.anything());
  });

  it('does NOT render raw gateway response', async () => {
    mockGet.mockResolvedValue({
      data: { data: [makePayment()], total: 1, page: 1, limit: 20 },
    });
    wrap(<PaymentsPage />);
    await waitForRow();
    expect(screen.queryByText(/gateway_response/i)).toBeNull();
    expect(screen.queryByText(/merchant_ref/i)).toBeNull();
  });

  it('does not reference phantom columns', async () => {
    mockGet.mockResolvedValue({
      data: { data: [makePayment()], total: 1, page: 1, limit: 20 },
    });
    wrap(<PaymentsPage />);
    await waitForRow();
    expect(screen.getByText('250.00 EGP')).toBeTruthy();
  });
});

describe('PaymentsPage — payment methods & statuses', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('displays CARD payment correctly', async () => {
    mockGet.mockResolvedValue({ data: { data: [makePayment({ payment_method: 'card', payment_status: 'paid' })], total: 1, page: 1, limit: 20 } });
    wrap(<PaymentsPage />);
    await waitForRow();
    expect(screen.getAllByText('Credit/Debit Card').length).toBeGreaterThan(0);
    expect(screen.getByText('paid')).toBeTruthy();
  });

  it('displays WALLET payment correctly', async () => {
    mockGet.mockResolvedValue({ data: { data: [makePayment({ payment_method: 'wallet', payment_status: 'paid' })], total: 1, page: 1, limit: 20 } });
    wrap(<PaymentsPage />);
    await waitForRow();
    expect(screen.getAllByText('Wallet').length).toBeGreaterThan(0);
  });

  it('displays CASH payment correctly', async () => {
    mockGet.mockResolvedValue({ data: { data: [makePayment({ payment_method: 'cash', payment_status: 'paid' })], total: 1, page: 1, limit: 20 } });
    wrap(<PaymentsPage />);
    await waitForRow();
    expect(screen.getAllByText('Cash').length).toBeGreaterThan(0);
  });

  it('displays pending / processing / failed / refunded statuses', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          makePayment({ id: 1, amount: 101, payment_status: 'pending' }),
          makePayment({ id: 2, amount: 102, payment_status: 'processing' }),
          makePayment({ id: 3, amount: 103, payment_status: 'failed' }),
          makePayment({ id: 4, amount: 104, payment_status: 'refunded' }),
        ],
        total: 4, page: 1, limit: 20,
      },
    });
    wrap(<PaymentsPage />);
    await waitForRow(101, 'EGP');
    expect(screen.getByText('pending')).toBeTruthy();
    expect(screen.getByText('processing')).toBeTruthy();
    expect(screen.getByText('failed')).toBeTruthy();
    expect(screen.getByText('refunded')).toBeTruthy();
  });
});

describe('PaymentsPage — payment types', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('displays SUBSCRIPTION payment correctly', async () => {
    mockGet.mockResolvedValue({ data: { data: [makePayment({ reference_type: 'subscription', reference_id: 77, amount: 200 })], total: 1, page: 1, limit: 20 } });
    wrap(<PaymentsPage />);
    await waitForRow(200, 'EGP');
    expect(screen.getAllByText('Subscription').length).toBeGreaterThan(0);
  });

  it('displays BOOKING payment correctly', async () => {
    mockGet.mockResolvedValue({ data: { data: [makePayment({ reference_type: 'booking', booking_id: 42, amount: 300 })], total: 1, page: 1, limit: 20 } });
    wrap(<PaymentsPage />);
    await waitForRow(300, 'EGP');
    expect(screen.getAllByText('Booking').length).toBeGreaterThan(0);
  });

  it('displays WALLET TOP-UP payment correctly', async () => {
    mockGet.mockResolvedValue({ data: { data: [makePayment({ reference_type: 'wallet_topup', reference_id: 1437, amount: 400 })], total: 1, page: 1, limit: 20 } });
    wrap(<PaymentsPage />);
    await waitForRow(400, 'EGP');
    expect(screen.getAllByText('Wallet Top-up').length).toBeGreaterThan(0);
  });
});

describe('PaymentsPage — receipt/details view', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('shows receipt details when a payment is opened', async () => {
    mockGet.mockResolvedValue({ data: { data: [makePayment()], total: 1, page: 1, limit: 20 } });
    wrap(<PaymentsPage />);
    await openRow();
    expect(await screen.findByText('Payment Details')).toBeTruthy();
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText('paymob_ref_001')).toBeTruthy();
    expect(screen.getAllByText('Credit/Debit Card').length).toBeGreaterThan(0);
  });

  it('shows gateway reference but never the raw response', async () => {
    mockGet.mockResolvedValue({ data: { data: [makePayment()], total: 1, page: 1, limit: 20 } });
    wrap(<PaymentsPage />);
    await openRow();
    await screen.findByText('Payment Details');
    expect(screen.getByText('paymob_ref_001')).toBeTruthy();
    expect(screen.queryByText(/gateway_response/i)).toBeNull();
  });

  it('navigates to the related order route', async () => {
    mockGet.mockResolvedValue({ data: { data: [makePayment({ reference_type: 'order', order_id: 555 })], total: 1, page: 1, limit: 20 } });
    wrap(<PaymentsPage />);
    await openRow();
    const link = await screen.findByText('View Order');
    expect(link.getAttribute('href')).toBe('/marketplace/orders/555');
  });

  it('navigates to the related booking route', async () => {
    mockGet.mockResolvedValue({ data: { data: [makePayment({ reference_type: 'booking', booking_id: 42 })], total: 1, page: 1, limit: 20 } });
    wrap(<PaymentsPage />);
    await openRow();
    const link = await screen.findByText('View Booking');
    expect(link.getAttribute('href')).toBe('/bookings/42');
  });

  it('navigates to the wallet for wallet_topup', async () => {
    mockGet.mockResolvedValue({ data: { data: [makePayment({ reference_type: 'wallet_topup', reference_id: 1437 })], total: 1, page: 1, limit: 20 } });
    wrap(<PaymentsPage />);
    await openRow();
    const link = await screen.findByText('View Wallet');
    expect(link.getAttribute('href')).toBe('/my/wallet');
  });

  it('subscription payment shows reference without order/booking nav', async () => {
    mockGet.mockResolvedValue({ data: { data: [makePayment({ reference_type: 'subscription', reference_id: 77 })], total: 1, page: 1, limit: 20 } });
    wrap(<PaymentsPage />);
    await openRow();
    await screen.findByText('Payment Details');
    expect(screen.getByText('#77')).toBeTruthy();
    expect(screen.queryByText('View Order')).toBeNull();
    expect(screen.queryByText('View Booking')).toBeNull();
  });
});

describe('PaymentsPage — no accounting calculation', () => {
  it('displays the backend amount directly without computing totals', async () => {
    mockGet.mockResolvedValue({ data: { data: [makePayment({ amount: 250, currency: 'EGP' })], total: 1, page: 1, limit: 20 } });
    wrap(<PaymentsPage />);
    await waitForRow(250, 'EGP');
    expect(screen.getByText('250.00 EGP')).toBeTruthy();
    expect(screen.queryByText(/subtotal/i)).toBeNull();
    expect(screen.queryByText(/commission/i)).toBeNull();
    expect(screen.queryByText(/net/i)).toBeNull();
  });
});