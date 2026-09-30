import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// G11 Phase 4 hotfix A — workbench draw/schedule/participants pages must use a
// REGISTERED permission key for their admin mode. The backend workbench routes
// are guarded by the singular `tournament.manage`; org mode uses
// `org.tournaments.manage`. Both must exist in the UI registry so `Can` can
// ever evaluate truthy.
const here = dirname(fileURLToPath(import.meta.url));

describe('Workbench managePerm RBAC wiring (G11 Phase 4 hotfix A)', () => {
  const pages = [
    '../TournamentDrawPage.tsx',
    '../TournamentSchedulePage.tsx',
    '../TournamentParticipantsPage.tsx',
  ];

  for (const page of pages) {
    it(`${page} admin managePerm uses the registered 'tournament.manage' key`, () => {
      const src = readFileSync(resolve(here, page), 'utf8');
      const line = src.split('\n').find((l) => l.includes('managePerm = '));
      expect(line, `${page} should define managePerm`).toBeTruthy();
      expect(line).toContain("'org.tournaments.manage'");
      expect(line).toContain("'tournament.manage'");
      expect(line).not.toContain("'tournaments.manage'");
    });
  }

  it(`registry registers both 'tournament.manage' and 'org.tournaments.manage'`, () => {
    const registryPath = resolve(here, '../../../../permissions/registry.ts');
    const registry = readFileSync(registryPath, 'utf8');
    expect(registry).toContain("permissionKey: 'tournament.manage'");
    expect(registry).toContain("permissionKey: 'org.tournaments.manage'");
    // No bare plural `tournaments.manage` key exists anymore.
    expect(registry).not.toMatch(/permissionKey: 'tournaments\.manage'/);
  });
});