#!/usr/bin/env node
// Thin wrapper — delegates to the new shell-based seed framework.
// Usage: node scripts/seed.js [--seed-file <file>] [--list]
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');
const seedSh = resolve(projectRoot, 'scripts/seed.sh');

const args = process.argv.slice(2);
const result = spawnSync('bash', [seedSh, ...args], {
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
