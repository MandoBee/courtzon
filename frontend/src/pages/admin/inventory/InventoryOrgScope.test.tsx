import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, screen, waitFor, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';

/**
 * P1 — organisation-scoped Inventory frontend scope.
 *
 * The organisation workspace uses the ROUTE organisation, fetches the
 * capabilities granted by roles bound to that organisation, and never falls back
 * to the global permission union (which would leak Organisation A capabilities
 * into Organisation B).
 */

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../../../services/api', () => ({ default: apiMock }));

const {
  InventoryOrgProvider,
  InventoryOrgGate,
  InventoryOrgSelector,
  useInventoryCan,
  useInventoryOrg,
} = await import('./InventoryOrgContext');

const respond = (permissions: string[]) =>
  apiMock.get.mockResolvedValue({ data: { data: { permissions } } });

const wrapperFor = (orgId: string) =>
  ({ children }: { children: ReactNode }) => (
    <InventoryOrgProvider orgId={orgId}>{children}</InventoryOrgProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.get.mockReset();
});

afterEach(() => cleanup());

describe('organisation workspace Inventory scope', () => {
  it('uses the route organisation and never fetches the admin organisation list', async () => {
    respond(['inventory.stock.view']);

    const { result } = renderHook(() => useInventoryOrg(), { wrapper: wrapperFor('5') });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(apiMock.get).toHaveBeenCalledWith('/org/5/inventory/access');
    expect(apiMock.get).not.toHaveBeenCalledWith('/admin/inventory/organisations');
    expect(result.current.orgId).toBe('5');
    expect(result.current.mode).toBe('org');
    expect(result.current.apiBase).toBe('/org/5/inventory');
    expect(result.current.transfersBase).toBe('/org/5/inventory/stock-transfers');
    expect(result.current.scopeParams).toEqual({});
    expect(result.current.requiresExplicitSelection).toBe(false);
    expect(result.current.needsSelection).toBe(false);
  });

  it('exposes the organisation-scoped capability list to page/button gates', async () => {
    respond(['inventory.stock.view', 'inventory.stock.adjust']);

    const { result } = renderHook(
      () => ({ org: useInventoryOrg(), canAny: useInventoryCan() }),
      { wrapper: wrapperFor('5') },
    );

    await waitFor(() => expect(result.current.org.loading).toBe(false));

    expect(result.current.canAny('inventory.stock.view')).toBe(true);
    expect(result.current.canAny('inventory.stock.adjust')).toBe(true);
    expect(result.current.canAny('inventory.warehouses.manage')).toBe(false);
    expect(result.current.canAny('inventory.stock.adjust', 'inventory.stock.manage')).toBe(true);
  });

  it('does not leak Organisation A capabilities into Organisation B', async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/org/5/inventory/access') {
        return { data: { data: { permissions: ['inventory.stock.adjust'] } } };
      }
      return { data: { data: { permissions: ['inventory.stock.view'] } } };
    });

    const orgA = renderHook(
      () => ({ org: useInventoryOrg(), canAny: useInventoryCan() }),
      { wrapper: wrapperFor('5') },
    );
    const orgB = renderHook(
      () => ({ org: useInventoryOrg(), canAny: useInventoryCan() }),
      { wrapper: wrapperFor('6') },
    );

    await waitFor(() => expect(orgA.result.current.org.loading).toBe(false));
    await waitFor(() => expect(orgB.result.current.org.loading).toBe(false));

    expect(orgA.result.current.canAny('inventory.stock.adjust')).toBe(true);
    expect(orgB.result.current.canAny('inventory.stock.adjust')).toBe(false);
    expect(orgB.result.current.canAny('inventory.stock.view')).toBe(true);
  });

  it('reports no Inventory access when the role has no capabilities', async () => {
    respond([]);

    const { result } = renderHook(() => useInventoryOrg(), { wrapper: wrapperFor('5') });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasNoAccess).toBe(true);
  });

  it('surfaces a backend denial as an error instead of granting access', async () => {
    apiMock.get.mockRejectedValueOnce({ response: { status: 403 } });

    const { result } = renderHook(() => useInventoryOrg(), { wrapper: wrapperFor('6') });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.hasNoAccess).toBe(false);
    expect(result.current.canAny?.('inventory.stock.view')).toBe(false);
  });

  it('never calls the API for an invalid route organisation', async () => {
    const { result } = renderHook(() => useInventoryOrg(), { wrapper: wrapperFor('abc') });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiMock.get).not.toHaveBeenCalled();
    expect(result.current.orgId).toBe('');
    expect(result.current.hasNoAccess).toBe(true);

    render(
      <InventoryOrgGate org={result.current}>
        <div>inventory content</div>
      </InventoryOrgGate>,
    );
    expect(screen.getByText(/invalid organisation/i)).toBeTruthy();
    expect(screen.queryByText('inventory content')).toBeNull();
  });
});

describe('organisation workspace surfaces', () => {
  it('never renders the organisation selector in organisation mode', async () => {
    respond(['inventory.stock.view']);

    const { result } = renderHook(() => useInventoryOrg(), { wrapper: wrapperFor('5') });
    await waitFor(() => expect(result.current.loading).toBe(false));

    render(<InventoryOrgSelector org={result.current} />);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('renders an explicit no-Inventory-access notice', async () => {
    respond([]);

    const { result } = renderHook(() => useInventoryOrg(), { wrapper: wrapperFor('5') });
    await waitFor(() => expect(result.current.loading).toBe(false));

    render(
      <InventoryOrgGate org={result.current}>
        <div>inventory content</div>
      </InventoryOrgGate>,
    );

    expect(screen.getByText(/no inventory access/i)).toBeTruthy();
    expect(screen.queryByText('inventory content')).toBeNull();
  });
});
