import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../../utils/currency', () => ({
  formatPrice: (n: number, _c?: string) => `${n.toFixed(2)}`,
}));

vi.mock('../../permissions/Can', () => ({
  Can: ({ children }: any) => children,
}));

vi.mock('../../components/subscription/SubscriptionRequestModal', () => ({
  default: () => null,
}));

import api from '../../services/api';
import OrgSubscriptionPage from './OrgSubscriptionPage';

const mockGet = vi.mocked(api.get);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/org/100']}>
        <Routes>
          <Route path="/org/:orgId" element={ui} />
          <Route path="/org/:orgId/finance" element={<div>finance page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function makeSubscription(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    planId: 5,
    planName: 'Elite Club',
    priceMonthly: 500,
    priceYearly: 5000,
    isUnlimited: false,
    isInternal: false,
    billingCycle: 'monthly',
    durationMonths: null,
    features: [],
    usage: {},
    startDate: '2026-08-22',
    endDate: '2026-09-22',
    status: 'active',
    autoRenew: false,
    paymentMethod: 'card',
    paymentStatus: 'paid',
    paymentAmount: 500,
    upcomingRenewal: null,
    pendingRequest: null,
    ...overrides,
  };
}

function makePeriod(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    plan_id: 5,
    billing_cycle: 'monthly',
    subscription_status: 'expired',
    start_date: '2026-07-22',
    end_date: '2026-08-21',
    created_at: '2026-07-22T00:00:00Z',
    plan_name: 'Elite Club',
    is_unlimited: 0,
    is_internal: 0,
    price: 500,
    ...overrides,
  };
}

function makeRequest(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    request_type: 'RENEWAL',
    requested_plan_name: 'Elite Club',
    requested_billing_cycle: 'monthly',
    requested_price: 500,
    chosen_payment_method: 'card',
    status: 'approved',
    created_at: '2026-08-22T00:00:00Z',
    ...overrides,
  };
}

describe('OrgSubscriptionPage — billing transparency', () => {
  beforeEach(() => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/subscription/periods')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/subscription/requests')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/transactions')) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: makeSubscription() });
    });
  });

  it('shows current plan name, price and dates', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/subscription/periods')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/subscription/requests')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/transactions')) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: makeSubscription() });
    });
    wrap(<OrgSubscriptionPage />);
    expect(await screen.findByText('Elite Club')).toBeTruthy();
    expect(screen.getByText('500.00/mo')).toBeTruthy();
    expect(screen.getByText(/Started:/)).toBeTruthy();
    expect(screen.getByText(/Expires:/)).toBeTruthy();
  });

  it('shows yearly price when billing cycle is yearly', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/subscription/periods')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/subscription/requests')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/transactions')) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: makeSubscription({ billingCycle: 'yearly' }) });
    });
    wrap(<OrgSubscriptionPage />);
    await screen.findByText('Elite Club');
    expect(screen.getByText('5000.00/yr')).toBeTruthy();
    expect(screen.getByText('Yearly')).toBeTruthy();
  });

  it('shows payment method and status from backend', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/subscription/periods')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/subscription/requests')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/transactions')) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: makeSubscription({ paymentMethod: 'card', paymentStatus: 'paid' }) });
    });
    wrap(<OrgSubscriptionPage />);
    await screen.findByText('Elite Club');
    expect(screen.getByText('Credit Card')).toBeTruthy();
    expect(screen.getByText('paid')).toBeTruthy();
  });

  it('shows CASH payment method when backend provides it', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/subscription/periods')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/subscription/requests')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/transactions')) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: makeSubscription({ paymentMethod: 'cash', paymentStatus: 'approved' }) });
    });
    wrap(<OrgSubscriptionPage />);
    await screen.findByText('Elite Club');
    expect(screen.getByText('Cash')).toBeTruthy();
  });

  it('marks internal plans clearly', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/subscription/periods')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/subscription/requests')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/transactions')) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: makeSubscription({ isInternal: true }) });
    });
    wrap(<OrgSubscriptionPage />);
    await screen.findByText('Elite Club');
    expect(screen.getByText('Internal')).toBeTruthy();
  });

  it('shows free when plan is unlimited', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/subscription/periods')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/subscription/requests')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/transactions')) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: makeSubscription({ isUnlimited: true }) });
    });
    wrap(<OrgSubscriptionPage />);
    await screen.findByText('Elite Club');
    expect(screen.getByText('Free')).toBeTruthy();
  });

  it('shows historical subscription amounts and billing cycles', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/subscription/periods')) return Promise.resolve({
        data: { data: [
          makePeriod({ id: 2, subscription_status: 'expired', price: 250, billing_cycle: 'monthly', plan_name: 'Standard Club' }),
          makePeriod({ id: 3, subscription_status: 'cancelled', price: 250, billing_cycle: 'yearly', plan_name: 'Standard Club' }),
        ] },
      });
      if (url.includes('/subscription/requests')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/transactions')) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: makeSubscription() });
    });
    wrap(<OrgSubscriptionPage />);
    expect(await screen.findByText('500.00/mo')).toBeTruthy();
    expect(screen.getAllByText('250.00').length).toBe(2);
    expect(screen.getAllByText('Standard Club').length).toBeGreaterThan(0);
    expect(screen.getByText('expired')).toBeTruthy();
    expect(screen.getByText('cancelled')).toBeTruthy();
  });

  it('keeps expired subscriptions visible in history', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/subscription/periods')) return Promise.resolve({
        data: { data: [makePeriod({ subscription_status: 'expired' })] },
      });
      if (url.includes('/subscription/requests')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/transactions')) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: makeSubscription() });
    });
    wrap(<OrgSubscriptionPage />);
    expect(await screen.findByText('500.00/mo')).toBeTruthy();
    expect(screen.getByText('expired')).toBeTruthy();
  });

  it('shows request history with amount, billing cycle and payment method', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/subscription/periods')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/subscription/requests')) return Promise.resolve({
        data: { data: [makeRequest({ chosen_payment_method: 'card', requested_billing_cycle: 'yearly' })] },
      });
      if (url.includes('/transactions')) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: makeSubscription() });
    });
    wrap(<OrgSubscriptionPage />);
    expect(await screen.findByText('500.00/mo')).toBeTruthy();
    expect(screen.getByText('Renewal')).toBeTruthy();
    expect(screen.getAllByText('Yearly').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Credit Card').length).toBeGreaterThan(0);
    expect(screen.getByText('approved')).toBeTruthy();
  });

  it('shows a pending renewal as separate from the current subscription', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/subscription/periods')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/subscription/requests')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/transactions')) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: makeSubscription({ upcomingRenewal: { id: 2, planName: 'Elite Club', startDate: '2026-09-23', endDate: '2026-10-23' } }) });
    });
    wrap(<OrgSubscriptionPage />);
    expect(await screen.findByText('Renewal Scheduled')).toBeTruthy();
    // The upcoming renewal period is shown, but the current card's status is 'active'
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText(/23\/09\/2026/)).toBeTruthy();
  });
});