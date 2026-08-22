import { describe, it, expect } from 'vitest';
import { dedupeRolesBySlug } from './roles';

const role = (id: number, name: string, slug: string, organisation_id: number | null = null) => ({
  id,
  name,
  slug,
  organisation_id,
});

describe('dedupeRolesBySlug', () => {
  it('collapses org-scoped clones into their global template (Admin Users dropdown regression)', () => {
    const roles = [
      role(3, 'Org Admin', 'org-admin'),
      role(1052, 'Org Admin', 'org-admin', 6),
      role(6, 'Shop Admin', 'shop-admin'),
      role(1087, 'Shop Admin', 'shop-admin', 6),
      role(2, 'Player', 'player'),
    ];

    const result = dedupeRolesBySlug(roles);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.slug)).toEqual(['org-admin', 'shop-admin', 'player']);
  });

  it('prefers the global template row over a clone when the clone appears first', () => {
    const roles = [
      role(1052, 'Org Admin', 'org-admin', 6),
      role(3, 'Org Admin', 'org-admin', null),
    ];

    const result = dedupeRolesBySlug(roles);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
    expect(result[0].organisation_id).toBeNull();
  });

  it('keeps distinct roles that merely share a display name but differ in slug', () => {
    const roles = [
      role(10, 'Manager', 'org-manager'),
      role(11, 'Manager', 'branch-manager'),
    ];

    const result = dedupeRolesBySlug(roles);

    expect(result).toHaveLength(2);
  });

  it('drops soft-deleted rows entirely', () => {
    const roles = [
      { ...role(3, 'Org Admin', 'org-admin'), deleted_at: '2026-01-01' },
      role(1052, 'Org Admin', 'org-admin', 6),
    ];

    const result = dedupeRolesBySlug(roles);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1052);
  });

  it('handles null/undefined/empty input', () => {
    expect(dedupeRolesBySlug(null)).toEqual([]);
    expect(dedupeRolesBySlug(undefined)).toEqual([]);
    expect(dedupeRolesBySlug([])).toEqual([]);
  });
});
