import { describe, it, expect } from 'vitest';
import { isSystemRole, canDeleteRole, canAssignPermission } from '../domain/rbac-aggregate.js';

describe('RBAC Aggregate', () => {
  const systemRole = { id: 1, organisation_id: null, name: 'Super Admin', slug: 'super_admin', is_system: true, is_active: true, deleted_at: null, aggregate_version: 1 };
  const activeRole = { id: 2, organisation_id: 1, name: 'Manager', slug: 'manager', is_system: false, is_active: true, deleted_at: null, aggregate_version: 1 };
  const inactiveRole = { id: 3, organisation_id: 1, name: 'Inactive', slug: 'inactive', is_system: false, is_active: false, deleted_at: null, aggregate_version: 1 };
  const deletedRole = { id: 4, organisation_id: 1, name: 'Deleted', slug: 'deleted', is_system: false, is_active: false, deleted_at: '2024-01-01', aggregate_version: 1 };

  describe('isSystemRole', () => {
    it('returns true for system role', () => expect(isSystemRole(systemRole)).toBe(true));
    it('returns false for non-system role', () => expect(isSystemRole(activeRole)).toBe(false));
  });

  describe('canDeleteRole', () => {
    it('allows deleting non-system active role', () => expect(canDeleteRole(activeRole)).toBe(true));
    it('rejects deleting system role', () => expect(canDeleteRole(systemRole)).toBe(false));
    it('rejects deleting already deleted role', () => expect(canDeleteRole(deletedRole)).toBe(false));
  });

  describe('canAssignPermission', () => {
    it('allows assigning to active role', () => expect(canAssignPermission(activeRole)).toBe(true));
    it('rejects assigning to inactive role', () => expect(canAssignPermission(inactiveRole)).toBe(false));
    it('rejects assigning to deleted role', () => expect(canAssignPermission(deletedRole)).toBe(false));
  });
});
