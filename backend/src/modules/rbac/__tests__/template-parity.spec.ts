import { describe, it, expect } from 'vitest';
import { permissionMatchesTemplate, TEMPLATE_SLUGS } from '../application/role-permission-templates.js';

const mjsModule = await import('../../../../scripts/role-permission-templates.mjs');
const mjsMatch = mjsModule.permissionMatchesTemplate;
const mjsSlugs = mjsModule.TEMPLATE_SLUGS;

const coachLifecycle = [
  'coaches.complete_session',
  'coaches.confirm_session',
  'coaches.no_show',
  'coaches.respond_request',
  'coaches.start_session',
];

const refereePerms = [
  'referee.assignments.manage',
  'referee.assignments.view',
  'referee.availability.manage',
  'referee.availability.view',
  'referee.dashboard.view',
  'referee.profile.update',
  'referee.profile.view',
  'referee.statistics.view',
];

describe('Role template parity — .ts matches .mjs', () => {

  it('TEMPLATE_SLUGS arrays match', () => {
    const tsSorted = [...TEMPLATE_SLUGS].sort();
    const mjsSorted = [...mjsSlugs].sort();
    expect(tsSorted).toEqual(mjsSorted);
  });

  it('player receives bookings.matchmaking', () => {
    expect(permissionMatchesTemplate('player', 'bookings.matchmaking')).toBe(true);
    expect(mjsMatch('player', 'bookings.matchmaking')).toBe(true);
  });

  it('player does NOT receive coach lifecycle verbs', () => {
    for (const key of coachLifecycle) {
      expect(permissionMatchesTemplate('player', key)).toBe(false);
      expect(mjsMatch('player', key)).toBe(false);
    }
  });

  it('coach receives all 5 lifecycle verbs', () => {
    for (const key of coachLifecycle) {
      expect(permissionMatchesTemplate('coach', key)).toBe(true);
      expect(mjsMatch('coach', key)).toBe(true);
    }
  });

  it('independent_coach receives all 5 lifecycle verbs', () => {
    for (const key of coachLifecycle) {
      expect(permissionMatchesTemplate('independent_coach', key)).toBe(true);
      expect(mjsMatch('independent_coach', key)).toBe(true);
    }
  });

  it('resident_coach receives all 5 lifecycle verbs', () => {
    for (const key of coachLifecycle) {
      expect(permissionMatchesTemplate('resident_coach', key)).toBe(true);
      expect(mjsMatch('resident_coach', key)).toBe(true);
    }
  });

  it('coach does NOT receive referee.* permissions', () => {
    for (const key of refereePerms) {
      expect(permissionMatchesTemplate('coach', key)).toBe(false);
      expect(mjsMatch('coach', key)).toBe(false);
    }
  });

  it('referee receives referee.* permissions', () => {
    for (const key of refereePerms) {
      expect(permissionMatchesTemplate('referee', key)).toBe(true);
      expect(mjsMatch('referee', key)).toBe(true);
    }
  });

  it('receptionist receives bookings.check-in', () => {
    expect(permissionMatchesTemplate('receptionist', 'bookings.check-in')).toBe(true);
    expect(mjsMatch('receptionist', 'bookings.check-in')).toBe(true);
  });

  it('master-admin receives coach lifecycle but not platform/feature-flags/app-settings', () => {
    for (const key of coachLifecycle) {
      expect(permissionMatchesTemplate('master-admin', key)).toBe(true);
      expect(mjsMatch('master-admin', key)).toBe(true);
    }
    expect(permissionMatchesTemplate('master-admin', 'platform.admin')).toBe(false);
    expect(permissionMatchesTemplate('master-admin', 'feature-flags.manage')).toBe(false);
    expect(permissionMatchesTemplate('master-admin', 'app-settings.view')).toBe(false);
    expect(permissionMatchesTemplate('master-admin', 'users.delete')).toBe(false);
  });

  it('auditor gets view-only permissions, not roles/permissions', () => {
    expect(permissionMatchesTemplate('auditor', 'bookings.view')).toBe(true);
    expect(permissionMatchesTemplate('auditor', 'dashboard.view')).toBe(true);
    expect(permissionMatchesTemplate('auditor', 'referee.statistics.view')).toBe(true);
    expect(permissionMatchesTemplate('auditor', 'roles.view')).toBe(false);
    expect(permissionMatchesTemplate('auditor', 'permissions.view')).toBe(false);
    expect(mjsMatch('auditor', 'bookings.view')).toBe(true);
    expect(mjsMatch('auditor', 'dashboard.view')).toBe(true);
    expect(mjsMatch('auditor', 'referee.statistics.view')).toBe(true);
    expect(mjsMatch('auditor', 'roles.view')).toBe(false);
    expect(mjsMatch('auditor', 'permissions.view')).toBe(false);
  });

  it('read-only-admin gets view-only, not delete/create/edit/manage/approve', () => {
    expect(permissionMatchesTemplate('read-only-admin', 'bookings.view')).toBe(true);
    expect(permissionMatchesTemplate('read-only-admin', 'organisations.view')).toBe(true);
    expect(permissionMatchesTemplate('read-only-admin', 'bookings.delete')).toBe(false);
    expect(permissionMatchesTemplate('read-only-admin', 'bookings.create')).toBe(false);
    expect(permissionMatchesTemplate('read-only-admin', 'bookings.edit')).toBe(false);
    expect(permissionMatchesTemplate('read-only-admin', 'bookings.manage')).toBe(false);
    expect(permissionMatchesTemplate('read-only-admin', 'bookings.approve')).toBe(false);
    expect(permissionMatchesTemplate('read-only-admin', 'roles.view')).toBe(false);
  });

  it('super_admin matches all keys', () => {
    expect(permissionMatchesTemplate('super_admin', 'anything.at.all')).toBe(true);
    expect(permissionMatchesTemplate('super_admin', 'platform.admin')).toBe(true);
    expect(mjsMatch('super_admin', 'anything.at.all')).toBe(true);
  });

  it('all 26 templates are recognized', () => {
    expect(TEMPLATE_SLUGS.length).toBe(26);
    expect(TEMPLATE_SLUGS).toContain('referee');
    expect(TEMPLATE_SLUGS).toContain('receptionist');
    expect(TEMPLATE_SLUGS).toContain('master-admin');
    expect(TEMPLATE_SLUGS).toContain('read-only-admin');
    expect(TEMPLATE_SLUGS).toContain('auditor');
  });

  // Smoke test: for a sampling of templates + permissions, both impls agree
  it('both implementations agree on sample [slug, key] pairs', () => {
    const samples = [
      ['player', 'bookings.matchmaking'],
      ['player', 'coaches.complete_session'],
      ['player', 'bookings.view'],
      ['player', 'profile.edit.birth-date'],
      ['coach', 'coaches.complete_session'],
      ['coach', 'referee.assignments.view'],
      ['coach', 'bookings.view'],
      ['coach', 'coaches.verify'],
      ['coach', 'coaches.approve'],
      ['accountant', 'financial.wallet.view'],
      ['accountant', 'users.delete'],
      ['accountant', 'sidebar.finance-transactions'],
      ['receptionist', 'bookings.check-in'],
      ['receptionist', 'bookings.view'],
      ['receptionist', 'bookings.delete'],
      ['org-admin', 'bookings.check-in'],
      ['org-admin', 'bookings.matchmaking'],
      ['branch-mgr', 'bookings.check-in'],
      ['branch-mgr', 'bookings.matchmaking'],
      ['resource-mgr', 'bookings.check-in'],
      ['resource-mgr', 'bookings.matchmaking'],
      ['court-manager', 'bookings.check-in'],
      ['court-manager', 'bookings.matchmaking'],
    ];
    for (const [slug, key] of samples) {
      const tsR = permissionMatchesTemplate(slug, key);
      const mjsR = mjsMatch(slug, key);
      expect(tsR).toBe(mjsR);
    }
  });
});

describe('Shop-admin seller branch Financials tab (seller branch editor parity)', () => {

  it('shop-admin receives branches.edit.financial so the Financials tab renders for sellers', () => {
    expect(permissionMatchesTemplate('shop-admin', 'branches.edit.financial')).toBe(true);
    expect(mjsMatch('shop-admin', 'branches.edit.financial')).toBe(true);
  });

  it('shop-admin retains its existing branch edit grants', () => {
    for (const key of [
      'branches.edit',
      'branches.edit.basic',
      'branches.edit.name',
      'branches.edit.email',
      'branches.edit.phone',
      'branches.edit.address',
      'branches.edit.status',
    ]) {
      expect(permissionMatchesTemplate('shop-admin', key)).toBe(true);
      expect(mjsMatch('shop-admin', key)).toBe(true);
    }
  });

  it('shop-admin does NOT gain unrelated branch sub-tabs or admin-only keys', () => {
    for (const key of [
      'branches.edit.amenities',
      'branches.edit.holidays',
      'branches.edit.cancellation',
      'branches.create',
      'branches.delete',
      'organisations.delete',
    ]) {
      expect(permissionMatchesTemplate('shop-admin', key)).toBe(false);
      expect(mjsMatch('shop-admin', key)).toBe(false);
    }
  });

  // ── Identity fields (Name / Type / Country) are super-admin-managed ──
  describe('org & seller identity fields are read-only (super-admin only)', () => {
    const identityKeys = [
      'organisations.edit.name',
      'organisations.edit.org-type',
      'organisations.edit.country',
    ];

    it('org-admin can NOT edit name/type/country', () => {
      for (const key of identityKeys) {
        expect(permissionMatchesTemplate('org-admin', key)).toBe(false);
        expect(mjsMatch('org-admin', key)).toBe(false);
      }
    });

    it('shop-admin can NOT edit name/type/country', () => {
      for (const key of identityKeys) {
        expect(permissionMatchesTemplate('shop-admin', key)).toBe(false);
        expect(mjsMatch('shop-admin', key)).toBe(false);
      }
    });

    it('operations-manager and master-admin can NOT edit identity fields', () => {
      for (const slug of ['operations-manager', 'master-admin']) {
        for (const key of identityKeys) {
          expect(permissionMatchesTemplate(slug, key)).toBe(false);
          expect(mjsMatch(slug, key)).toBe(false);
        }
      }
    });

    it('super_admin CAN edit identity fields', () => {
      for (const key of identityKeys) {
        expect(permissionMatchesTemplate('super_admin', key)).toBe(true);
        expect(mjsMatch('super_admin', key)).toBe(true);
      }
    });
  });
});

describe('P2-4 — marketplace.complaints.approve RBAC scope', () => {
  const approveKey = 'marketplace.complaints.approve';

  it('org-admin is NOT granted CourtZon-level complaint approval', () => {
    expect(permissionMatchesTemplate('org-admin', approveKey)).toBe(false);
    expect(mjsMatch('org-admin', approveKey)).toBe(false);
  });

  it('shop-admin is NOT granted CourtZon-level complaint approval', () => {
    expect(permissionMatchesTemplate('shop-admin', approveKey)).toBe(false);
    expect(mjsMatch('shop-admin', approveKey)).toBe(false);
  });

  it('org-admin / shop-admin keep complaint manage (resolve) but not approve', () => {
    for (const slug of ['org-admin', 'shop-admin']) {
      expect(permissionMatchesTemplate(slug, 'marketplace.complaints.manage')).toBe(true);
      expect(mjsMatch(slug, 'marketplace.complaints.manage')).toBe(true);
      expect(permissionMatchesTemplate(slug, approveKey)).toBe(false);
    }
  });

  it('CourtZon platform roles retain complaint approval', () => {
    for (const slug of ['super_admin', 'customer-service', 'master-admin', 'marketplace-manager']) {
      expect(permissionMatchesTemplate(slug, approveKey)).toBe(true);
      expect(mjsMatch(slug, approveKey)).toBe(true);
    }
  });

  it('player does NOT hold complaint approval', () => {
    expect(permissionMatchesTemplate('player', approveKey)).toBe(false);
    expect(mjsMatch('player', approveKey)).toBe(false);
  });

  it('player retains submit + view', () => {
    expect(permissionMatchesTemplate('player', 'marketplace.complaints.submit')).toBe(true);
    expect(permissionMatchesTemplate('player', 'marketplace.complaints.view')).toBe(true);
  });
});
