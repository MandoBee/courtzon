#!/usr/bin/env tsx
// ============================================================================
// CourtZon — static baseline-manifest integrity CLI (V1).
//
// Read-only, database-free:
//   npx tsx backend/scripts/verify-baseline-static.ts
//   npx tsx backend/scripts/verify-baseline-static.ts --json
//   npx tsx backend/scripts/verify-baseline-static.ts --project-root <dir>
//
// This command never connects to MySQL, never runs migrations or seeds and
// never writes files. It is not a stamping authorization gate.
// ============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateStaticManifest,
  type StaticValidationInput,
  type StaticValidationReport,
} from '../src/infrastructure/migrations/baseline/static-validation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = resolve(__dirname, '..', '..');

interface CliOptions {
  projectRoot: string;
  json: boolean;
  help: boolean;
}

function usage(): string {
  return [
    'Usage: npx tsx backend/scripts/verify-baseline-static.ts [options]',
    '',
    'Options:',
    '  --project-root <dir>  Repository root (default: two levels above this script)',
    '  --json                Emit the structured report as JSON',
    '  --help                Show this help',
    '',
    'Validates only the static baseline artefacts; no database connection is made.',
    '',
  ].join('\n');
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { projectRoot: DEFAULT_PROJECT_ROOT, json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--project-root') {
      const value = argv[index + 1];
      if (!value) throw new Error('--project-root requires a directory');
      options.projectRoot = resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function loadInputs(projectRoot: string): StaticValidationInput {
  const baselinePath = join(projectRoot, 'database', 'baseline', '001_courtzon_v3.sql');
  const manifestPath = join(projectRoot, 'database', 'baseline', '001_courtzon_v3.manifest.json');
  const requirementsPath = join(projectRoot, 'database', 'baseline', 'baseline-requirements.json');
  const migrationsDir = join(projectRoot, 'database', 'migrations');

  const baselineSql = readFileSync(baselinePath, 'utf8');
  const manifestRaw = readFileSync(manifestPath, 'utf8');
  const requirementsRaw = readFileSync(requirementsPath, 'utf8');
  const migrationFiles = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, content: readFileSync(join(migrationsDir, name), 'utf8') }));

  return {
    baselineSql,
    baselinePath: relative(projectRoot, baselinePath).split(sep).join('/'),
    manifestRaw,
    requirementsRaw,
    migrationFiles,
  };
}

function printHuman(report: StaticValidationReport): void {
  const { summary, hashes } = report;
  process.stdout.write(
    `${report.ok ? 'STATIC MANIFEST VALID' : 'STATIC MANIFEST INVALID'} ` +
      `(tables=${summary.tableCount} triggers=${summary.triggerCount} pins=${summary.pinCount} ` +
      `migrations=${summary.migrationCount} findings=${summary.findings})\n`,
  );
  process.stdout.write(`baseline=${hashes.baseline ?? 'unknown'}\n`);
  process.stdout.write(`requirements=${hashes.requirements}\n`);
  process.stdout.write(`inventory=${hashes.inventory ?? 'unknown'}\n`);
  process.stdout.write(`object=${hashes.object ?? 'unknown'}\n`);
  process.stdout.write(`schema=${hashes.schema ?? 'unknown'}\n`);
  process.stdout.write(`migrations=${hashes.migrations ?? 'unknown'}\n`);
  for (const finding of report.findings) {
    process.stdout.write(`\n[${finding.code}] ${finding.path}: ${finding.message}\n`);
    process.stdout.write(`  expected: ${String(finding.expected)}\n`);
    process.stdout.write(`  actual:   ${String(finding.actual)}\n`);
  }
}

function main(argv: string[]): number {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }

  let input: StaticValidationInput;
  try {
    input = loadInputs(options.projectRoot);
  } catch (error) {
    process.stderr.write(
      `STATIC MANIFEST VALIDATION FAILED: could not read the baseline artefact set.\n` +
        `${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }

  const report = validateStaticManifest(input);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHuman(report);
  }
  return report.ok ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
