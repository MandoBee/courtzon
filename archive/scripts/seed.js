#!/usr/bin/env node
// Convenience wrapper — delegates to migrate.js with --seed flag
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, [resolve(__dirname, 'migrate.js'), '--seed'], {
  stdio: 'inherit',
  cwd: resolve(__dirname, '..'),
});

child.on('exit', (code) => process.exit(code ?? 1));
