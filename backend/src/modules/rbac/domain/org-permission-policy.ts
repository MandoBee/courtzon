/**
 * Organisation staff permission policy (R4).
 *
 * CourtZon has two permission scopes:
 *   - PLATFORM-ONLY capabilities (finance, administration, platform content,
 *     audit, infrastructure). They must only ever live on GLOBAL roles
 *     (`roles.organisation_id IS NULL`).
 *   - ORGANISATION-ASSIGNABLE capabilities (org portal, branches, resources,
 *     bookings, marketplace seller tools, memberships, academies, tournaments,
 *     org-level accounting/settlements, profile).
 *
 * Organisation role clones are created by `rbacRepository.cloneRoleForOrg()`
 * and copied permission-by-permission, while permission resolution
 * (`getUserPermissionKeys`) is intentionally organisation-agnostic. Without this
 * policy an organisation could clone the platform `accountant` template and
 * receive `financial.reconcile` (or any other platform key) inside its own
 * organisation scope.
 *
 * The policy is deliberately a deny-list (platform-only) PLUS a positive
 * allowlist: cloning filters the platform-only keys out of the template (so a
 * legitimate organisation capability is never lost), while manual permission
 * grants must match the positive allowlist (so arbitrary non-organisation keys
 * — player/referee/platform — cannot be granted by an organisation admin).
 */

/**
 * Namespaces / keys that are platform-only. Mirrors the ADMIN_ONLY boundary of
 * `role-permission-templates.ts` with two deliberate differences:
 *   - `financial.` is platform-only here (the templates grant it to the platform
 *     accountant/finance-manager roles; organisations use `org.finance.*`,
 *     `org.accounting.*` and the org-scoped `settlements.*` actions instead).
 *   - `academy.`, `tournament.`, `season.`, `league.` and the match-result
 *     administration keys are NOT platform-only: org admins legitimately hold
 *     them for their own organisation.
 */
const PLATFORM_ONLY_PREFIXES: readonly string[] = [
  // Identity, RBAC and platform administration
  'users.',
  'roles.',
  'permissions.',
  'ui-permissions.',
  'organisations.view',
  'organisations.create',
  'organisations.delete',
  'organisations.verify',
  'organisations.edit.name',
  'organisations.edit.org-type',
  'organisations.edit.country',
  'organisation-types.',
  'admin.',
  'admin-academies.',
  'admin-coaches.',
  'admin-events.',
  'admin-tournaments.',
  'platform.',
  'security.',
  'monitoring.',
  'scheduled-jobs.',
  'audit.',
  'settings.',
  'sidebar.',
  'sidebar.layout.manage',
  'cache.',
  'queue.',
  'approvals.',
  // Platform content / CMS / branding / configuration
  'cms.',
  'app-settings.',
  'design-tokens.',
  'appearance.',
  'translations.',
  'translation-keys.',
  'feature-flags.',
  'languages.',
  'countries.',
  'currencies.',
  'banks.',
  'bank-branches.',
  'brands.',
  'tags.',
  'sport-categories.',
  'sports.edit',
  'sports.create',
  'sports.delete',
  'sports.formats.',
  'sports.rule-sets.',
  'sports-engine.',
  'amenities.',
  'resource-types.',
  'files.view',
  'files.delete',
  'payment-methods.',
  'payment-gateways.',
  'commission-rules.',
  'coupons.admin',
  'settlements.admin',
  'pricing.',
  'ads.',
  'hero.',
  'faq.',
  'features.',
  'style.',
  'text.',
  'team.',
  'testimonials.',
  'steps.',
  'stats.',
  'cta.',
  'blog_preview.',
  'contact.',
  'contact_form.',
  'contact_info.',
  'contact-submissions.',
  'location_map.',
  'indoor_outdoor.',
  'court_surface.',
  'court_type.',
  'depth_meters.',
  'pitch_size.',
  'pool_type.',
  'surface.',
  'surface_type.',
  'year_founded.',
  'capacity.',
  'member_capacity.',
  'affiliation.',
  // Platform finance + accounting + monitoring + back-office modules
  'financial.',
  'accounting.',
  'reports.',
  'notifications.',
  'notification_templates.',
  'notification_types.',
  'support.',
  'inventory.',
  'crm.',
  'hr.',
  'bi.',
  'integration.',
  'mobile.',
  'subscription.',
  'subscription-plans.',
  'marketplace.admin.',
  // Marketplace platform moderation + CourtZon-level refund approval are NOT
  // under `marketplace.admin.` but are platform capabilities: they guard
  // `/marketplace/admin/*` (all sellers/orders/products/reviews/upgrade
  // requests) and `/admin/marketplace/complaints/*` (over-threshold refunds)
  // with no organisation scoping. They must never be cloned or granted to an
  // organisation role — org staff resolve their own cases through
  // `marketplace.complaints.manage` (org-scoped, `requireApprovedOrg`).
  'marketplace.moderate',
  'marketplace.complaints.approve',
  // Player→seller activation is a platform onboarding capability. Organisation
  // staff must never hold it: it would let an org role activate selling for
  // other actors outside its tenant boundary. Org roles have no legitimate use
  // for it (org sellers are provisioned through their own registration flow).
  'marketplace.player.activate',
  'matches.admin.view',
  // Actor surfaces that never belong to organisation staff
  'player.',
  'referee.',
];

/**
 * Positive allowlist used when an organisation admin requests explicit
 * permission ids for their own staff (R4-B). Anything outside this list is
 * rejected even if it is not explicitly platform-only.
 */
const ORG_ASSIGNABLE_PATTERNS: readonly RegExp[] = [
  /^org\./,
  /^organisations\.edit$/,
  /^organisations\.edit\.(?!name$|org-type$|country$)/,
  /^organisations\.storefront(\.|$)/,
  /^branches\./,
  /^resources\./,
  /^bookings\./,
  /^marketplace\.(?!admin\.)/,
  /^membership\./,
  /^academy\./,
  /^academies\./,
  /^tournament\./,
  /^tournaments\./,
  /^league\./,
  /^season\./,
  /^coaches\./,
  /^coach\./,
  /^community\./,
  /^profile\./,
  /^home\./,
  /^dashboard\./,
  /^attendance\./,
  /^matches\.(view|apply|cancel|manage|result\.manage|result\.rules\.manage)$/,
];

/**
 * Refund Engine capabilities that an organisation may hold. Enumerated exactly
 * (never a `refunds.` prefix) so a future refund key stays fail-closed until it
 * is reviewed and added here.
 *
 * The owning organisation bears the refund cost, executes the transfer and
 * records the evidence, so all eight keys are organisation-assignable. The
 * per-case separation of duties is enforced in the refund service
 * (approver != executor != confirmer).
 */
const REFUND_ORG_ASSIGNABLE_KEYS: readonly string[] = [
  'refunds.view',
  'refunds.request',
  'refunds.approve',
  'refunds.reject',
  'refunds.payout',
  'refunds.payout.confirm',
  'refunds.retry',
  'refunds.export',
];

/**
 * Data-egress restriction: `refunds.export` may only be held by the
 * organisation administrator and accountant roles. The other seven refund
 * permissions remain assignable to any organisation employee.
 */
const REFUND_EXPORT_ORG_ROLES: ReadonlySet<string> = new Set(['org-admin', 'accountant']);

// ── Inventory (P1 — organisation-scoped Inventory) ──────────────────────────
//
// `inventory.` stays in PLATFORM_ONLY_PREFIXES above: the namespace is NOT
// broadly organisation-assignable. Only the exact keys below may cross the
// boundary, and only for the roles in INVENTORY_ROLE_GRANTS. An unknown future
// `inventory.*` key therefore remains fail-closed until it is reviewed.

export const INVENTORY_ORG_ASSIGNABLE_KEYS: readonly string[] = [
  'inventory.warehouses.view',
  'inventory.warehouses.manage',
  'inventory.suppliers.view',
  'inventory.suppliers.manage',
  'inventory.purchase-orders.view',
  'inventory.purchase-orders.manage',
  'inventory.stock.view',
  'inventory.stock.adjust',
  'inventory.transfers.view',
  'inventory.transfers.create',
  'inventory.transfers.complete',
  'inventory.transfers.cancel',
  'inventory.logs.view',
  'inventory.reports.view',
  'inventory.reports.export',
];

/**
 * Role-aware Inventory matrix. The organisation role clone slug is the same as
 * the global template slug (`cloneRoleForOrg`), so this map is shared by role
 * cloning, organisation staff grants AND the role-template matcher.
 *
 * `marketplace-manager` is the closest existing template to the product's
 * "Inventory Manager" persona; no new database role is invented in P1.
 */
export const INVENTORY_ROLE_GRANTS: Readonly<Record<string, ReadonlySet<string>>> = {
  'org-admin': new Set(INVENTORY_ORG_ASSIGNABLE_KEYS),
  'marketplace-manager': new Set([
    'inventory.warehouses.view',
    'inventory.warehouses.manage',
    'inventory.stock.view',
    'inventory.stock.adjust',
    'inventory.transfers.view',
    'inventory.transfers.create',
    'inventory.transfers.complete',
    'inventory.transfers.cancel',
    'inventory.logs.view',
  ]),
  accountant: new Set([
    'inventory.warehouses.view',
    'inventory.stock.view',
    'inventory.transfers.view',
    'inventory.logs.view',
    'inventory.reports.view',
    'inventory.reports.export',
  ]),
  receptionist: new Set([
    'inventory.warehouses.view',
    'inventory.stock.view',
    'inventory.transfers.view',
  ]),
};

export function canOrgRoleReceiveInventoryPermission(
  roleSlug: string,
  permissionKey: string,
): boolean {
  return INVENTORY_ROLE_GRANTS[roleSlug]?.has(permissionKey) ?? false;
}

/** Explicit organisation capabilities that do not follow a namespace prefix. */
const ORG_ASSIGNABLE_EXACT: ReadonlySet<string> = new Set([
  'files.upload',
  'settlements.view',
  'settlements.request',
  'settlements.pay',
  'settlements.cancel',
  'settlements.export',
  ...REFUND_ORG_ASSIGNABLE_KEYS,
  ...INVENTORY_ORG_ASSIGNABLE_KEYS,
]);

export function isPlatformOnlyPermission(permissionKey: string): boolean {
  if (!permissionKey) return true;
  return PLATFORM_ONLY_PREFIXES.some(
    (prefix) => permissionKey === prefix || permissionKey.startsWith(prefix),
  );
}

/**
 * True when an organisation administrator may grant the permission to their own
 * staff. Platform-only keys are always rejected; everything else must match the
 * organisation allowlist.
 */
export function isOrgAssignablePermission(permissionKey: string): boolean {
  if (!permissionKey) return false;
  if (ORG_ASSIGNABLE_EXACT.has(permissionKey)) return true;
  if (isPlatformOnlyPermission(permissionKey)) return false;
  return ORG_ASSIGNABLE_PATTERNS.some((pattern) => pattern.test(permissionKey));
}

/**
 * True when a specific ORGANISATION role may hold the permission.
 *
 * This is the role-aware layer on top of `isOrgAssignablePermission`:
 *   - every organisation-assignable key passes for every organisation role,
 *   - except `refunds.export`, which is restricted to organization admin and
 *     accountant (data egress).
 *
 * Callers that grant permissions to a concrete organization role MUST use this
 * function (role cloning, org staff grants, org permission updates) so the
 * restriction cannot be bypassed by supplying a key that is otherwise
 * organisation-assignable.
 */
export function canOrgRoleReceivePermission(roleSlug: string, permissionKey: string): boolean {
  if (!isOrgAssignablePermission(permissionKey)) return false;
  if (permissionKey.startsWith('inventory.')) {
    return canOrgRoleReceiveInventoryPermission(roleSlug, permissionKey);
  }
  if (permissionKey === 'refunds.export') return REFUND_EXPORT_ORG_ROLES.has(roleSlug);
  return true;
}

/**
 * Split a set of permission keys into the organisation-assignable subset and
 * the rejected subset (used by role cloning, where the goal is to drop
 * platform-only keys while keeping every legitimate organisation capability).
 *
 * When `roleSlug` is supplied the role-aware restriction is applied too (e.g.
 * `refunds.export` is rejected for roles other than organization admin and
 * accountant). Omitting it preserves the legacy key-level behaviour.
 */
export function filterOrgAssignablePermissionKeys(
  permissionKeys: readonly string[],
  roleSlug?: string,
): {
  allowed: string[];
  rejected: string[];
} {
  const allowed: string[] = [];
  const rejected: string[] = [];
  for (const key of permissionKeys) {
    const isAllowed = roleSlug
      ? canOrgRoleReceivePermission(roleSlug, key)
      : isOrgAssignablePermission(key);
    if (isAllowed) allowed.push(key);
    else rejected.push(key);
  }
  return { allowed, rejected };
}
