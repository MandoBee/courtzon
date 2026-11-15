import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import api from '../../../services/api';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { useCan } from '../../../hooks/useCan';

export interface InventoryOrgOption {
  id: number;
  name: string;
}

export interface InventoryOrgState {
  /** Selected organisation id as a string ('' = not selected). Never guessed. */
  orgId: string;
  setOrgId: (id: string) => void;
  orgs: InventoryOrgOption[];
  loading: boolean;
  error: unknown | null;
  retry: () => void;
  /** Server decision: multi-organisation actors and platform admins must choose. */
  requiresExplicitSelection: boolean;
  /** True when the actor must pick an organisation before requests are sent. */
  needsSelection: boolean;
  /** True when the actor has no organisation to operate on. */
  hasNoAccess: boolean;
  /** True when the route organisation id is malformed. */
  invalidOrg?: boolean;
  /** `admin` = platform workspace; `org` = fixed route organisation. */
  mode?: 'admin' | 'org';
  /** API namespace for the current surface (`/admin/inventory` or `/org/:id/inventory`). */
  apiBase?: string;
  /** Stock-transfer namespace (`/admin/stock-transfers` or `/org/:id/inventory/stock-transfers`). */
  transfersBase?: string;
  /** Extra query params (`{ orgId }` in admin mode, `{}` in organisation mode). */
  scopeParams?: Record<string, string | number>;
  /** Effective capabilities for the current scope (organisation mode only). */
  permissions?: string[];
  /**
   * Capability check bound to the active scope. In organisation mode it uses
   * ONLY the permissions granted by roles bound to the route organisation, so
   * a role that manages Organisation A does not unlock buttons for
   * Organisation B. In admin mode it behaves like `useCan`.
   */
  canAny?: (...permissionKeys: string[]) => boolean;
}

interface InventoryOrgScopeValue {
  orgId: string;
  apiBase: string;
  transfersBase: string;
  permissions: string[] | null;
  loading: boolean;
  error: unknown | null;
  retry: () => void;
}

const InventoryOrgScopeContext = createContext<InventoryOrgScopeValue | null>(null);

const NOOP = () => {};

/**
 * Fixed-organisation scope for the `/org/:orgId/inventory` workspace.
 *
 * The route organisation is the ONLY source of scope; there is no selector and
 * no stale `?orgId=` value. Effective capabilities are fetched from
 * `GET /org/:orgId/inventory/access`, which resolves the permissions granted by
 * roles bound to that organisation on the backend.
 */
export function InventoryOrgProvider({ orgId, children }: { orgId: string; children: ReactNode }) {
  const normalized = /^\d+$/.test(String(orgId ?? '')) ? String(orgId) : '';
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!normalized) {
      setPermissions([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPermissions(null);
    api
      .get(`/org/${normalized}/inventory/access`)
      .then((res: any) => {
        if (cancelled) return;
        const list = res.data?.data?.permissions ?? res.data?.permissions ?? [];
        setPermissions(Array.isArray(list) ? list.map((key: unknown) => String(key)) : []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPermissions([]);
        setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [normalized, reloadKey]);

  const value = useMemo<InventoryOrgScopeValue>(
    () => ({
      orgId: normalized,
      apiBase: `/org/${normalized}/inventory`,
      transfersBase: `/org/${normalized}/inventory/stock-transfers`,
      permissions,
      loading,
      error,
      retry: () => setReloadKey((key) => key + 1),
    }),
    [normalized, permissions, loading, error],
  );

  return (
    <InventoryOrgScopeContext.Provider value={value}>{children}</InventoryOrgScopeContext.Provider>
  );
}

/**
 * Organisation scope for the Inventory pages.
 *
 * Admin mode (`/admin/inventory`): the list is served by
 * `GET /admin/inventory/organisations`, which applies exactly the same
 * membership predicates as the backend `resolveOrgId`. This is the single
 * source of truth: the selector cannot offer an organisation the backend would
 * reject, and cannot omit a valid membership. Nothing is read from localStorage.
 *
 * Organisation mode (`/org/:orgId/inventory`): the organisation is fixed by the
 * route and the capability list comes from the organisation-scoped backend
 * endpoint. No selector is shown and no client-supplied scope is trusted.
 */
export function useInventoryOrg(): InventoryOrgState {
  const scope = useContext(InventoryOrgScopeContext);
  const { can } = useCan();
  const [orgs, setOrgs] = useState<InventoryOrgOption[]>([]);
  const [requiresExplicitSelection, setRequiresExplicitSelection] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown | null>(null);
  const [orgId, setOrgId] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (scope) {
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get('/admin/inventory/organisations')
      .then((res: any) => {
        if (cancelled) return;
        const list = res.data?.data ?? [];
        setOrgs(
          Array.isArray(list)
            ? list.map((org: any) => ({
                id: Number(org.id),
                name: org.name ?? org.organisationName ?? `Organisation ${org.id}`,
              }))
            : [],
        );
        setRequiresExplicitSelection(Boolean(res.data?.requiresExplicitSelection));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setOrgs([]);
        setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, reloadKey]);

  useEffect(() => {
    if (scope) return;
    if (loading || error) return;
    if (requiresExplicitSelection) {
      // Keep a valid existing choice; otherwise wait for the actor to choose.
      setOrgId((prev) => (prev && orgs.some((org) => String(org.id) === prev) ? prev : ''));
      return;
    }
    if (orgs.length === 1) {
      setOrgId(String(orgs[0].id));
    } else if (orgs.length === 0) {
      setOrgId('');
    } else {
      setOrgId((prev) => (prev && orgs.some((org) => String(org.id) === prev) ? prev : ''));
    }
  }, [scope, loading, error, requiresExplicitSelection, orgs]);

  const orgPermissions = scope?.permissions ?? [];
  const permissionSet = useMemo(() => new Set(orgPermissions), [orgPermissions]);

  const canAny = useCallback(
    (...permissionKeys: string[]) => {
      if (scope) {
        return permissionKeys.some(
          (key) => permissionSet.has('*') || permissionSet.has(key),
        );
      }
      return permissionKeys.some((key) => can(key));
    },
    [scope, permissionSet, can],
  );

  if (scope) {
    return {
      orgId: scope.orgId,
      setOrgId: NOOP,
      orgs: scope.orgId ? [{ id: Number(scope.orgId), name: 'Organisation' }] : [],
      loading: scope.loading,
      error: scope.error,
      retry: scope.retry,
      requiresExplicitSelection: false,
      needsSelection: false,
      hasNoAccess: !scope.loading && !scope.error && orgPermissions.length === 0,
      invalidOrg: !scope.orgId,
      mode: 'org',
      apiBase: scope.apiBase,
      transfersBase: scope.transfersBase,
      scopeParams: {},
      permissions: orgPermissions,
      canAny,
    };
  }

  return {
    orgId,
    setOrgId,
    orgs,
    loading,
    error,
    retry: () => setReloadKey((key) => key + 1),
    requiresExplicitSelection,
    needsSelection: !loading && !error && orgId === '' && orgs.length > 0,
    hasNoAccess: !loading && !error && orgs.length === 0,
    mode: 'admin',
    apiBase: '/admin/inventory',
    transfersBase: '/admin/stock-transfers',
    scopeParams: { orgId },
    canAny,
  };
}

/**
 * Capability check for a shared Inventory page/subcomponent.
 *
 * Uses the organisation-scoped capability list when rendered inside
 * `InventoryOrgProvider`, and the normal global `useCan` behaviour otherwise.
 */
export function useInventoryCan(): (...permissionKeys: string[]) => boolean {
  const scope = useContext(InventoryOrgScopeContext);
  const { can } = useCan();
  const orgPermissions = scope?.permissions ?? [];
  const permissionSet = useMemo(() => new Set(orgPermissions), [orgPermissions]);

  return useCallback(
    (...permissionKeys: string[]) => {
      if (scope) {
        return permissionKeys.some(
          (key) => permissionSet.has('*') || permissionSet.has(key),
        );
      }
      return permissionKeys.some((key) => can(key));
    },
    [scope, permissionSet, can],
  );
}

export function InventoryOrgSelector({ org }: { org: InventoryOrgState }) {
  if (org.mode === 'org') return null;
  if (org.orgs.length === 0) return null;
  if (!org.requiresExplicitSelection && org.orgs.length === 1) return null;
  return (
    <select
      value={org.orgId}
      onChange={(e) => org.setOrgId(e.target.value)}
      aria-label="Organisation"
      className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[200px]"
    >
      <option value="">Select organisation…</option>
      {org.orgs.map((option) => (
        <option key={option.id} value={option.id}>{option.name}</option>
      ))}
    </select>
  );
}

function InventoryNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] p-6 text-center">
      <p className="text-sm font-medium text-[var(--color-text)]">{title}</p>
      <p className="text-xs text-[var(--color-text-muted)] mt-1">{message}</p>
    </div>
  );
}

/**
 * Renders its children only when a concrete organisation scope is resolved.
 * Prevents requests without a valid organisation and never shows a fake
 * "no data" state while the actor still has to choose one.
 */
export function InventoryOrgGate({ org, children }: { org: InventoryOrgState; children: ReactNode }) {
  if (org.loading) return <SkeletonRow count={4} />;
  if (org.error) {
    return (
      <InventoryErrorState
        error={org.error}
        onRetry={org.retry}
        title="We couldn't load your organisations"
      />
    );
  }
  if (org.invalidOrg) {
    return (
      <InventoryNotice
        title="Invalid organisation"
        message="The organisation in this address is not valid."
      />
    );
  }
  if (org.hasNoAccess) {
    if (org.mode === 'org') {
      return (
        <InventoryNotice
          title="No Inventory access"
          message="Your role does not grant Inventory access for this organisation."
        />
      );
    }
    return (
      <InventoryNotice
        title="No organisation access"
        message="Your account is not linked to an organisation, so there is no inventory to show."
      />
    );
  }
  if (org.needsSelection) {
    return (
      <InventoryNotice
        title="Select an organisation"
        message="Choose the organisation whose inventory you want to manage."
      />
    );
  }
  return <>{children}</>;
}

/** User-safe failure text; backend details are never surfaced. */
export function inventoryErrorMessage(error: unknown): string {
  const status = (error as { response?: { status?: number } } | undefined)?.response?.status;
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have access to this organisation.';
  if (status === 400) return 'The selected organisation is not valid for this account.';
  if (typeof status === 'number' && status >= 500) {
    return 'The server could not complete the request. Please try again.';
  }
  return 'Please check your connection and try again.';
}

export function InventoryErrorState({
  error,
  onRetry,
  title = "We couldn't load inventory data",
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] p-6 text-center">
      <p className="text-sm font-medium text-[var(--color-text)]">{title}</p>
      <p className="text-xs text-[var(--color-text-muted)] mt-1">{inventoryErrorMessage(error)}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-[var(--radius-md)] hover:bg-[var(--color-bg)]"
        >
          Retry
        </button>
      )}
    </div>
  );
}
