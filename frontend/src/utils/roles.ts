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
