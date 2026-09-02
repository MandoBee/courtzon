import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GatewaySettlementPage from './GatewaySettlementPage';
import api from '../../../services/api';
import { ToastProvider } from '../../../components/ui/Toast';

vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../../../hooks/useCan', () => ({
  useCan: () => ({ can: () => true }),
}));

vi.mock('../../../permissions/Can', () => ({
  Can: ({ children }: any) => <>{children}</>,
}));

const completed = {
  id: 11,
  batch_code: 'GWS-2026-09-01-042',
  settlement_status: 'completed',
  gross_amount: 850,
  gateway_fee_amount: 22.25,
  net_amount: 827.75,
  currency: 'EGP',
  transaction_count: 1,
  settled_by: 5,
  settled_at: '2026-09-01T10:00:00.000Z',
  settled_by_name: 'Sara Finance',
  reversed_at: null,
  reversed_by: null,
  reversed_by_name: null,
  reversal_reason: null,
  reversal_reference: null,
  notes: null,
  created_at: '2026-09-01T10:00:00.000Z',
};

const reversed = {
  id: 12,
  batch_code: 'GWS-2026-08-29-017',
  settlement_status: 'reversed',
  gross_amount: 500,
  gateway_fee_amount: 13.5,
  net_amount: 486.5,
  currency: 'EGP',
  transaction_count: 1,
  settled_by: 5,
  settled_at: '2026-08-29T10:00:00.000Z',
  settled_by_name: 'Sara Finance',
  reversed_at: '2026-08-30T09:00:00.000Z',
  reversed_by: 6,
  reversed_by_name: 'Omar Admin',
  reversal_reason: 'Paid in error — refund issued',
  reversal_reference: 'REV-12-K3XA',
  notes: null,
  created_at: '2026-08-29T10:00:00.000Z',
};

const detail11 = {
  settlement: completed,
  transactions: [
    {
      id: 101,
      payment_transaction_id: 900011,
      payment_method_name: 'Card',
      gross_amount: 850,
      gateway_fee_pct: 2.5,
      gateway_fee_fixed: 1,
      gateway_fee_amount: 22.25,
      net_amount: 827.75,
      currency: 'EGP',
      order_id: 900011,
      booking_id: null,
      gateway_reference: 'pm-rev-1',
      paid_at: '2026-09-01T09:00:00.000Z',
    },
  ],
};

vi.mocked(api.get).mockImplementation((url: string, config?: any) => {
  if (url === '/admin/gateway-settlements/eligible') {
    return Promise.resolve({ data: { data: [] } });
  }
  if (url === '/admin/gateway-settlements/11') {
    return Promise.resolve({ data: detail11 });
  }
  if (url === '/admin/gateway-settlements') {
    const status = config?.params?.status;
    const filtered = status ? [completed, reversed].filter((s) => s.settlement_status === status) : [completed, reversed];
    return Promise.resolve({ data: { data: filtered, total: filtered.length } });
  }
  return Promise.resolve({ data: { data: [] } });
});

vi.mocked(api.post).mockImplementation((url: string) => {
  if (url === '/admin/gateway-settlements/11/reverse') {
    return Promise.resolve({ data: { settlement: { ...completed, settlement_status: 'reversed', reversal_reference: 'REV-11-ABC' }, transactions: detail11.transactions } });
  }
  return Promise.resolve({ data: {} });
});

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <MemoryRouter initialEntries={['/admin/gateway-settlements']}>
      <Routes>
        <Route path="/admin/gateway-settlements" element={
          <QueryClientProvider client={qc}>
            <ToastProvider>
              <GatewaySettlementPage />
            </ToastProvider>
          </QueryClientProvider>
        } />
        <Route path="/admin/unified-settlements/new" element={<div>ORG-SETTLE-PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('GatewaySettlementPage — settled gateway payments tab', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockClear();
    vi.mocked(api.post).mockClear();
    (api.get as any).mockImplementation(vi.mocked(api.get).getMockImplementation()!);
    (api.post as any).mockImplementation(vi.mocked(api.post).getMockImplementation()!);
  });

  it('shows the pending tab by default and switches to the settled list', async () => {
    renderPage();
    expect(screen.getByText('Receive Gateway Settlement')).toBeTruthy();

    fireEvent.click(screen.getByText('Settled Gateway Payments'));

    expect(await screen.findByText('GWS-2026-09-01-042')).toBeTruthy();
    expect(screen.getByText('GWS-2026-08-29-017')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Completed / Received' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reversed / Cancelled' })).toBeTruthy();
    expect(screen.getByText(/827\.75/)).toBeTruthy();
  });

  it('filters the settled list by status and surfaces reversal metadata', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Settled Gateway Payments'));
    await screen.findByText('GWS-2026-09-01-042');

    fireEvent.click(screen.getByRole('button', { name: 'Completed / Received' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/admin/gateway-settlements', { params: { page: 1, limit: 20, status: 'completed' } }));

    fireEvent.click(screen.getByRole('button', { name: 'Reversed / Cancelled' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/admin/gateway-settlements', { params: { page: 1, limit: 20, status: 'reversed' } }));

    const reversedRow = screen.getByText('GWS-2026-08-29-017').closest('tr')!;
    // Reversed rows have NO reverse action.
    const reverseBtns = Array.from(reversedRow.querySelectorAll('button')).filter((b) => b.textContent?.includes('Reverse'));
    expect(reverseBtns.length).toBe(0);

    // Expand the reversed row → its immutable reversal metadata is surfaced.
    fireEvent.click(screen.getAllByText('▸')[0]);
    expect(await screen.findByText(/Reversal reason:/)).toBeTruthy();
    expect(screen.getByText('Paid in error — refund issued')).toBeTruthy();
  });

  it('expands a batch to show its transactions', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Settled Gateway Payments'));
    await screen.findByText('GWS-2026-09-01-042');

    fireEvent.click(screen.getAllByText('▸')[0]);
    expect(await screen.findByText('order #900011')).toBeTruthy();
    expect(screen.getByText('900011')).toBeTruthy();
  });

  it('requires a reason before reversing and POSTs the reversal', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Settled Gateway Payments'));
    await screen.findByText('GWS-2026-09-01-042');

    const row = screen.getByText('GWS-2026-09-01-042').closest('tr')!;
    const reverseBtn = Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.includes('Reverse'));
    fireEvent.click(reverseBtn!);
    await waitFor(() => expect(document.body.textContent).toContain('Reverse Gateway Settlement GWS-2026-09-01-042'));

    // Reason required — confirm stays disabled.
    const confirm = screen.getByText('Reverse Settlement') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('Reversal reason (required)'), { target: { value: 'Paid in error' } });
    await waitFor(() => expect(confirm.disabled).toBe(false));

    fireEvent.click(confirm);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/admin/gateway-settlements/11/reverse', { reason: 'Paid in error' });
    });
  });

  it('navigates to the canonical takeover flow via "Settle Organisations"', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Settled Gateway Payments'));
    await screen.findByText('Settle Organisations');

    fireEvent.click(screen.getByText('Settle Organisations'));
    expect(await screen.findByText('ORG-SETTLE-PAGE')).toBeTruthy();
  });
});