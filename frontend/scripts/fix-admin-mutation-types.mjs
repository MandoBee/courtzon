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

const replacements = [
  [/mutationFn: async \(([a-zA-Z_][a-zA-Z0-9_]*)\) =>/g, 'mutationFn: async ($1: Record<string, unknown>) =>'],
  [/mutationFn: \(([a-zA-Z_][a-zA-Z0-9_]*)\) =>/g, 'mutationFn: ($1: Record<string, unknown>) =>'],
  [/mutationFn: \(\{ id, \.\.\.([a-zA-Z_][a-zA-Z0-9_]*) \}\) =>/g,
    'mutationFn: ({ id, ...$1 }: { id: number } & Record<string, unknown>) =>'],
  [/mutationFn: \(\{ id, data \}: \{ id: number; data: any \}\)/g,
    'mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> })'],
  [/data: any/g, 'data: Record<string, unknown>'],
  [/useState<any>\(null\)/g, 'useState<Record<string, unknown> | null>(null)'],
  [/useState<any>\(\{\}\)/g, 'useState<Record<string, unknown>>({})'],
  [/useState<any>\(/g, 'useState<Record<string, unknown>>('],
];

let changed = 0;
for (const file of walk(adminRoot)) {
  let s = fs.readFileSync(file, 'utf8');
  const orig = s;
  for (const [re, rep] of replacements) s = s.replace(re, rep);
  if (s !== orig) {
    fs.writeFileSync(file, s);
    changed++;
  }
}
console.log(`Fixed mutation/state types in ${changed} files`);
