import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORG_NAV } from '../org.registry';
import { uiRegistry } from '../../permissions/registry';

const __dirname = dirname(fileURLToPath(import.meta.url));

function flatNav() {
  const out: Array<{ id: string; permissionKey?: string }> = [];
  const walk = (items: any[]) => {
    for (const it of items) {
      out.push(it);
      if (it.children) walk(it.children);
    }
  };
  walk(ORG_NAV);
  return out;
}

const ORG_TOURNAMENT_KEYS = [
  'org.sidebar.tournaments',
  'org.tournaments.view',
  'org.tournaments.create',
  'org.tournaments.update',
  'org.tournaments.publish',
  'org.tournaments.delete',
  'org.tournaments.manage',
  'org.tournaments.register',
  'org.tournaments.result.manage',
];

describe('Org Tournament RBAC contract (UAT blocker regression)', () => {
  it('org sidebar "Tournaments" nav item is gated by org.sidebar.tournaments', () => {
    const item = flatNav().find((n) => n.id === 'nav.org.tournaments');
    expect(item).toBeTruthy();
    expect(item!.permissionKey).toBe('org.sidebar.tournaments');
  });

  it('every org.tournaments.* permission key is registered in the UI registry (single source of truth)', () => {
    const registered = new Set(uiRegistry.map((e) => e.permissionKey));
    for (const key of ORG_TOURNAMENT_KEYS) {
      expect(registered.has(key)).toBe(true);
    }
  });

  it('the org Tournament list "New Tournament" button is gated by org.tournaments.create', () => {
    const src = readFileSync(
      resolve(__dirname, '../../pages/admin/tournament/TournamentListPage.tsx'),
      'utf8',
    );
    expect(src).toContain("create: 'org.tournaments.create'");
  });
});