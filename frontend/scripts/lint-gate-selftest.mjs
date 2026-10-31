#!/usr/bin/env node
/**
 * P3-07 — self-test for the ESLint baseline gate.
 *
 * Proves that scripts/lint-baseline.mjs:
 *   1. passes on the unchanged baseline;
 *   2. fails on a new violation in an existing file;
 *   3. fails on a new file that contains a violation;
 *   4. passes for a new file with no violations (precision);
 *   5. fails when a baseline file is no longer linted (coverage loss);
 *   6. fails when an eslint-disable directive is added to hide a new violation.
 *
 * Every temporary change is reverted in a finally block. No DB/Docker/network.
 * Run with: npm run lint:gate:selftest
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE = path.join(ROOT, 'scripts', 'lint-baseline.mjs');
const BASELINE = JSON.parse(readFileSync(path.join(ROOT, 'lint-baseline.json'), 'utf8'));
const PROBE_FILE = path.join(ROOT, 'src', '__lint_gate_probe__.ts');
const CLEAN_FILE = path.join(ROOT, 'src', '__lint_gate_clean__.ts');
const TARGET = pickTarget();

let failures = 0;

function pickTarget() {
  const entries = Object.entries(BASELINE.findings || {});
  const withoutDirective = (file) => !(BASELINE.directives || {})[file];
  const withAny = entries
    .filter(([file, rules]) => rules['@typescript-eslint/no-explicit-any:error'] > 0)
    .filter(([file]) => withoutDirective(file))
    .map(([file]) => file);
  const preferred = withAny.find((file) => file.includes('.test.')) || withAny[0];
  if (preferred) return preferred;
  // Fallback for a future tree where no-explicit-any is fully cleaned: any file
  // with a finding still works (the injected probe becomes a new violation).
  const fallback = entries
    .filter(([file]) => withoutDirective(file))
    .map(([file]) => file)
    .sort()[0];
  if (!fallback) throw new Error('No baseline file with a finding and no directive was found.');
  return fallback;
}

function runGate() {
  const result = spawnSync(process.execPath, [GATE], { cwd: ROOT, encoding: 'utf8' });
  return {
    status: result.status,
    output: `${result.stdout || ''}\n${result.stderr || ''}`,
  };
}

function record(name, passed, detail, exitCode) {
  if (passed) {
    console.log(`PASS  ${name} (exit ${exitCode})`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name} (exit ${exitCode})`);
    const lines = detail.trim().split(/\r?\n/).slice(-12).join('\n');
    console.error(lines);
  }
}

function expectFailure(name, fragments) {
  const { status, output } = runGate();
  const expected = Array.isArray(fragments) ? fragments : [fragments];
  record(name, status === 1 && expected.some((fragment) => output.includes(fragment)), output, status);
}

function expectPass(name) {
  const { status, output } = runGate();
  record(name, status === 0 && output.includes('PASS: ESLint findings and coverage match'), output, status);
}

const original = readFileSync(path.join(ROOT, TARGET), 'utf8');

try {
  // 1. Unchanged baseline.
  expectPass('unchanged baseline passes');

  // 2. New violation in an existing file (same rule already has a baseline count).
  writeFileSync(path.join(ROOT, TARGET), `${original}\nconst __lintGateProbe: any = 1;\n`, 'utf8');
  expectFailure('new violation in an existing file fails', ['Increased violations', 'New violations']);
  writeFileSync(path.join(ROOT, TARGET), original, 'utf8');

  // 3. Violation in a new file.
  writeFileSync(PROBE_FILE, 'export const __lintGateProbe: any = 1;\n', 'utf8');
  expectFailure('violation in a new file fails', 'New violations');
  rmSync(PROBE_FILE, { force: true });

  // 4. New clean file is allowed (no false positive on new files).
  writeFileSync(CLEAN_FILE, 'export const __lintGateClean = 1;\n', 'utf8');
  expectPass('new file with no violations passes');
  rmSync(CLEAN_FILE, { force: true });

  // 5. Coverage loss: a baseline file is no longer linted.
  const hidden = `${path.join(ROOT, TARGET)}.lint-gate-selftest.bak`;
  renameSync(path.join(ROOT, TARGET), hidden);
  expectFailure('removed/ignored baseline file fails', 'Removed or no-longer-linted baseline files');
  renameSync(hidden, path.join(ROOT, TARGET));

  // 6. A new eslint-disable directive hides a new violation but is still rejected.
  writeFileSync(
    path.join(ROOT, TARGET),
    `${original}\n// eslint-disable-next-line @typescript-eslint/no-explicit-any\nconst __lintGateSuppressed: any = 1;\n`,
    'utf8',
  );
  expectFailure('new eslint-disable directive fails', 'New eslint-disable directives');
} finally {
  writeFileSync(path.join(ROOT, TARGET), original, 'utf8');
  rmSync(PROBE_FILE, { force: true });
  rmSync(CLEAN_FILE, { force: true });
  if (existsSync(`${path.join(ROOT, TARGET)}.lint-gate-selftest.bak`)) {
    renameSync(`${path.join(ROOT, TARGET)}.lint-gate-selftest.bak`, path.join(ROOT, TARGET));
  }
}

if (failures > 0) {
  console.error(`\nSELFTEST FAILED: ${failures} scenario(s).`);
  process.exit(1);
}
console.log('\nSELFTEST PASSED: all six gate scenarios behaved as expected.');
