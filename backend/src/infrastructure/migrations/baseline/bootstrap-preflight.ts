// ============================================================================
// CourtZon — read-only bootstrap preflight (D1).
//
// Strict sequence:
//   1. V1 static validation (no database connection may be opened first)
//   2. parse V3 inputs
//   3. V2 complete/exact live metadata
//   4. V3 Tier B comparison
//
// This module performs no writes, no locks, no migrations, no seeds and no
// stamping. It is not referenced by the entrypoint, migrate.js or migrate.sh.
// ============================================================================

import {
  parseManifest,
  parseRequirements,
  type BaselineRequirements,
  type Manifest,
} from './baseline-manifest.js';
import {
  validateStaticManifest,
  type StaticValidationInput,
  type StaticValidationReport,
} from './static-validation.js';
import {
  readLiveSchema,
  type LiveConnectionConfig,
  type LiveMetadataOptions,
  type LiveMetadataReport,
  type MetadataConnectionFactory,
} from './live-metadata.js';
import { compareSchemas, type SchemaComparisonReport } from './schema-compare.js';

export type PreflightStage = 'static' | 'live' | 'compare' | 'config';
export type PreflightStatus = 'ok' | 'drift' | 'blocked';
export type PreflightSeverity = 'error' | 'warning' | 'info';

/**
 * The only local target the D1 bootstrap preflight may inspect. These values
 * mirror `e2e/helpers/cleanup-guard.ts` (parity is asserted by tests); they are
 * duplicated here because backend `src` cannot import the e2e helper without
 * breaking its rootDir boundary.
 */
export const APPROVED_LOCAL_TARGET = {
  hosts: ['127.0.0.1', 'localhost', '::1'] as const,
  port: 3307,
  database: 'courtzon_v3',
} as const;

/** `approved-local` is the default; `none` is an explicit code-only opt-out. */
export type BaselineTargetPolicy = 'approved-local' | 'none';

export interface ApprovedLocalTargetInput {
  host: string;
  port: number;
  database: string;
  expectDatabase: string;
}

const TARGET_DATABASE_PATTERN = /^[A-Za-z0-9_]+$/;

/**
 * Fail-closed local D1 target policy. Rejects any host/port/database other than
 * the approved local test target, including when `--expect-database` is changed
 * to a different (e.g. production) database name.
 */
export function assertApprovedLocalTarget(target: ApprovedLocalTargetInput): void {
  const host = typeof target.host === 'string' ? target.host.trim() : '';
  const database = typeof target.database === 'string' ? target.database.trim() : '';
  const expectDatabase = typeof target.expectDatabase === 'string' ? target.expectDatabase.trim() : '';
  const port = Number(target.port);

  if (!TARGET_DATABASE_PATTERN.test(database)) {
    throw new Error('D1 target refused: connection database name is invalid.');
  }
  if (!TARGET_DATABASE_PATTERN.test(expectDatabase)) {
    throw new Error('D1 target refused: --expect-database is invalid.');
  }
  if (database !== APPROVED_LOCAL_TARGET.database) {
    throw new Error(`D1 target refused: connection database must be "${APPROVED_LOCAL_TARGET.database}".`);
  }
  if (expectDatabase !== APPROVED_LOCAL_TARGET.database) {
    throw new Error(`D1 target refused: --expect-database must be "${APPROVED_LOCAL_TARGET.database}".`);
  }
  if (!(APPROVED_LOCAL_TARGET.hosts as readonly string[]).includes(host)) {
    throw new Error(`D1 target refused: host must be loopback (${APPROVED_LOCAL_TARGET.hosts.join(', ')}).`);
  }
  if (!Number.isInteger(port) || port !== APPROVED_LOCAL_TARGET.port) {
    throw new Error(`D1 target refused: port must be ${APPROVED_LOCAL_TARGET.port}.`);
  }
}

export interface PreflightFinding {
  stage: PreflightStage;
  /** Stable stage-prefixed code, e.g. STATIC/MANIFEST_STALE. */
  code: string;
  severity: PreflightSeverity;
  path: string;
  message: string;
  expected: string | null;
  actual: string | null;
}

export interface BootstrapPreflightInput {
  staticInput: StaticValidationInput;
  expectDatabase: string;
  connection: LiveConnectionConfig;
  /** Default: approved-local. `none` is an explicit code-only opt-out. */
  targetPolicy?: BaselineTargetPolicy;
  /** Default: ['migration_history']. */
  runtimeObjects?: string[];
  /** V2 connection DI seam for tests. */
  createConnection?: MetadataConnectionFactory;
}

export type LiveReader = (options: LiveMetadataOptions) => Promise<LiveMetadataReport>;

export interface BootstrapPreflightDeps {
  /** Tests inject a fake reader; production uses V2's real readLiveSchema. */
  readLiveSchema?: LiveReader;
}

export interface BootstrapPreflightReport {
  preflightVersion: 1;
  status: PreflightStatus;
  complete: boolean;
  expectDatabase: string;
  stages: {
    static: {
      ok: boolean;
      findings: number;
      schemaHead: string | null;
      tableCount: number;
      triggerCount: number;
      pinCount: number;
    };
    live: {
      ok: boolean;
      complete: boolean;
      findings: number;
      tables: number;
      triggers: number;
    };
    compare: {
      status: string;
      complete: boolean;
      findings: number;
    } | null;
  };
  findings: PreflightFinding[];
  summary: {
    staticFindings: number;
    liveFindings: number;
    comparisonFindings: number;
    errors: number;
    warnings: number;
  };
  fatal?: {
    stage: PreflightStage;
    code: string;
    message: string;
    details?: string;
  };
}

const DEFAULT_RUNTIME_OBJECTS = ['migration_history'];

interface ReportContext {
  staticReport?: StaticValidationReport;
  liveReport?: LiveMetadataReport;
  comparison?: SchemaComparisonReport;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function display(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  return String(value);
}

function sortFindings(findings: PreflightFinding[]): PreflightFinding[] {
  return [...findings].sort((a, b) => {
    const left = `${a.stage}|${a.code}|${a.path}|${a.message}`;
    const right = `${b.stage}|${b.code}|${b.path}|${b.message}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

function staticFinding(finding: { code: string; path: string; message: string; expected: unknown; actual: unknown }): PreflightFinding {
  return {
    stage: 'static',
    code: `STATIC/${finding.code}`,
    severity: 'error',
    path: finding.path,
    message: finding.message,
    expected: display(finding.expected),
    actual: display(finding.actual),
  };
}

function liveFinding(finding: {
  code: string;
  severity: PreflightSeverity;
  path: string;
  message: string;
  details?: string;
}): PreflightFinding {
  return {
    stage: 'live',
    code: `LIVE/${finding.code}`,
    severity: finding.severity,
    path: finding.path,
    message: finding.details ? `${finding.message} (${finding.details})` : finding.message,
    expected: null,
    actual: null,
  };
}

function compareFinding(finding: {
  code: string;
  severity: PreflightSeverity;
  path: string;
  message: string;
  expected: string | null;
  actual: string | null;
}): PreflightFinding {
  return {
    stage: 'compare',
    code: `COMPARE/${finding.code}`,
    severity: finding.severity,
    path: finding.path,
    message: finding.message,
    expected: finding.expected,
    actual: finding.actual,
  };
}

function fatalFinding(stage: PreflightStage, code: string, message: string, details?: string): PreflightFinding {
  return {
    stage,
    code: `${stage.toUpperCase()}/${code}`,
    severity: 'error',
    path: `${stage}.fatal`,
    message,
    expected: null,
    actual: details ?? null,
  };
}

function configFinding(code: string, message: string, details?: string): PreflightFinding {
  return {
    stage: 'config',
    code: `CONFIG/${code}`,
    severity: 'error',
    path: `config.${code}`,
    message,
    expected: null,
    actual: details ?? null,
  };
}

function buildReport(
  input: BootstrapPreflightInput,
  findings: PreflightFinding[],
  context: ReportContext,
  fatal?: BootstrapPreflightReport['fatal'],
): BootstrapPreflightReport {
  const sorted = sortFindings(findings);
  const staticFindings = sorted.filter((finding) => finding.stage === 'static').length;
  const liveFindings = sorted.filter((finding) => finding.stage === 'live').length;
  const comparisonFindings = sorted.filter((finding) => finding.stage === 'compare').length;
  const comparison = context.comparison;
  const complete = fatal === undefined && comparison?.complete === true && comparison.status !== 'blocked';
  const status: PreflightStatus = fatal !== undefined
    ? 'blocked'
    : comparison?.status === 'drift'
      ? 'drift'
      : comparison?.status === 'ok' && comparison.complete
        ? 'ok'
        : 'blocked';

  return {
    preflightVersion: 1,
    status,
    complete,
    expectDatabase: typeof input.expectDatabase === 'string' ? input.expectDatabase : '',
    stages: {
      static: {
        ok: context.staticReport?.ok === true,
        findings: staticFindings,
        schemaHead: context.staticReport?.summary.schemaHead ?? null,
        tableCount: context.staticReport?.summary.tableCount ?? 0,
        triggerCount: context.staticReport?.summary.triggerCount ?? 0,
        pinCount: context.staticReport?.summary.pinCount ?? 0,
      },
      live: {
        ok: context.liveReport?.ok === true,
        complete: context.liveReport?.complete === true,
        findings: liveFindings,
        tables:
          context.liveReport?.snapshot && isRecord(context.liveReport.snapshot.tables)
            ? Object.keys(context.liveReport.snapshot.tables).length
            : 0,
        triggers:
          context.liveReport?.snapshot && isRecord(context.liveReport.snapshot.triggers)
            ? Object.keys(context.liveReport.snapshot.triggers).length
            : 0,
      },
      compare: comparison
        ? {
            status: comparison.status,
            complete: comparison.complete,
            findings: comparisonFindings,
          }
        : null,
    },
    findings: sorted,
    summary: {
      staticFindings,
      liveFindings,
      comparisonFindings,
      errors: sorted.filter((finding) => finding.severity === 'error').length,
      warnings: sorted.filter((finding) => finding.severity === 'warning').length,
    },
    ...(fatal === undefined ? {} : { fatal }),
  };
}

function isValidStaticInput(value: unknown): value is StaticValidationInput {
  return (
    isRecord(value) &&
    typeof value.baselineSql === 'string' &&
    typeof value.baselinePath === 'string' &&
    typeof value.manifestRaw === 'string' &&
    typeof value.requirementsRaw === 'string' &&
    Array.isArray(value.migrationFiles) &&
    value.migrationFiles.every((file) => isRecord(file) && typeof file.name === 'string' && typeof file.content === 'string')
  );
}

function validateConfig(input: BootstrapPreflightInput): string | null {
  if (typeof input.expectDatabase !== 'string' || input.expectDatabase.trim().length === 0) {
    return 'expectDatabase must be a non-empty string';
  }
  if (!input.connection || typeof input.connection !== 'object') {
    return 'connection configuration is missing';
  }
  for (const field of ['host', 'user', 'database'] as const) {
    if (typeof input.connection[field] !== 'string' || input.connection[field].trim().length === 0) {
      return `connection.${field} must be a non-empty string`;
    }
  }
  if (typeof input.connection.password !== 'string') {
    return 'connection.password must be a string';
  }
  if (!Number.isInteger(input.connection.port) || input.connection.port <= 0 || input.connection.port > 65535) {
    return 'connection.port must be a valid TCP port';
  }
  if (input.connection.database !== input.expectDatabase) {
    return 'connection.database must equal expectDatabase';
  }
  if (input.runtimeObjects !== undefined && (!Array.isArray(input.runtimeObjects) || !input.runtimeObjects.every((item) => typeof item === 'string'))) {
    return 'runtimeObjects must be an array of strings';
  }
  return null;
}

function liveBlockReason(live: LiveMetadataReport): { code: string; message: string; details?: string } | null {
  if (!live) {
    return { code: 'LIVE_METADATA_UNAVAILABLE', message: 'Live metadata report is missing' };
  }
  // Preserve a safe, specific reason for TLS configuration/establishment
  // failures. Other fatal causes keep their existing generic wording.
  if (live.fatal) {
    const tlsFailure =
      live.fatal.code === 'TLS_CONFIGURATION_FAILED' || live.fatal.code === 'TLS_NOT_ESTABLISHED';
    return {
      code: 'LIVE_METADATA_UNAVAILABLE',
      message: tlsFailure ? live.fatal.message : 'Live metadata report is not ok',
      ...(tlsFailure && live.fatal.details !== undefined ? { details: live.fatal.details } : {}),
    };
  }
  if (live.ok !== true) {
    return { code: 'LIVE_METADATA_UNAVAILABLE', message: 'Live metadata report is not ok' };
  }
  if (!live.snapshot) {
    return { code: 'LIVE_METADATA_UNAVAILABLE', message: 'Live metadata snapshot is missing' };
  }
  if (!Array.isArray(live.findings)) {
    return { code: 'LIVE_METADATA_INVALID', message: 'Live metadata findings must be an array' };
  }
  if (live.complete !== true) {
    return { code: 'LIVE_METADATA_INCOMPLETE', message: 'Live metadata snapshot is incomplete' };
  }
  const errors = live.findings.filter((finding) => finding.severity === 'error');
  if (errors.length > 0) {
    return { code: 'LIVE_METADATA_INCOMPLETE', message: 'Live metadata contains blocking findings', details: `${errors.length} error finding(s)` };
  }
  const snapshot = live.snapshot;
  if (!isRecord(snapshot.tables) || !isRecord(snapshot.triggers)) {
    return { code: 'LIVE_METADATA_INVALID', message: 'Live snapshot table/trigger maps are malformed' };
  }
  if (!Array.isArray(snapshot.unsupportedObjects)) {
    return { code: 'LIVE_METADATA_INVALID', message: 'Live snapshot unsupportedObjects must be an array' };
  }
  if (!Array.isArray(snapshot.runtimeObjects) || !Array.isArray(snapshot.views)) {
    return { code: 'LIVE_METADATA_INVALID', message: 'Live snapshot runtimeObjects/views must be arrays' };
  }
  if (snapshot.unsupportedObjects.length > 0) {
    return { code: 'LIVE_METADATA_UNSUPPORTED', message: 'Live snapshot contains unsupported objects', details: `${snapshot.unsupportedObjects.length} object(s)` };
  }
  const inexactTables = Object.values(snapshot.tables).filter((table) => !isRecord(table) || table.exact !== true);
  const inexactTriggers = Object.values(snapshot.triggers).filter((trigger) => !isRecord(trigger) || trigger.exact !== true);
  if (inexactTables.length > 0 || inexactTriggers.length > 0) {
    return { code: 'LIVE_METADATA_INDETERMINATE', message: 'Live snapshot contains inexact signatures', details: `${inexactTables.length} table(s), ${inexactTriggers.length} trigger(s)` };
  }
  return null;
}

export async function runBootstrapPreflight(
  input: BootstrapPreflightInput,
  deps: BootstrapPreflightDeps = {},
): Promise<BootstrapPreflightReport> {
  const findings: PreflightFinding[] = [];
  const runtimeObjects = input?.runtimeObjects ?? DEFAULT_RUNTIME_OBJECTS;

  if (!input || !isValidStaticInput(input.staticInput)) {
    findings.push(configFinding('INVALID_STATIC_INPUT', 'Static validation input is malformed'));
    return buildReport(input ?? ({} as BootstrapPreflightInput), findings, {}, {
      stage: 'config',
      code: 'INVALID_STATIC_INPUT',
      message: 'Static validation input is malformed',
    });
  }

  let staticReport: StaticValidationReport;
  try {
    staticReport = validateStaticManifest(input.staticInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    findings.push(fatalFinding('static', 'STATIC_VALIDATION_FAILED', 'V1 static validation threw', message));
    return buildReport(input, findings, {}, { stage: 'static', code: 'STATIC_VALIDATION_FAILED', message: 'V1 static validation threw', details: message });
  }

  if (!staticReport.ok) {
    findings.push(...staticReport.findings.map(staticFinding));
    findings.push(fatalFinding('static', 'STATIC_VALIDATION_FAILED', 'V1 static validation failed'));
    return buildReport(input, findings, { staticReport }, { stage: 'static', code: 'STATIC_VALIDATION_FAILED', message: 'V1 static validation failed' });
  }

  let manifest: Manifest;
  let requirements: BaselineRequirements;
  try {
    manifest = parseManifest(input.staticInput.manifestRaw);
    requirements = parseRequirements(input.staticInput.requirementsRaw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    findings.push(configFinding('INPUT_PARSE_FAILED', 'V3 manifest/requirements parsing failed', message));
    return buildReport(input, findings, { staticReport }, { stage: 'config', code: 'INPUT_PARSE_FAILED', message: 'V3 manifest/requirements parsing failed', details: message });
  }

  const configError = validateConfig(input);
  if (configError) {
    findings.push(configFinding('INVALID_CONFIG', configError));
    return buildReport(input, findings, { staticReport }, { stage: 'config', code: 'INVALID_CONFIG', message: configError });
  }

  const targetPolicy: BaselineTargetPolicy = input.targetPolicy === 'none' ? 'none' : 'approved-local';
  if (targetPolicy === 'approved-local') {
    try {
      assertApprovedLocalTarget({
        host: input.connection.host,
        port: input.connection.port,
        database: input.connection.database,
        expectDatabase: input.expectDatabase,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      findings.push(configFinding('TARGET_NOT_APPROVED', 'D1 target is not the approved local target', message));
      return buildReport(input, findings, { staticReport }, {
        stage: 'config',
        code: 'TARGET_NOT_APPROVED',
        message: 'D1 target is not the approved local target',
        details: message,
      });
    }
  }

  const reader = deps.readLiveSchema ?? readLiveSchema;
  let liveReport: LiveMetadataReport;
  try {
    liveReport = await reader({
      staticValidation: staticReport,
      expectDatabase: input.expectDatabase,
      connection: input.connection,
      runtimeObjects,
      ...(input.createConnection === undefined ? {} : { createConnection: input.createConnection }),
      ...(targetPolicy === 'approved-local' ? { targetGuard: assertApprovedLocalTarget } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    findings.push(fatalFinding('live', 'LIVE_READER_FAILED', 'V2 live metadata reader threw', message));
    return buildReport(input, findings, { staticReport }, { stage: 'live', code: 'LIVE_READER_FAILED', message: 'V2 live metadata reader threw', details: message });
  }

  const liveFindings = Array.isArray(liveReport?.findings) ? liveReport.findings.map(liveFinding) : [];
  const liveBlock = liveBlockReason(liveReport);
  if (liveBlock) {
    findings.push(...liveFindings);
    findings.push(fatalFinding('live', liveBlock.code, liveBlock.message, liveBlock.details));
    return buildReport(input, findings, { staticReport, liveReport }, {
      stage: 'live',
      code: liveBlock.code,
      message: liveBlock.message,
      ...(liveBlock.details === undefined ? {} : { details: liveBlock.details }),
    });
  }

  let comparison: SchemaComparisonReport;
  try {
    comparison = compareSchemas({
      mode: 'tierB',
      staticValidation: staticReport,
      manifest,
      requirements,
      live: liveReport,
      runtimeObjects,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    findings.push(...liveFindings);
    findings.push(fatalFinding('compare', 'COMPARISON_INTERNAL_ERROR', 'V3 comparison threw', message));
    return buildReport(input, findings, { staticReport, liveReport }, {
      stage: 'compare',
      code: 'COMPARISON_INTERNAL_ERROR',
      message: 'V3 comparison threw',
      details: message,
    });
  }

  findings.push(...liveFindings);
  findings.push(...comparison.findings.map(compareFinding));

  if (comparison.status === 'blocked' || !comparison.complete) {
    findings.push(fatalFinding('compare', 'COMPARISON_BLOCKED', 'Tier B comparison is blocked or incomplete'));
    return buildReport(input, findings, { staticReport, liveReport, comparison }, {
      stage: 'compare',
      code: 'COMPARISON_BLOCKED',
      message: 'Tier B comparison is blocked or incomplete',
    });
  }

  return buildReport(input, findings, { staticReport, liveReport, comparison });
}
