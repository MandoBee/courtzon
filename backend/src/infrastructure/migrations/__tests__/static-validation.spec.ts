import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { projectRoot } from './migration-guard-test-helper.js';
import {
  buildManifest,
  buildMigrationIndex,
  contentSha256,
  toLf,
  type Manifest,
  type MigrationInputFile,
} from '../baseline/baseline-manifest.js';
import {
  validateStaticManifest,
  type StaticValidationInput,
  type StaticValidationReport,
} from '../baseline/static-validation.js';

const FIXTURE_BASELINE = `
DROP TABLE IF EXISTS \`parents\`;
CREATE TABLE \`parents\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`name\` varchar(50) NOT NULL DEFAULT 'x',
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS \`children\`;
CREATE TABLE \`children\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`parent_id\` int unsigned NOT NULL,
  \`amount\` decimal(10,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (\`id\`),
  KEY \`idx_child_parent\` (\`parent_id\`),
  CONSTRAINT \`fk_child_parent\` FOREIGN KEY (\`parent_id\`) REFERENCES \`parents\` (\`id\`) ON DELETE RESTRICT,
  CONSTRAINT \`chk_child_amount\` CHECK (\`amount\` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER ;;
/*!50003 CREATE*/ /*!50003 TRIGGER \`trg_child_bi\` BEFORE INSERT ON \`children\` FOR EACH ROW SET NEW.amount = IFNULL(NEW.amount, 0) */;;
DELIMITER ;

INSERT INTO \`parents\` (\`id\`, \`name\`) VALUES (1, 'one');
`;

const FIXTURE_MIGRATIONS: MigrationInputFile[] = [
  {
    name: '001_parents.sql',
    content: '-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE\nCREATE TABLE `legacy_parents` (`id` int);\n',
  },
  {
    name: '002_content.sql',
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

const FIXTURE_REQUIREMENTS = {
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
  requiredTriggers: [{ name: 'trg_child_bi', table: 'children', timing: 'BEFORE', event: 'INSERT' }],
  knownGaps: [],
};

let realInput: StaticValidationInput;
let fixtureInput: StaticValidationInput;
let fixtureManifest: Manifest;
let fixtureReport: StaticValidationReport;

beforeAll(() => {
  realInput = {
    baselineSql: readFileSync(resolve(projectRoot, 'database/baseline/001_courtzon_v3.sql'), 'utf8'),
    baselinePath: 'database/baseline/001_courtzon_v3.sql',
    manifestRaw: readFileSync(resolve(projectRoot, 'database/baseline/001_courtzon_v3.manifest.json'), 'utf8'),
    requirementsRaw: readFileSync(resolve(projectRoot, 'database/baseline/baseline-requirements.json'), 'utf8'),
    migrationFiles: readdirSync(resolve(projectRoot, 'database/migrations'))
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .map((name) => ({
        name,
        content: readFileSync(resolve(projectRoot, 'database/migrations', name), 'utf8'),
      })),
  };

  const requirementsRaw = JSON.stringify(FIXTURE_REQUIREMENTS, null, 2);
  const migrations = buildMigrationIndex(FIXTURE_MIGRATIONS, 'database/migrations');
  const migrationContents: Record<string, string> = {};
  for (const file of FIXTURE_MIGRATIONS) migrationContents[file.name] = file.content;
  const built = buildManifest({
    baselineSql: FIXTURE_BASELINE,
    baselinePath: 'database/baseline/mini.sql',
    requirements: JSON.parse(requirementsRaw),
    requirementsRaw,
    migrations,
    migrationContents,
  });
  fixtureManifest = built.manifest;
  fixtureInput = {
    baselineSql: FIXTURE_BASELINE,
    baselinePath: 'database/baseline/mini.sql',
    manifestRaw: built.serialized,
    requirementsRaw,
    migrationFiles: FIXTURE_MIGRATIONS,
  };
  fixtureReport = validateStaticManifest(fixtureInput);
});

function manifestWith(mutator: (manifest: any) => void): string {
  const copy = JSON.parse(fixtureInput.manifestRaw);
  mutator(copy);
  return JSON.stringify(copy, null, 2);
}

function inputWith(overrides: Partial<StaticValidationInput>): StaticValidationInput {
  return { ...fixtureInput, ...overrides };
}

function codes(report: StaticValidationReport): string[] {
  return report.findings.map((finding) => finding.code);
}

function expectCode(report: StaticValidationReport, code: string): void {
  expect(report.ok).toBe(false);
  expect(codes(report)).toContain(code);
}

describe('static validation — committed baseline artefacts', () => {
  it('validates the real manifest, requirements, baseline and migration chain', () => {
    const report = validateStaticManifest(realInput);
    expect(report.findings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary.tableCount).toBe(332);
    expect(report.summary.triggerCount).toBe(19);
    expect(report.summary.pinCount).toBe(79);
    expect(report.summary.migrationCount).toBe(217);
    expect(report.summary.objectCount).toBe(351);
    expect(report.hashes.baseline).toMatch(/^[0-9a-f]{64}$/);
  });

  it('validates the deterministic fixture', () => {
    expect(fixtureReport.findings).toEqual([]);
    expect(fixtureReport.ok).toBe(true);
    expect(fixtureManifest.schema.tableCount).toBe(2);
    expect(fixtureManifest.schema.triggerCount).toBe(1);
  });
});

describe('static validation — baseline and requirements integrity', () => {
  it('detects a changed baseline hash', () => {
    expectCode(validateStaticManifest(inputWith({ baselineSql: `${fixtureInput.baselineSql}\n-- changed\n` })), 'BASELINE_HASH_MISMATCH');
  });

  it('detects a changed baseline byte length', () => {
    expectCode(validateStaticManifest(inputWith({ manifestRaw: manifestWith((manifest) => { manifest.baseline.bytes += 1; }) })), 'BASELINE_BYTES_MISMATCH');
  });

  it('detects a changed baseline line count', () => {
    expectCode(validateStaticManifest(inputWith({ manifestRaw: manifestWith((manifest) => { manifest.baseline.lines += 1; }) })), 'BASELINE_LINES_MISMATCH');
  });

  it('detects a baseline path mismatch', () => {
    expectCode(validateStaticManifest(inputWith({ baselinePath: 'database/baseline/other.sql' })), 'BASELINE_PATH_MISMATCH');
  });

  it('detects a requirements hash mismatch without changing the pins', () => {
    expectCode(validateStaticManifest(inputWith({ requirementsRaw: `${fixtureInput.requirementsRaw}\n` })), 'REQUIREMENTS_HASH_MISMATCH');
  });

  it('detects a malformed requirements file', () => {
    expectCode(validateStaticManifest(inputWith({ requirementsRaw: '{}' })), 'REQUIREMENTS_SHAPE_INVALID');
  });

  it('detects a Tier A pin mismatch', () => {
    const requirements = JSON.parse(fixtureInput.requirementsRaw);
    requirements.requiredColumns[0].type = 'bigint unsigned';
    expectCode(validateStaticManifest(inputWith({ requirementsRaw: JSON.stringify(requirements, null, 2) })), 'REQUIREMENTS_PIN_MISMATCH');
  });

  it('detects a stale manifest whose internally consistent signatures disagree with the baseline', () => {
    const changedBaseline = fixtureInput.baselineSql.replace('`amount` decimal(10,2)', '`amount` decimal(12,2)');
    const staleManifest = manifestWith((manifest) => {
      manifest.baseline.sha256 = contentSha256(changedBaseline);
      manifest.baseline.bytes = Buffer.byteLength(toLf(changedBaseline), 'utf8');
      manifest.baseline.lines = changedBaseline.split(/\r?\n/).length;
    });
    expectCode(validateStaticManifest(inputWith({ baselineSql: changedBaseline, manifestRaw: staleManifest })), 'MANIFEST_STALE');
  });
});

describe('static validation — deep manifest and hash checks', () => {
  it('detects malformed manifest JSON', () => {
    expectCode(validateStaticManifest(inputWith({ manifestRaw: '{' })), 'MANIFEST_JSON_INVALID');
  });

  it('detects a missing nested column field', () => {
    expectCode(
      validateStaticManifest(
        inputWith({
          manifestRaw: manifestWith((manifest) => {
            delete manifest.schema.tables.parents.signature.columns[0].type;
          }),
        }),
      ),
      'MANIFEST_NESTED_INVALID',
    );
  });

  it('detects a changed table object hash', () => {
    expectCode(
      validateStaticManifest(
        inputWith({
          manifestRaw: manifestWith((manifest) => {
            manifest.schema.tables.parents.objectSha256 = '0'.repeat(64);
          }),
        }),
      ),
      'OBJECT_HASH_MISMATCH',
    );
  });

  it('detects a changed trigger object hash', () => {
    expectCode(
      validateStaticManifest(
        inputWith({
          manifestRaw: manifestWith((manifest) => {
            manifest.schema.triggers.trg_child_bi.objectSha256 = '0'.repeat(64);
          }),
        }),
      ),
      'OBJECT_HASH_MISMATCH',
    );
  });

  it('detects a count mismatch', () => {
    expectCode(
      validateStaticManifest(
        inputWith({
          manifestRaw: manifestWith((manifest) => {
            manifest.schema.columnCount += 1;
          }),
        }),
      ),
      'COUNT_MISMATCH',
    );
  });

  it('detects inventory, object and schema hash changes', () => {
    for (const field of ['inventorySha256', 'objectSha256', 'schemaSha256'] as const) {
      const report = validateStaticManifest(
        inputWith({
          manifestRaw: manifestWith((manifest) => {
            manifest.schema[field] = '0'.repeat(64);
          }),
        }),
      );
      expectCode(
        report,
        field === 'inventorySha256' ? 'INVENTORY_HASH_MISMATCH' : field === 'objectSha256' ? 'OBJECT_HASH_MISMATCH' : 'SCHEMA_HASH_MISMATCH',
      );
    }
  });

  it('detects a contentOnly mismatch between manifest and requirements', () => {
    expectCode(
      validateStaticManifest(
        inputWith({
          manifestRaw: manifestWith((manifest) => {
            manifest.schema.contentOnly = ['001'];
          }),
        }),
      ),
      'CONTENT_ONLY_MISMATCH',
    );
  });
});

describe('static validation — migration inventory', () => {
  it('detects a changed migration file hash', () => {
    const changed = fixtureInput.migrationFiles.map((file) =>
      file.name === '001_parents.sql' ? { ...file, content: `${file.content}-- changed\n` } : file,
    );
    expectCode(validateStaticManifest(inputWith({ migrationFiles: changed })), 'MIGRATION_FILE_HASH_MISMATCH');
  });

  it('detects an extra migration file', () => {
    const extra = [...fixtureInput.migrationFiles, { name: '004_extra.sql', content: 'SELECT 1;\n' }];
    expectCode(validateStaticManifest(inputWith({ migrationFiles: extra })), 'MIGRATION_FILE_SET_MISMATCH');
  });

  it('detects a changed migration classification', () => {
    expectCode(
      validateStaticManifest(
        inputWith({
          manifestRaw: manifestWith((manifest) => {
            manifest.migrations.files[0].classification = 'LOCAL_DOCKER_ONLY';
          }),
        }),
      ),
      'MIGRATION_CLASSIFICATION_MISMATCH',
    );
  });

  it('detects a changed missing-prefix set', () => {
    expectCode(
      validateStaticManifest(
        inputWith({
          manifestRaw: manifestWith((manifest) => {
            manifest.migrations.missingPrefixes = ['999'];
          }),
        }),
      ),
      'MIGRATION_MISSING_PREFIX_MISMATCH',
    );
  });

  it('detects a changed duplicate-prefix set', () => {
    expectCode(
      validateStaticManifest(
        inputWith({
          manifestRaw: manifestWith((manifest) => {
            manifest.migrations.duplicatePrefixes = [{ prefix: '002', files: ['002_content.sql'] }];
          }),
        }),
      ),
      'MIGRATION_DUPLICATE_PREFIX_MISMATCH',
    );
  });

  it('detects a missing schemaHead repair in the head migration', () => {
    const changed = fixtureInput.migrationFiles.map((file) =>
      file.name === '003_convergence.sql'
        ? { ...file, content: file.content.replace('ADD INDEX `idx_child_parent`', 'ADD INDEX `idx_other`') }
        : file,
    );
    expectCode(validateStaticManifest(inputWith({ migrationFiles: changed })), 'SCHEMA_HEAD_EVIDENCE_MISMATCH');
  });

  it('detects a schemaHead mismatch in requirements', () => {
    const requirements = JSON.parse(fixtureInput.requirementsRaw);
    requirements.schemaHead = '004';
    expectCode(validateStaticManifest(inputWith({ requirementsRaw: JSON.stringify(requirements, null, 2) })), 'SCHEMA_HEAD_MISMATCH');
  });

  it('detects a content-only migration that contains schema DDL', () => {
    const changed = fixtureInput.migrationFiles.map((file) =>
      file.name === '002_content.sql'
        ? { ...file, content: '-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE\nCREATE TABLE `oops` (`id` int);\n' }
        : file,
    );
    expectCode(validateStaticManifest(inputWith({ migrationFiles: changed })), 'CONTENT_ONLY_MISMATCH');
  });
});
