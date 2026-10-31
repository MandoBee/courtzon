#!/usr/bin/env node
/**
 * P3-07 — deterministic ESLint baseline gate.
 *
 * ESLint 10's bulk-suppression file only covers errors (3,295 of the 3,377
 * findings here); the 82 warnings and 3 no-rule warnings would remain ungated.
 * This script therefore records the exact configured lint result per file, rule
 * and severity, plus the full linted-file inventory and the count of
 * eslint-disable directives per file.
 *
 * Modes:
 *   node scripts/lint-baseline.mjs            # check (CI gate)
 *   node scripts/lint-baseline.mjs --update   # regenerate the committed baseline
 *
 * The check fails if:
 *   - a new violation appears (new file/rule/severity key or a higher count);
 *   - an existing finding disappears (fixed vs. coverage hidden/suppressed —
 *     either way the baseline must be updated deliberately);
 *   - a linted file is removed/ignored (coverage loss);
 *   - an eslint-disable directive is added or removed (no new suppressions);
 *   - a rule severity changes (error <-> warning).
 *
 * New files with zero findings are allowed. The gate never disables or weakens
 * ESLint rules; it only snapshots what the existing `eslint .` configuration
 * reports.
 */
import { ESLint } from 'eslint';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = path.join(ROOT, 'lint-baseline.json');
const UPDATE = process.argv.includes('--update');
const MAX_DETAIL_LINES = 40;

const toPosix = (value) => value.split(path.sep).join('/');

function eslintVersion() {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, 'node_modules/eslint/package.json'), 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

function listConfigFiles() {
  const files = ['eslint.config.js'];
  try {
    for (const name of readdirSync(path.join(ROOT, 'eslint-rules')).sort()) {
      if (name.endsWith('.mjs') || name.endsWith('.js')) files.push(`eslint-rules/${name}`);
    }
  } catch {
    /* no custom rules directory */
  }
  return files;
}

function configHash() {
  const hash = createHash('sha256');
  for (const rel of listConfigFiles()) {
    hash.update(rel);
    hash.update('\0');
    try {
      hash.update(readFileSync(path.join(ROOT, rel)));
    } catch {
      hash.update('<missing>');
    }
    hash.update('\0');
  }
  return hash.digest('hex');
}

/** Count eslint-disable / -next-line / -line directives in a TS/TSX source file. */
function countDirectives(absPath) {
  if (!/\.(ts|tsx)$/.test(absPath)) return 0;
  try {
    const source = readFileSync(absPath, 'utf8');
    return (source.match(/eslint-disable(?:-next-line|-line)?/g) || []).length;
  } catch {
    return 0;
  }
}

function sortedObject(entries) {
  return Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b)));
}

async function collect() {
  const eslint = new ESLint({ cwd: ROOT });
  const results = await eslint.lintFiles(['.']);

  const files = [];
  const findings = new Map(); // file -> Map(rule:severity -> count)
  const directives = new Map(); // file -> count
  let errors = 0;
  let warnings = 0;

  for (const result of results) {
    const rel = toPosix(path.relative(ROOT, result.filePath));
    files.push(rel);

    const perFile = new Map();
    for (const message of result.messages) {
      const rule = message.ruleId ?? '<no-rule>';
      const severity = message.severity === 2 ? 'error' : 'warning';
      if (severity === 'error') errors += 1;
      else warnings += 1;
      const key = `${rule}:${severity}`;
      perFile.set(key, (perFile.get(key) || 0) + 1);
    }
    if (perFile.size > 0) findings.set(rel, perFile);

    const directiveCount = countDirectives(result.filePath);
    if (directiveCount > 0) directives.set(rel, directiveCount);
  }

  files.sort();

  const findingsObject = {};
  for (const file of [...findings.keys()].sort()) {
    findingsObject[file] = sortedObject(findings.get(file).entries());
  }
  const directivesObject = {};
  for (const file of [...directives.keys()].sort()) {
    directivesObject[file] = directives.get(file);
  }

  return {
    files,
    findings: findingsObject,
    directives: directivesObject,
    errors,
    warnings,
    findingCount: errors + warnings,
  };
}

function flattenFindings(findings) {
  const flat = new Map();
  for (const [file, rules] of Object.entries(findings)) {
    for (const [rule, count] of Object.entries(rules)) {
      flat.set(`${file}\u0000${rule}`, count);
    }
  }
  return flat;
}

function printList(title, lines) {
  if (lines.length === 0) return;
  console.error(`\n${title} (${lines.length})`);
  for (const line of lines.slice(0, MAX_DETAIL_LINES)) console.error(`  ${line}`);
  if (lines.length > MAX_DETAIL_LINES) {
    console.error(`  … and ${lines.length - MAX_DETAIL_LINES} more`);
  }
}

async function main() {
  const current = await collect();
  const eslintVer = eslintVersion();
  const configSha256 = configHash();

  if (UPDATE) {
    const baseline = {
      schemaVersion: 1,
      generatedBy: 'frontend/scripts/lint-baseline.mjs',
      command: 'eslint .',
      eslintVersion: eslintVer,
      configSha256,
      fileCount: current.files.length,
      findingCount: current.findingCount,
      errorCount: current.errors,
      warningCount: current.warnings,
      files: current.files,
      findings: current.findings,
      directives: current.directives,
    };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
    console.log(
      `Lint baseline written: ${baseline.fileCount} files, ${baseline.findingCount} findings ` +
        `(${baseline.errorCount} errors, ${baseline.warningCount} warnings), ` +
        `${Object.keys(baseline.directives).length} files with suppression directives.`,
    );
    return;
  }

  let baseline;
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch (error) {
    console.error(`Missing or unreadable ${path.relative(ROOT, BASELINE_PATH)}: ${error.message}`);
    console.error('Run `npm run lint:baseline` to create it deliberately.');
    process.exit(1);
  }

  const baseFiles = new Set(baseline.files || []);
  const curFiles = new Set(current.files);
  const removedFiles = [...baseFiles].filter((file) => !curFiles.has(file)).sort();

  const baseFindings = flattenFindings(baseline.findings || {});
  const curFindings = flattenFindings(current.findings);
  const keys = new Set([...baseFindings.keys(), ...curFindings.keys()]);
  const newViolations = [];
  const increased = [];
  const decreased = [];

  for (const key of [...keys].sort()) {
    const [file, rule] = key.split('\u0000');
    const before = baseFindings.get(key) || 0;
    const after = curFindings.get(key) || 0;
    if (after === before) continue;
    if (before === 0) {
      newViolations.push(`${file} → ${rule} (+${after})`);
      continue;
    }
    if (removedFiles.includes(file) && after === 0) continue; // reported as removed file
    if (after > before) increased.push(`${file} → ${rule}: ${before} → ${after}`);
    else decreased.push(`${file} → ${rule}: ${before} → ${after} (update baseline deliberately)`);
  }

  const baseDirectives = baseline.directives || {};
  const directiveKeys = new Set([...Object.keys(baseDirectives), ...Object.keys(current.directives)]);
  const addedDirectives = [];
  const removedDirectives = [];
  for (const file of [...directiveKeys].sort()) {
    if (removedFiles.includes(file)) continue;
    const before = baseDirectives[file] || 0;
    const after = current.directives[file] || 0;
    if (after > before) addedDirectives.push(`${file}: ${before} → ${after}`);
    else if (after < before) removedDirectives.push(`${file}: ${before} → ${after} (update baseline deliberately)`);
  }

  const failures =
    removedFiles.length +
    newViolations.length +
    increased.length +
    decreased.length +
    addedDirectives.length +
    removedDirectives.length;

  console.log(
    `Lint baseline check: ${current.files.length} files, ${current.findingCount} findings ` +
      `(${current.errors} errors, ${current.warnings} warnings).`,
  );
  if (baseline.eslintVersion && baseline.eslintVersion !== eslintVer) {
    console.log(`Note: ESLint ${baseline.eslintVersion} → ${eslintVer} (findings still compared).`);
  }
  if (baseline.configSha256 && baseline.configSha256 !== configSha256) {
    console.log('Note: ESLint config changed (findings/coverage still compared).');
  }

  if (failures > 0) {
    printList('Removed or no-longer-linted baseline files', removedFiles);
    printList('New violations', newViolations);
    printList('Increased violations', increased);
    printList('Disappeared violations (fixed or suppressed)', decreased);
    printList('New eslint-disable directives', addedDirectives);
    printList('Removed eslint-disable directives', removedDirectives);
    console.error(
      `\nFAIL: ${failures} baseline difference(s). ` +
        'Fix the regression, or update the baseline deliberately with `npm run lint:baseline`.',
    );
    process.exit(1);
  }

  console.log('PASS: ESLint findings and coverage match the committed baseline.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
