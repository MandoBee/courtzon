import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '../src/pages/admin');
const utilsRoot = path.resolve(__dirname, '../src/utils/errors.ts');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function errImport(file) {
  let rel = path.relative(path.dirname(file), utilsRoot).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel.replace(/\.ts$/, '');
}

let changed = 0;
for (const file of walk(adminRoot)) {
  let s = fs.readFileSync(file, 'utf8');
  const orig = s;
  s = s.replace(/\(err as any\)\.message/g, 'getErrorMessage(err)');
  s = s.replace(/\(([a-zA-Z0-9_.]+) as any\)\?\.message/g, 'getErrorMessage($1)');
  s = s.replace(/\(err: any\)/g, '(err: unknown)');
  if (s === orig) continue;
  if (!/import\s*\{[^}]*getErrorMessage/.test(s)) {
    const imp = `import { getErrorMessage } from '${errImport(file)}';\n`;
    const idx = s.indexOf('\n', s.indexOf('import '));
    if (idx !== -1) s = s.slice(0, idx + 1) + imp + s.slice(idx + 1);
    else s = imp + s;
  }
  fs.writeFileSync(file, s);
  changed++;
}
console.log(`Updated ${changed} admin files`);
