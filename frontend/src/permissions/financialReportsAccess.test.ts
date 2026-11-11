import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getAdminRoutePermission } from './adminRoutePermissions';

/**
 * D4 follow-up — financial.reports.view route gate.
 *
 * /admin/finance/reports is protected by the dedicated key, so master-admin
 * (which holds reports.view since D4 Expanded) cannot open it, while
 * super_admin and finance-manager can. General reports (/admin/reports) stay
 * on reports.view.
 */

const can = (permissions: string[], key: string) => permissions.includes('*') || permissions.includes(key);

/** Permission sets as actually granted by the role templates. */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['*'],
  'finance-manager': [
    'financial.reports.view',
    'financial.view',
    'reports.view',
    'settlements.view',
    'accounting.gl.view',
  ],
  'master-admin': [
    'reports.view',
    'reports.export',
    'sidebar.reports',
    'financial.view',
  ],
  accountant: [
    'reports.view',
    'financial.view',
    'settlements.view',
    'settlements.export',
  ],
  'org-admin': ['settlements.view', 'settlements.export', 'org.sidebar.finance'],
  'operations-manager': ['settlements.view', 'settlements.export'],
  'marketplace-manager': ['settlements.view', 'marketplace.view'],
  auditor: [
    'reports.view',
    'reports.export',
    'financial.view',
    'accounting.gl.view',
    'settlements.view',
    'sidebar.audit',
    'bi.dashboard.view',
  ],
  'read-only-admin': [
    'reports.view',
    'financial.view',
    'accounting.gl.view',
    'settlements.view',
    'sidebar.audit',
  ],
  'content-manager': ['translations.view', 'cms.view'],
};

const routeKey = (pathname: string) => getAdminRoutePermission(pathname);

describe('financial.reports.view — admin route gate', () => {
  it('protects /admin/finance/reports with the dedicated key', () => {
    expect(routeKey('/admin/finance/reports')).toBe('financial.reports.view');
  });

  it('keeps /admin/reports on reports.view', () => {
    expect(routeKey('/admin/reports')).toBe('reports.view');
  });

  it('protects /admin/finance and /admin/finance/ledger with the dedicated key', () => {
    expect(routeKey('/admin/finance')).toBe('financial.reports.view');
    expect(routeKey('/admin/finance/ledger')).toBe('financial.reports.view');
  });

  it('allows super_admin and finance-manager to open /admin/finance/reports', () => {
    for (const slug of ['super_admin', 'finance-manager']) {
      expect(can(ROLE_PERMISSIONS[slug], routeKey('/admin/finance/reports')!), slug).toBe(true);
    }
  });

  it('denies every other role on /admin/finance/reports', () => {
    for (const slug of [
      'master-admin',
      'accountant',
      'org-admin',
      'operations-manager',
      'marketplace-manager',
      'auditor',
      'read-only-admin',
      'content-manager',
    ]) {
      expect(can(ROLE_PERMISSIONS[slug], routeKey('/admin/finance/reports')!), slug).toBe(false);
    }
  });

  it('master-admin retains access to general reports (/admin/reports)', () => {
    expect(can(ROLE_PERMISSIONS['master-admin'], routeKey('/admin/reports')!)).toBe(true);
  });

  it('denies general reports to roles without reports.view', () => {
    for (const slug of ['org-admin', 'operations-manager', 'marketplace-manager', 'content-manager']) {
      expect(can(ROLE_PERMISSIONS[slug], routeKey('/admin/reports')!), slug).toBe(false);
    }
  });

  it('registers financial.reports.view exactly once in the permission registry', () => {
    const registry = fs.readFileSync(path.join(__dirname, 'registry.ts'), 'utf-8');
    const occurrences = registry.split(`permissionKey: 'financial.reports.view'`).length - 1;
    expect(occurrences).toBe(1);
  });
});
