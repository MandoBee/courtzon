import type { ReactNode } from 'react';

/**
 * Shared 403 handling for admin data queries (UAT UR-01 / UR-04).
 *
 * A failed authorisation is NOT an empty dataset. Pages must render this
 * state instead of zero KPIs, empty tables or "No data" placeholders.
 *
 * The component mirrors the route-level "Access denied" surface used by
 * AdminLayout/RouteGuards so users get one consistent experience, and it
 * never echoes backend error text (no API details, URLs or permission keys).
 */
export type AdminDataErrorKind = 'forbidden' | 'unauthenticated' | 'server' | 'network';

export interface AdminDataError {
  kind: AdminDataErrorKind;
  message: string;
  retryable: boolean;
}

export function getAdminDataError(error: unknown, resource = 'this page'): AdminDataError {
  const status = (error as { response?: { status?: number } } | undefined)?.response?.status;

  if (status === 403) {
    return {
      kind: 'forbidden',
      message: `You don't have permission to view ${resource}.`,
      retryable: false,
    };
  }
  if (status === 401) {
    return {
      kind: 'unauthenticated',
      message: 'Your session has expired. Please sign in again.',
      retryable: false,
    };
  }
  if (typeof status === 'number' && status >= 500) {
    return {
      kind: 'server',
      message: `We couldn't load ${resource}. Please try again.`,
      retryable: true,
    };
  }
  return {
    kind: 'network',
    message: `We couldn't load ${resource}. Please check your connection and try again.`,
    retryable: true,
  };
}

interface AdminDataErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  resource?: string;
  /** Optional back link, e.g. "Go to dashboard". */
  action?: ReactNode;
}

export function AdminDataErrorState({ error, onRetry, resource = 'this page', action }: AdminDataErrorStateProps) {
  const info = getAdminDataError(error, resource);
  const forbidden = info.kind === 'forbidden';

  return (
    <div
      role="alert"
      data-testid="admin-data-error"
      data-error-kind={info.kind}
      className="flex min-h-[50vh] flex-col items-center justify-center gap-2 p-6 text-center"
    >
      <span className="text-3xl" aria-hidden="true">{forbidden ? '🔒' : '⚠️'}</span>
      <p className="text-lg font-semibold text-[var(--color-text)]">
        {forbidden ? 'Access denied' : info.kind === 'unauthenticated' ? 'Session expired' : 'Unable to load data'}
      </p>
      <p className="text-sm text-[var(--color-muted)]">{info.message}</p>
      {info.retryable && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
        >
          Try again
        </button>
      )}
      {action}
    </div>
  );
}

export default AdminDataErrorState;
