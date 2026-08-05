/**
 * Build-time script: generates a JSON artifact from the frontend translation registry
 * so the backend can sync keys without needing the frontend source at runtime.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const registryPath = resolve(__dirname, '../../frontend/src/i18n/translation-keys.registry.ts');
const outDir = resolve(__dirname, '../generated');
const outPath = resolve(outDir, 'translation-keys.json');

const content = readFileSync(registryPath, 'utf8');
const entryRe =
  /\{\s*key:\s*['"]([^'"]+)['"],\s*defaultValue:\s*(['"])((?:\\.|(?!\2).)*)\2,\s*moduleSlug:\s*['"]([^'"]+)['"],\s*elementType:\s*['"]([^'"]+)['"],\s*elementLabel:\s*(['"])((?:\\.|(?!\6).)*)\6(?:,\s*componentPath:\s*['"]([^'"]*)['"])?\s*\}/g;

const unescape = (s) => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');

const entries = [];
let match;
while ((match = entryRe.exec(content)) !== null) {
  entries.push({
    key: match[1],
    defaultValue: unescape(match[3]),
    moduleSlug: match[4],
    elementType: match[5],
    elementLabel: unescape(match[7]),
    componentPath: match[8] || null,
  });
}

if (!entries.length) {
  console.error(`No entries parsed from ${registryPath}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(entries), 'utf8');
console.log(`Generated ${outPath} with ${entries.length} translation keys`);
