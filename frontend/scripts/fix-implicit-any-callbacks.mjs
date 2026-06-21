/**
 * Re-add `: any` on untyped arrow-function parameters in admin pages.
 * Safe to re-run: skips params that already include `:`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/pages/admin');
const skip = new Set(
  [
    'coupons/CouponListPage.tsx',
    'academies/AcademyAdminPage.tsx',
    'tournaments/TournamentAdminPage.tsx',
    'organisations/OrganisationListPage.tsx',
    'bookings/BookingsPage.tsx',
    'AdminDashboard.tsx',
  ].map((p) => path.join(adminRoot, p).replace(/\\/g, '/')),
);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function annotateArrowParams(source) {
  return source.replace(/\(([^()]*?)\)\s*=>/g, (full, params) => {
    if (params.includes(':')) return full;
    if (/[{[\]]/.test(params)) return full;
    const parts = params.split(',').map((p) => p.trim());
    if (parts.length === 0 || parts.some((p) => !IDENT.test(p))) return full;
    return `(${parts.map((p) => `${p}: any`).join(', ')}) =>`;
  });
}

let changed = 0;
for (const file of walk(adminRoot)) {
  if (skip.has(file.replace(/\\/g, '/'))) continue;
  const orig = fs.readFileSync(file, 'utf8');
  const next = annotateArrowParams(orig);
  if (next !== orig) {
    fs.writeFileSync(file, next);
    changed++;
  }
}
console.log(`Annotated arrow params in ${changed} files`);
