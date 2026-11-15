import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Transfer cancellation UI (R1/R2 review notes).
 *
 * Verifies the confirmation flow, response interpretation (restored vs legacy
 * non-restored), pending-only actions, empty and error states.
 */

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const showToastMock = vi.hoisted(() => vi.fn());

vi.mock('../../../services/api', () => ({ default: apiMock }));
vi.mock('../../../components/ui/Toast', () => ({ useToast: () => ({ showToast: showToastMock }) }));
vi.mock('../../../permissions/Can', () => ({ Can: ({ children }: any) => children }));

const { StockTransferTab } = await import('./InventoryPage');

const pendingTransfer = {
  id: 7,
  status: 'pending',
  variant_id: 9,
  variant_name: 'Shirt',
  sku: 'S',
  quantity: 3,
  from_warehouse_id: 1,
  to_warehouse_id: 2,
  from_warehouse_name: 'Main',
  to_warehouse_name: 'Overflow',
  created_at: '2026-01-01T00:00:00Z',
};

function mockApi(transfers: any[], cancelResult: any = { success: true, restored: true, restoredQuantity: 3 }) {
  apiMock.get.mockImplementation((url: string) => {
    if (url === '/admin/inventory/warehouses') {
      return Promise.resolve({ data: { data: [{ id: 1, name: 'Main' }, { id: 2, name: 'Overflow' }] } });
    }
    if (url === '/admin/stock-transfers') {
      return Promise.resolve({ data: { data: transfers } });
    }
    return Promise.resolve({ data: { data: [] } });
  });
  apiMock.post.mockResolvedValue({ data: cancelResult });
}

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <StockTransferTab orgId="6" />
    </QueryClientProvider>,
  );
}

async function openConfirmation(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('Shirt (S)');
  await user.click(screen.getByRole('button', { name: 'Cancel Transfer' }));
  expect(screen.getByText('Cancel Stock Transfer')).toBeTruthy();
  expect(screen.getByText(/Deducted stock is restored only when the original deduction record exists/i)).toBeTruthy();
}

async function confirmCancellation(user: ReturnType<typeof userEvent.setup>) {
  const buttons = screen.getAllByRole('button', { name: 'Cancel Transfer' });
  await user.click(buttons[buttons.length - 1]);
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.get.mockReset();
  apiMock.post.mockReset();
  showToastMock.mockReset();
});

afterEach(() => cleanup());

describe('inventory transfer cancellation UI', () => {
  it('lists only pending transfers with a cancel action', async () => {
    mockApi([
      pendingTransfer,
      { ...pendingTransfer, id: 8, status: 'completed', variant_name: 'Completed Shirt' },
    ]);
    renderTab();

    expect(await screen.findByText('Shirt (S)')).toBeTruthy();
    expect(screen.queryByText(/Completed Shirt/)).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Cancel Transfer' })).toHaveLength(1);
    expect(apiMock.get).toHaveBeenCalledWith('/admin/stock-transfers', {
      params: { orgId: '6', status: 'pending' },
    });
  });

  it('requires confirmation and reports stock restoration when restored=true', async () => {
    mockApi([pendingTransfer]);
    const user = userEvent.setup();
    renderTab();

    await openConfirmation(user);
    await confirmCancellation(user);

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/admin/stock-transfers/7/cancel', {}, { params: { orgId: '6' } }),
    );
    expect(await screen.findByText(/Restored 3 unit\(s\) to stock/i)).toBeTruthy();
    expect(screen.queryByText(/NOT restored automatically/i)).toBeNull();
    expect(showToastMock).toHaveBeenCalledWith('Stock transfer cancelled', 'success');
  });

  it('legacy transfer never claims restoration and shows a manual-reconciliation warning', async () => {
    mockApi([pendingTransfer], { success: true, restored: false, restoredQuantity: 0 });
    const user = userEvent.setup();
    renderTab();

    await openConfirmation(user);
    await confirmCancellation(user);

    expect(await screen.findByText(/NOT restored automatically/i)).toBeTruthy();
    expect(screen.getByText(/Manual reconciliation may be required/i)).toBeTruthy();
    expect(screen.queryByText(/Restored \d+ unit\(s\)/i)).toBeNull();
  });

  it('shows a genuine empty state when there are no pending transfers', async () => {
    mockApi([]);
    renderTab();

    expect(await screen.findByText('No pending transfers')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel Transfer' })).toBeNull();
  });

  it('shows an error with retry instead of an empty state when loading fails', async () => {
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/admin/inventory/warehouses') {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.reject({ response: { status: 500 } });
    });
    renderTab();

    expect(await screen.findByText(/couldn't load inventory data/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
    expect(screen.queryByText('No pending transfers')).toBeNull();
  });
});
