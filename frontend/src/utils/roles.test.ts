import { describe, it, expect } from 'vitest';
import { dedupeRolesBySlug, dedupeRolesByIdentity, groupRolesByOrganisation } from './roles';

const role = (id: number, name: string, slug: string, organisation_id: number | null = null) => ({
  id,
  name,
  slug,
  organisation_id,
  is_system: false as boolean,
  is_active: true as boolean,
  deleted_at: null as string | null,
  organisation_name: null as string | null,
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

describe('dedupeRolesByIdentity (Admin Roles page regression)', () => {
  it('keeps multiple global roles with unique slugs', () => {
    const roles = [
      role(6, 'Shop Admin', 'shop-admin'),
      role(3, 'Org Admin', 'org-admin'),
      role(7, 'Coach', 'coach'),
    ];

    const result = dedupeRolesByIdentity(roles);

    expect(result).toHaveLength(3);
  });

  it('never merges organisation clones that share a slug across different organisations', () => {
    const roles = [
      role(6, 'Shop Admin', 'shop-admin'),
      role(1087, 'Shop Admin', 'shop-admin', 6),
      role(1201, 'Shop Admin', 'shop-admin', 9),
    ];

    const result = dedupeRolesByIdentity(roles);

    expect(result).toHaveLength(3);
  });

  it('collapses duplicated global rows with the same slug to one entry', () => {
    const roles = [
      role(6, 'Shop Admin', 'shop-admin'),
      role(77, 'Shop Admin', 'shop-admin'),
    ];

    const result = dedupeRolesByIdentity(roles);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(6);
  });

  it('collapses duplicate rows inside the same organisation but keeps other orgs untouched', () => {
    const roles = [
      role(1087, 'Shop Admin', 'shop-admin', 6),
      role(1090, 'Shop Admin', 'shop-admin', 6),
      role(1201, 'Shop Admin', 'shop-admin', 9),
    ];

    const result = dedupeRolesByIdentity(roles);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort((a, b) => a - b)).toEqual([1087, 1201]);
  });

  it('prefers the system row when collapsing duplicates', () => {
    const systemRow = { ...role(99, 'Player', 'player'), is_system: true };
    const roles = [role(2, 'Player', 'player'), systemRow];

    const result = dedupeRolesByIdentity(roles);

    expect(result).toHaveLength(1);
    expect(result[0].is_system).toBe(true);
  });

  it('passes soft-deleted rows through without hiding active counterparts', () => {
    const deleted = { ...role(50, 'Shop Admin', 'shop-admin', 6), deleted_at: '2026-01-01' };
    const roles = [role(1087, 'Shop Admin', 'shop-admin', 6), deleted];

    const result = dedupeRolesByIdentity(roles);

    expect(result).toHaveLength(2);
    expect(result.filter((r) => r.deleted_at)).toHaveLength(1);
  });
});

describe('groupRolesByOrganisation (Admin Roles page regression)', () => {
  it('places every global role exactly once under COURTZON (GLOBAL) and never mixes org clones into it', () => {
    const roles = [
      { ...role(1, 'Super Admin', 'super_admin'), is_system: true },
      role(3, 'Org Admin', 'org-admin'),
      role(6, 'Shop Admin', 'shop-admin'),
      role(1052, 'Org Admin', 'org-admin', 6),
      role(1087, 'Shop Admin', 'shop-admin', 6),
      role(1201, 'Shop Admin', 'shop-admin', 9),
    ];

    const groups = groupRolesByOrganisation(roles, (orgId) =>
      orgId === 6 ? 'Padel Edge' : orgId === 9 ? 'Tennis Club' : null,
    );

    const byKey = Object.fromEntries(groups.map(([key, group]) => [key, group]));
    expect(byKey['__global'].label).toBe('CourtZon (global)');
    expect(byKey['__global'].roles.map((r) => r.slug).sort()).toEqual(['org-admin', 'shop-admin']);
    // Each clone only in its own org group
    expect(byKey['6'].roles.map((r) => r.slug).sort()).toEqual(['org-admin', 'shop-admin']);
    expect(byKey['9'].roles.map((r) => r.slug)).toEqual(['shop-admin']);
    // Org ordering alphabetical
    expect(groups.map(([k]) => k)).toEqual(['__system', '__global', '6', '9']);
  });

  it('labels an orphaned clone after its organisation id, never as COURTZON (GLOBAL)', () => {
    // Organisation hard-deleted on production: no name resolvable anywhere.
    const orphan = { ...role(1087, 'Shop Admin', 'shop-admin', 12), organisation_name: null };
    const roles = [role(6, 'Shop Admin', 'shop-admin'), orphan];

    const groups = groupRolesByOrganisation(roles, () => null);

    expect(groups).toHaveLength(2);
    const [, orgGroup] = groups.find(([key]) => key === '12')!;
    expect(orgGroup.label).toBe('Organisation #12');
    expect(orgGroup.label).not.toContain('global');
    const [, globalGroup] = groups.find(([key]) => key === '__global')!;
    expect(globalGroup.roles).toHaveLength(1);
  });

  it('uses the organisations-list name over the stale JOINed row name and falls back to it when absent', () => {
    const rows = [
      { ...role(1052, 'Org Admin', 'org-admin', 6), organisation_name: 'Stale Name From Join' },
      { ...role(1201, 'Coach', 'coach', 7), organisation_name: 'Join Only Name' },
    ];
    const groups = groupRolesByOrganisation(rows, (orgId) => (orgId === 6 ? 'Padel Edge' : null));

    const [, six] = groups.find(([key]) => key === '6')!;
    const [, seven] = groups.find(([key]) => key === '7')!;
    expect(six.label).toBe('Padel Edge');
    expect(seven.label).toBe('Join Only Name');
  });

  it('handles empty input', () => {
    expect(groupRolesByOrganisation(null, () => 'x')).toEqual([]);
    expect(groupRolesByOrganisation([], () => 'x')).toEqual([]);
  });
});
