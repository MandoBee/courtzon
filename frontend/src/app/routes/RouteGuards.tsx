import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { resolveUserHome, useWorkspaceStore } from '../../store/workspace.store';
import { useCan } from '../../hooks/useCan';
import { hasPlatformAdminAccess } from '../../permissions/platformAccess';

function AccessDenied() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 p-6 text-center">
      <span className="text-3xl">🔒</span>
      <p className="text-lg font-semibold text-[var(--color-text)]">Access denied</p>
      <p className="text-sm text-[var(--color-muted)]">
        You don&apos;t have permission to view the admin workspace.
      </p>
      <Link to="/app" className="mt-2 text-sm font-medium text-[var(--color-primary)]">
        Go to your dashboard
      </Link>
    </div>
  );
}

/** Authenticated shell: routes platform staff to /admin and every role to its workspace home. */
export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const { can } = useCan();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const isPlatformStaff = hasPlatformAdminAccess(can);
  if (isPlatformStaff && !location.pathname.startsWith('/admin') && !location.pathname.startsWith('/org') && !location.pathname.startsWith('/notifications')) {
    return <Navigate to="/admin" replace />;
  }

  if (!isPlatformStaff && location.pathname === '/app' && activeWorkspace !== 'player') {
    const home = resolveUserHome();
    // Never bounce back into the admin area that this user cannot enter — it would
    // redirect-loop between /app → /admin → /app for a platform role without the
    // admin permission.
    if (home.workspace !== 'player' && home.path !== '/app' && !home.path.startsWith('/admin')) {
      return <Navigate to={home.path} replace />;
    }
  }
  return <Outlet />;
}

/**
 * `/admin` gate. Per-section authorisation is still enforced inside `AdminLayout`
 * via `getAdminRoutePermission()`, so this is only the coarse workspace entry.
 *
 * Denied users get an explicit "Access denied" surface instead of a redirect, so a
 * platform role without the permission can never redirect-loop with `/` / `/app`.
 */
export function AdminRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { can } = useCan();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!hasPlatformAdminAccess(can)) return <AccessDenied />;
  return <Outlet />;
}
