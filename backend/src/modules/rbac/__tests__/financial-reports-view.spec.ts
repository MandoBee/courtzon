import { describe, it, expect } from 'vitest';
import { permissionMatchesTemplate, TEMPLATE_SLUGS } from '../application/role-permission-templates.js';

/**
 * financial.reports.view — approved role matrix.
 *
 * The key gates the Financial Reports screen (/admin/finance/reports) and the
 * report data endpoints. ONLY super_admin and finance-manager may hold it.
 */
const mjsModule = await import('../../../../scripts/role-permission-templates.mjs');
const mjsMatch = mjsModule.permissionMatchesTemplate;

const KEY = 'financial.reports.view';

const DENIED_ROLES = [
  'master-admin',
  'accountant',
  'org-admin',
  'operations-manager',
  'marketplace-manager',
  'auditor',
  'read-only-admin',
  'content-manager',
];

describe('financial.reports.view — role policy (.ts/.mjs parity)', () => {
  it('is granted to exactly super_admin and finance-manager', () => {
    const grantedTs = TEMPLATE_SLUGS.filter((slug) => permissionMatchesTemplate(slug, KEY)).sort();
    const grantedMjs = TEMPLATE_SLUGS.filter((slug) => mjsMatch(slug, KEY)).sort();
    expect(grantedTs).toEqual(['finance-manager', 'super_admin']);
    expect(grantedMjs).toEqual(['finance-manager', 'super_admin']);
  });

  it('denies every explicitly excluded role in both implementations', () => {
    for (const slug of DENIED_ROLES) {
      expect(permissionMatchesTemplate(slug, KEY), `${slug} (.ts)`).toBe(false);
      expect(mjsMatch(slug, KEY), `${slug} (.mjs)`).toBe(false);
    }
  });

  it('.ts and .mjs agree for ALL 26 templates', () => {
    for (const slug of TEMPLATE_SLUGS) {
      expect(permissionMatchesTemplate(slug, KEY), slug).toBe(mjsMatch(slug, KEY));
    }
  });

  it('does not change the existing financial.view policy', () => {
    for (const slug of ['accountant', 'master-admin', 'finance-manager']) {
      expect(permissionMatchesTemplate(slug, 'financial.view'), `${slug} (.ts)`).toBe(true);
      expect(mjsMatch(slug, 'financial.view'), `${slug} (.mjs)`).toBe(true);
    }
  });

  it('grants financial.export only to roles with global Financial Dashboard access', () => {
    for (const slug of ['super_admin', 'finance-manager']) {
      expect(permissionMatchesTemplate(slug, 'financial.export'), `${slug} (.ts)`).toBe(true);
      expect(mjsMatch(slug, 'financial.export'), `${slug} (.mjs)`).toBe(true);
    }
    for (const slug of ['accountant', 'master-admin', 'auditor', 'read-only-admin', 'org-admin']) {
      expect(permissionMatchesTemplate(slug, 'financial.export'), `${slug} (.ts)`).toBe(false);
      expect(mjsMatch(slug, 'financial.export'), `${slug} (.mjs)`).toBe(false);
    }
  });
});
