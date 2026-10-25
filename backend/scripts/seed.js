#!/usr/bin/env node
// Thin wrapper — delegates to the shell-based seed framework.
// Usage: node scripts/seed.js [--seed-file <file>] [--list] [--help]
//
// scripts/seed.sh is the single source of truth for argument handling and for
// the database-target policy (name validation, loopback-only hosts, opt-in for
// persistent targets). This wrapper deliberately performs NO argument
// interpretation and NO target validation: it forwards argv and environment
// unchanged, so there is no way for the two entry points to disagree about
// what `--help`, `--list`, `--seed-file` or an unknown option means.
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');
const seedSh = resolve(projectRoot, 'scripts/seed.sh').replace(/\\/g, '/');

const args = process.argv.slice(2);

// Supply exactly the defaults scripts/seed.sh applies via ${VAR:-default} /
// ${VAR-default}, so the shell receives the same inputs whether it is invoked
// through this wrapper or directly. An explicitly empty DB_NAME is preserved
// (the shell rejects it); only an unset value falls back to the default.
const env = {
  ...process.env,
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: process.env.DB_PORT || '3306',
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_NAME: process.env.DB_NAME ?? 'courtzon_v3',
  ALLOW_PERSISTENT_SEED: process.env.ALLOW_PERSISTENT_SEED || 'false',
};

const result = spawnSync(process.env.BASH_BIN || 'bash', [seedSh, ...args], {
  stdio: 'inherit',
  cwd: projectRoot,
  env,
});

process.exit(result.status ?? 1);
