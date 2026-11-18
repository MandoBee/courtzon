/**
 * Platform-workspace access policy.
 *
 * Permission keys only — never role strings. `platform.admin` is the sole coarse
 * gate for the platform workspace. The backend dashboard endpoints are restricted
 * to the global super-admin role, so accepting a broader UI-only key would let a
 * viewer into `/admin` only to receive a 403 from every dashboard API.
 *
 * Sections inside `/admin` keep their own independently mapped permissions via
 * `canAccessAdminPath()`; this predicate only decides whether the workspace is
 * enterable at all.
 */
export const PLATFORM_ADMIN_PERMISSIONS = ['platform.admin'] as const;

export function hasPlatformAdminAccess(can: (permission: string) => boolean): boolean {
  return PLATFORM_ADMIN_PERMISSIONS.some((permission) => can(permission));
}
