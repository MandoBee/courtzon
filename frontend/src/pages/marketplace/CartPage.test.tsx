import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = vi.fn();
const mockPost = vi.fn();
const confirmMock = vi.fn();
const navigateMock = vi.fn();
let confirmState = 'idle';

vi.mock('../../services/api', () => ({
  default: { get: (...a: any[]) => mockGet(...a), post: (...a: any[]) => mockPost(...a) },
}));
vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('../../components/ui/Modal', () => ({
  Modal: ({ open, children }: any) => (open ? <div>{children}</div> : null),
}));
vi.mock('../../hooks/usePaymentConfirm', () => ({
  usePaymentConfirm: () => ({ state: confirmState, confirm: confirmMock, reset: vi.fn() }),
}));
vi.mock('../../components/payment/PaymobPixelCard', () => ({
  default: () => <div data-testid="paymob-iframe">PAYMOB_IFRAME</div>,
}));
vi.mock('../../components/payment/PaymentStatusPoller', () => ({
  default: () => <div data-testid="status-poller">STATUS_POLLER</div>,
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  Link: ({ to, children }: any) => <a href={to}>{children}</a>,
}));
vi.mock('../../i18n', () => ({
  useTranslation: () => ({
    t: (k: string) => ({
      'cart.payment_method': 'Payment Method',
      'cart.place_order': 'Place Order',
      'cart.loading': 'Loading...',
      'cart.shipping_address': 'Shipping Address',
      'cart.contact_seller_note': 'Contact seller',
      'common.processing': 'Processing...',
      'common.cancel': 'Cancel',
      'cart.checkout_failed': 'Checkout failed',
      'cart.no_addresses': 'No saved addresses',
    }[k] ?? k),
    locale: 'en', setLocale: vi.fn(), getLocale: vi.fn(), loading: false,
  }),
}));

import CartPage from './CartPage';

function baseGet(url: string) {
  if (url === '/marketplace/cart') {
    return Promise.resolve({ data: { items: [{ id: 1, product_id: 10, name: 'Item', quantity: 1, unit_price: 100, price: 100, currency_code: 'EGP', seller_id: 1 }], subtotal: 100 } });
  }
  if (url === '/marketplace/cart/seller-info') return Promise.resolve({ data: { data: [] } });
  if (url === '/marketplace/addresses') {
    return Promise.resolve({ data: { data: [{ id: 1, full_name: 'Test User', street_address: '1 Street', city: 'Cairo' }] } });
  }
  return Promise.resolve({ data: {} });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CartPage />
    </QueryClientProvider>,
  );
}

async function selectAddressAndMethod(method: 'card' | 'cash') {
  await waitFor(() => expect(screen.getByRole('radio', { name: /Test User/ })).toBeTruthy());
  fireEvent.click(screen.getByRole('radio', { name: /Test User/ }));
  fireEvent.click(screen.getByRole('button', { name: method === 'card' ? /Card/ : /Cash/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  confirmState = 'idle';
  mockGet.mockImplementation(baseGet);
  mockPost.mockImplementation((url: string) => {
    if (url === '/marketplace/cart/check-shipping') return Promise.resolve({ data: { sellers: [], total_shipping: 0 } });
    return Promise.resolve({ data: {} });
  });
});

describe('PHASE 2 — Marketplace CartPage local mock card UX', () => {
  it('1. mock clientSecret → PaymobPixelCard NOT rendered; usePaymentConfirm.confirm(paymentId) IS called', async () => {
    mockPost.mockImplementation((url: string) => {
      if (url === '/marketplace/cart/check-shipping') return Promise.resolve({ data: { sellers: [], total_shipping: 0 } });
      if (url === '/marketplace/orders') return Promise.resolve({ data: { id: 1, paymentId: 123, clientSecret: 'mock_csk_test_1', paymentUrl: 'https://mock/pay' } });
      return Promise.resolve({ data: {} });
    });
    confirmMock.mockResolvedValue({ confirmed: true, state: 'confirmed', data: {} });

    renderPage();
    await selectAddressAndMethod('card');
    await waitFor(() => expect(screen.getByRole('button', { name: /Place Order/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Place Order/ }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith(123));
    expect(screen.queryByTestId('paymob-iframe')).toBeNull();
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/marketplace/orders'));
  });

  it('2. real clientSecret → PaymobPixelCard IS rendered; confirm is NOT auto-called', async () => {
    mockPost.mockImplementation((url: string) => {
      if (url === '/marketplace/cart/check-shipping') return Promise.resolve({ data: { sellers: [], total_shipping: 0 } });
      if (url === '/marketplace/orders') return Promise.resolve({ data: { id: 1, paymentId: 123, clientSecret: 'csk_live_secret_abc', paymentUrl: 'https://accept.paymob.com/...' } });
      return Promise.resolve({ data: {} });
    });

    renderPage();
    await selectAddressAndMethod('card');
    await waitFor(() => expect(screen.getByRole('button', { name: /Place Order/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Place Order/ }));

    await waitFor(() => expect(screen.getByTestId('paymob-iframe')).toBeTruthy());
    expect(confirmMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('3. mock confirmation failure → UI does NOT falsely report success', async () => {
    mockPost.mockImplementation((url: string) => {
      if (url === '/marketplace/cart/check-shipping') return Promise.resolve({ data: { sellers: [], total_shipping: 0 } });
      if (url === '/marketplace/orders') return Promise.resolve({ data: { id: 1, paymentId: 123, clientSecret: 'mock_csk_test_1' } });
      return Promise.resolve({ data: {} });
    });
    confirmMock.mockResolvedValue({ confirmed: false, state: 'failed' });

    renderPage();
    await selectAddressAndMethod('card');
    await waitFor(() => expect(screen.getByRole('button', { name: /Place Order/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Place Order/ }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith(123));
    expect(navigateMock).not.toHaveBeenCalled(); // no false success
    // Falls back to the authoritative status poller.
    await waitFor(() => expect(screen.getByTestId('status-poller')).toBeTruthy());
  });

  it('4. cash flow unchanged — order placed, no card modal, no confirm', async () => {
    mockPost.mockImplementation((url: string) => {
      if (url === '/marketplace/cart/check-shipping') return Promise.resolve({ data: { sellers: [], total_shipping: 0 } });
      if (url === '/marketplace/orders') return Promise.resolve({ data: { id: 1 } });
      return Promise.resolve({ data: {} });
    });

    renderPage();
    await selectAddressAndMethod('cash');
    await waitFor(() => expect(screen.getByRole('button', { name: /Place Order/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Place Order/ }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/marketplace/orders'));
    expect(mockPost).toHaveBeenCalledWith('/marketplace/orders', expect.objectContaining({ paymentMethod: 'cash' }));
    expect(screen.queryByTestId('paymob-iframe')).toBeNull();
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('5. wallet is NOT rendered as a payment option in Marketplace checkout', async () => {
    mockPost.mockImplementation((url: string) => {
      if (url === '/marketplace/cart/check-shipping') return Promise.resolve({ data: { sellers: [], total_shipping: 0 } });
      return Promise.resolve({ data: {} });
    });

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /Card/ })).toBeTruthy());
    expect(screen.getByRole('button', { name: /Cash/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Wallet/i })).toBeNull();
  });
});