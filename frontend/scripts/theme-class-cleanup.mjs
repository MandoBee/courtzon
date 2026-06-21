/**
 * One-off codemod: replace hardcoded Tailwind grays/greens with semantic CSS variables.
 * Run: node frontend/scripts/theme-class-cleanup.mjs
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(process.cwd(), 'frontend', 'src');
const SKIP_DIRS = new Set(['node_modules', 'design-tokens']);
const SKIP_FILES = new Set();

/** Longest-first replacements (e.g. bg-blue-500 before bg-blue-50) */
const REPLACEMENTS = [
  ['bg-[var(--color-info-bg)]0', 'bg-[var(--color-primary)]'],
  ['bg-blue-500', 'bg-[var(--color-primary)]'],
  ['bg-blue-600', 'bg-[var(--color-primary)]'],
  ['bg-green-700', 'bg-[var(--color-primary)]'],
  ['bg-green-50 border-green-200 text-green-800 dark:bg-green-900/40 dark:border-green-700 dark:text-green-300', 'bg-[var(--color-success-bg)] border-[var(--color-border)] text-[var(--color-success-text)]'],
  ['bg-green-50 dark:bg-green-900/20 border-green-200', 'bg-[var(--color-success-bg)] border-[var(--color-border)]'],
  ['bg-green-50 dark:bg-green-900/20', 'bg-[var(--color-success-bg)]'],
  ['bg-green-200 dark:bg-green-800', 'bg-[var(--color-success-bg)]'],
  ['hover:bg-green-50 border-green-300', 'hover:bg-[var(--color-success-bg)] border-[var(--color-border)]'],
  ['border-green-200 hover:opacity-80 dark:bg-green-900/30 text-[var(--color-success-text)] dark:border-green-800', 'border-[var(--color-border)] hover:opacity-80 bg-[var(--color-success-bg)] text-[var(--color-success-text)]'],
  ['hover:bg-white dark:hover:bg-gray-700', 'hover:bg-[var(--color-bg)]'],
  ['dark:hover:bg-gray-800', 'hover:bg-[var(--color-bg)]'],
  ['dark:hover:bg-gray-600', 'hover:bg-[var(--color-border)]'],
  ['dark:hover:bg-gray-700', 'hover:bg-[var(--color-border)]'],
  ['dark:bg-gray-900', 'bg-[var(--color-bg)]'],
  ['hover:bg-gray-200', 'hover:bg-[var(--color-border)]'],
  ['hover:border-gray-300', 'hover:border-[var(--color-border)]'],
  ['border-gray-300', 'border-[var(--color-border)]'],
  ['bg-gray-300', 'bg-[var(--color-border)]'],
  ['text-gray-400', 'text-[var(--color-text-muted)]'],
  ['bg-green-50 text-[var(--color-success-text)] dark:bg-green-900/20', 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]'],
  ['bg-orange-500', 'bg-[var(--color-warning)]'],
  ['text-orange-600', 'text-[var(--color-warning-text)]'],
  ['bg-green-500', 'bg-[var(--color-success)]'],
  ['bg-green-600', 'bg-[var(--color-primary)]'],
  ['hover:bg-green-700', 'hover:opacity-90'],
  ['hover:bg-green-200', 'hover:opacity-80'],
  ['border border-gray-300 border-[var(--color-border)]', 'border border-[var(--color-border)]'],
  ['border-gray-300 border-[var(--color-border)]', 'border-[var(--color-border)]'],
  ['border-2 border-dashed border-gray-300 border-[var(--color-border)]', 'border-2 border-dashed border-[var(--color-border)]'],
  ['bg-gray-200 bg-[var(--color-surface)]', 'bg-[var(--color-surface)]'],
  ['border-b border-[var(--color-border)] border-[var(--color-border)]', 'border-b border-[var(--color-border)]'],
  ['border-t border-[var(--color-border)] border-[var(--color-border)]', 'border-t border-[var(--color-border)]'],
  ['border border-[var(--color-border)] border-[var(--color-border)]', 'border border-[var(--color-border)]'],
  ['bg-white/90 bg-[var(--color-surface)]/90', 'bg-[var(--color-surface)]/90'],
  ['text-gray-300 dark:text-[var(--color-text-muted)]', 'text-[var(--color-text-muted)]'],
  ['text-gray-300', 'text-[var(--color-text-muted)]'],
  ['bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]'],
  ['bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300', 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]'],
  ['bg-blue-100 text-blue-700', 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]'],
  ['hover:bg-blue-200', 'hover:opacity-90'],
  ['hover:bg-blue-100', 'hover:bg-[var(--color-info-bg)]'],
  ['text-blue-800 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-300', 'text-[var(--color-info-text)] border-[var(--color-border)]'],
  ['text-blue-800', 'text-[var(--color-info-text)]'],
  ['text-blue-700', 'text-[var(--color-info-text)]'],
  ['text-blue-500', 'text-[var(--color-info-text)]'],
  ['dark:bg-blue-900/10', ''],
  ['dark:bg-blue-900/20', ''],
  ['dark:bg-blue-900/30', ''],
  ['dark:bg-blue-900/40', ''],
  ['dark:bg-blue-900', ''],
  ['dark:border-blue-800', 'border-[var(--color-border)]'],
  ['dark:border-blue-700', 'border-[var(--color-border)]'],
  ['dark:text-blue-400', 'text-[var(--color-info-text)]'],
  ['dark:text-blue-300', 'text-[var(--color-info-text)]'],
  ['dark:text-green-400', 'text-[var(--color-success-text)]'],
  ['dark:text-gray-200', 'text-[var(--color-text-muted)]'],
  ['bg-gray-200 text-[var(--color-text)] bg-[var(--color-surface)]', 'bg-[var(--color-surface)] text-[var(--color-text-muted)]'],
  ['bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800', 'bg-[var(--color-info-bg)] border border-[var(--color-border)]'],
  ['hover:bg-gray-50 dark:hover:bg-gray-800/50', 'hover:bg-[var(--color-bg)]'],
  ['hover:bg-gray-50 dark:hover:bg-gray-800', 'hover:bg-[var(--color-bg)]'],
  ['dark:hover:bg-gray-800/50', 'hover:bg-[var(--color-bg)]'],
  ['bg-gray-50 dark:bg-gray-800/50', 'bg-[var(--color-bg)]'],
  ['border-gray-200 dark:border-gray-700', 'border-[var(--color-border)]'],
  ['border-gray-100 dark:border-gray-800', 'border-[var(--color-border)]'],
  ['border-b border-gray-200 dark:border-gray-700', 'border-b border-[var(--color-border)]'],
  ['border-b border-gray-100 dark:border-gray-800', 'border-b border-[var(--color-border)]'],
  ['border-t border-gray-200 dark:border-gray-700', 'border-t border-[var(--color-border)]'],
  ['border-t border-gray-100 dark:border-gray-800', 'border-t border-[var(--color-border)]'],
  ['text-green-700 dark:text-green-400', 'text-[var(--color-success-text)]'],
  ['bg-green-100 dark:bg-green-900/30', 'bg-[var(--color-success-bg)]'],
  ['bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]'],
  ['bg-green-100 text-green-700', 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]'],
  ['active: \'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400\'', 'active: \'bg-[var(--color-success-bg)] text-[var(--color-success-text)]\''],
  ['pending: \'bg-yellow-100 text-yellow-700\'', 'pending: \'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]\''],
  ['pending: \'bg-[var(--color-warning-bg,#fef3c7)] text-[var(--color-warning-text,#92400e)]\'', 'pending: \'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]\''],
  ['bg-white dark:bg-gray-800', ''],
  ['dark:bg-gray-900/30', ''],
  ['dark:bg-gray-800/50', ''],
  ['dark:bg-gray-800', 'bg-[var(--color-surface)]'],
  ['dark:bg-gray-700', 'bg-[var(--color-surface)]'],
  ['dark:border-gray-700', 'border-[var(--color-border)]'],
  ['dark:border-gray-600', 'border-[var(--color-border)]'],
  ['border-gray-200', 'border-[var(--color-border)]'],
  ['border-gray-100', 'border-[var(--color-border)]'],
  ['hover:bg-gray-50', 'hover:bg-[var(--color-bg)]'],
  ['bg-gray-50/30', 'bg-[var(--color-bg)]/30'],
  ['bg-gray-50', 'bg-[var(--color-bg)]'],
  ['bg-gray-100 text-gray-600', 'bg-[var(--color-border)] text-[var(--color-text-muted)]'],
  ['bg-gray-100 text-gray-700', 'bg-[var(--color-border)] text-[var(--color-text)]'],
  ['bg-gray-100', 'bg-[var(--color-border)]'],
  ['text-gray-500', 'text-[var(--color-text-muted)]'],
  ['text-gray-600', 'text-[var(--color-text-muted)]'],
  ['text-gray-700', 'text-[var(--color-text)]'],
  ['dark:text-gray-400', 'text-[var(--color-text-muted)]'],
  ['dark:text-gray-300', 'text-[var(--color-text)]'],
  ['text-green-700', 'text-[var(--color-success-text)]'],
  ['text-green-600', 'text-[var(--color-success-text)]'],
  ['bg-green-100', 'bg-[var(--color-success-bg)]'],
  ['text-red-600', 'text-[var(--color-error-text)]'],
  ['text-red-700', 'text-[var(--color-error-text)]'],
  ['bg-red-500', 'bg-[var(--color-error)]'],
  ['bg-red-100', 'bg-[var(--color-error-bg)]'],
  ['text-yellow-700', 'text-[var(--color-warning-text)]'],
  ['bg-yellow-100', 'bg-[var(--color-warning-bg)]'],
  ['bg-blue-50', 'bg-[var(--color-info-bg)]'],
  ['border-blue-200', 'border-[var(--color-border)]'],
  ['peer-checked:bg-green-600', 'peer-checked:bg-[var(--color-primary)]'],
  ['bg-gray-200 peer-focus', 'bg-[var(--color-border)] peer-focus'],
  ['after:border-gray-300', 'after:border-[var(--color-border)]'],
  ['bg-gray-100 text-gray-500', 'bg-[var(--color-border)] text-[var(--color-text-muted)]'],
  [': \'bg-gray-100 text-gray-600\'', ': \'bg-[var(--color-border)] text-[var(--color-text-muted)]\''],
  [': \'bg-gray-100 text-gray-700\'', ': \'bg-[var(--color-border)] text-[var(--color-text)]\''],
  ['bg-gray-100 text-gray-500', 'bg-[var(--color-border)] text-[var(--color-text-muted)]'],
];

function cleanWhitespace(content) {
  return content
    .replace(/className="([^"]*)"/g, (_, cls) => {
      const cleaned = cls
        .replace(/\s{2,}/g, ' ')
        .replace(/^\s+|\s+$/g, '')
        .replace(/\s+\+/g, ' +')
        .trim();
      return cleaned ? `className="${cleaned}"` : 'className=""';
    })
    .replace(/className="\s+"/g, 'className=""')
    .replace(/className=""/g, '')
    .replace(/className=" \+/g, 'className={\' +')
    .replace(/\{\s*''\s*\}/g, '{}')
    .replace(/className=\{`([^`]*)\s{2,}/g, (m) => m);
}

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const rel = path.relative(SRC, p);
    if (SKIP_DIRS.has(name)) continue;
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/\.(tsx|ts)$/.test(name) && !rel.includes('design-tokens') && name !== 'tokens.ts' && name !== 'component-styles.ts')
      files.push(p);
  }
  return files;
}

let changed = 0;
for (const file of walk(SRC)) {
  let content = fs.readFileSync(file, 'utf8');
  const before = content;
  for (const [from, to] of REPLACEMENTS) {
    content = content.split(from).join(to);
  }
  content = cleanWhitespace(content);
  if (content !== before) {
    fs.writeFileSync(file, content);
    changed++;
    console.log('updated', path.relative(process.cwd(), file));
  }
}
console.log(`Done. ${changed} files updated.`);
