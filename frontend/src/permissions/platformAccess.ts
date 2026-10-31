/**
 * Platform-workspace access policy (P3-05).
 *
 * Permission keys only — never role strings.
 *
 * - `dashboard.view` is the canonical UI permission for the `/admin` landing route
 *   (`permissions/adminRoutePermissions.ts` maps `/admin` → `dashboard.view`). It is
 *   registered in the UI registry and held only by platform staff templates.
 * - `platform.admin` mirrors the backend `adminGuard` ("platform admin API access",
 *   granted to `super_admin`) so legacy super-admin sessions keep working if the UI
 *   dashboard key is ever missing from a session payload.
 */
export const PLATFORM_ADMIN_PERMISSIONS = ['dashboard.view', 'platform.admin'] as const;

export function hasPlatformAdminAccess(can: (permission: string) => boolean): boolean {
  return PLATFORM_ADMIN_PERMISSIONS.some((permission) => can(permission));
}
