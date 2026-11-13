import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  permissionMatchesTemplate,
  TEMPLATE_SLUGS,
} from '../../rbac/application/role-permission-templates.js';

const mjs = await import('../../../../scripts/role-permission-templates.mjs');
const mjsMatch = mjs.permissionMatchesTemplate as (slug: string, key: string) => boolean;

const KEY = 'financial.payment.refund';

const repoRoot = resolve(import.meta.dirname, '../../../../..');

describe('R3 — dedicated payment-refund permission', () => {
  it('is granted to super_admin, master-admin and finance-manager only', () => {
    for (const slug of ['super_admin', 'master-admin', 'finance-manager']) {
      expect(permissionMatchesTemplate(slug, KEY), slug).toBe(true);
      expect(mjsMatch(slug, KEY), slug).toBe(true);
    }
  });

  it('is NOT granted to the accountant role or any organisation role', () => {
    const denied = [
      'accountant',
      'org-admin',
      'shop-admin',
      'branch-mgr',
      'resource-mgr',
      'coach',
      'independent_coach',
      'resident_coach',
      'referee',
      'player',
      'receptionist',
      'customer-service',
      'operations-manager',
      'tournament-manager',
      'academy-manager',
      'event-manager',
      'marketing-manager',
      'content-manager',
      'support-agent',
      'auditor',
      'read-only-admin',
      'court-manager',
      'marketplace-manager',
    ];
    for (const slug of denied) {
      expect(permissionMatchesTemplate(slug, KEY), slug).toBe(false);
      expect(mjsMatch(slug, KEY), slug).toBe(false);
    }
  });

  it('does not weaken financial.reconcile (still held by the platform finance roles)', () => {
    for (const slug of ['super_admin', 'master-admin', 'accountant', 'finance-manager']) {
      expect(permissionMatchesTemplate(slug, 'financial.reconcile'), slug).toBe(true);
      expect(mjsMatch(slug, 'financial.reconcile'), slug).toBe(true);
    }
  });

  it('.ts and .mjs templates agree on the new key for all templates', () => {
    for (const slug of TEMPLATE_SLUGS) {
      expect(permissionMatchesTemplate(slug, KEY), slug).toBe(mjsMatch(slug, KEY));
    }
  });

  it('is registered in the authoritative frontend permission registry', () => {
    const registry = readFileSync(resolve(repoRoot, 'frontend/src/permissions/registry.ts'), 'utf8');
    expect(registry).toContain(`permissionKey: '${KEY}'`);
    // The sync script parses exactly this shape; keep it machine-readable.
    const entry = registry
      .split('\n')
      .find((line) => line.includes(`permissionKey: '${KEY}'`)) as string;
    expect(entry).toContain("moduleSlug: 'financial'");
    expect(entry).toContain("elementType: 'action'");
  });

  it('is NOT registered as an organisation-assignable capability', async () => {
    const { isOrgAssignablePermission } = await import('../../rbac/domain/org-permission-policy.js');
    expect(isOrgAssignablePermission(KEY)).toBe(false);
  });
});
