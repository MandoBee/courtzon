import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GatewaySettlementPage from './GatewaySettlementPage';
import api from '../../../services/api';
import { ToastProvider } from '../../../components/ui/Toast';

vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { data: [] } })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../../../hooks/useCan', () => ({
  useCan: () => ({ can: () => true }),
}));

vi.mock('../../../permissions/Can', () => ({
  Can: ({ children }: any) => <>{children}</>,
}));

const validCard = {
  paymentTransactionId: 1,
  referenceType: 'order',
  referenceId: 900001,
  orderId: 900001,
  bookingId: null,
  gatewayReference: 'pm-valid-1',
  gatewayProvider: 'paymob',
  paymentMethod: 'card',
  paidAt: '2026-08-20T13:15:47.000Z',
  currency: 'EGP',
  grossAmount: 250,
  feeConfigStatus: 'ok',
  feeConfigError: null,
  gatewayFeePct: 2.5,
  gatewayFeeFixed: 1,
  gatewayFeeAmount: 7.25,
  netAmount: 242.75,
};

const missingOnline = {
  paymentTransactionId: 2,
  referenceType: 'order',
  referenceId: 900002,
  orderId: 900002,
  bookingId: null,
  gatewayReference: 'pm-missing-1',
  gatewayProvider: 'paymob',
  paymentMethod: 'online',
  paidAt: '2026-08-21T13:15:47.000Z',
  currency: 'EGP',
  grossAmount: 150,
  feeConfigStatus: 'missing',
  feeConfigError: "Payment method fee configuration is missing for 'online'",
  gatewayFeePct: null,
  gatewayFeeFixed: null,
  gatewayFeeAmount: null,
  netAmount: null,
};

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <GatewaySettlementPage />
      </ToastProvider>
    </QueryClientProvider>
  );
};

describe('GatewaySettlementPage — misconfigured fee configuration', () => {
  beforeEach(() => {
    (api.get as any).mockClear();
    (api.post as any).mockClear();
    (api.get as any).mockResolvedValue({ data: { data: [validCard, missingOnline] } });
  });

  it('renders valid fee math (E£250 × 2.5% + E£1 → E£7.25, net E£242.75) for the configured card row', async () => {
    renderPage();
    const row = await screen.findByText(/order #900001/i);
    expect(row).toBeTruthy();
    expect(screen.getByText('2.5%')).toBeTruthy();
    expect(screen.getByText(/7\.25/)).toBeTruthy();
    expect(screen.getByText(/242\.75/)).toBeTruthy();
  });

  it('flags the misconfigured transaction as "Fee configuration missing"', async () => {
    renderPage();
    await screen.findByText(/Fee configuration missing/i);
    expect(screen.getByText(/cannot compute gateway fees/i)).toBeTruthy();
  });

  it('does NOT allow selecting a misconfigured transaction, but valid rows are selectable', async () => {
    renderPage();
    const badge = await screen.findByText(/Fee configuration missing/i);
    const checkboxRow = badge.closest('tr')!;
    const checkboxes = Array.from(checkboxRow.querySelectorAll('input[type="checkbox"]'));
    expect(checkboxes.length).toBe(1);
    expect((checkboxes[0] as HTMLInputElement).disabled).toBe(true);

    const validRow = (await screen.findByText(/order #900001/i)).closest('tr')!;
    const validCheckbox = validRow.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(validCheckbox.disabled).toBe(false);
    fireEvent.click(validCheckbox);
    await waitFor(() => expect(screen.getByText('Confirm Gateway Settlement (1)')).toBeTruthy());
  });

  it('"select all" only selects settleable transactions', async () => {
    renderPage();
    await screen.findByText(/order #900001/i);
    const headerCheckbox = document.querySelector('thead input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(headerCheckbox);
    await waitFor(() => expect(screen.getByText('Confirm Gateway Settlement (1)')).toBeTruthy());
  });

  it('shows the misconfigured warning banner when at least one row is missing fee configuration', async () => {
    renderPage();
    await screen.findByText(/1 payment transaction\(s\) are missing gateway fee configuration/i);
  });

  it('confirming posts ONLY the selected valid transaction ids', async () => {
    renderPage();
    const validRow = (await screen.findByText(/order #900001/i)).closest('tr')!;
    fireEvent.click(validRow.querySelector('input[type="checkbox"]') as HTMLInputElement);
    await waitFor(() => expect(screen.getByText('Confirm Gateway Settlement (1)')).toBeTruthy());
    fireEvent.click(screen.getByText('Confirm Gateway Settlement (1)'));
    fireEvent.click(await screen.findByText('Confirm & Record'));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/admin/gateway-settlements', {
        paymentTransactionIds: [1],
        notes: undefined,
      });
    });
  });
});