#!/usr/bin/env tsx
// ============================================================================
// CourtZon — read-only live metadata CLI (V2).
//
//   npx tsx backend/scripts/verify-baseline-live.ts --expect-database courtzon_v3
//   npx tsx backend/scripts/verify-baseline-live.ts --expect-database courtzon_v3 --json
//
// Connection credentials come from DB_HOST/DB_PORT/DB_USER/DB_PASSWORD. The
// password is never accepted as a CLI argument. V1 static validation runs
// before any connection is opened. This command never writes, locks, migrates,
// seeds, or stamps history.
// ============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStaticManifest, type StaticValidationInput, type StaticValidationReport } from '../src/infrastructure/migrations/baseline/static-validation.js';
import { readLiveSchema, type LiveMetadataReport } from '../src/infrastructure/migrations/baseline/live-metadata.js';
import { assertApprovedLocalTarget } from '../src/infrastructure/migrations/baseline/bootstrap-preflight.js';
import {
  connectionConfigFromEnvironment,
  describeConnectionConfigIssues,
  parseConnectionConfig,
} from '../src/infrastructure/migrations/baseline/connection-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = resolve(__dirname, '..', '..');

interface CliOptions {
  projectRoot: string;
  expectDatabase: string | null;
  json: boolean;
  help: boolean;
}

function usage(): string {
  return [
    'Usage: npx tsx backend/scripts/verify-baseline-live.ts --expect-database <name> [options]',
    '',
    'Required:',
    '  --expect-database <name>  Exact database name expected from SELECT DATABASE()',
    '',
    'Options:',
    '  --project-root <dir>      Repository root (default: two levels above this script)',
    '  --json                    Emit the structured report as JSON',
    '  --help                    Show this help',
    '',
    'Connection credentials (never accepted as CLI flags):',
    '  DB_HOST, DB_PORT, DB_USER, DB_PASSWORD',
    '',
    'Optional TLS (validated before any connection):',
    '  DB_SSL_MODE=disabled|verify-ca|verify-full',
    '  DB_SSL_CA=<absolute path to a PEM CA bundle> (required when enabled)',
    '  DB_SSL_SERVER_NAME=<certificate hostname/IP> (verify-full; defaults to DB_HOST)',
    '',
    'Target policy (fail-closed, no override):',
    '  Only courtzon_v3 on a loopback host at port 3307 is accepted.',
    '',
    'V1 static validation is executed before any database connection is opened.',
    'This command is read-only and is not a migration-stamping authorization.',
    '',
  ].join('\n');
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { projectRoot: DEFAULT_PROJECT_ROOT, expectDatabase: null, json: false, help: false };
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
    if (arg === '--expect-database') {
      const value = argv[index + 1];
      if (!value) throw new Error('--expect-database requires a database name');
      options.expectDatabase = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--password')) {
      throw new Error('Passwords must not be supplied on the command line; use DB_PASSWORD.');
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function loadStaticInput(projectRoot: string): StaticValidationInput {
  const baselinePath = join(projectRoot, 'database', 'baseline', '001_courtzon_v3.sql');
  const manifestPath = join(projectRoot, 'database', 'baseline', '001_courtzon_v3.manifest.json');
  const requirementsPath = join(projectRoot, 'database', 'baseline', 'baseline-requirements.json');
  const migrationsDir = join(projectRoot, 'database', 'migrations');

  return {
    baselineSql: readFileSync(baselinePath, 'utf8'),
    baselinePath: relative(projectRoot, baselinePath).split(sep).join('/'),
    manifestRaw: readFileSync(manifestPath, 'utf8'),
    requirementsRaw: readFileSync(requirementsPath, 'utf8'),
    migrationFiles: readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .map((name) => ({ name, content: readFileSync(join(migrationsDir, name), 'utf8') })),
  };
}

function printStaticReport(report: StaticValidationReport): void {
  process.stderr.write(
    `V1 static validation ${report.ok ? 'passed' : 'FAILED'} ` +
      `(tables=${report.summary.tableCount} triggers=${report.summary.triggerCount} pins=${report.summary.pinCount} findings=${report.summary.findings}).\n`,
  );
  if (!report.ok) {
    for (const finding of report.findings) {
      process.stderr.write(`  [${finding.code}] ${finding.path}: ${finding.message}\n`);
    }
  }
}

function printLiveReport(report: LiveMetadataReport): void {
  if (report.fatal) {
    process.stderr.write(`LIVE METADATA FAILED [${report.fatal.code}]: ${report.fatal.message}\n`);
    if (report.fatal.details) process.stderr.write(`  details: ${report.fatal.details}\n`);
  } else {
    const snapshot = report.snapshot;
    process.stdout.write(
      `LIVE METADATA ${report.complete ? 'COMPLETE' : 'INCOMPLETE'} ` +
        `(tables=${snapshot ? Object.keys(snapshot.tables).length : 0} ` +
        `triggers=${snapshot ? Object.keys(snapshot.triggers).length : 0} ` +
        `runtime=${snapshot ? snapshot.runtimeObjects.length : 0} ` +
        `views=${snapshot ? snapshot.views.length : 0} ` +
        `findings=${report.findings.length})\n`,
    );
    if (snapshot) process.stdout.write(`snapshot=${snapshot.snapshotSha256}\n`);
  }
  for (const finding of report.findings) {
    process.stdout.write(`[${finding.code}] ${finding.severity} ${finding.path}: ${finding.message}\n`);
    if (finding.details) process.stdout.write(`  details: ${finding.details}\n`);
  }
}

async function main(argv: string[]): Promise<number> {
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
  if (!options.expectDatabase) {
    process.stderr.write(`--expect-database is required.\n\n${usage()}`);
    return 2;
  }

  const parsedConnection = parseConnectionConfig({
    ...connectionConfigFromEnvironment(process.env),
    database: options.expectDatabase,
  });
  if (!parsedConnection.ok) {
    process.stderr.write(`${describeConnectionConfigIssues(parsedConnection.issues)}\n`);
    return 2;
  }

  try {
    assertApprovedLocalTarget({
      host: parsedConnection.config.host,
      port: parsedConnection.config.port,
      database: parsedConnection.config.database,
      expectDatabase: parsedConnection.config.database,
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  let staticInput: StaticValidationInput;
  try {
    staticInput = loadStaticInput(options.projectRoot);
  } catch (error) {
    process.stderr.write(`Could not read the V1 baseline artefact set: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const staticReport = validateStaticManifest(staticInput);
  printStaticReport(staticReport);
  if (!staticReport.ok) {
    return 1;
  }

  const report = await readLiveSchema({
    staticValidation: staticReport,
    expectDatabase: parsedConnection.config.database,
    connection: {
      host: parsedConnection.config.host,
      port: parsedConnection.config.port,
      user: parsedConnection.config.user,
      password: parsedConnection.config.password,
      database: parsedConnection.config.database,
      tls: parsedConnection.config.tls,
    },
    targetGuard: assertApprovedLocalTarget,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printLiveReport(report);
  }
  return report.ok && report.complete ? 0 : 1;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`LIVE METADATA FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
