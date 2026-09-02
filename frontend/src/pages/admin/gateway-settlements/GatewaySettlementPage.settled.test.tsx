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
  useCan: () => ({ can: (permission: string) => mockPermissions.has('*') || mockPermissions.has(permission), permissions: [...mockPermissions] }),
}));

vi.mock('../../../permissions/Can', () => ({
  Can: ({ children }: any) => <>{children}</>,
}));

let mockPermissions = new Set<string>();
const grant = (...keys: string[]) => { mockPermissions = new Set(keys); };
const REVERSE_KEY = 'financial.gateway-settlement.reverse';
const SETTLE_ORGS_KEY = 'financial.gateway-settlement.settle-orgs';
const VIEW_KEY = 'financial.gateway-settlement.view';

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
  if (url === '/admin/gateway-settlements/12') {
    return Promise.resolve({
      data: {
        settlement: reversed,
        transactions: [
          {
            id: 102,
            payment_transaction_id: 900012,
            payment_method_name: 'Card',
            gross_amount: 500,
            gateway_fee_pct: 2.5,
            gateway_fee_fixed: 1,
            gateway_fee_amount: 13.5,
            net_amount: 486.5,
            currency: 'EGP',
            order_id: 900012,
            booking_id: null,
            gateway_reference: 'pm-rev-2',
            paid_at: '2026-08-29T09:00:00.000Z',
          },
        ],
      },
    });
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
    // Default: full finance access (like super_admin / accountant / finance-manager / master-admin).
    grant(VIEW_KEY, REVERSE_KEY, SETTLE_ORGS_KEY);
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

  it('renders BOTH actions for a completed settlement (Reverse + Settle Organisations)', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Settled Gateway Payments'));
    await screen.findByText('GWS-2026-09-01-042');

    const completedRow = screen.getByText('GWS-2026-09-01-042').closest('tr')!;
    const rowButtons = Array.from(completedRow.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(rowButtons).toContain('Reverse');

    expect(screen.getByRole('button', { name: 'Settle Organisations' })).toBeTruthy();
  });

  it('hides Reverse Settlement when the reverse permission is missing', async () => {
    grant(VIEW_KEY, SETTLE_ORGS_KEY); // no REVERSE_KEY
    renderPage();
    fireEvent.click(screen.getByText('Settled Gateway Payments'));
    await screen.findByText('GWS-2026-09-01-042');

    const completedRow = screen.getByText('GWS-2026-09-01-042').closest('tr')!;
    const reverseBtns = Array.from(completedRow.querySelectorAll('button')).filter((b) => b.textContent?.includes('Reverse'));
    expect(reverseBtns.length).toBe(0);
    // Actions cell falls back to the dash.
    expect(completedRow.textContent).toContain('—');

    // Settle Organisations is independently visible (different permission).
    expect(screen.getByRole('button', { name: 'Settle Organisations' })).toBeTruthy();
  });

  it('hides Settle Organisations when the settle-orgs permission is missing', async () => {
    grant(VIEW_KEY, REVERSE_KEY); // no SETTLE_ORGS_KEY
    renderPage();
    fireEvent.click(screen.getByText('Settled Gateway Payments'));
    await screen.findByText('GWS-2026-09-01-042');

    expect(screen.queryByRole('button', { name: 'Settle Organisations' })).toBeNull();

    const completedRow = screen.getByText('GWS-2026-09-01-042').closest('tr')!;
    const reverseBtns = Array.from(completedRow.querySelectorAll('button')).filter((b) => b.textContent?.includes('Reverse'));
    expect(reverseBtns.length).toBe(1);
  });

  it('hides BOTH actions when only the view permission is present', async () => {
    grant(VIEW_KEY);
    renderPage();
    fireEvent.click(screen.getByText('Settled Gateway Payments'));
    await screen.findByText('GWS-2026-09-01-042');

    expect(screen.queryByRole('button', { name: 'Settle Organisations' })).toBeNull();
    const completedRow = screen.getByText('GWS-2026-09-01-042').closest('tr')!;
    const reverseBtns = Array.from(completedRow.querySelectorAll('button')).filter((b) => b.textContent?.includes('Reverse'));
    expect(reverseBtns.length).toBe(0);
    expect(completedRow.textContent).toContain('—');
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

  it('does NOT render Reverse Settlement for a reversed settlement (and still shows reversal metadata)', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Settled Gateway Payments'));
    await screen.findByText('GWS-2026-08-29-017');

    const reversedRow = screen.getByText('GWS-2026-08-29-017').closest('tr')!;
    const reverseBtns = Array.from(reversedRow.querySelectorAll('button')).filter((b) => b.textContent?.includes('Reverse'));
    expect(reverseBtns.length).toBe(0);
    // Reversal identity is surfaced on the row.
    expect(reversedRow.textContent).toContain('Omar Admin');

    // Its expandable detail still shows the reversal reference.
    fireEvent.click(screen.getAllByText('▸')[1]);
    expect(await screen.findByText('REV-12-K3XA')).toBeTruthy();
  });

  it('prevents duplicate reverse submissions while the request is in flight', async () => {
    // The reverse endpoint stays pending until we resolve it manually.
    let resolveReverse: (v: unknown) => void = () => {};
    (api.post as any).mockImplementation((url: string) => {
      if (url === '/admin/gateway-settlements/11/reverse') {
        return new Promise((res) => { resolveReverse = res; });
      }
      return Promise.resolve({ data: {} });
    });

    renderPage();
    fireEvent.click(screen.getByText('Settled Gateway Payments'));
    await screen.findByText('GWS-2026-09-01-042');

    const row = screen.getByText('GWS-2026-09-01-042').closest('tr')!;
    const reverseBtn = Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.includes('Reverse'));
    fireEvent.click(reverseBtn!);
    await waitFor(() => expect(document.body.textContent).toContain('Reverse Gateway Settlement GWS-2026-09-01-042'));

    fireEvent.change(screen.getByPlaceholderText('Reversal reason (required)'), { target: { value: 'Paid in error' } });
    const confirm = screen.getByText('Reverse Settlement') as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false));

    fireEvent.click(confirm);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));

    // While pending the confirm button is disabled → a second click cannot fire.
    const pendingConfirm = screen.getByText('Reversing...') as HTMLButtonElement;
    expect(pendingConfirm.disabled).toBe(true);
    fireEvent.click(pendingConfirm);
    expect(api.post).toHaveBeenCalledTimes(1);

    resolveReverse({ data: { settlement: { ...completed, settlement_status: 'reversed', reversal_reference: 'REV-11-ABC' }, transactions: [] } });
    await waitFor(() => expect(screen.queryByText('Reversing...')).toBeNull());
  });

  it('navigates to the canonical takeover flow via "Settle Organisations"', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Settled Gateway Payments'));
    await screen.findByText('Settle Organisations');

    fireEvent.click(screen.getByText('Settle Organisations'));
    expect(await screen.findByText('ORG-SETTLE-PAGE')).toBeTruthy();
  });
});