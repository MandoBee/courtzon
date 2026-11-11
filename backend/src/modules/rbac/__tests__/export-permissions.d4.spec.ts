import { describe, it, expect } from 'vitest';
import { permissionMatchesTemplate, TEMPLATE_SLUGS } from '../application/role-permission-templates.js';

/**
 * D4 Expanded — export permissions in the role templates.
 *
 * The runtime template (.ts) and the sync-script template (.mjs) are two
 * representations of the same policy and MUST agree, so every assertion runs
 * against both.
 */
const mjsModule = await import('../../../../scripts/role-permission-templates.mjs');
const mjsMatch = mjsModule.permissionMatchesTemplate;

/** Every registered export permission key (existing + D4 Expanded). */
const EXPORT_KEYS = [
  'reports.export',
  'audit.export',
  'bi.export',
  'accounting.export',
  'settlements.export',
  'financial.export',
  'notifications.webhooks.export',
  'translations.export',
];

/**
 * D4 parity contract scope.
 *
 * `.ts` and `.mjs` must agree on every key that D4 owns: the export families,
 * the financial-reports read gate, and the two D4 Expanded report-surface keys
 * (`reports.view`, `sidebar.reports`). Nested export variants are included to
 * pin the `isExportPermission()` matcher.
 *
 * Deliberately OUT of scope: pre-existing divergences between the base commit's
 * `.ts` and `.mjs` templates that belong to unrelated work (G11 tournament
 * competition/awards, C10 `org.sidebar.*` / `org.accounting.*` patterns, and the
 * `.mjs` sidebar regex anchor). Those must not be allowed to mask a D4 policy
 * regression, and D4 must not absorb them.
 */
const D4_PARITY_KEYS = [
  ...EXPORT_KEYS,
  'financial.reports.view',
  'reports.view',
  'sidebar.reports',
  'reports.export.csv',
  'accounting.export.summary',
];

describe('D4 Expanded — export permissions in the role templates (.ts/.mjs parity)', () => {
  for (const slug of ['auditor', 'read-only-admin']) {
    it(`${slug} receives only the approved export permissions`, () => {
      const allowed = slug === 'auditor' ? new Set(['reports.export']) : new Set<string>();
      for (const key of [...EXPORT_KEYS, 'reports.export.csv', 'accounting.export.summary']) {
        const expected = allowed.has(key);
        expect(permissionMatchesTemplate(slug, key), `${slug} / ${key} (.ts)`).toBe(expected);
        expect(mjsMatch(slug, key), `${slug} / ${key} (.mjs)`).toBe(expected);
      }
    });
  }

  it('grants auditor reports.export for general reports only', () => {
    expect(permissionMatchesTemplate('auditor', 'reports.export')).toBe(true);
    expect(mjsMatch('auditor', 'reports.export')).toBe(true);
  });

  it('C6 — the export matcher does not deny unrelated permission names', () => {
    for (const slug of ['auditor', 'read-only-admin']) {
      // `reports.exports` is not an export action; the auditor keeps read access
      // to the reports family via its existing view patterns.
      expect(permissionMatchesTemplate(slug, 'reports.exports'), `${slug} (.ts)`).toBe(true);
      expect(mjsMatch(slug, 'reports.exports'), `${slug} (.mjs)`).toBe(true);
      // `export.reports` is unrelated and falls outside the reports family.
      expect(permissionMatchesTemplate(slug, 'export.reports'), `${slug} (.ts)`).toBe(false);
      expect(mjsMatch(slug, 'export.reports'), `${slug} (.mjs)`).toBe(false);
    }
  });

  it('auditor keeps its read-only surface (view keys are unaffected)', () => {
    for (const key of ['reports.view', 'audit.view', 'dashboard.view', 'bookings.view', 'sidebar.audit']) {
      expect(permissionMatchesTemplate('auditor', key), `${key} (.ts)`).toBe(true);
      expect(mjsMatch('auditor', key), `${key} (.mjs)`).toBe(true);
    }
  });

  it('read-only-admin keeps its read-only surface (view keys are unaffected)', () => {
    for (const key of ['reports.view', 'audit.view', 'dashboard.view', 'bookings.view', 'sidebar.audit']) {
      expect(permissionMatchesTemplate('read-only-admin', key), `${key} (.ts)`).toBe(true);
      expect(mjsMatch('read-only-admin', key), `${key} (.mjs)`).toBe(true);
    }
  });

  it('master-admin can open the reports screens and export reports', () => {
    for (const key of ['reports.view', 'sidebar.reports', 'reports.export']) {
      expect(permissionMatchesTemplate('master-admin', key), `${key} (.ts)`).toBe(true);
      expect(mjsMatch('master-admin', key), `${key} (.mjs)`).toBe(true);
    }
  });

  it('master-admin does NOT receive finance-reports navigation or export grants', () => {
    for (const key of [
      'sidebar.finance-reports',
      'financial.reports.view',
      'financial.export',
      'accounting.export',
      'settlements.export',
      'audit.export',
      'bi.export',
      'notifications.webhooks.export',
      'translations.export',
    ]) {
      expect(permissionMatchesTemplate('master-admin', key), `${key} (.ts)`).toBe(false);
      expect(mjsMatch('master-admin', key), `${key} (.mjs)`).toBe(false);
    }
  });

  it('settlements.export is granted exactly to the approved roles', () => {
    for (const slug of ['super_admin', 'accountant', 'finance-manager', 'org-admin', 'operations-manager']) {
      expect(permissionMatchesTemplate(slug, 'settlements.export'), `${slug} (.ts)`).toBe(true);
      expect(mjsMatch(slug, 'settlements.export'), `${slug} (.mjs)`).toBe(true);
    }
    for (const slug of ['marketplace-manager', 'auditor', 'read-only-admin', 'master-admin']) {
      expect(permissionMatchesTemplate(slug, 'settlements.export'), `${slug} (.ts)`).toBe(false);
      expect(mjsMatch(slug, 'settlements.export'), `${slug} (.mjs)`).toBe(false);
    }
  });

  it('settlements.view is preserved for every role that had it', () => {
    for (const slug of ['accountant', 'finance-manager', 'org-admin', 'operations-manager', 'marketplace-manager', 'auditor', 'read-only-admin']) {
      expect(permissionMatchesTemplate(slug, 'settlements.view'), `${slug} (.ts)`).toBe(true);
      expect(mjsMatch(slug, 'settlements.view'), `${slug} (.mjs)`).toBe(true);
    }
  });

  it('financial.export is granted only to roles with global Financial Dashboard access', () => {
    for (const slug of ['super_admin', 'finance-manager']) {
      expect(permissionMatchesTemplate(slug, 'financial.export'), `${slug} (.ts)`).toBe(true);
      expect(mjsMatch(slug, 'financial.export'), `${slug} (.mjs)`).toBe(true);
    }
    for (const slug of ['accountant', 'master-admin', 'auditor', 'read-only-admin', 'org-admin', 'player']) {
      expect(permissionMatchesTemplate(slug, 'financial.export'), `${slug} (.ts)`).toBe(false);
      expect(mjsMatch(slug, 'financial.export'), `${slug} (.mjs)`).toBe(false);
    }
  });

  it('accounting.export is granted to super_admin and finance-manager only', () => {
    for (const slug of ['super_admin', 'finance-manager']) {
      expect(permissionMatchesTemplate(slug, 'accounting.export'), `${slug} (.ts)`).toBe(true);
      expect(mjsMatch(slug, 'accounting.export'), `${slug} (.mjs)`).toBe(true);
    }
    for (const slug of ['accountant', 'master-admin', 'auditor', 'read-only-admin']) {
      expect(permissionMatchesTemplate(slug, 'accounting.export'), `${slug} (.ts)`).toBe(false);
      expect(mjsMatch(slug, 'accounting.export'), `${slug} (.mjs)`).toBe(false);
    }
  });

  it('notifications.webhooks.export and translations.export are super-admin only', () => {
    for (const key of ['notifications.webhooks.export', 'translations.export']) {
      expect(permissionMatchesTemplate('super_admin', key), `${key} (.ts)`).toBe(true);
      expect(mjsMatch('super_admin', key), `${key} (.mjs)`).toBe(true);
      for (const slug of ['master-admin', 'content-manager', 'auditor', 'read-only-admin']) {
        expect(permissionMatchesTemplate(slug, key), `${slug} / ${key} (.ts)`).toBe(false);
        expect(mjsMatch(slug, key), `${slug} / ${key} (.mjs)`).toBe(false);
      }
    }
  });

  it('content-manager does not receive translations.export', () => {
    // The ADMIN_ONLY `translations.` block already denies translations.view to
    // this role, and the explicit deny keeps the export key out as well.
    expect(permissionMatchesTemplate('content-manager', 'translations.export')).toBe(false);
    expect(permissionMatchesTemplate('content-manager', 'translations.view')).toBe(false);
    expect(mjsMatch('content-manager', 'translations.export')).toBe(false);
    expect(mjsMatch('content-manager', 'translations.view')).toBe(false);
    // It keeps the (non-admin-only) translations sidebar entry it already had.
    expect(permissionMatchesTemplate('content-manager', 'sidebar.translations')).toBe(true);
    expect(mjsMatch('content-manager', 'sidebar.translations')).toBe(true);
  });

  it('general report export is available to the approved reporting roles', () => {
    for (const slug of ['super_admin', 'accountant', 'finance-manager', 'auditor', 'master-admin']) {
      expect(permissionMatchesTemplate(slug, 'reports.export'), `${slug} (.ts)`).toBe(true);
      expect(mjsMatch(slug, 'reports.export'), `${slug} (.mjs)`).toBe(true);
    }
  });

  it('super_admin can export everything', () => {
    for (const key of EXPORT_KEYS) {
      expect(permissionMatchesTemplate('super_admin', key), `${key} (.ts)`).toBe(true);
      expect(mjsMatch('super_admin', key), `${key} (.mjs)`).toBe(true);
    }
  });

  it('D4 export and finance keys are identical in .ts and .mjs across ALL 26 templates', () => {
    for (const slug of TEMPLATE_SLUGS) {
      for (const key of D4_PARITY_KEYS) {
        expect(permissionMatchesTemplate(slug, key), `${slug} / ${key}`)
          .toBe(mjsMatch(slug, key));
      }
    }
  });

  it('D4 role policy matrix matches the approved policy in both implementations', () => {
    const roles = [
      'super_admin',
      'finance-manager',
      'accountant',
      'org-admin',
      'operations-manager',
      'master-admin',
      'auditor',
      'read-only-admin',
      'marketplace-manager',
      'content-manager',
    ];
    // Authoritative D4 allow-list per key; every other role in `roles` denies.
    const policy: Record<string, string[]> = {
      'financial.reports.view': ['super_admin', 'finance-manager'],
      'settlements.export': ['super_admin', 'finance-manager', 'accountant', 'org-admin', 'operations-manager'],
      'financial.export': ['super_admin', 'finance-manager'],
      'accounting.export': ['super_admin', 'finance-manager'],
      'reports.export': ['super_admin', 'finance-manager', 'accountant', 'master-admin', 'auditor'],
      'audit.export': ['super_admin'],
      'bi.export': ['super_admin'],
      'notifications.webhooks.export': ['super_admin'],
      'translations.export': ['super_admin'],
    };

    for (const [key, allowed] of Object.entries(policy)) {
      for (const slug of roles) {
        const expected = allowed.includes(slug);
        expect(permissionMatchesTemplate(slug, key), `${slug} / ${key} (.ts)`).toBe(expected);
        expect(mjsMatch(slug, key), `${slug} / ${key} (.mjs)`).toBe(expected);
      }
    }
  });

  it('documents that non-D4 template divergences are excluded from this parity contract', () => {
    // Base 9230b155 already diverges outside D4 (G11 tournament competition and
    // awards, C10 org.sidebar/org.accounting patterns, .mjs sidebar anchor).
    // These keys are intentionally NOT part of the D4 parity contract, so a D4
    // regression cannot be hidden by them and D4 does not silently absorb them.
    for (const unrelated of [
      'tournaments.awards.view',
      'tournament.competition.create',
      'tournament.create.organisation',
      'org.sidebar.accounting',
      'org.accounting.view',
      'sidebar.settlements-bookings',
    ]) {
      expect(D4_PARITY_KEYS).not.toContain(unrelated);
    }
  });
});
