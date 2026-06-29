// Copy flag SVGs from flag-icons package into public/flags/
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'node_modules', 'flag-icons', 'flags', '4x3');
const dest = resolve(root, 'public', 'flags');

if (!existsSync(src)) {
  console.warn('[copy-flags] flag-icons not installed — skipping flag copy');
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true, force: true });
console.log('[copy-flags] flags copied to public/flags/');
