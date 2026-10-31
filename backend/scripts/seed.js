#!/usr/bin/env node
// Thin wrapper — delegates to the new shell-based seed framework.
// Usage: node scripts/seed.js [--seed-file <file>] [--list]
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve scripts/seed.sh in BOTH supported layouts:
 *   repo:      <root>/scripts/seed.sh    (wrapper: <root>/backend/scripts)
 *   container: /app/scripts/seed.sh      (wrapper: /app/scripts)
 *
 * COURTZON_PROJECT_ROOT is authoritative when set; otherwise the wrapper's
 * sibling, the app root, the repository root and the process cwd are probed.
 */
function resolveShellScript(scriptName) {
  const explicitRoot = process.env.COURTZON_PROJECT_ROOT;
  if (explicitRoot) {
    const explicitPath = resolve(explicitRoot, 'scripts', scriptName);
    if (existsSync(explicitPath)) return explicitPath;
    console.error(
      `Seed runner failed: ${scriptName} is missing at the configured ` +
        `COURTZON_PROJECT_ROOT path:\n  - ${explicitPath}\n` +
        'Unset COURTZON_PROJECT_ROOT or point it at the directory that contains scripts/.',
    );
    process.exit(1);
  }

  const candidates = [
    resolve(scriptDir, scriptName), // container: /app/scripts/seed.sh
    resolve(scriptDir, '..', 'scripts', scriptName), // container app root
    resolve(scriptDir, '..', '..', 'scripts', scriptName), // repo root
    resolve(process.cwd(), 'scripts', scriptName), // explicit cwd invocation
  ].filter((candidate, index, all) => all.indexOf(candidate) === index);

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    console.error(
      `Seed runner failed: ${scriptName} is missing. Resolved candidates:\n` +
        candidates.map((candidate) => `  - ${candidate}`).join('\n') +
        '\nSet COURTZON_PROJECT_ROOT to the directory that contains scripts/, or ' +
        'ensure the image packages scripts/seed.sh at /app/scripts/seed.sh.',
    );
    process.exit(1);
  }
  return found;
}

const seedSh = resolveShellScript('seed.sh');
// <root>/scripts/seed.sh -> <root>; used as the shell engine's cwd.
const projectRoot = resolve(dirname(seedSh), '..');

/**
 * A shell script can exist in a directory that is not a CourtZon project (a
 * stray sibling or a wrong COURTZON_PROJECT_ROOT). Reject that before spawn.
 */
function assertCourtzonProjectRoot(root, requiredPaths) {
  const missing = requiredPaths
    .map((relativePath) => resolve(root, relativePath))
    .filter((absolutePath) => !existsSync(absolutePath));

  if (missing.length === 0) return;

  console.error(
    `Seed runner failed: resolved project root is not a CourtZon project root:\n` +
      `  project root: ${root}\n` +
      missing.map((absolutePath) => `  missing: ${absolutePath}`).join('\n') +
      '\nSet COURTZON_PROJECT_ROOT to the directory that contains database/ and scripts/.',
  );
  process.exit(1);
}

assertCourtzonProjectRoot(projectRoot, ['database/seeds']);

const args = process.argv.slice(2);
const result = spawnSync('bash', [seedSh, ...args], {
  stdio: 'inherit',
  cwd: projectRoot,
  env: {
    ...process.env,
    DB_HOST: process.env.DB_HOST || 'localhost',
    DB_PORT: process.env.DB_PORT || '3307',
    DB_USER: process.env.DB_USER || 'root',
    DB_PASSWORD: process.env.DB_PASSWORD || '',
    DB_NAME: process.env.DB_NAME || 'courtzon_v3',
  },
});

process.exit(result.status ?? 1);
