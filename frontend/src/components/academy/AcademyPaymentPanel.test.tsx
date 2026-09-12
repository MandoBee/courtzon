import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AcademyPaymentPanel from './AcademyPaymentPanel';
import { useAuthStore } from '../../store/auth.store';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('../../services/api', () => ({
  default: {
    get: (...a: any[]) => mockGet(...a),
    post: (...a: any[]) => mockPost(...a),
  },
}));
vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('../../components/payment/WalletPaymentOption', () => ({
  default: ({ selected, onClick, disabled }: any) => (
    <button type="button" onClick={onClick} disabled={disabled} data-selected={selected}>Wallet</button>
  ),
}));
vi.mock('../../components/payment/PaymentStatusPoller', () => ({
  default: () => null,
}));
vi.mock('../../components/payment/PaymobPixelCard', () => ({
  default: () => null,
}));
vi.mock('../../hooks/usePaymentConfirm', () => ({
  usePaymentConfirm: () => ({ confirm: vi.fn(), state: 'idle', result: null, reset: vi.fn() }),
}));
vi.mock('../../i18n', () => {
  const map: Record<string, string> = {
    'player.academy.pay_now': 'Pay Now',
    'player.academy.payment_required': 'Payment Required',
    'player.academy.payment_success': 'Payment Confirmed',
    'player.academy.payment_processing': 'Payment Processing',
    'player.academy.payment_unavailable': 'Payment Unavailable',
    'player.academy.payment_failed': 'Payment Failed',
    'player.academy.no_payment_required': 'No Payment Required',
    'player.academy.card': 'Card',
    'player.academy.card_note': 'Debit / Credit Card',
    'player.academy.try_again': 'Try Again',
  };
  return {
    useTranslation: () => ({ t: (k: string) => map[k] ?? k, locale: 'en', setLocale: vi.fn(), getLocale: vi.fn(), loading: false }),
  };
});

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AcademyPaymentPanel enrollmentId={11} />
    </QueryClientProvider>,
  );
}

function state(overrides: Record<string, any> = {}) {
  return {
    enrollmentId: 11, programId: 1, programName: 'Tennis Pro', groupId: 2, groupName: 'G8 Group',
    enrollmentStatus: 'confirmed', paymentState: 'unpaid', amount: 200, currency: 'EGP',
    paid: false, paymentConfirmedAt: null, availableMethods: ['wallet', 'card'], ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: { id: 200, permissions: ['*'] } as any });
  mockGet.mockImplementation((url: string) => {
    if (url === '/my/academy/enrollments/11/payment') return Promise.resolve({ data: state() });
    if (url === '/wallets/me') return Promise.resolve({ data: { id: 1, balance: 500, currencyCode: 'EGP' } });
    return Promise.resolve({ data: {} });
  });
});

describe('G8.4 — AcademyPaymentPanel', () => {
  it('FREE program → "No Payment Required", no Pay Now', async () => {
    mockGet.mockImplementation((url: string) =>
      url === '/my/academy/enrollments/11/payment'
        ? Promise.resolve({ data: state({ paymentState: 'free', amount: null, availableMethods: [] }) })
        : Promise.resolve({ data: {} }),
    );
    renderPanel();
    await waitFor(() => expect(screen.getByText('No Payment Required')).toBeTruthy());
    expect(screen.queryByText('Pay Now')).toBeNull();
  });

  it('paid → "Payment Confirmed", no Pay Now', async () => {
    mockGet.mockImplementation((url: string) =>
      url === '/my/academy/enrollments/11/payment'
        ? Promise.resolve({ data: state({ paymentState: 'paid', paid: true }) })
        : Promise.resolve({ data: {} }),
    );
    renderPanel();
    await waitFor(() => expect(screen.getByText('Payment Confirmed')).toBeTruthy());
    expect(screen.queryByText('Pay Now')).toBeNull();
  });

  it('processing → "Payment Processing"', async () => {
    mockGet.mockImplementation((url: string) =>
      url === '/my/academy/enrollments/11/payment'
        ? Promise.resolve({ data: state({ paymentState: 'processing' }) })
        : Promise.resolve({ data: {} }),
    );
    renderPanel();
    await waitFor(() => expect(screen.getByText('Payment Processing')).toBeTruthy());
    expect(screen.queryByText('Pay Now')).toBeNull();
  });

  it('unavailable → "Payment Unavailable" + Try Again', async () => {
    mockGet.mockImplementation((url: string) =>
      url === '/my/academy/enrollments/11/payment'
        ? Promise.resolve({ data: state({ paymentState: 'unavailable', amount: null }) })
        : Promise.resolve({ data: {} }),
    );
    renderPanel();
    await waitFor(() => expect(screen.getByText('Payment Unavailable')).toBeTruthy());
    expect(screen.getByText('Try Again')).toBeTruthy();
  });

  it('unpaid → amount + Payment Required + Wallet/Card methods + Pay Now', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('Payment Required')).toBeTruthy());
    expect(screen.getByText('Pay Now')).toBeTruthy();
    expect(screen.getByText('Card')).toBeTruthy();
    expect(screen.getByText('Wallet')).toBeTruthy();
  });

  it('wallet Pay Now → POST /pay → refresh shows Payment Confirmed', async () => {
    mockPost.mockImplementation((url: string) => {
      if (url === '/my/academy/enrollments/11/pay') return Promise.resolve({ data: { status: 'paid', paymentId: 5001, paymentStatus: 'paid' } });
      return Promise.resolve({ data: {} });
    });
    let paid = false;
    mockGet.mockImplementation((url: string) => {
      if (url === '/my/academy/enrollments/11/payment') return Promise.resolve({ data: paid ? state({ paymentState: 'paid', paid: true }) : state() });
      if (url === '/wallets/me') return Promise.resolve({ data: { id: 1, balance: 500, currencyCode: 'EGP' } });
      return Promise.resolve({ data: {} });
    });
    renderPanel();
    await waitFor(() => expect(screen.getByText('Pay Now')).toBeTruthy());
    fireEvent.click(screen.getByText('Pay Now'));
    paid = true;
    await waitFor(() => expect(screen.getByText('Payment Confirmed')).toBeTruthy());
    expect(mockPost).toHaveBeenCalledWith('/my/academy/enrollments/11/pay', expect.objectContaining({ paymentMethod: 'wallet' }));
  });

  it('backend error on pay → toast error (backend remains authoritative)', async () => {
    mockPost.mockImplementation((url: string) => {
      if (url === '/my/academy/enrollments/11/pay') return Promise.reject(new Error('Payment is temporarily unavailable'));
      return Promise.resolve({ data: {} });
    });
    renderPanel();
    await waitFor(() => expect(screen.getByText('Pay Now')).toBeTruthy());
    fireEvent.click(screen.getByText('Pay Now'));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
  });
});