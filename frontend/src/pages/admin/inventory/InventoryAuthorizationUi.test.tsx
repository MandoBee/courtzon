import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * P1 remediation — organisation-scoped UI authorization.
 *
 * Covers:
 *   • a stale tab cannot keep rendering after the organisation/capabilities
 *     change (M2);
 *   • a stock-only user cannot see stock/logs/adjust content even if the tab
 *     state is stale;
 *   • a read-only purchase-order user can open the detail view but cannot see
 *     create/status actions (L1).
 */

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../../../services/api', () => ({ default: apiMock }));
vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const { InventoryOrgProvider } = await import('./InventoryOrgContext');
const { default: InventoryPage } = await import('./InventoryPage');
const { default: PurchaseOrdersPage } = await import('./PurchaseOrdersPage');

const ORG_A_PERMISSIONS = [
  'inventory.stock.view',
  'inventory.stock.adjust',
  'inventory.transfers.view',
  'inventory.transfers.create',
  'inventory.logs.view',
];

const ORG_B_PERMISSIONS = ['inventory.stock.view'];

function queryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderInOrg(orgId: string, children: ReactNode, client = queryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <InventoryOrgProvider orgId={orgId}>{children}</InventoryOrgProvider>
    </QueryClientProvider>,
  );
}

function mockInventoryApi(orgPermissions: Record<string, string[]>) {
  apiMock.get.mockImplementation(async (url: string) => {
    const access = url.match(/^\/org\/(\d+)\/inventory\/access$/);
    if (access) {
      return { data: { data: { permissions: orgPermissions[access[1]] ?? [] } } };
    }
    if (
      url.includes('/inventory/stock/logs') ||
      url.includes('/inventory/stock') ||
      url.includes('/inventory/variants/search')
    ) {
      return { data: { data: [], total: 0 } };
    }
    if (url.includes('/inventory/warehouses') || url.includes('/inventory/suppliers')) {
      return { data: { data: [], total: 0 } };
    }
    return { data: { data: [], total: 0 } };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.get.mockReset();
  apiMock.post.mockReset();
  apiMock.put.mockReset();
  apiMock.delete.mockReset();
});

afterEach(() => cleanup());

describe('organisation Inventory tab authorization (M2)', () => {
  it('resets a stale adjust tab when switching to an organisation without adjust permission', async () => {
    mockInventoryApi({ '5': ORG_A_PERMISSIONS, '6': ORG_B_PERMISSIONS });
    const client = queryClient();
    const user = userEvent.setup();

    const { rerender } = renderInOrg('5', <InventoryPage />, client);

    const adjustTab = await screen.findByRole('button', { name: 'Adjust Stock' });
    await user.click(adjustTab);
    expect(await screen.findByText('Adjust Stock Quantity')).toBeTruthy();

    rerender(
      <QueryClientProvider client={client}>
        <InventoryOrgProvider orgId="6">
          <InventoryPage />
        </InventoryOrgProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.queryByText('Adjust Stock Quantity')).toBeNull());
    expect(await screen.findByText('Current Stock')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Adjust Stock' })).toBeNull();
  });

  it('resets a stale logs tab when switching to an organisation without logs permission', async () => {
    mockInventoryApi({ '5': ORG_A_PERMISSIONS, '6': ORG_B_PERMISSIONS });
    const client = queryClient();
    const user = userEvent.setup();

    const { rerender } = renderInOrg('5', <InventoryPage />, client);

    const logsTab = await screen.findByRole('button', { name: 'Inventory Logs' });
    await user.click(logsTab);
    expect(await screen.findByText('Movement Type')).toBeTruthy();

    rerender(
      <QueryClientProvider client={client}>
        <InventoryOrgProvider orgId="6">
          <InventoryPage />
        </InventoryOrgProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.queryByText('Movement Type')).toBeNull());
    expect(await screen.findByText('Current Stock')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Inventory Logs' })).toBeNull();
  });

  it('does not render stock content for a user without inventory.stock.view', async () => {
    mockInventoryApi({ '5': ['inventory.warehouses.view'] });

    renderInOrg('5', <InventoryPage />);

    // The page title is always visible; the stock table must not be.
    expect(await screen.findByText('Stock Levels')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Current Stock')).toBeNull());
    expect(screen.queryByText('Adjust Stock Quantity')).toBeNull();
    expect(screen.queryByText('Movement Type')).toBeNull();
  });
});

describe('purchase-order read-only detail access (L1)', () => {
  it('shows View for a view-only user and hides create/status actions', async () => {
    const user = userEvent.setup();
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/org/5/inventory/access') {
        return { data: { data: { permissions: ['inventory.purchase-orders.view'] } } };
      }
      if (url === '/org/5/inventory/purchase-orders/44') {
        return {
          data: {
            data: {
              id: 44,
              supplier_name: 'Acme',
              warehouse_name: 'Main',
              status: 'draft',
              total_cost: 10,
              notes: '',
              created_at: '2026-01-01T00:00:00Z',
              items: [],
            },
          },
        };
      }
      if (url.includes('/org/5/inventory/purchase-orders')) {
        return {
          data: {
            data: [{
              id: 44,
              supplier_name: 'Acme',
              warehouse_name: 'Main',
              status: 'draft',
              total_cost: 10,
              created_at: '2026-01-01T00:00:00Z',
              items: [],
            }],
            total: 1,
          },
        };
      }
      return { data: { data: [], total: 0 } };
    });

    renderInOrg('5', <PurchaseOrdersPage />);

    expect(await screen.findByText('PO-00044')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New Purchase Order' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByRole('heading', { name: 'PO-00044' })).toBeTruthy();
    expect(apiMock.get).toHaveBeenCalledWith(
      '/org/5/inventory/purchase-orders/44',
      expect.objectContaining({ params: {} }),
    );
  });
});
