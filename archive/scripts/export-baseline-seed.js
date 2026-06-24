#!/usr/bin/env node
/** Convenience wrapper — exports current DB to database/seed/003_baseline_snapshot.sql */
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, [resolve(__dirname, 'export-baseline-seed.mjs'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: resolve(__dirname, '..'),
});

child.on('exit', (code) => process.exit(code ?? 1));
