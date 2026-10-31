#!/usr/bin/env tsx
// ============================================================================
// CourtZon — baseline manifest CLI (the ONLY I/O boundary for the manifest).
//
//   tsx backend/scripts/baseline-manifest.ts --check   # read-only drift gate
//   tsx backend/scripts/baseline-manifest.ts --write   # atomic regeneration
//
// `--check` never writes and never opens a database connection. `--write`
// writes `database/baseline/001_courtzon_v3.manifest.json` via a temp file in
// the same directory + rename, so a partial file can never be committed.
//
// This script deliberately does NOT import `backend/scripts/migrate.js`, any
// database driver, or any environment loader. It is a pure static analyser.
// ============================================================================

import { readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildManifest,
  buildMigrationIndex,
  diffManifests,
  parseManifest,
  parseRequirements,
  type MigrationInputFile,
} from '../src/infrastructure/migrations/baseline/baseline-manifest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const BASELINE_PATH = join(REPO_ROOT, 'database', 'baseline', '001_courtzon_v3.sql');
const REQUIREMENTS_PATH = join(REPO_ROOT, 'database', 'baseline', 'baseline-requirements.json');
const MANIFEST_PATH = join(REPO_ROOT, 'database', 'baseline', '001_courtzon_v3.manifest.json');
const MIGRATIONS_DIR = join(REPO_ROOT, 'database', 'migrations');

const BASELINE_RELATIVE = 'database/baseline/001_courtzon_v3.sql';
const MIGRATIONS_RELATIVE = 'database/migrations';

function usage(): void {
  process.stdout.write(
    [
      'Usage: tsx backend/scripts/baseline-manifest.ts <--check|--write>',
      '',
      '  --check   Verify the committed manifest against the baseline + migrations',
      '            (read-only; exits 1 on drift).',
      '  --write   Regenerate database/baseline/001_courtzon_v3.manifest.json',
      '            atomically.',
      '',
    ].join('\n'),
  );
}

export interface LoadedInputs {
  baselineSql: string;
  requirementsRaw: string;
  migrationFiles: MigrationInputFile[];
  migrationContents: Record<string, string>;
}

function loadInputs(): LoadedInputs {
  const baselineSql = readFileSync(BASELINE_PATH, 'utf8');
  const requirementsRaw = readFileSync(REQUIREMENTS_PATH, 'utf8');
  const names = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  if (names.length === 0) {
    throw new Error(`no migration files found in ${MIGRATIONS_DIR}`);
  }
  const migrationContents: Record<string, string> = {};
  const migrationFiles: MigrationInputFile[] = [];
  for (const name of names) {
    const content = readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
    migrationContents[name] = content;
    migrationFiles.push({ name, content });
  }
  return { baselineSql, requirementsRaw, migrationFiles, migrationContents };
}

export function buildFromDisk(): { serialized: string; summary: string } {
  const inputs = loadInputs();
  const requirements = parseRequirements(inputs.requirementsRaw);
  const migrations = buildMigrationIndex(inputs.migrationFiles, MIGRATIONS_RELATIVE);
  const { manifest, serialized } = buildManifest({
    baselineSql: inputs.baselineSql,
    baselinePath: BASELINE_RELATIVE,
    requirements,
    requirementsRaw: inputs.requirementsRaw,
    migrations,
    migrationContents: inputs.migrationContents,
  });

  const summary = [
    `schemaHead=${manifest.schema.schemaHead}`,
    `tables=${manifest.schema.tableCount}`,
    `columns=${manifest.schema.columnCount}`,
    `indexes=${manifest.schema.indexCount}`,
    `foreignKeys=${manifest.schema.foreignKeyCount}`,
    `triggers=${manifest.schema.triggerCount}`,
    `migrations=${manifest.migrations.count}`,
    `pins=${manifest.requirements.pinCount}`,
    `baselineSha256=${manifest.baseline.sha256}`,
    `schemaSha256=${manifest.schema.schemaSha256}`,
  ].join(' ');

  return { serialized, summary };
}

function writeAtomically(target: string, content: string): void {
  const temp = `${target}.tmp-${process.pid}`;
  try {
    writeFileSync(temp, content, 'utf8');
    renameSync(temp, target);
  } catch (err) {
    try {
      unlinkSync(temp);
    } catch {
      /* best effort */
    }
    throw err;
  }
}

function runCheck(): number {
  const { serialized, summary } = buildFromDisk();
  let committedRaw: string;
  try {
    committedRaw = readFileSync(MANIFEST_PATH, 'utf8');
  } catch {
    process.stderr.write(
      `baseline-manifest: committed manifest is missing at ${MANIFEST_PATH}\n` +
        'Run with --write to generate it.\n',
    );
    return 1;
  }

  const committed = parseManifest(committedRaw);
  const regenerated = parseManifest(serialized);

  const differences = diffManifests(committed, regenerated);
  if (differences.length > 0) {
    process.stderr.write(
      `baseline-manifest: DRIFT detected (${differences.length} difference(s))\n`,
    );
    for (const difference of differences.slice(0, 25)) {
      process.stderr.write(
        `  ${difference.path}\n    committed: ${difference.expected}\n    regenerated: ${difference.actual}\n`,
      );
    }
    if (differences.length > 25) {
      process.stderr.write(`  ... ${differences.length - 25} more\n`);
    }
    process.stderr.write('Run with --write to regenerate the manifest.\n');
    return 1;
  }

  process.stdout.write(`baseline-manifest: OK ${summary}\n`);
  return 0;
}

function runWrite(): number {
  const { serialized, summary } = buildFromDisk();
  writeAtomically(MANIFEST_PATH, serialized);
  process.stdout.write(`baseline-manifest: WROTE ${MANIFEST_PATH}\n`);
  process.stdout.write(`baseline-manifest: ${summary}\n`);
  return 0;
}

function main(argv: string[]): number {
  const check = argv.includes('--check');
  const write = argv.includes('--write');
  if (check === write) {
    usage();
    return 2;
  }
  try {
    return check ? runCheck() : runWrite();
  } catch (err) {
    process.stderr.write(`baseline-manifest: FAILED — ${(err as Error).message}\n`);
    return 2;
  }
}

process.exitCode = main(process.argv.slice(2));
