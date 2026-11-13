import { describe, it, expect } from 'vitest';
import {
  isPlatformOnlyPermission,
  isOrgAssignablePermission,
  canOrgRoleReceivePermission,
  filterOrgAssignablePermissionKeys,
} from '../domain/org-permission-policy.js';

const REFUND_KEYS = [
  'refunds.view',
  'refunds.request',
  'refunds.approve',
  'refunds.reject',
  'refunds.payout',
  'refunds.payout.confirm',
  'refunds.retry',
  'refunds.export',
] as const;

describe('R4 — organisation permission policy', () => {
  describe('platform-only capabilities are never organisation-assignable', () => {
    const platformKeys = [
      'financial.reconcile',
      'financial.payment.refund',
      'financial.payment.charge',
      'financial.entitlements.cancel',
      'financial.process_payouts',
      'users.view',
      'roles.update',
      'permissions.view',
      'ui-permissions.apply-templates',
      'admin.users',
      'audit.view',
      'accounting.view',
      'reports.view',
      'settlements.admin',
      'subscription.assignments.status',
      'marketplace.admin.orders',
      'sidebar.withdrawals-queue',
      'files.view',
      'files.delete',
      'player.wallet.view',
      'referee.profile.view',
      'notifications.config.manage',
    ];

    it.each(platformKeys)('%s is platform-only and not org-assignable', (key) => {
      expect(isPlatformOnlyPermission(key), key).toBe(true);
      expect(isOrgAssignablePermission(key), key).toBe(false);
    });
  });

  describe('legitimate organisation capabilities remain assignable', () => {
    const orgKeys = [
      'org.staff.manage',
      'org.accounting.view',
      'org.accounting.journal.create',
      'org.finance.view',
      'org.sidebar.accounting',
      'org.settings.edit',
      'branches.edit',
      'branches.edit.financial',
      'resources.manage',
      'bookings.view',
      'bookings.recurring.collect-cash',
      'marketplace.products.manage',
      'membership.manage',
      'academy.manage',
      'academies.enroll',
      'tournament.create',
      'tournaments.awards.grant',
      'league.manage',
      'season.publish',
      'coaches.approve',
      'coach.revenue.view',
      'community.chat.send',
      'profile.edit',
      'matches.result.manage',
      'settlements.view',
      'settlements.request',
      'settlements.pay',
      'settlements.cancel',
      'settlements.export',
      'files.upload',
      'organisations.edit.logo',
      'organisations.storefront.view',
    ];

    it.each(orgKeys)('%s is org-assignable', (key) => {
      expect(isOrgAssignablePermission(key), key).toBe(true);
    });
  });

  it('explicitly blocks organisation identity/platform-finance leaks', () => {
    for (const key of ['organisations.edit.name', 'organisations.edit.country', 'organisations.edit.org-type']) {
      expect(isOrgAssignablePermission(key), key).toBe(false);
    }
  });

  describe('approved Refund Engine organisation permissions', () => {
    it.each(REFUND_KEYS)('%s is organisation-assignable', (key) => {
      expect(isOrgAssignablePermission(key), key).toBe(true);
      expect(isPlatformOnlyPermission(key), key).toBe(false);
    });

    it('keeps unknown future refund keys fail-closed', () => {
      expect(isOrgAssignablePermission('refunds.future')).toBe(false);
      expect(isOrgAssignablePermission('refunds.future.approve')).toBe(false);
    });

    it('keeps the legacy platform payment-refund key non-assignable', () => {
      expect(isOrgAssignablePermission('financial.payment.refund')).toBe(false);
    });

    it('restricts refunds.export to organization admin and accountant roles', () => {
      for (const role of ['org-admin', 'accountant']) {
        expect(canOrgRoleReceivePermission(role, 'refunds.export'), role).toBe(true);
      }
      for (const role of ['branch-mgr', 'resource-mgr', 'shop-admin', 'coach', 'player', '']) {
        expect(canOrgRoleReceivePermission(role, 'refunds.export'), role).toBe(false);
      }
    });

    it('does not role-restrict the other seven refund permissions', () => {
      for (const key of REFUND_KEYS.filter((entry) => entry !== 'refunds.export')) {
        for (const role of ['org-admin', 'accountant', 'branch-mgr', 'shop-admin', 'coach']) {
          expect(canOrgRoleReceivePermission(role, key), `${role}/${key}`).toBe(true);
        }
      }
    });

    it('still rejects platform-only keys for every organization role', () => {
      for (const role of ['org-admin', 'accountant', 'branch-mgr', 'shop-admin', 'coach']) {
        expect(canOrgRoleReceivePermission(role, 'financial.reconcile'), role).toBe(false);
        expect(canOrgRoleReceivePermission(role, 'users.view'), role).toBe(false);
      }
    });
  });

  it('filterOrgAssignablePermissionKeys keeps org keys and drops platform keys', () => {
    const { allowed, rejected } = filterOrgAssignablePermissionKeys([
      'org.accounting.view',
      'bookings.view',
      'financial.reconcile',
      'financial.payment.refund',
      'users.view',
      'settlements.view',
    ]);

    expect(allowed.sort()).toEqual(['bookings.view', 'org.accounting.view', 'settlements.view']);
    expect(rejected.sort()).toEqual([
      'financial.payment.refund',
      'financial.reconcile',
      'users.view',
    ]);
  });

  it('filtering preserves allowed refund permissions and rejects unknown ones', () => {
    const { allowed, rejected } = filterOrgAssignablePermissionKeys([
      ...REFUND_KEYS,
      'refunds.future',
    ]);

    expect(allowed.sort()).toEqual([...REFUND_KEYS].sort());
    expect(rejected).toEqual(['refunds.future']);
  });

  it('role-aware filtering drops refunds.export for non-admin/non-accountant roles', () => {
    const branch = filterOrgAssignablePermissionKeys(REFUND_KEYS, 'branch-mgr');
    expect(branch.allowed).not.toContain('refunds.export');
    expect(branch.allowed).toEqual(
      expect.arrayContaining(REFUND_KEYS.filter((key) => key !== 'refunds.export')),
    );
    expect(branch.rejected).toEqual(['refunds.export']);

    const accountant = filterOrgAssignablePermissionKeys(REFUND_KEYS, 'accountant');
    expect(accountant.rejected).toEqual([]);
    expect(accountant.allowed.sort()).toEqual([...REFUND_KEYS].sort());
  });

  it('treats empty/blank keys as non-assignable (fail closed)', () => {
    expect(isOrgAssignablePermission('')).toBe(false);
    expect(isPlatformOnlyPermission('')).toBe(true);
  });
});
