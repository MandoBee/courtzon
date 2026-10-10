import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { permissionMatchesTemplate } from '../../rbac/application/role-permission-templates.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../../../../..');

function source(relPath: string): string {
  return readFileSync(resolve(rootDir, relPath), 'utf8');
}

const routes = () => source('backend/src/modules/match-result/presentation/match-result.routes.ts');
const templatesTs = () => source('backend/src/modules/rbac/application/role-permission-templates.ts');
const templatesMjs = () => source('backend/scripts/role-permission-templates.mjs');
const registry = () => source('frontend/src/permissions/registry.ts');

const ROUTE_PERMISSION_EXPECTATIONS: Array<[string, string]> = [
  ["app.get('/admin/sport-formats'", "['sports.formats.view']"],
  ["app.get('/admin/sport-formats/:id'", "['sports.formats.view']"],
  ["app.post('/admin/sports/:sportId/formats'", "['sports.formats.manage']"],
  ["app.put('/admin/sport-formats/:id'", "['sports.formats.manage']"],
  ["app.delete('/admin/sport-formats/:id'", "['sports.formats.manage']"],
  ["app.get('/admin/sport-formats/:formatId/rule-sets'", "['sports.rule-sets.view']"],
  ["app.get('/admin/sport-rule-sets/:id'", "['sports.rule-sets.view']"],
  ["app.post('/admin/sport-formats/:formatId/rule-sets'", "['sports.rule-sets.manage']"],
  ["app.put('/admin/sport-rule-sets/:id'", "['sports.rule-sets.manage']"],
  ["app.post('/admin/sport-rule-sets/:id/activate'", "['sports.rule-sets.manage']"],
  ["app.post('/admin/sport-rule-sets/:id/deactivate'", "['sports.rule-sets.manage']"],
];

const NEW_KEYS = [
  'sports.formats.view',
  'sports.formats.manage',
  'sports.formats.edit.name',
  'sports.formats.edit.format-type',
  'sports.formats.edit.players-per-side',
  'sports.formats.edit.roster-size',
  'sports.formats.edit.description',
  'sports.rule-sets.view',
  'sports.rule-sets.manage',
  'sports.rule-sets.edit.name',
  'sports.rule-sets.edit.rules',
  'sports.rule-sets.edit.standings-rules',
];

const NON_ADMIN_ROLES = [
  'player',
  'org-admin',
  'branch-mgr',
  'resource-mgr',
  'shop-admin',
  'coach',
  'independent_coach',
  'resident_coach',
  'referee',
  'accountant',
  'court-manager',
  'marketplace-manager',
  'receptionist',
  'customer-service',
  'finance-manager',
  'operations-manager',
  'tournament-manager',
  'academy-manager',
  'event-manager',
  'marketing-manager',
  'content-manager',
  'support-agent',
];

describe('Phase A sport-config — ROUTE RBAC source scan', () => {
  it('every admin endpoint is gated with the exact intended permission', () => {
    const src = routes();
    for (const [route, permission] of ROUTE_PERMISSION_EXPECTATIONS) {
      expect(src).toContain(route);
      expect(src).toContain(`requirePermission(${permission})`);
    }
  });

  it('the legacy rule-set create endpoint was REKEYED away from matches.result.rules.manage', () => {
    const src = routes();
    expect(src).not.toContain("requirePermission(['matches.result.rules.manage'])");
  });

  it('no Phase A admin route uses a role check or unauthenticated access', () => {
    const src = routes();
    const phaseASection = src.slice(src.indexOf('Phase A — Super Admin sport format'));
    expect(phaseASection).toContain("requirePermission(['sports.");
    expect(phaseASection).not.toContain('requireRole(');
    expect(phaseASection).not.toContain('adminGuard');
  });
});

describe('Phase A sport-config — ROLE TEMPLATE runtime assertions', () => {
  it('super_admin has every new key (all-access passthrough)', () => {
    for (const key of NEW_KEYS) {
      expect(permissionMatchesTemplate('super_admin', key)).toBe(true);
    }
  });

  it('master-admin has every new key (explicit Phase A grant)', () => {
    for (const key of NEW_KEYS) {
      expect(permissionMatchesTemplate('master-admin', key)).toBe(true);
    }
  });

  it('org/player/ops roles NEVER receive any new key (ADMIN_ONLY block)', () => {
    for (const role of NON_ADMIN_ROLES) {
      for (const key of NEW_KEYS) {
        expect(permissionMatchesTemplate(role, key)).toBe(false);
      }
    }
  });

  it('read-only-admin and auditor receive only the .view keys', () => {
    for (const role of ['read-only-admin', 'auditor']) {
      expect(permissionMatchesTemplate(role, 'sports.formats.view')).toBe(true);
      expect(permissionMatchesTemplate(role, 'sports.rule-sets.view')).toBe(true);
      expect(permissionMatchesTemplate(role, 'sports.formats.manage')).toBe(false);
      expect(permissionMatchesTemplate(role, 'sports.rule-sets.manage')).toBe(false);
    }
  });

  it('existing match-result grants remain intact (no unrelated RBAC regression)', () => {
    expect(permissionMatchesTemplate('master-admin', 'matches.result.rules.manage')).toBe(true);
    expect(permissionMatchesTemplate('org-admin', 'matches.result.rules.manage')).toBe(true);
    expect(permissionMatchesTemplate('master-admin', 'matches.result.manage')).toBe(true);
    expect(permissionMatchesTemplate('org-admin', 'matches.result.manage')).toBe(true);
    expect(permissionMatchesTemplate('player', 'matches.result.rules.manage')).toBe(false);
  });

  it('both template sources (TS runtime + mjs sync) declare the admin-only prefixes', () => {
    for (const src of [templatesTs(), templatesMjs()]) {
      expect(src).toContain("'sports.formats.'");
      expect(src).toContain("'sports.rule-sets.'");
      expect(src).toContain('sports.formats.');
    }
  });
});

describe('Phase A sport-config — FRONTEND permission registry', () => {
  it('registers every new UI permission key', () => {
    const src = registry();
    for (const key of NEW_KEYS) {
      expect(src).toContain(`permissionKey: '${key}'`);
    }
  });

  it('keeps the existing sports.* keys untouched', () => {
    const src = registry();
    expect(src).toContain("permissionKey: 'sports.view'");
    expect(src).toContain("permissionKey: 'sports.edit.name'");
  });
});