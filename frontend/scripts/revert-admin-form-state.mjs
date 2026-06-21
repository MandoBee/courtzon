import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/pages/admin');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const skip = new Set([
  'coupons/CouponListPage.tsx',
  'academies/AcademyAdminPage.tsx',
  'tournaments/TournamentAdminPage.tsx',
].map((p) => path.join(adminRoot, p).replace(/\\/g, '/')));

let changed = 0;
for (const file of walk(adminRoot)) {
  const norm = file.replace(/\\/g, '/');
  if (skip.has(norm)) continue;
  let s = fs.readFileSync(file, 'utf8');
  const orig = s;
  s = s.replace(/useState<Record<string, unknown> \| null>\(null\)/g, 'useState<any>(null)');
  s = s.replace(/useState<Record<string, unknown>>\(\{\}\)/g, 'useState<any>({})');
  s = s.replace(/useState<Record<string, unknown>>\(/g, 'useState<any>(');
  if (s !== orig) {
    fs.writeFileSync(file, s);
    changed++;
  }
}
console.log(`Reverted form useState in ${changed} files`);
