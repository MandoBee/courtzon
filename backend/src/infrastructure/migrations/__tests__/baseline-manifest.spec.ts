// ============================================================================
// CourtZon — Baseline manifest static tests (no database, no Docker, no I/O
// outside the repository's committed SQL/JSON artefacts).
//
// Two layers:
//   1. COMMITTED ARTEFACT checks — the manifest must match the real baseline
//      and migration chain, with exact audited counts and semantic pins.
//   2. SELF-TESTS — in-memory fixtures prove that every safety property the
//      generator claims actually fails closed (missing tables, renamed or
//      altered indexes, changed FK actions, duplicate tables, malformed
//      manifests, changed migrations, unsupported SQL).
// ============================================================================
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { projectRoot } from './migration-guard-test-helper.js';
import {
  BaselineParseError,
  hasSchemaDdl,
  parseSql,
  type ParsedSql,
} from '../baseline/parse-baseline.js';
import {
  assertManifestShape,
  buildManifest,
  buildMigrationIndex,
  canonicalJson,
  classifyMigration,
  contentSha256,
  diffManifests,
  parseManifest,
  parseRequirements,
  toLf,
  type Manifest,
  type MigrationInputFile,
} from '../baseline/baseline-manifest.js';

const BASELINE_PATH = resolve(projectRoot, 'database/baseline/001_courtzon_v3.sql');
const REQUIREMENTS_PATH = resolve(projectRoot, 'database/baseline/baseline-requirements.json');
const MANIFEST_PATH = resolve(projectRoot, 'database/baseline/001_courtzon_v3.manifest.json');
const MIGRATIONS_DIR = join(projectRoot, 'database', 'migrations');

interface RealArtefacts {
  baselineSql: string;
  requirementsRaw: string;
  manifestRaw: string;
  manifest: Manifest;
  parsed: ParsedSql;
  migrationFiles: MigrationInputFile[];
  migrationContents: Record<string, string>;
  regeneratedSerialized: string;
}

let real: RealArtefacts;

beforeAll(() => {
  const baselineSql = readFileSync(BASELINE_PATH, 'utf8');
  const requirementsRaw = readFileSync(REQUIREMENTS_PATH, 'utf8');
  const manifestRaw = readFileSync(MANIFEST_PATH, 'utf8');
  const names = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
  const migrationContents: Record<string, string> = {};
  const migrationFiles: MigrationInputFile[] = names.map((name) => {
    const content = readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
    migrationContents[name] = content;
    return { name, content };
  });
  const migrations = buildMigrationIndex(migrationFiles, 'database/migrations');
  const requirements = parseRequirements(requirementsRaw);
  const { manifest, serialized } = buildManifest({
    baselineSql,
    baselinePath: 'database/baseline/001_courtzon_v3.sql',
    requirements,
    requirementsRaw,
    migrations,
    migrationContents,
  });
  real = {
    baselineSql,
    requirementsRaw,
    manifestRaw,
    manifest,
    parsed: parseSql(baselineSql, 'baseline'),
    migrationFiles,
    migrationContents,
    regeneratedSerialized: serialized,
  };
});

const tableOf = (parsed: ParsedSql, name: string) => {
  const table = parsed.tables.find((t) => t.name === name);
  if (!table) throw new Error(`fixture table '${name}' not found`);
  return table;
};

// ---------------------------------------------------------------------------
// Fixtures for self-tests
// ---------------------------------------------------------------------------

const MINI_BASELINE = `
DROP TABLE IF EXISTS \`parents\`;
CREATE TABLE \`parents\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`name\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'x' COMMENT 'doc',
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS \`children\`;
CREATE TABLE \`children\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`parent_id\` int unsigned NOT NULL,
  \`amount\` decimal(10,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (\`id\`),
  KEY \`idx_child_parent\` (\`parent_id\`),
  CONSTRAINT \`fk_child_parent\` FOREIGN KEY (\`parent_id\`) REFERENCES \`parents\` (\`id\`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO \`parents\` (\`id\`, \`name\`) VALUES (1, 'one');
`;

const MINI_MIGRATIONS: MigrationInputFile[] = [
  {
    name: '001_create_legacy.sql',
    content: '-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE\nCREATE TABLE `legacy` (`id` int);\n',
  },
  {
    name: '002_content_only.sql',
    content: "-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE\nUPDATE `parents` SET `name` = 'two' WHERE `id` = 1;\n",
  },
  {
    name: '003_convergence.sql',
    content: [
      '-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE',
      "SET @has_idx := (SELECT COUNT(*) FROM information_schema.statistics WHERE index_name = 'idx_child_parent');",
      "SET @sql := IF(@has_idx = 0, 'ALTER TABLE `children` ADD INDEX `idx_child_parent` (`parent_id`)', 'SELECT 1 AS skipped');",
      'PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;',
      '',
    ].join('\n'),
  },
];

const MINI_REQUIREMENTS_OBJECT = {
  version: 1,
  baselinePath: 'database/baseline/mini.sql',
  schemaHead: '003',
  contentOnly: ['002'],
  schemaHeadEvidence: {
    head: '003',
    repairs: [{ table: 'children', index: 'idx_child_parent' }],
  },
  requiredTables: [
    { name: 'parents' },
    { name: 'children', columnCount: 3, columns: ['id', 'parent_id', 'amount'] },
  ],
  requiredColumns: [{ table: 'children', column: 'amount' }],
  requiredIndexes: [
    { table: 'children', name: 'primary', columns: ['id'], unique: true },
    { table: 'children', name: 'idx_child_parent', columns: ['parent_id'], unique: false },
  ],
  requiredForeignKeys: [
    {
      table: 'children',
      name: 'fk_child_parent',
      columns: ['parent_id'],
      referencedTable: 'parents',
      referencedColumns: ['id'],
      onDelete: 'RESTRICT',
      onUpdate: null,
    },
  ],
  requiredTriggers: [],
  knownGaps: [{ id: 'fixture_gap', detail: 'fixture-only gap' }],
};

const MINI_REQUIREMENTS_RAW = JSON.stringify(MINI_REQUIREMENTS_OBJECT);

function requirementsWith(overrides: Partial<typeof MINI_REQUIREMENTS_OBJECT>): string {
  return JSON.stringify({ ...MINI_REQUIREMENTS_OBJECT, ...overrides });
}

interface FixtureOptions {
  baselineSql?: string;
  baselinePath?: string;
  migrations?: MigrationInputFile[];
  requirementsRaw?: string;
}

function buildFixture(options: FixtureOptions = {}) {
  const baselineSql = options.baselineSql ?? MINI_BASELINE;
  const files = options.migrations ?? MINI_MIGRATIONS;
  const requirementsRaw = options.requirementsRaw ?? MINI_REQUIREMENTS_RAW;
  const migrationContents: Record<string, string> = {};
  for (const file of files) migrationContents[file.name] = file.content;
  return buildManifest({
    baselineSql,
    baselinePath: options.baselinePath ?? 'database/baseline/mini.sql',
    requirements: parseRequirements(requirementsRaw),
    requirementsRaw,
    migrations: buildMigrationIndex(files, 'database/migrations'),
    migrationContents,
  });
}

function expectManifestFailure(options: FixtureOptions, pattern: RegExp): void {
  expect(() => buildFixture(options)).toThrow(pattern);
}

// ---------------------------------------------------------------------------
// 1. Committed artefact
// ---------------------------------------------------------------------------

describe('committed baseline manifest', () => {
  it('is well-formed and describes the authoritative baseline', () => {
    expect(() => assertManifestShape(real.manifest)).not.toThrow();
    expect(real.manifest.manifestVersion).toBe(1);
    expect(real.manifest.generator).toBe('backend/scripts/baseline-manifest.ts');
    expect(real.manifest.baseline.path).toBe('database/baseline/001_courtzon_v3.sql');
    expect(real.manifest.baseline.hashKind).toBe('content_sha256_lf');
    expect(real.manifest.baseline.bytes).toBe(Buffer.byteLength(toLf(real.baselineSql), 'utf8'));
  });

  it('records the raw baseline SHA-256 (distinct from every normalized hash)', () => {
    expect(real.manifest.baseline.sha256).toBe(contentSha256(real.baselineSql));
    const normalized = [
      real.manifest.schema.inventorySha256,
      real.manifest.schema.objectSha256,
      real.manifest.schema.schemaSha256,
      real.manifest.migrations.sha256,
    ];
    for (const hash of normalized) {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).not.toBe(real.manifest.baseline.sha256);
    }
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  it('contains the exact audited schema counts (no loose lower bounds)', () => {
    expect(real.manifest.schema.schemaHead).toBe('205');
    expect(real.manifest.schema.contentOnly).toEqual(['196', '197', '198', '199', '200', '201']);
    expect(real.manifest.schema.tableCount).toBe(329);
    expect(real.manifest.schema.columnCount).toBe(3668);
    expect(real.manifest.schema.indexCount).toBe(1297);
    expect(real.manifest.schema.foreignKeyCount).toBe(515);
    expect(real.manifest.schema.checkCount).toBe(54);
    expect(real.manifest.schema.triggerCount).toBe(19);
    expect(real.manifest.schema.dataStatementCount).toBe(6);
    expect(real.manifest.schema.alterStatementCount).toBe(13);
    expect(real.manifest.schema.dropTableStatementCount).toBe(316);
    expect(Object.keys(real.manifest.schema.tables)).toHaveLength(329);
    expect(Object.keys(real.manifest.schema.triggers)).toHaveLength(19);
    // Manifest-derived counts must equal the parser's live model.
    expect(real.parsed.tables).toHaveLength(real.manifest.schema.tableCount);
    expect(real.parsed.triggers).toHaveLength(real.manifest.schema.triggerCount);
  });

  it('is deterministic and content-equal to the committed file', () => {
    const rebuilt = buildFixture({
      baselineSql: real.baselineSql,
      baselinePath: 'database/baseline/001_courtzon_v3.sql',
      migrations: real.migrationFiles,
      requirementsRaw: real.requirementsRaw,
    });

    // Two consecutive in-memory generations must be byte-identical.
    expect(rebuilt.serialized).toBe(real.regeneratedSerialized);

    // The committed artefact must be byte-for-byte the generator's output
    // (normalising only line endings, since Git may check out CRLF on Windows).
    expect(toLf(real.manifestRaw)).toBe(rebuilt.serialized);

    // Compare content, not line endings, and prove semantic equality.
    const committed = parseManifest(real.manifestRaw);
    expect(canonicalJson(committed)).toBe(canonicalJson(rebuilt.manifest));
    expect(diffManifests(committed, rebuilt.manifest)).toEqual([]);

    // Corrected-parser invariants are now part of the committed artefact.
    const entitlementColumns = committed.schema.tables.financial_entitlements.signature.columns.map((column) => column.name);
    expect(entitlementColumns.indexOf('source_type')).toBe(entitlementColumns.indexOf('source_id') - 1);

    const publicId = committed.schema.tables.users.signature.columns.find((column) => column.name === 'public_id');
    expect(publicId?.characterSet).toBe('utf8mb4');
    expect(publicId?.collation).toBe('utf8mb4_unicode_ci');
  });

  it('is not one of the seed row-count manifests', () => {
    // database/{seed,seeds}/baseline-manifest.json are a different artefact
    // shape (row counts only). This manifest must never be conflated with them.
    for (const seedPath of [
      resolve(projectRoot, 'database/seed/baseline-manifest.json'),
      resolve(projectRoot, 'database/seeds/baseline-manifest.json'),
    ]) {
      const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as Record<string, unknown>;
      expect(seed).not.toHaveProperty('schema');
      expect(seed).not.toHaveProperty('migrations');
    }
    expect(real.manifest.baseline.path).toBe('database/baseline/001_courtzon_v3.sql');
  });
});

// ---------------------------------------------------------------------------
// 2. Schema semantics
// ---------------------------------------------------------------------------

describe('baseline schema semantics', () => {
  it('tokenizes the dump completely (tables, triggers, DELIMITER, ALTERs)', () => {
    expect(real.parsed.tables).toHaveLength(329);
    expect(real.parsed.triggers).toHaveLength(19);
    expect(real.parsed.dataStatements).toHaveLength(6);
    expect(real.parsed.alters).toHaveLength(13);
    expect(real.parsed.droppedTables).toHaveLength(316);
    expect(real.parsed.delimiterDirectives).toHaveLength(24);
    // Dynamic comments really are executable: every trigger survives.
    for (const trigger of real.parsed.triggers) {
      expect(trigger.body.length).toBeGreaterThan(0);
    }
  });

  it('pins payment_allocations exactly (15 columns, PK + 4 indexes, 3 FKs)', () => {
    const table = tableOf(real.parsed, 'payment_allocations');
    expect(table.columns.map((column) => column.name)).toEqual([
      'id',
      'payment_transaction_id',
      'series_id',
      'booking_id',
      'subtotal',
      'tax_amount',
      'commission_amount',
      'org_net_amount',
      'gross_amount',
      'currency',
      'refunded_amount',
      'status',
      'payment_method',
      'created_at',
      'updated_at',
    ]);
    expect(table.columns).toHaveLength(15);

    const indexes = new Map(table.indexes.map((index) => [index.name, index]));
    expect([...indexes.keys()].sort()).toEqual([
      'idx_pa_booking',
      'idx_pa_payment',
      'idx_pa_series',
      'primary',
      'uk_pa_payment_booking',
    ]);
    expect(indexes.get('primary')).toMatchObject({
      kind: 'PRIMARY',
      unique: true,
      columns: [{ name: 'id', desc: false, prefixLength: null }],
    });
    expect(indexes.get('uk_pa_payment_booking')).toMatchObject({
      kind: 'UNIQUE',
      unique: true,
      columns: [
        { name: 'payment_transaction_id', desc: false, prefixLength: null },
        { name: 'booking_id', desc: false, prefixLength: null },
      ],
    });
    expect(indexes.get('idx_pa_series')?.columns.map((c) => c.name)).toEqual(['series_id']);
    expect(indexes.get('idx_pa_booking')?.columns.map((c) => c.name)).toEqual(['booking_id']);
    expect(indexes.get('idx_pa_payment')?.columns.map((c) => c.name)).toEqual([
      'payment_transaction_id',
    ]);
    for (const name of ['idx_pa_series', 'idx_pa_booking', 'idx_pa_payment']) {
      expect(indexes.get(name)?.unique).toBe(false);
    }

    const fks = new Map(table.foreignKeys.map((fk) => [fk.name, fk]));
    expect(fks.get('fk_pa_payment_transaction')).toMatchObject({
      columns: ['payment_transaction_id'],
      referencedTable: 'payment_transactions',
      referencedColumns: ['id'],
      onDelete: 'RESTRICT',
      onUpdate: null,
    });
    expect(fks.get('fk_pa_booking_series')).toMatchObject({
      columns: ['series_id'],
      referencedTable: 'booking_series',
      referencedColumns: ['id'],
      onDelete: 'SET NULL',
      onUpdate: null,
    });
    expect(fks.get('fk_pa_booking')).toMatchObject({
      columns: ['booking_id'],
      referencedTable: 'bookings',
      referencedColumns: ['id'],
      onDelete: 'RESTRICT',
      onUpdate: null,
    });
  });

  it('pins all four convergence indexes by table, name, ordered columns, uniqueness', () => {
    const expected = [
      ['notifications', 'idx_notifications_event', ['event_name']],
      ['organisation_subscriptions', 'idx_status_enddate', ['subscription_status', 'end_date']],
      ['payment_transactions', 'idx_pt_status_created', ['payment_status', 'created_at']],
      ['professional_services', 'idx_ps_pp', ['professional_profile_id']],
    ] as const;
    for (const [tableName, indexName, columns] of expected) {
      const table = tableOf(real.parsed, tableName);
      const index = table.indexes.find((candidate) => candidate.name === indexName);
      expect(index, `${tableName}.${indexName}`).toBeDefined();
      expect(index?.columns.map((column) => column.name)).toEqual([...columns]);
      expect(index?.columns.every((column) => column.desc === false)).toBe(true);
      expect(index?.unique).toBe(false);
      expect(index?.kind).toBe('KEY');
    }
  });

  it('applies all 13 appended ALTER TABLE statements to the model', () => {
    // A representative column from each convergence block; missing application
    // of an ALTER would drop these.
    const expectations: Array<[string, string[]]> = [
      ['payment_transactions', ['gateway_settlement_id', 'gateway_settled_at']],
      ['academy_programs', ['organisation_id', 'lifecycle_state', 'original_capacity']],
      ['academy_group_sessions', ['schedule_id', 'reservation_status', 'confirmed_at']],
      ['bookings', ['series_id']],
      ['organisation_membership_settings', ['cancellation_refund_policy']],
    ];
    for (const [tableName, columns] of expectations) {
      const names = tableOf(real.parsed, tableName).columns.map((column) => column.name);
      for (const column of columns) expect(names, `${tableName}.${column}`).toContain(column);
    }
    // MODIFY COLUMN replaces the definition rather than appending a duplicate.
    const reservation = tableOf(real.parsed, 'academy_group_sessions').columns.filter(
      (column) => column.name === 'reservation_status',
    );
    expect(reservation).toHaveLength(1);
    expect(reservation[0].type).toContain('pending_court');
  });

  it('excludes AUTO_INCREMENT counters and comments from normalized signatures', () => {
    const noisy = MINI_BASELINE.replace('AUTO_INCREMENT=42', 'AUTO_INCREMENT=987654')
      .replace("COMMENT 'doc'", "COMMENT 'different documentation'");
    const original = buildFixture();
    const rebuilt = buildFixture({ baselineSql: noisy });
    expect(rebuilt.manifest.schema.tables.parents.objectSha256).toBe(
      original.manifest.schema.tables.parents.objectSha256,
    );
    // The raw baseline hash MUST still differ (it hashes real bytes).
    expect(rebuilt.manifest.baseline.sha256).not.toBe(original.manifest.baseline.sha256);
  });
});

// ---------------------------------------------------------------------------
// 2b. Parser corrections (P8.6.13)
// ---------------------------------------------------------------------------

describe('parser corrections — MODIFY position and charset inheritance', () => {
  const DDL = `
DROP TABLE IF EXISTS \`positioning\`;
CREATE TABLE \`positioning\` (
  \`a\` int NOT NULL,
  \`b\` int NOT NULL,
  \`c\` varchar(10) NOT NULL,
  \`amount\` decimal(10,2) NOT NULL,
  \`note\` varchar(10) CHARACTER SET latin1 COLLATE latin1_swedish_ci DEFAULT NULL,
  \`code\` varchar(10) COLLATE utf8mb4_bin DEFAULT NULL,
  \`plain\` varchar(10) CHARACTER SET latin1 DEFAULT NULL,
  PRIMARY KEY (\`a\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE \`positioning\` MODIFY COLUMN \`a\` bigint NOT NULL;
`;

  const columnsOf = (sql: string): ParsedSql['tables'][number]['columns'] =>
    tableOf(parseSql(sql, 'baseline'), 'positioning').columns;

  it('preserves the ordinal position of MODIFY COLUMN without FIRST/AFTER', () => {
    const columns = columnsOf(DDL);
    expect(columns.map((column) => column.name)).toEqual(['a', 'b', 'c', 'amount', 'note', 'code', 'plain']);
    expect(columns[0].type).toBe('bigint');
  });

  it('applies explicit FIRST and AFTER positioning', () => {
    const first = columnsOf(`${DDL}\nALTER TABLE \`positioning\` MODIFY COLUMN \`c\` varchar(20) FIRST;`);
    expect(first.map((column) => column.name)).toEqual(['c', 'a', 'b', 'amount', 'note', 'code', 'plain']);

    const after = columnsOf(`${DDL}\nALTER TABLE \`positioning\` MODIFY COLUMN \`b\` int AFTER \`amount\`;`);
    expect(after.map((column) => column.name)).toEqual(['a', 'c', 'amount', 'b', 'note', 'code', 'plain']);
  });

  it('inherits table charset/collation for character columns only', () => {
    const columns = columnsOf(DDL);
    const byName = new Map(columns.map((column) => [column.name, column]));
    expect(byName.get('c')).toMatchObject({ characterSet: 'utf8mb4', collation: 'utf8mb4_unicode_ci' });
    expect(byName.get('amount')).toMatchObject({ characterSet: null, collation: null });
  });

  it('preserves explicit column-level charset and collation overrides', () => {
    const columns = columnsOf(DDL);
    const byName = new Map(columns.map((column) => [column.name, column]));
    expect(byName.get('note')).toMatchObject({ characterSet: 'latin1', collation: 'latin1_swedish_ci' });
    expect(byName.get('code')).toMatchObject({ characterSet: 'utf8mb4', collation: 'utf8mb4_bin' });
    // An explicit charset that differs from the table must not inherit the
    // table collation.
    expect(byName.get('plain')).toMatchObject({ characterSet: 'latin1', collation: null });
  });

  it('applies the same inheritance to columns added by ALTER TABLE', () => {
    const columns = columnsOf(`${DDL}\nALTER TABLE \`positioning\` ADD COLUMN \`added\` varchar(20) DEFAULT NULL;`);
    const added = columns.find((column) => column.name === 'added');
    expect(added).toMatchObject({ characterSet: 'utf8mb4', collation: 'utf8mb4_unicode_ci' });
  });
});



describe('migration chain index', () => {
  it('captures every file, prefix, duplicate and missing prefix exactly', () => {
    const migrations = real.manifest.migrations;
    expect(migrations.count).toBe(212);
    expect(migrations.distinctPrefixes).toBe(203);
    expect(migrations.duplicatePrefixes).toEqual([
      {
        prefix: '002',
        files: [
          '002_add_financial_unique_constraints.sql',
          '002_add_payment_columns.sql',
          '002_clear_branding_asset_paths.sql',
        ],
      },
      {
        prefix: '017',
        files: [
          '017_add_wallet_payment_type.sql',
          '017_booking_pending_payment.sql',
          '017_create_matches.sql',
          '017_notification_types.sql',
        ],
      },
      {
        prefix: '018',
        files: [
          '018_add_order_source_type.sql',
          '018_create_public_match_details.sql',
          '018_notification_template_management.sql',
        ],
      },
      {
        prefix: '019',
        files: ['019_create_invitations.sql', '019_system_settings.sql'],
      },
      {
        prefix: '020',
        files: ['020_create_join_requests.sql', '020_membership_foundation.sql'],
      },
    ]);
    expect(migrations.missingPrefixes).toEqual(['001', '076']);
    expect(migrations.classifications).toEqual({
      PRODUCTION_SAFE: 212,
      LOCAL_DOCKER_ONLY: 0,
      INVALID: 0,
    });
    for (const file of migrations.files) {
      expect(file.sha256).toBe(contentSha256(real.migrationContents[file.file]));
    }
  });

  it('classifies migrations using the guard marker semantics (first marker wins)', () => {
    expect(classifyMigration('CREATE TABLE x (id int);')).toEqual({
      classification: 'PRODUCTION_SAFE',
      marker: null,
    });
    expect(classifyMigration('-- COURTZON_MIGRATION_ENV: LOCAL_DOCKER_ONLY\nSELECT 1;')).toEqual({
      classification: 'LOCAL_DOCKER_ONLY',
      marker: 'LOCAL_DOCKER_ONLY',
    });
    expect(classifyMigration('-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE\nSELECT 1;')).toEqual({
      classification: 'PRODUCTION_SAFE',
      marker: 'PRODUCTION_SAFE',
    });
    expect(classifyMigration('-- COURTZON_MIGRATION_ENV: WHATEVER\nSELECT 1;')).toEqual({
      classification: 'INVALID',
      marker: 'WHATEVER',
    });
    // The guard regex requires the marker to be the whole line; inline text is
    // not a marker. The FIRST matching line wins even if a later one differs.
    expect(
      classifyMigration('-- COURTZON_MIGRATION_ENV: LOCAL_DOCKER_ONLY -- note\nSELECT 1;').marker,
    ).toBeNull();
    expect(
      classifyMigration(
        '-- COURTZON_MIGRATION_ENV: LOCAL_DOCKER_ONLY\n-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE\n',
      ).classification,
    ).toBe('LOCAL_DOCKER_ONLY');
  });

  it('verifies schemaHead=205 from content, not from the numeric prefix alone', () => {
    // 196–201 are content-only by PARSING; 202–205 are not.
    for (const prefix of ['196', '197', '198', '199', '200', '201']) {
      const file = real.manifest.migrations.files.find((candidate) => candidate.prefix === prefix);
      expect(file, prefix).toBeDefined();
      expect(hasSchemaDdl(real.migrationContents[file!.file]), `${prefix} must be content-only`).toBe(
        false,
      );
    }
    for (const prefix of ['202', '203', '204', '205']) {
      const file = real.manifest.migrations.files.find((candidate) => candidate.prefix === prefix);
      expect(file, prefix).toBeDefined();
      expect(hasSchemaDdl(real.migrationContents[file!.file]), `${prefix} mutates schema`).toBe(true);
    }
    // 203's prepared DDL creates the three original convergence repairs.
    const repairs203 = parseSql(real.migrationContents['203_convergence_indexes.sql'], 'migration')
      .preparedDdl.indexes;
    expect(repairs203.map((entry) => `${entry.table}.${entry.index.name}`).sort()).toEqual([
      'notifications.idx_notifications_event',
      'payment_transactions.idx_pt_status_created',
      'professional_services.idx_ps_pp',
    ]);
    // 204 carries exactly the audited idx_status_enddate repair.
    const repairs204 = parseSql(
      real.migrationContents['204_convergence_idx_status_enddate.sql'],
      'migration',
    ).preparedDdl.indexes;
    expect(repairs204.map((entry) => `${entry.table}.${entry.index.name}`)).toEqual([
      'organisation_subscriptions.idx_status_enddate',
    ]);
    // 205 is the head: it adds the tournaments CHECK and repairs no index.
    expect(real.manifest.schema.schemaHead).toBe('205');
    const sql205 = real.migrationContents['205_tournaments_max_events_check.sql'];
    expect(classifyMigration(sql205).classification).toBe('PRODUCTION_SAFE');
    expect(sql205).toContain('information_schema.table_constraints');
    expect(sql205).toContain('information_schema.check_constraints');
    expect(sql205).toContain(
      'ADD CONSTRAINT `chk_tournaments_max_events_per_player` CHECK ((max_events_per_player IS NULL) OR (max_events_per_player >= 1))',
    );
    expect(
      parseSql(sql205, 'migration').preparedDdl.indexes.map(
        (entry) => `${entry.table}.${entry.index.name}`,
      ),
    ).toEqual([]);
    const evidence = parseRequirements(real.requirementsRaw).schemaHeadEvidence;
    expect(evidence).toEqual({
      head: '205',
      repairs: [],
    });
  });

  it('changes the migration hash when a migration file changes', () => {
    const baseline = real.manifest.migrations;
    const mutated = real.migrationFiles.map((file) =>
      file.name === '002_add_payment_columns.sql'
        ? { ...file, content: `${file.content}\n-- changed\n` }
        : file,
    );
    const next = buildMigrationIndex(mutated, 'database/migrations');
    expect(next.sha256).not.toBe(baseline.sha256);
    const changed = next.files.find((record) => record.file === '002_add_payment_columns.sql');
    const original = baseline.files.find((record) => record.file === '002_add_payment_columns.sql');
    expect(changed?.sha256).not.toBe(original?.sha256);
  });
});

// ---------------------------------------------------------------------------
// 4. Requirements + self-tests (fail closed)
// ---------------------------------------------------------------------------

describe('requirements resolution', () => {
  it('resolves every curated pin and reports the pin count', () => {
    expect(real.manifest.requirements.pinCount).toBe(74);
    expect(real.manifest.requirements.schemaHead).toBe('205');
    expect(real.manifest.requirements.contentOnly).toEqual([
      '196',
      '197',
      '198',
      '199',
      '200',
      '201',
    ]);
    expect(real.manifest.requirements.indexes).toHaveLength(9);
    expect(real.manifest.requirements.foreignKeys).toHaveLength(3);
    expect(real.manifest.requirements.triggers).toHaveLength(19);
  });

  it('keeps known gaps explicit instead of silently accepting them', () => {
    const ids = real.manifest.knownGaps.map((gap) => gap.id);
    // Resolved by migration 204: the index now has a roll-forward repair.
    expect(ids).not.toContain('idx_status_enddate_no_rollforward');
    expect(ids).toContain('booking_series_not_idempotent');
    expect(ids).toContain('payment_allocations_docs_column_count');
  });

  it('retains the migration 204 index and pins migration 205 as head with no index repairs', () => {
    expect(real.manifest.schema.schemaHead).toBe('205');
    expect(real.manifest.requirements.schemaHead).toBe('205');
    expect(real.manifest.migrations.count).toBe(212);
    const index = real.manifest.schema.tables.organisation_subscriptions.signature.indexes.find(
      (candidate) => candidate.name === 'idx_status_enddate',
    );
    expect(index?.columns.map((column) => column.name)).toEqual([
      'subscription_status',
      'end_date',
    ]);
    expect(index?.unique).toBe(false);
  });
});

describe('self-tests — the generator fails closed', () => {
  it('S1: missing required table', () => {
    const baseline = MINI_BASELINE.replace(
      /DROP TABLE IF EXISTS `children`;[\s\S]*?\) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;/,
      '',
    );
    expect(baseline).not.toContain('CREATE TABLE `children`');
    expectManifestFailure({ baselineSql: baseline }, /table 'children' is missing/);
  });

  it('S2: renamed index', () => {
    expectManifestFailure(
      { baselineSql: MINI_BASELINE.replace('`idx_child_parent` (`parent_id`)', '`idx_child_parent_v2` (`parent_id`)') },
      /index 'idx_child_parent' is missing/,
    );
  });

  it('S3: altered index columns / order', () => {
    expectManifestFailure(
      { baselineSql: MINI_BASELINE.replace('KEY `idx_child_parent` (`parent_id`)', 'KEY `idx_child_parent` (`amount`)') },
      /ordered columns differ/,
    );
  });

  it('S4: changed foreign-key action', () => {
    expectManifestFailure(
      { baselineSql: MINI_BASELINE.replace('ON DELETE RESTRICT', 'ON DELETE CASCADE') },
      /ON DELETE differs/,
    );
  });

  it('S5: duplicate table definition (even with IF NOT EXISTS / a preceding DROP)', () => {
    const duplicate = `${MINI_BASELINE}\nCREATE TABLE IF NOT EXISTS \`children\` (\`id\` int);\n`;
    expect(() => parseSql(duplicate, 'baseline')).toThrow(/duplicate table definition for 'children'/);
  });

  it('S6: malformed manifests', () => {
    expect(() => parseManifest('{ not json')).toThrow(/not valid JSON/);
    expect(() => parseManifest('{}')).toThrow(/manifestVersion/);
    const valid = JSON.parse(real.manifestRaw) as Record<string, any>;
    delete valid.baseline.sha256;
    expect(() => assertManifestShape(valid)).toThrow(/baseline.sha256/);
    const noTables = JSON.parse(real.manifestRaw) as Record<string, any>;
    noTables.schema.tables = {};
    expect(() => assertManifestShape(noTables)).toThrow(/must not be empty/);
  });

  it('S7: changed migration file changes the manifest migration commitment', () => {
    const original = buildFixture();
    const mutated = MINI_MIGRATIONS.map((file) =>
      file.name === '002_content_only.sql'
        ? { ...file, content: `${file.content}-- trailing\n` }
        : file,
    );
    const next = buildFixture({ migrations: mutated });
    expect(next.manifest.migrations.sha256).not.toBe(original.manifest.migrations.sha256);
    expect(next.manifest.baseline.sha256).toBe(original.manifest.baseline.sha256);
  });

  it('S8: unsupported statements are rejected, never skipped', () => {
    expect(() => parseSql('CREATE VIEW `v` AS SELECT 1;', 'baseline')).toThrow(BaselineParseError);
    expect(() => parseSql('CREATE VIEW `v` AS SELECT 1;', 'baseline')).toThrow(
      /unsupported CREATE target 'VIEW'/,
    );
    expect(() => parseSql('GRANT ALL ON *.* TO x;', 'baseline')).toThrow(/unsupported statement 'GRANT'/);
    expect(() => parseSql('CREATE TABLE `x` (`id` int) ENGINE=MyISAM;', 'baseline')).not.toThrow();
    expect(() => parseSql("CREATE TABLE `x` (`id` int) COMPRESSION='zlib';", 'baseline')).toThrow(
      /unsupported table option/,
    );
  });

  it('S9: ALTER TABLE on an unknown table', () => {
    expect(() => parseSql('ALTER TABLE `ghost` ADD COLUMN `x` int;', 'baseline')).toThrow(
      /unknown table 'ghost'/,
    );
    // Migration mode deliberately allows ALTER on a baseline-owned table.
    expect(() => parseSql('ALTER TABLE `ghost` ADD COLUMN `x` int;', 'migration')).not.toThrow();
  });

  it('S10: duplicate column / index identities in ALTER TABLE', () => {
    const withAlter = (alter: string) => parseSql(`${MINI_BASELINE}\n${alter}\n`, 'baseline');
    expect(() => withAlter('ALTER TABLE `parents` ADD COLUMN `id` int;')).toThrow(
      /duplicate column 'id'/,
    );
    expect(() => withAlter('ALTER TABLE `children` ADD KEY `idx_child_parent` (`id`);')).toThrow(
      /duplicate index 'idx_child_parent'/,
    );
    expect(() =>
      withAlter(
        'ALTER TABLE `children` ADD CONSTRAINT `fk_child_parent` FOREIGN KEY (`parent_id`) REFERENCES `parents` (`id`);',
      ),
    ).toThrow(/duplicate foreign key 'fk_child_parent'/);
  });

  it('S11: malformed SQL (unterminated quote / unbalanced parentheses)', () => {
    expect(() => parseSql("INSERT INTO `parents` (`name`) VALUES ('oops);", 'baseline')).toThrow(
      /unterminated string literal/,
    );
    expect(() => parseSql('CREATE TABLE `x` (`id` int;', 'baseline')).toThrow(
      /unbalanced parentheses/,
    );
  });

  it('S12: dynamic comments + DELIMITER keep triggers executable', () => {
    const sql = [
      'CREATE TABLE `children` (`id` int);',
      'DELIMITER ;;',
      '/*!50003 CREATE*/ /*!50003 TRIGGER `trg_x` BEFORE INSERT ON `children` FOR EACH ROW BEGIN',
      '  SET NEW.id = 1;',
      'END */;;',
      'DELIMITER ;',
      '',
    ].join('\n');
    const parsed = parseSql(sql, 'baseline');
    expect(parsed.triggers).toHaveLength(1);
    expect(parsed.triggers[0]).toMatchObject({
      name: 'trg_x',
      timing: 'BEFORE',
      event: 'INSERT',
      table: 'children',
    });
    expect(parsed.triggers[0].body).toContain('set new.id = 1');
    expect(parsed.delimiterDirectives).toEqual([
      { value: ';;', line: 2 },
      { value: ';', line: 6 },
    ]);
  });

  it('S13: a "content-only" migration that contains DDL is rejected', () => {
    const migrations = MINI_MIGRATIONS.map((file) =>
      file.name === '002_content_only.sql'
        ? { ...file, content: '-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE\nCREATE TABLE `oops` (`id` int);\n' }
        : file,
    );
    expectManifestFailure({ migrations }, /contentOnly:002.*contains schema DDL/);
  });

  it('S14: schemaHead must match the real highest prefix', () => {
    expectManifestFailure(
      { requirementsRaw: requirementsWith({ schemaHead: '004' }) },
      /highest migration prefix is 003/,
    );
  });

  it('S15: schemaHead must be PRODUCTION_SAFE (audited classification)', () => {
    const migrations = MINI_MIGRATIONS.map((file) =>
      file.name === '003_convergence.sql'
        ? { ...file, content: file.content.replace('PRODUCTION_SAFE', 'LOCAL_DOCKER_ONLY') }
        : file,
    );
    expectManifestFailure({ migrations }, /is LOCAL_DOCKER_ONLY, not PRODUCTION_SAFE/);
  });

  it('S16: head migration must actually create the audited repair', () => {
    const migrations = MINI_MIGRATIONS.map((file) =>
      file.name === '003_convergence.sql'
        ? {
            ...file,
            content: file.content.replace(
              'ADD INDEX `idx_child_parent` (`parent_id`)',
              'ADD INDEX `idx_something_else` (`parent_id`)',
            ),
          }
        : file,
    );
    expectManifestFailure({ migrations }, /does not create this index/);
  });

  it('S17: requirements with a head repair that has no index pin are rejected', () => {
    const requirementsRaw = requirementsWith({
      schemaHeadEvidence: {
        head: '003',
        repairs: [{ table: 'children', index: 'idx_not_required' }],
      },
    });
    expectManifestFailure({ requirementsRaw }, /repair has no matching requiredIndexes pin/);
  });

  it('S18: drift diff is precise and deterministic', () => {
    const original = buildFixture();
    const mutated = buildFixture({
      baselineSql: MINI_BASELINE.replace("DEFAULT 'x'", "DEFAULT 'y'"),
    });
    const differences = diffManifests(original.manifest, mutated.manifest);
    expect(differences.some((difference) => difference.path === 'baseline.sha256')).toBe(true);
    expect(
      differences.some((difference) => difference.path === 'schema.tables.parents.objectSha256'),
    ).toBe(true);
    expect(differences.some((difference) => difference.path === 'migrations.sha256')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. ManifestData shape used by the integrity spec
// ---------------------------------------------------------------------------

describe('manifest data exposed to the integrity spec', () => {
  it('exposes semantic index / FK / column data for exact assertions', () => {
    const payments = real.manifest.schema.tables.payment_allocations.signature;
    expect(payments.columns).toHaveLength(15);
    expect(payments.indexes.map((index) => index.name).sort()).toEqual([
      'idx_pa_booking',
      'idx_pa_payment',
      'idx_pa_series',
      'primary',
      'uk_pa_payment_booking',
    ]);
    expect(payments.foreignKeys.map((fk) => [fk.name, fk.onDelete])).toEqual([
      ['fk_pa_booking', 'RESTRICT'],
      ['fk_pa_booking_series', 'SET NULL'],
      ['fk_pa_payment_transaction', 'RESTRICT'],
    ]);
    const convergence = [
      ['notifications', 'idx_notifications_event'],
      ['organisation_subscriptions', 'idx_status_enddate'],
      ['payment_transactions', 'idx_pt_status_created'],
      ['professional_services', 'idx_ps_pp'],
    ] as const;
    for (const [tableName, indexName] of convergence) {
      const table = real.manifest.schema.tables[tableName];
      expect(table, tableName).toBeDefined();
      const index = table.signature.indexes.find((candidate) => candidate.name === indexName);
      expect(index, `${tableName}.${indexName}`).toBeDefined();
      expect(index?.unique).toBe(false);
    }
  });

  it('never claims to prove a hydrated database', () => {
    // The manifest is a static artefact. Tier B (information_schema parity) is
    // a separate, DB-backed phase; nothing here may be read as hydration proof.
    expect(real.manifest.manifestVersion).toBe(1);
    expect(real.manifest.schema.schemaHead).toBe('205');
    expect(real.manifest.requirements.schemaHead).toBe('205');
  });
});
