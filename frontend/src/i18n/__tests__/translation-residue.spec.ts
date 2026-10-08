import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translationKeysRegistry } from '../translation-keys.registry';

// Step 5I-2 — F-03 guard: the two confirmed orphaned translation keys from the
// deleted legacy tournament surfaces must NOT be present in the registry and must
// NOT be referenced by any live (non-test) frontend source.
//
//   • `tournaments.admin.title`  — consumed only by the deleted TournamentAdminPage.
//   • `admin.tournament.matches` — consumed only by the deleted TournamentMatchesPage.
//
// Live neighbours are asserted to stay intact so future cleanups do not confuse
// F-03 with unrelated keys in the same registry block.

const here = dirname(fileURLToPath(import.meta.url));
// .../frontend/src
const frontendSrc = resolve(here, '../..');

const REMOVED_KEYS = ['tournaments.admin.title', 'admin.tournament.matches'] as const;
const LIVE_NEIGHBOURS = ['admin.tournament.no_tournaments', 'tournaments.list.title', 'tournaments.search'] as const;

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

describe('Step 5I-2 — orphaned tournament translation keys removed', () => {
  it('neither F-03 key is registered', () => {
    const registered = new Set(translationKeysRegistry.map((e) => e.key));
    for (const key of REMOVED_KEYS) {
      expect(registered.has(key), `key still registered: ${key}`).toBe(false);
    }
  });

  it('neither F-03 key is referenced by live runtime source', () => {
    const offenders: string[] = [];
    for (const file of collectRuntimeSources(frontendSrc)) {
      const src = readFileSync(file, 'utf8');
      for (const key of REMOVED_KEYS) {
        if (src.includes(key)) offenders.push(`${file} (${key})`);
      }
    }
    expect(offenders, `live runtime references: ${offenders.join(', ')}`).toEqual([]);
  });

  it('live neighbour keys in the same registry blocks remain registered', () => {
    const registered = new Set(translationKeysRegistry.map((e) => e.key));
    for (const key of LIVE_NEIGHBOURS) {
      expect(registered.has(key), `live neighbour key missing: ${key}`).toBe(true);
    }
  });
});