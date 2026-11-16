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
    // A 403 without a recognised backend message must fall back to a generic
    // permission denial — never to an organisation-scope claim (A2).
    expect(inventoryErrorMessage({ response: { status: 403 } })).toMatch(/don't have permission/i);
    expect(inventoryErrorMessage({ response: { status: 500 } })).toMatch(/server could not complete/i);
    expect(inventoryErrorMessage(new Error('boom'))).toMatch(/check your connection/i);
  });

  it('renders an error state (not an empty dataset) with a retry action', () => {
    const retry = vi.fn();

    render(
      <InventoryErrorState
        error={{
          response: {
            status: 403,
            data: { error: 'FORBIDDEN', message: 'You do not have access to this organisation' },
          },
        }}
        onRetry={retry}
      />,
    );

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

// A2 (Inventory UAT 2026-11-16) — a 403 used to be collapsed into
// "You do not have access to this organisation.", which mislabelled capability
// denials and platform-admin denials as an organisation-scope problem. The three
// documented backend messages are now mapped exactly; everything else fails
// closed to a generic permission denial and is never echoed.
describe('inventory 403 message allowlist (A2)', () => {
  const forbidden = (message?: unknown) => ({
    response: {
      status: 403,
      ...(message === undefined ? {} : { data: { error: 'FORBIDDEN', message } }),
    },
  });

  it('1. organisation scope denial → scope message', () => {
    expect(inventoryErrorMessage(forbidden('You do not have access to this organisation'))).toBe(
      'You do not have access to this organisation.',
    );
  });

  it('2. missing Inventory capability → permission message (not the organisation one)', () => {
    const message = inventoryErrorMessage(
      forbidden('Insufficient Inventory permissions for this organisation'),
    );

    expect(message).toBe('Your role does not include this Inventory permission.');
    expect(message).not.toMatch(/do not have access/i);
  });

  it('3. platform administrator requirement → platform message', () => {
    expect(inventoryErrorMessage(forbidden('Platform administrator access required'))).toBe(
      'Inventory administration requires platform administrator access.',
    );
  });

  it('4a. unknown 403 message → generic fallback and the raw text is never exposed', () => {
    const message = inventoryErrorMessage(forbidden('SELLER_PRIVATE_DEBUG_TOKEN'));

    expect(message).toBe("You don't have permission to perform this action.");
    expect(message).not.toMatch(/SELLER_PRIVATE_DEBUG_TOKEN/);
  });

  it('4b. 403 without a body → generic fallback', () => {
    expect(inventoryErrorMessage(forbidden())).toBe(
      "You don't have permission to perform this action.",
    );
  });

  it('4c. 403 with a non-string message → generic fallback', () => {
    expect(inventoryErrorMessage(forbidden({ nested: 'text' }))).toBe(
      "You don't have permission to perform this action.",
    );
  });

  it('4d. known message with surrounding whitespace still maps (trimmed match)', () => {
    expect(
      inventoryErrorMessage(forbidden('  Insufficient Inventory permissions for this organisation  ')),
    ).toBe('Your role does not include this Inventory permission.');
  });

  it('5. 401 regression → session message (body is ignored)', () => {
    expect(
      inventoryErrorMessage({
        response: { status: 401, data: { message: 'Platform administrator access required' } },
      }),
    ).toMatch(/session has expired/i);
  });

  it('6. 400 regression → invalid-organisation message', () => {
    expect(
      inventoryErrorMessage({
        response: { status: 400, data: { message: 'Invalid organisation id' } },
      }),
    ).toMatch(/not valid for this account/i);
  });

  it('7. 500 regression → server message (body is ignored)', () => {
    expect(
      inventoryErrorMessage({
        response: { status: 500, data: { message: 'Insufficient Inventory permissions for this organisation' } },
      }),
    ).toMatch(/server could not complete/i);
  });

  it('8. network/unknown errors keep the connection message', () => {
    expect(inventoryErrorMessage(new Error('boom'))).toMatch(/check your connection/i);
    expect(inventoryErrorMessage(undefined)).toMatch(/check your connection/i);
  });

  it('9. InventoryErrorState renders the mapped text for a capability denial', () => {
    render(
      <InventoryErrorState
        error={forbidden('Insufficient Inventory permissions for this organisation')}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('Your role does not include this Inventory permission.')).toBeTruthy();
    expect(screen.queryByText(/do not have access to this organisation/i)).toBeNull();
  });
});
