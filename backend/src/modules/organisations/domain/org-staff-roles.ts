/**
 * Organisation staff role allowlist — single source of truth.
 *
 * Global template roles that may be cloned into an organisation as staff.
 *
 * Security contract enforced by `cloneRoleForOrg` + `canOrgRoleReceivePermission`:
 * the clone is created with `organisation_id = <org>`, receives ONLY
 * organisation-assignable permissions (platform-only namespaces — `platform.`,
 * `users.`, `financial.`, `sidebar.`, `marketplace.admin.`, … — are dropped) and
 * the assignee receives an organisation `user_role_scopes` row.
 *
 * `marketplace-manager` and `receptionist` were added for the Inventory UAT:
 * both already have organisation-assignable Inventory capabilities in the
 * role-aware matrix (`INVENTORY_ROLE_GRANTS`), but must NEVER be granted as
 * global roles with an organisation scope — that path would expose their
 * platform permissions because `checkPermission()` unions permissions across
 * scopes.
 *
 * Kept in the domain layer (not the repository) so request validation and the
 * runtime lookup cannot drift apart, and so test doubles that stub the
 * repository never remove the allowlist.
 */
export const ASSIGNABLE_ORG_ROLE_SLUGS = [
  'org-admin',
  'shop-admin',
  'branch-mgr',
  'resource-mgr',
  'coach',
  'accountant',
  'marketplace-manager',
  'receptionist',
] as const;

export type AssignableOrgRoleSlug = (typeof ASSIGNABLE_ORG_ROLE_SLUGS)[number];
