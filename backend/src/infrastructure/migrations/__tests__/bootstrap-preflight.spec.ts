import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectRoot } from './migration-guard-test-helper.js';
import {
  runBootstrapPreflight,
  type BootstrapPreflightInput,
  type BootstrapPreflightReport,
} from '../baseline/bootstrap-preflight.js';
import type { StaticValidationInput } from '../baseline/static-validation.js';
import type {
  LiveMetadataOptions,
  LiveMetadataReport,
  LiveTableSnapshot,
  LiveTriggerSnapshot,
} from '../baseline/live-metadata.js';
import type { Manifest } from '../baseline/baseline-manifest.js';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

let staticInput: StaticValidationInput;
let manifest: Manifest;
let live: LiveMetadataReport;

function liveFromManifest(source: Manifest): LiveMetadataReport {
  const tables: Record<string, LiveTableSnapshot> = {};
  const triggers: Record<string, LiveTriggerSnapshot> = {};
  for (const [name, record] of Object.entries(source.schema.tables)) {
    tables[name] = {
      name,
      signature: clone(record.signature),
      objectSha256: record.objectSha256,
      exact: true,
      source: 'show_create',
    };
  }
  for (const [name, record] of Object.entries(source.schema.triggers)) {
    triggers[name] = {
      name,
      signature: clone(record.signature),
      objectSha256: record.objectSha256,
      exact: true,
      source: 'show_create',
    };
  }
  return {
    ok: true,
    complete: true,
    findings: [],
    snapshot: {
      database: {
        name: 'courtzon_v3',
        version: '8.0.36',
        versionComment: 'MySQL Community Server - GPL',
        serverFamily: 'mysql',
        lowerCaseTableNames: 0,
      },
      tables,
      triggers,
      runtimeObjects: ['migration_history'],
      views: [],
      unsupportedObjects: [],
      snapshotSha256: '0'.repeat(64),
    },
  };
}

beforeAll(() => {
  staticInput = {
    baselineSql: readFileSync(resolve(projectRoot, 'database/baseline/001_courtzon_v3.sql'), 'utf8'),
    baselinePath: 'database/baseline/001_courtzon_v3.sql',
    manifestRaw: readFileSync(resolve(projectRoot, 'database/baseline/001_courtzon_v3.manifest.json'), 'utf8'),
    requirementsRaw: readFileSync(resolve(projectRoot, 'database/baseline/baseline-requirements.json'), 'utf8'),
    migrationFiles: readdirSync(resolve(projectRoot, 'database/migrations'))
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .map((name) => ({ name, content: readFileSync(resolve(projectRoot, 'database/migrations', name), 'utf8') })),
  };
  manifest = JSON.parse(staticInput.manifestRaw) as Manifest;
  live = liveFromManifest(manifest);
});

function baseInput(): BootstrapPreflightInput {
  return {
    staticInput,
    expectDatabase: 'courtzon_v3',
    connection: {
      host: '127.0.0.1',
      port: 3307,
      user: 'root',
      password: 'test',
      database: 'courtzon_v3',
    },
    runtimeObjects: ['migration_history'],
  };
}

interface RunResult {
  report: BootstrapPreflightReport;
  calls: number;
}

async function run(
  overrides: Partial<BootstrapPreflightInput> = {},
  liveReport: LiveMetadataReport = live,
): Promise<RunResult> {
  let calls = 0;
  const report = await runBootstrapPreflight(
    { ...baseInput(), ...overrides },
    {
      readLiveSchema: async (_options: LiveMetadataOptions) => {
        calls += 1;
        return liveReport;
      },
    },
  );
  return { report, calls };
}

function codes(report: BootstrapPreflightReport): string[] {
  return report.findings.map((finding) => finding.code);
}

function expectBlocked(report: BootstrapPreflightReport, stage: string, codePart: string): void {
  expect(report.status).toBe('blocked');
  expect(report.complete).toBe(false);
  expect(report.fatal?.stage).toBe(stage);
  expect(report.fatal?.code).toContain(codePart);
}

describe('bootstrap preflight — success path', () => {
  it('runs V1, V2 complete/exact metadata and V3 Tier B successfully', async () => {
    const { report, calls } = await run();
    expect(calls).toBe(1);
    expect(report.status).toBe('ok');
    expect(report.complete).toBe(true);
    expect(report.stages.static.ok).toBe(true);
    expect(report.stages.static.tableCount).toBe(329);
    expect(report.stages.static.triggerCount).toBe(19);
    expect(report.stages.static.pinCount).toBe(76);
    expect(report.stages.live.ok).toBe(true);
    expect(report.stages.live.complete).toBe(true);
    expect(report.stages.live.tables).toBe(329);
    expect(report.stages.live.triggers).toBe(19);
    expect(report.stages.compare?.status).toBe('ok');
    expect(report.stages.compare?.complete).toBe(true);
    expect(report.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
    expect(report.findings.some((finding) => finding.code === 'COMPARE/RUNTIME_OBJECT_IGNORED')).toBe(true);
  });

  it('reports an unallowlisted runtime object as drift in Tier B', async () => {
    const withUnknownRuntime = clone(live);
    withUnknownRuntime.snapshot!.runtimeObjects.push('other_runtime');
    const { report, calls } = await run({}, withUnknownRuntime);
    expect(calls).toBe(1);
    expect(report.status).toBe('drift');
    expect(report.complete).toBe(true);
    expect(codes(report)).toContain('COMPARE/UNEXPECTED_RUNTIME_OBJECT');
  });
});

describe('bootstrap preflight — V1 gate', () => {
  it('stops before any live call when V1 static validation fails', async () => {
    const { report, calls } = await run({ staticInput: { ...staticInput, manifestRaw: '{}' } });
    expect(calls).toBe(0);
    expectBlocked(report, 'static', 'STATIC_VALIDATION_FAILED');
    expect(report.stages.compare).toBeNull();
    expect(report.findings.some((finding) => finding.stage === 'static')).toBe(true);
  });

  it('stops before any live call when static input is malformed', async () => {
    const { report, calls } = await run({ staticInput: {} as StaticValidationInput });
    expect(calls).toBe(0);
    expectBlocked(report, 'config', 'INVALID_STATIC_INPUT');
    expect(report.stages.compare).toBeNull();
  });
});

describe('bootstrap preflight — configuration gate', () => {
  it('requires a non-empty expectDatabase before live metadata', async () => {
    const { report, calls } = await run({ expectDatabase: '' });
    expect(calls).toBe(0);
    expectBlocked(report, 'config', 'INVALID_CONFIG');
    expect(report.stages.live.ok).toBe(false);
    expect(report.stages.compare).toBeNull();
  });

  it('rejects invalid runtimeObjects before live metadata', async () => {
    const { report, calls } = await run({ runtimeObjects: 'migration_history' as unknown as string[] });
    expect(calls).toBe(0);
    expectBlocked(report, 'config', 'INVALID_CONFIG');
  });

  it('refuses a non-approved port before any live reader call', async () => {
    const { report, calls } = await run({ connection: { ...baseInput().connection, port: 3306 } });
    expect(calls).toBe(0);
    expectBlocked(report, 'config', 'TARGET_NOT_APPROVED');
  });

  it('refuses a remote host before any live reader call', async () => {
    const { report, calls } = await run({ connection: { ...baseInput().connection, host: '10.0.0.5' } });
    expect(calls).toBe(0);
    expectBlocked(report, 'config', 'TARGET_NOT_APPROVED');
  });

  it('refuses courzon_v2 even when connection and --expect-database agree', async () => {
    const { report, calls } = await run({
      expectDatabase: 'courtzon_v2',
      connection: { ...baseInput().connection, database: 'courtzon_v2' },
    });
    expect(calls).toBe(0);
    expectBlocked(report, 'config', 'TARGET_NOT_APPROVED');
  });

  it('allows an explicit code-only opt-out for non-local environments', async () => {
    const { report, calls } = await run({
      targetPolicy: 'none',
      connection: { ...baseInput().connection, port: 3306 },
    });
    expect(calls).toBe(1);
    expect(report.status).toBe('ok');
  });
});

describe('bootstrap preflight — V2 gate', () => {
  it('blocks an incomplete snapshot without producing Tier B missing findings', async () => {
    const incomplete = { ...clone(live), complete: false };
    const { report, calls } = await run({}, incomplete);
    expect(calls).toBe(1);
    expectBlocked(report, 'live', 'LIVE_METADATA_INCOMPLETE');
    expect(report.stages.compare).toBeNull();
    expect(codes(report).some((code) => code.startsWith('COMPARE/MISSING_'))).toBe(false);
  });

  it('blocks a fatal V2 report', async () => {
    const fatal = { ...clone(live), ok: false, fatal: { code: 'INTERNAL_ERROR' as const, message: 'boom' } };
    const { report } = await run({}, fatal);
    expectBlocked(report, 'live', 'LIVE_METADATA_UNAVAILABLE');
    expect(report.fatal?.message).toBe('Live metadata report is not ok');
    expect(report.stages.compare).toBeNull();
  });

  it('preserves the safe TLS fatal reason and details from V2', async () => {
    const tlsFailure = {
      ...clone(live),
      ok: false,
      complete: false,
      fatal: {
        code: 'TLS_CONFIGURATION_FAILED' as const,
        message: 'TLS configuration could not be applied',
        details: 'DB_SSL_MODE=verify-full cannot be used with an IP host.',
      },
    };
    const { report, calls } = await run({}, tlsFailure);
    expect(calls).toBe(1);
    expectBlocked(report, 'live', 'LIVE_METADATA_UNAVAILABLE');
    expect(report.fatal?.message).toBe('TLS configuration could not be applied');
    expect(report.fatal?.details).toContain('cannot be used with an IP host');
  });

  it('blocks V2 error findings even when complete is true', async () => {
    const withError = clone(live);
    withError.findings.push({ code: 'METADATA_ACCESS_DENIED', severity: 'error', path: 'metadata', message: 'denied' });
    const { report } = await run({}, withError);
    expectBlocked(report, 'live', 'LIVE_METADATA_INCOMPLETE');
    expect(report.findings.some((finding) => finding.code === 'LIVE/METADATA_ACCESS_DENIED')).toBe(true);
  });

  it('blocks malformed live snapshot structures without throwing', async () => {
    const malformed = clone(live);
    (malformed.snapshot as unknown as { tables: unknown }).tables = null;
    const { report } = await run({}, malformed);
    expectBlocked(report, 'live', 'LIVE_METADATA_INVALID');
    expect(report.stages.live.tables).toBe(0);
  });

  it('blocks unsupported and inexact metadata', async () => {
    const unsupported = clone(live);
    unsupported.snapshot!.unsupportedObjects.push({ kind: 'index', name: 'x.y', reason: 'functional index' });
    const unsupportedResult = await run({}, unsupported);
    expectBlocked(unsupportedResult.report, 'live', 'LIVE_METADATA_UNSUPPORTED');

    const inexact = clone(live);
    inexact.snapshot!.tables.payment_allocations.exact = false;
    const inexactResult = await run({}, inexact);
    expectBlocked(inexactResult.report, 'live', 'LIVE_METADATA_INDETERMINATE');
  });
});

describe('bootstrap preflight — V3 gate', () => {
  it('returns drift when Tier B comparison finds a missing table', async () => {
    const missing = clone(live);
    delete missing.snapshot!.tables.ad_campaigns;
    const { report, calls } = await run({}, missing);
    expect(calls).toBe(1);
    expect(report.status).toBe('drift');
    expect(report.complete).toBe(true);
    expect(report.fatal).toBeUndefined();
    expect(report.stages.compare?.status).toBe('drift');
    expect(codes(report)).toContain('COMPARE/MISSING_TABLE');
  });

  it('returns blocked when Tier B comparison blocks runtime-object placement', async () => {
    const runtimeInSnapshot = clone(live);
    const source = runtimeInSnapshot.snapshot!.tables.ad_campaigns;
    runtimeInSnapshot.snapshot!.tables.migration_history = {
      ...clone(source),
      name: 'migration_history',
      signature: { ...clone(source.signature), name: 'migration_history' },
    };
    const { report } = await run({}, runtimeInSnapshot);
    expectBlocked(report, 'compare', 'COMPARISON_BLOCKED');
    expect(report.stages.compare?.status).toBe('blocked');
  });
});

describe('bootstrap preflight — determinism and reporting', () => {
  it('produces deterministic stage-tagged findings and summary counts', async () => {
    const missing = clone(live);
    delete missing.snapshot!.tables.ad_campaigns;
    const first = await run({}, missing);
    const second = await run({}, missing);
    expect(first.report.findings).toEqual(second.report.findings);
    expect(first.report.summary).toEqual(second.report.summary);
    expect(first.report.summary.comparisonFindings).toBeGreaterThan(0);
    expect(first.report.findings.map((finding) => `${finding.stage}|${finding.code}|${finding.path}`)).toEqual(
      [...first.report.findings.map((finding) => `${finding.stage}|${finding.code}|${finding.path}`)].sort(),
    );
  });
});
