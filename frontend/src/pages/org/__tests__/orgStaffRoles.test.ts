import { describe, it, expect } from 'vitest';
import { ORG_STAFF_ROLE_OPTIONS, orgStaffRoleLabel } from '../orgStaffRoles';

/**
 * The organisation staff role list is the UI echo of the backend
 * `ASSIGNABLE_ORG_ROLE_SLUGS` allowlist. These tests lock the provisioning
 * surface for the Inventory UAT roles and prove that no platform role can be
 * offered through the organisation portal.
 */
describe('organisation staff role options (provisioning surface)', () => {
  const slugs = ORG_STAFF_ROLE_OPTIONS.map((role) => role.slug);

  it('offers the Inventory organisation roles', () => {
    expect(slugs).toEqual(
      expect.arrayContaining(['org-admin', 'marketplace-manager', 'receptionist']),
    );
  });

  it('matches the backend assignable allowlist exactly', () => {
    expect([...slugs].sort()).toEqual(
      [
        'accountant',
        'branch-mgr',
        'coach',
        'marketplace-manager',
        'org-admin',
        'receptionist',
        'resource-mgr',
        'shop-admin',
      ].sort(),
    );
  });

  it('never offers a platform role', () => {
    const platformRoles = [
      'super_admin',
      'super-admin',
      'master-admin',
      'auditor',
      'read-only-admin',
      'finance-manager',
      'content-manager',
      'event-manager',
      'player',
      'referee',
    ];
    for (const role of platformRoles) {
      expect(slugs, role).not.toContain(role);
    }
  });

  it('uses unique slugs and a non-empty label for every role', () => {
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const role of ORG_STAFF_ROLE_OPTIONS) {
      expect(role.label.length, role.slug).toBeGreaterThan(0);
    }
  });

  it('resolves labels and falls back to the slug for unknown roles', () => {
    expect(orgStaffRoleLabel('marketplace-manager')).toBe('Marketplace Manager');
    expect(orgStaffRoleLabel('receptionist')).toBe('Receptionist');
    expect(orgStaffRoleLabel('unknown-role')).toBe('unknown-role');
  });
});
