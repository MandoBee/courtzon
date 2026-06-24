#!/usr/bin/env node
// Thin wrapper — delegates to the new shell-based migration framework.
// Usage: node scripts/migrate.js [--fresh] [--status] [--rollback <file>]
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');
const migrateSh = resolve(projectRoot, 'scripts/migrate.sh');

// Fallback: if migrate.sh doesn't exist yet, use direct execution
const runner = existsSync(migrateSh) ? migrateSh : resolve(__dirname, './migrate.js');

const args = process.argv.slice(2);
const result = spawnSync('bash', [migrateSh, ...args], {
  stdio: 'inherit',
  cwd: projectRoot,
  env: {
    ...process.env,
    DB_HOST: process.env.DB_HOST || 'localhost',
    DB_PORT: process.env.DB_PORT || '3306',
    DB_USER: process.env.DB_USER || 'root',
    DB_PASSWORD: process.env.DB_PASSWORD || '',
    DB_NAME: process.env.DB_NAME || 'courtzon_v3',
  },
});

process.exit(result.status ?? 1);
