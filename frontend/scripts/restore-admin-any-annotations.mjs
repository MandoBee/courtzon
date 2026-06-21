import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/pages/admin');
const skip = new Set([
  'coupons/CouponListPage.tsx',
  'academies/AcademyAdminPage.tsx',
  'tournaments/TournamentAdminPage.tsx',
  'organisations/OrganisationListPage.tsx',
  'bookings/BookingsPage.tsx',
  'AdminDashboard.tsx',
].map((p) => path.join(adminRoot, p).replace(/\\/g, '/')));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const replacements = [
  [/\(r\) => r\.data\.data/g, '(r: any) => r.data.data'],
  [/\(r\) => r\.data/g, '(r: any) => r.data'],
  [/\.map\(([a-zA-Z_][a-zA-Z0-9_]*)\) =>/g, '.map(($1: any) =>'],
  [/\.map\(([a-zA-Z_][a-zA-Z0-9_]*), /g, '.map(($1: any), '],
  [/\.filter\(([a-zA-Z_][a-zA-Z0-9_]*)\) =>/g, '.filter(($1: any) =>'],
  [/\.find\(([a-zA-Z_][a-zA-Z0-9_]*)\) =>/g, '.find(($1: any) =>'],
  [/const openEdit = \(([a-zA-Z_][a-zA-Z0-9_]*)\) =>/g, 'const openEdit = ($1: any) =>'],
  [/const handleEditStart = \(([a-zA-Z_][a-zA-Z0-9_]*)\) =>/g, 'const handleEditStart = ($1: any) =>'],
  [/const openEdit = async \(([a-zA-Z_][a-zA-Z0-9_]*)\) =>/g, 'const openEdit = async ($1: any) =>'],
  [/onChange=\{e => setForm\(\(f\) =>/g, 'onChange={e => setForm((f: any) =>'],
  [/mutationFn: \(([a-zA-Z_][a-zA-Z0-9_]*): Record<string, unknown>\) =>/g,
    'mutationFn: ($1: any) =>'],
  [/mutationFn: async \(([a-zA-Z_][a-zA-Z0-9_]*): Record<string, unknown>\) =>/g,
    'mutationFn: async ($1: any) =>'],
  [/mutationFn: \(\{ id, \.\.\.([a-zA-Z_][a-zA-Z0-9_]*) \}: \{ id: number \} & Record<string, unknown>\) =>/g,
    'mutationFn: ({ id, ...$1 }: any) =>'],
  [/mutationFn: \(\{ id, data \}: \{ id: number; data: Record<string, unknown> \}\)/g,
    'mutationFn: ({ id, data }: any) =>'],
];

let changed = 0;
for (const file of walk(adminRoot)) {
  if (skip.has(file.replace(/\\/g, '/'))) continue;
  let s = fs.readFileSync(file, 'utf8');
  const orig = s;
  for (const [re, rep] of replacements) s = s.replace(re, rep);
  if (s !== orig) {
    fs.writeFileSync(file, s);
    changed++;
  }
}
console.log(`Restored any annotations in ${changed} files`);
