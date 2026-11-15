import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, renderHook, screen, waitFor, cleanup } from '@testing-library/react';

/**
 * Phase B.1 — Inventory organisation scope alignment.
 *
 * The selector is driven exclusively by `GET /admin/inventory/organisations`,
 * which applies the backend's canonical membership predicates. The frontend
 * must never infer scope from client storage or from `/my/scopes` role clones.
 */

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../../../services/api', () => ({ default: apiMock }));

const {
  useInventoryOrg,
  InventoryOrgGate,
  InventoryOrgSelector,
  inventoryErrorMessage,
  InventoryErrorState,
} = await import('./InventoryOrgContext');

const org = (id: number, name: string) => ({ id, name });

const respond = (data: any[], requiresExplicitSelection = false) =>
  apiMock.get.mockResolvedValue({ data: { data, requiresExplicitSelection } });

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.get.mockReset();
});

afterEach(() => cleanup());

describe('inventory organisation scope source', () => {
  it('auto-selects the single permitted organisation', async () => {
    respond([org(5, 'Org Five')]);

    const { result } = renderHook(() => useInventoryOrg());

    await waitFor(() => expect(result.current.orgId).toBe('5'));
    expect(apiMock.get).toHaveBeenCalledWith('/admin/inventory/organisations');
    expect(result.current.needsSelection).toBe(false);
    expect(result.current.hasNoAccess).toBe(false);
  });

  it('includes every server-authorised membership (owner / role scope / user_organisations)', async () => {
    respond([org(5, 'Owned Org'), org(6, 'Scoped Org'), org(7, 'Member Org')], true);

    const { result } = renderHook(() => useInventoryOrg());

    await waitFor(() => expect(result.current.orgs).toHaveLength(3));
    expect(result.current.orgs.map((o) => o.id)).toEqual([5, 6, 7]);
    expect(result.current.orgId).toBe('');
    expect(result.current.needsSelection).toBe(true);
  });

  it('exposes only the server list (role-clone organisations are never added client-side)', async () => {
    // The backend excludes role-clone-only organisations, so it returns only org 5.
    respond([org(5, 'Org Five')]);

    const { result } = renderHook(() => useInventoryOrg());

    await waitFor(() => expect(result.current.orgs).toHaveLength(1));
    expect(result.current.orgs.map((o) => o.id)).toEqual([5]);
  });

  it('requires an explicit choice for multi-organisation actors', async () => {
    respond([org(5, 'Org Five'), org(6, 'Org Six')], true);

    const { result } = renderHook(() => useInventoryOrg());

    await waitFor(() => expect(result.current.orgs).toHaveLength(2));
    expect(result.current.orgId).toBe('');
    expect(result.current.needsSelection).toBe(true);

    act(() => result.current.setOrgId('6'));
    expect(result.current.orgId).toBe('6');
    expect(result.current.needsSelection).toBe(false);
  });

  it('requires a platform administrator to choose even with a single organisation', async () => {
    respond([org(9, 'Platform Org')], true);

    const { result } = renderHook(() => useInventoryOrg());

    await waitFor(() => expect(result.current.orgs).toHaveLength(1));
    expect(result.current.requiresExplicitSelection).toBe(true);
    expect(result.current.orgId).toBe('');
    expect(result.current.needsSelection).toBe(true);
  });

  it('reports no organisation access instead of guessing one', async () => {
    respond([], false);

    const { result } = renderHook(() => useInventoryOrg());

    await waitFor(() => expect(result.current.hasNoAccess).toBe(true));
    expect(result.current.orgId).toBe('');
    expect(result.current.needsSelection).toBe(false);
  });

  it('surfaces a load failure as an error (not as "no access") and can retry', async () => {
    apiMock.get.mockRejectedValueOnce({ response: { status: 500 } });

    const { result } = renderHook(() => useInventoryOrg());

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.hasNoAccess).toBe(false);
    expect(result.current.needsSelection).toBe(false);

    respond([org(5, 'Org Five')]);
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.error).toBeNull());
    await waitFor(() => expect(result.current.orgId).toBe('5'));
    expect(apiMock.get).toHaveBeenCalledTimes(2);
  });
});

describe('inventory organisation selector', () => {
  it('hides the selector for an auto-selected single organisation', () => {
    render(
      <InventoryOrgSelector
        org={{
          orgId: '5',
          setOrgId: vi.fn(),
          orgs: [org(5, 'Org Five')],
          loading: false,
          error: null,
          retry: vi.fn(),
          requiresExplicitSelection: false,
          needsSelection: false,
          hasNoAccess: false,
        }}
      />,
    );

    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('renders the selector for platform admins with one organisation', () => {
    render(
      <InventoryOrgSelector
        org={{
          orgId: '',
          setOrgId: vi.fn(),
          orgs: [org(9, 'Platform Org')],
          loading: false,
          error: null,
          retry: vi.fn(),
          requiresExplicitSelection: true,
          needsSelection: true,
          hasNoAccess: false,
        }}
      />,
    );

    expect(screen.getByRole('combobox')).toBeTruthy();
  });
});

describe('inventory error states', () => {
  it('maps failures to safe, user-facing messages', () => {
    expect(inventoryErrorMessage({ response: { status: 401 } })).toMatch(/session has expired/i);
    expect(inventoryErrorMessage({ response: { status: 403 } })).toMatch(/do not have access/i);
    expect(inventoryErrorMessage({ response: { status: 500 } })).toMatch(/server could not complete/i);
    expect(inventoryErrorMessage(new Error('boom'))).toMatch(/check your connection/i);
  });

  it('renders an error state (not an empty dataset) with a retry action', () => {
    const retry = vi.fn();

    render(<InventoryErrorState error={{ response: { status: 403 } }} onRetry={retry} />);

    expect(screen.getByText(/couldn't load inventory data/i)).toBeTruthy();
    expect(screen.getByText(/do not have access/i)).toBeTruthy();
    expect(screen.queryByText(/no data/i)).toBeNull();

    screen.getByRole('button', { name: /retry/i }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('gates content until an organisation is selected', () => {
    const state = {
      orgId: '',
      setOrgId: vi.fn(),
      orgs: [org(5, 'Org Five'), org(6, 'Org Six')],
      loading: false,
      error: null,
      retry: vi.fn(),
      requiresExplicitSelection: true,
      needsSelection: true,
      hasNoAccess: false,
    };

    render(
      <InventoryOrgGate org={state}>
        <div>inventory content</div>
      </InventoryOrgGate>,
    );

    expect(screen.getByText(/select an organisation/i)).toBeTruthy();
    expect(screen.queryByText('inventory content')).toBeNull();
  });

  it('renders children once an organisation is resolved', () => {
    const state = {
      orgId: '5',
      setOrgId: vi.fn(),
      orgs: [org(5, 'Org Five')],
      loading: false,
      error: null,
      retry: vi.fn(),
      requiresExplicitSelection: false,
      needsSelection: false,
      hasNoAccess: false,
    };

    render(
      <InventoryOrgGate org={state}>
        <div>inventory content</div>
      </InventoryOrgGate>,
    );

    expect(screen.getByText('inventory content')).toBeTruthy();
  });

  it('renders a load error instead of a false "no access" message', () => {
    const state = {
      orgId: '',
      setOrgId: vi.fn(),
      orgs: [],
      loading: false,
      error: { response: { status: 500 } },
      retry: vi.fn(),
      requiresExplicitSelection: false,
      needsSelection: false,
      hasNoAccess: false,
    };

    render(
      <InventoryOrgGate org={state}>
        <div>inventory content</div>
      </InventoryOrgGate>,
    );

    expect(screen.getByText(/couldn't load your organisations/i)).toBeTruthy();
    expect(screen.queryByText(/no organisation access/i)).toBeNull();
  });
});
