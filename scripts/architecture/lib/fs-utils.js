// File system utilities for architecture validators.
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
export const ROOT = resolve(__dirname, '..', '..', '..');

export function collectFiles(dir, predicate = () => true) {
  const result = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('node_modules') && !entry.name.startsWith('.')) {
          result.push(...collectFiles(full, predicate));
        }
      } else if (entry.isFile() && predicate(full)) {
        result.push(full);
      }
    }
  } catch { /* directory does not exist */ }
  return result;
}

export function readFile(path) {
  try { return readFileSync(path, 'utf-8'); } catch { return ''; }
}

export function shortPath(fullPath) {
  return relative(ROOT, fullPath).replace(/\\/g, '/');
}
