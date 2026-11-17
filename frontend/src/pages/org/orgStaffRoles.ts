/**
 * Organisation staff roles that may be provisioned from the organisation portal.
 *
 * This list MUST mirror the backend allowlist
 * `backend/src/modules/organisations/infrastructure/repositories/org-portal.repository.ts`
 * (`ASSIGNABLE_ORG_ROLE_SLUGS`). The server clones the selected GLOBAL template
 * role into the organisation (`roles.organisation_id = <org>`) and copies only
 * organisation-assignable permissions — platform-only namespaces are dropped by
 * `canOrgRoleReceivePermission()`.
 *
 * `marketplace-manager` and `receptionist` are organisation roles for the
 * Inventory workspace. They are deliberately provisioned as organisation clones
 * and never as global roles with an organisation scope, because permission
 * resolution aggregates permissions across scopes.
 */
export const ORG_STAFF_ROLE_OPTIONS = [
  { slug: 'org-admin', label: 'Org Admin' },
  { slug: 'branch-mgr', label: 'Branch Manager' },
  { slug: 'resource-mgr', label: 'Resource Manager' },
  { slug: 'shop-admin', label: 'Shop Admin' },
  { slug: 'coach', label: 'Coach' },
  { slug: 'accountant', label: 'Accountant' },
  { slug: 'marketplace-manager', label: 'Marketplace Manager' },
  { slug: 'receptionist', label: 'Receptionist' },
] as const;

export type OrgStaffRoleSlug = (typeof ORG_STAFF_ROLE_OPTIONS)[number]['slug'];

export function orgStaffRoleLabel(slug: string): string {
  return ORG_STAFF_ROLE_OPTIONS.find((role) => role.slug === slug)?.label || slug;
}
