export interface RoleLike {
  id: number;
  name: string;
  slug: string;
  organisation_id?: number | null;
  deleted_at?: string | null;
}

/**
 * Collapse duplicate role rows that share the same stable role code (`slug`).
 * Organisation-scoped clones created at registration time keep the template's
 * name/slug, so selectors must show one entry per slug — preferring the global
 * (organisation_id IS NULL) template row.
 */
export function dedupeRolesBySlug<T extends RoleLike>(roles: T[] | null | undefined): T[] {
  if (!roles?.length) return [];
  const bySlug = new Map<string, T>();
  for (const role of roles) {
    if (role.deleted_at) continue;
    const existing = bySlug.get(role.slug);
    if (!existing) {
      bySlug.set(role.slug, role);
      continue;
    }
    const existingIsGlobal = existing.organisation_id == null;
    const candidateIsGlobal = role.organisation_id == null;
    if (candidateIsGlobal && !existingIsGlobal) {
      bySlug.set(role.slug, role);
    }
  }
  return Array.from(bySlug.values());
}

/**
 * Stable identity for a physical role row within its organisation context.
 * Global roles are identified by slug alone; organisation-scoped clones are
 * identified by their organisation PLUS slug — two organisations can
 * legitimately hold distinct clones with the same slug.
 */
function scopedIdentity(role: RoleLike): string {
  const scope = role.organisation_id == null ? 'global' : String(role.organisation_id);
  return `${scope}:${role.slug}`;
}

/**
 * Collapse duplicate rows that share the same organisation context AND slug
 * (e.g. orphaned clones or re-seeded templates). Roles in different
 * organisations are never merged. Soft-deleted rows pass through untouched so
 * restore flows keep working. Preference: system > active > lowest id.
 */
export function dedupeRolesByIdentity<T extends RoleLike & { is_system?: boolean | number; is_active?: boolean | number }>(
  roles: T[] | null | undefined,
): T[] {
  if (!roles?.length) return [];
  const kept = new Map<string, T>();
  for (const role of roles) {
    if (role.deleted_at) continue;
    const key = scopedIdentity(role);
    const existing = kept.get(key);
    if (!existing || rankRole(role) < rankRole(existing)) {
      kept.set(key, role);
    }
  }
  return roles.filter((role) => {
    if (role.deleted_at) return true;
    return kept.get(scopedIdentity(role)) === role;
  });
}

function rankRole(role: RoleLike & { is_system?: boolean | number; is_active?: boolean | number }): number {
  const isSystem = role.is_system ? 1 : 0;
  const isActive = role.is_active ? 1 : 0;
  return (isSystem ? 0 : 1) * 100000 + (isActive ? 0 : 1) * 10000 + role.id;
}

export interface RoleGroup<T> {
  key: string;
  label: string;
  isSystem: boolean;
  isGlobal: boolean;
  roles: T[];
}

/**
 * Group roles strictly by organisation context for the admin management list.
 * - organisation_id IS NULL → '__system' / '__global' groups (never mixed with org roles)
 * - otherwise → one group per organisation id
 *
 * Labels resolve through `resolveOrgName`; an org whose row no longer resolves
 * renders as "Organisation #<id>" — never as a global group.
 */
export function groupRolesByOrganisation<
  T extends RoleLike & { is_system?: boolean | number },
>(
  roles: T[] | null | undefined,
  resolveOrgName: (organisationId: number) => string | null | undefined,
): Array<[string, RoleGroup<T>]> {
  if (!roles?.length) return [];
  const groups = new Map<string, RoleGroup<T>>();
  for (const role of roles) {
    const isGlobal = role.organisation_id == null;
    const isSystem = !!role.is_system;
    let key: string;
    let label: string;
    if (isGlobal) {
      key = isSystem ? '__system' : '__global';
      label = isSystem ? 'System' : 'CourtZon (global)';
    } else {
      const orgId = Number(role.organisation_id);
      key = String(orgId);
      label =
        resolveOrgName(orgId) ??
        (role as any).organisation_name ??
        `Organisation #${orgId}`;
    }
    let group = groups.get(key);
    if (!group) {
      group = { key, label, isSystem, isGlobal, roles: [] };
      groups.set(key, group);
    }
    group.roles.push(role);
  }
  // System first, then global, then organisations alphabetically by label.
  const order = ['__system', '__global'];
  return Array.from(groups.entries()).sort((a, b) => {
    const ai = order.indexOf(a[0]);
    const bi = order.indexOf(b[0]);
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    return a[1].label.localeCompare(b[1].label);
  });
}
