import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, '../src/pages/admin');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const patterns = [
  [/\(r: any\) =>/g, '(r) =>'],
  [/\(f: any\) =>/g, '(f) =>'],
  [/\(([a-zA-Z_][a-zA-Z0-9_]*): any\) =>/g, '($1) =>'],
  [/\(([a-zA-Z_][a-zA-Z0-9_]*): any\)/g, '($1)'],
  [/:\s*any\[\]/g, ': unknown[]'],
];

let changed = 0;
for (const file of walk(adminRoot)) {
  let s = fs.readFileSync(file, 'utf8');
  const orig = s;
  for (const [re, rep] of patterns) s = s.replace(re, rep);
  if (s !== orig) {
    fs.writeFileSync(file, s);
    changed++;
  }
}
console.log(`Stripped explicit any in ${changed} files`);
