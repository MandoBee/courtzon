import { useEffect, useState, type ReactNode } from 'react';
import api from '../../../services/api';
import { SkeletonRow } from '../../../components/ui/Skeleton';

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
}

/**
 * Organisation scope for the Inventory admin pages.
 *
 * The list is served by `GET /admin/inventory/organisations`, which applies
 * exactly the same membership predicates as the backend `resolveOrgId`
 * (owner ∪ active organisation role scope ∪ `user_organisations`, or every
 * active organisation for platform admins). This is the single source of
 * truth: the selector cannot offer an organisation the backend would reject,
 * and cannot omit a valid membership. Nothing is read from localStorage.
 *
 * Single-organisation actors are selected automatically. Multi-organisation
 * actors and platform administrators must choose explicitly.
 */
export function useInventoryOrg(): InventoryOrgState {
  const [orgs, setOrgs] = useState<InventoryOrgOption[]>([]);
  const [requiresExplicitSelection, setRequiresExplicitSelection] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown | null>(null);
  const [orgId, setOrgId] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
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
  }, [reloadKey]);

  useEffect(() => {
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
  }, [loading, error, requiresExplicitSelection, orgs]);

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
  };
}

export function InventoryOrgSelector({ org }: { org: InventoryOrgState }) {
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
  if (org.hasNoAccess) {
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
