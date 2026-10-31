import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '../../services/api';
import SubscriptionRequestModal from './SubscriptionRequestModal';

/**
 * P3-10 regression — the card-payment fallback poller must mount after a card
 * payment that the confirm endpoint could not settle immediately.
 *
 * The payment id now comes from state (`paymentInfo`) instead of a ref read during
 * render (P3-06 purity fix), but `handlePaymentComplete` closes the card modal by
 * clearing `paymentInfo`. The poller therefore needs its own payment-id state;
 * gating it on `paymentInfo?.paymentId` silently disables the "Confirming
 * payment..." poller for every card payment (subscription + both registrations).
 */

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('../ui/Toast', () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../permissions/Can', () => ({
  Can: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../legal/LegalConsent', () => ({
  default: ({ onChange }: { onChange: (value: boolean) => void }) => (
    <button type="button" onClick={() => onChange(true)}>accept-terms</button>
  ),
}));

vi.mock('../payment/PaymobPixelCard', () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <button type="button" onClick={() => onComplete()}>card-success</button>
  ),
}));

vi.mock('../payment/PaymentStatusPoller', () => ({
  default: ({ endpoint }: { endpoint: string }) => (
    <div data-testid="payment-poller" data-endpoint={endpoint} />
  ),
}));

vi.mock('../../hooks/usePaymentConfirm', () => ({
  usePaymentConfirm: () => ({
    state: 'idle',
    result: null,
    confirm: vi.fn().mockResolvedValue({ confirmed: false, pending: true, state: 'timeout' }),
    reset: vi.fn(),
  }),
}));

const PLAN = { id: 5, planName: 'Pro Plan', priceMonthly: 500, priceYearly: 5000, isUnlimited: false };
const PAYMENT_ID = 777;

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SubscriptionRequestModal orgId={1} open onClose={vi.fn()} requestType="NEW_SUBSCRIPTION" />
    </QueryClientProvider>,
  );
}

describe('SubscriptionRequestModal — card payment fallback polling', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      const body = url.endsWith('/available-plans') ? { data: [PLAN] } : { planId: null };
      return Promise.resolve({ data: body } as never);
    });
    vi.mocked(api.post).mockResolvedValue({
      data: { payment: { paymentId: PAYMENT_ID, clientSecret: 'cs_test_123' } },
    } as never);
  });

  it('mounts the status poller for the created payment after the card step', async () => {
    renderModal();

    fireEvent.click(await screen.findByText('Pro Plan'));
    fireEvent.click(screen.getByRole('button', { name: 'accept-terms' }));
    fireEvent.click(screen.getByRole('button', { name: /Pay —/ }));

    fireEvent.click(await screen.findByRole('button', { name: 'card-success' }));

    const poller = await screen.findByTestId('payment-poller');
    expect(poller.getAttribute('data-endpoint')).toBe(`/payments/status/${PAYMENT_ID}`);
  });

  it('does not poll before a payment exists', () => {
    renderModal();
    expect(screen.queryByTestId('payment-poller')).toBeNull();
  });
});
