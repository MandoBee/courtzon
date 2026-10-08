import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uiRegistry } from '../../../../permissions/registry';
import { ADMIN_NAV } from '../../../../navigation/admin.registry';

// Step 5I-1 — F-01 + F-02 residue cleanup guard.
//
//   • F-01: the orphaned legacy `TournamentAdminPage.tsx` is deleted and must have
//           NO remaining reference in live runtime code (tests/scripts/docs excluded).
//   • F-02: the three registry entries that used to point at that deleted page must
//           now point at the canonical live admin tournament list, and every
//           componentPath in the corrected set must resolve to a real file.
//
// This is intentionally a focused residue guard — it does not re-test navigation
// behaviour (that stays covered by AdminTournamentsRedirect.spec.tsx /
// TournamentListPage.spec.tsx).

const here = dirname(fileURLToPath(import.meta.url));
// .../frontend/src
const frontendSrc = resolve(here, '../../../..');

const DELETED_LEGACY_COMPONENT = 'pages/admin/tournaments/TournamentAdminPage.tsx';
const CANONICAL_ADMIN_LIST = 'pages/admin/tournament/TournamentListPage.tsx';

const CORRECTED_KEYS = ['admin-tournaments.view', 'tournaments.edit', 'tournaments.delete'] as const;

/** Recursively collect source files under `dir`, excluding test files. */
function collectRuntimeSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      out.push(...collectRuntimeSources(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

describe('Step 5I-1 — TournamentAdminPage removal + componentPath repair', () => {
  it('F-01: the orphaned TournamentAdminPage.tsx file no longer exists', () => {
    expect(existsSync(resolve(frontendSrc, DELETED_LEGACY_COMPONENT))).toBe(false);
  });

  it('F-01: no live runtime source references TournamentAdminPage', () => {
    const offenders = collectRuntimeSources(frontendSrc).filter((file) =>
      readFileSync(file, 'utf8').includes('TournamentAdminPage'),
    );
    expect(offenders, `live runtime references: ${offenders.join(', ')}`).toEqual([]);
  });

  it('F-02: the three registry entries no longer point at the deleted page', () => {
    const stale = uiRegistry.filter((e) => e.componentPath === DELETED_LEGACY_COMPONENT);
    expect(stale).toEqual([]);
  });

  it('F-02: the three corrected componentPath values resolve to existing live files', () => {
    for (const key of CORRECTED_KEYS) {
      const entry = uiRegistry.find((e) => e.permissionKey === key);
      expect(entry, `missing registry entry ${key}`).toBeTruthy();
      expect(entry!.componentPath).toBe(CANONICAL_ADMIN_LIST);
      expect(
        existsSync(resolve(frontendSrc, entry!.componentPath!)),
        `componentPath for ${key} must exist: ${entry!.componentPath}`,
      ).toBe(true);
    }
  });

  it('F-02: semantic identity of the three entries is unchanged (key/module/type/label)', () => {
    const expected = {
      'admin-tournaments.view': { moduleSlug: 'tournaments', elementType: 'page', elementLabel: 'Tournaments Admin Page' },
      'tournaments.edit': { moduleSlug: 'tournaments', elementType: 'button', elementLabel: 'Edit Tournament' },
      'tournaments.delete': { moduleSlug: 'tournaments', elementType: 'button', elementLabel: 'Delete Tournament' },
    } as const;

    for (const key of CORRECTED_KEYS) {
      const entry = uiRegistry.find((e) => e.permissionKey === key)!;
      expect(entry.moduleSlug).toBe(expected[key].moduleSlug);
      expect(entry.elementType).toBe(expected[key].elementType);
      expect(entry.elementLabel).toBe(expected[key].elementLabel);
    }
  });

  it('navigation behaviour is unchanged: canonical admin tournament paths, no legacy path', () => {
    const paths: string[] = [];
    const walk = (nodes: any[]) => {
      for (const n of nodes) {
        if (n.path) paths.push(String(n.path));
        if (Array.isArray(n.children)) walk(n.children);
      }
    };
    walk(ADMIN_NAV);
    expect(paths).toContain('/admin/tournament/list');
    expect(paths).toContain('/admin/tournament/dashboard');
    expect(paths).not.toContain('/admin/tournaments');
    expect(paths).not.toContain('/admin/tournament/matches');
  });
});
