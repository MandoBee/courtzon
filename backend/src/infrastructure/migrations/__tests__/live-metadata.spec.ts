import { describe, expect, it } from 'vitest';
import {
  readLiveSchema,
  type LiveMetadataFinding,
  type LiveMetadataReport,
  type MetadataConnection,
} from '../baseline/live-metadata.js';
import type { StaticValidationReport } from '../baseline/static-validation.js';

type Row = Record<string, unknown>;

const OK_STATIC: StaticValidationReport = {
  ok: true,
  findings: [],
  summary: {
    baselineSha256: '0'.repeat(64),
    schemaHead: '203',
    tableCount: 2,
    triggerCount: 1,
    pinCount: 74,
    migrationCount: 210,
    objectCount: 3,
    findings: 0,
  },
  hashes: {
    baseline: '0'.repeat(64),
    requirements: '1'.repeat(64),
    inventory: '2'.repeat(64),
    object: '3'.repeat(64),
    schema: '4'.repeat(64),
    migrations: '5'.repeat(64),
  },
};

const INVALID_STATIC: StaticValidationReport = {
  ...OK_STATIC,
  ok: false,
  summary: { ...OK_STATIC.summary, findings: 2 },
  findings: [
    { code: 'MANIFEST_STALE', path: 'manifest', message: 'stale', expected: 'a', actual: 'b' },
    { code: 'BASELINE_HASH_MISMATCH', path: 'baseline', message: 'hash', expected: 'a', actual: 'b' },
  ],
};

const PARENTS_DDL = "CREATE TABLE `parents` (`id` int unsigned NOT NULL AUTO_INCREMENT, `name` varchar(50) NOT NULL DEFAULT 'x', PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
const CHILDREN_DDL = "CREATE TABLE `children` (`id` int unsigned NOT NULL AUTO_INCREMENT, `parent_id` int unsigned NOT NULL, `amount` decimal(10,2) NOT NULL DEFAULT 0, PRIMARY KEY (`id`), KEY `idx_child_parent` (`parent_id`), CONSTRAINT `fk_child_parent` FOREIGN KEY (`parent_id`) REFERENCES `parents` (`id`) ON DELETE RESTRICT, CONSTRAINT `chk_child_amount` CHECK (`amount` >= 0)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
const HISTORY_DDL = 'CREATE TABLE `migration_history` (`id` bigint unsigned NOT NULL AUTO_INCREMENT, `filename` varchar(255) NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
const TRIGGER_DDL = 'CREATE DEFINER=`root`@`localhost` TRIGGER `trg_child_bi` BEFORE INSERT ON `children` FOR EACH ROW SET NEW.amount = IFNULL(NEW.amount, 0)';

interface FakeData {
  identity?: Row;
  grants?: Row[];
  tables?: Row[];
  collations?: Row[];
  columns?: Row[];
  statistics?: Row[];
  foreignKeys?: Row[];
  checks?: Row[];
  triggers?: Row[];
  showCreateTables?: Record<string, string>;
  showCreateTriggers?: Record<string, string>;
  throwOn?: (sql: string) => Error | undefined;
}

interface FakeConnection {
  connection: MetadataConnection;
  queries: string[];
  isEnded: () => boolean;
}

function dbError(code: string): Error {
  const error = new Error(code);
  (error as Error & { code: string }).code = code;
  return error;
}

function makeFake(data: FakeData = {}): FakeConnection {
  const queries: string[] = [];
  let ended = false;
  const tables = data.tables ?? [
    { tableName: 'parents', tableType: 'BASE TABLE', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci' },
    { tableName: 'children', tableType: 'BASE TABLE', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci' },
    { tableName: 'migration_history', tableType: 'BASE TABLE', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci' },
  ];
  const showCreateTables = data.showCreateTables ?? {
    parents: PARENTS_DDL,
    children: CHILDREN_DDL,
    migration_history: HISTORY_DDL,
  };
  const showCreateTriggers = data.showCreateTriggers ?? { trg_child_bi: TRIGGER_DDL };
  const triggers = data.triggers ?? [
    { triggerName: 'trg_child_bi', eventObjectTable: 'children', eventManipulation: 'INSERT', actionTiming: 'BEFORE', actionStatement: 'SET NEW.amount = IFNULL(NEW.amount, 0)', actionOrder: 1 },
  ];

  const handler = (rawSql: string): Row[] => {
    const sql = rawSql.replace(/\s+/g, ' ').trim();
    const injected = data.throwOn?.(sql);
    if (injected) throw injected;
    if (sql.startsWith('SELECT DATABASE()')) {
      return [data.identity ?? { databaseName: 'courtzon_v3', version: '8.0.36', versionComment: 'MySQL Community Server - GPL', lowerCaseTableNames: 0 }];
    }
    if (sql.startsWith('SHOW GRANTS')) {
      return data.grants ?? [{ 'Grants for root@%': 'GRANT ALL PRIVILEGES ON *.* TO `root`@`%`' }];
    }
    if (sql.includes('FROM information_schema.TABLES')) return tables;
    if (sql.includes('FROM information_schema.COLLATIONS')) return data.collations ?? [{ collationName: 'utf8mb4_unicode_ci', characterSetName: 'utf8mb4' }];
    if (sql.includes('FROM information_schema.COLUMNS')) return data.columns ?? [];
    if (sql.includes('FROM information_schema.STATISTICS')) return data.statistics ?? [];
    if (sql.includes('FROM information_schema.KEY_COLUMN_USAGE')) return data.foreignKeys ?? [];
    if (sql.includes('information_schema.CHECK_CONSTRAINTS')) return data.checks ?? [];
    if (sql.includes('FROM information_schema.TRIGGERS')) return triggers;
    if (sql.startsWith('SHOW CREATE TABLE')) {
      const match = /SHOW CREATE TABLE `[^`]+`\.`([^`]+)`/.exec(sql);
      const name = match?.[1];
      const ddl = name ? showCreateTables[name] : undefined;
      if (!ddl) throw new Error(`missing SHOW CREATE TABLE fixture for ${name ?? 'unknown'}`);
      return [{ 'Create Table': ddl }];
    }
    if (sql.startsWith('SHOW CREATE TRIGGER')) {
      const match = /SHOW CREATE TRIGGER `[^`]+`\.`([^`]+)`/.exec(sql);
      const name = match?.[1];
      const ddl = name ? showCreateTriggers[name] : undefined;
      if (!ddl) throw new Error(`missing SHOW CREATE TRIGGER fixture for ${name ?? 'unknown'}`);
      return [{ 'SQL Original Statement': ddl }];
    }
    if (sql === 'SET SESSION TRANSACTION READ ONLY' || sql === 'START TRANSACTION READ ONLY' || sql === 'ROLLBACK') return [];
    throw new Error(`unexpected query: ${sql}`);
  };

  const connection: MetadataConnection = {
    async query<T = Row>(sql: string): Promise<[T[], unknown]> {
      queries.push(sql);
      return [handler(sql) as T[], []];
    },
    async end(): Promise<void> {
      ended = true;
    },
  };
  return { connection, queries, isEnded: () => ended };
}

async function run(data: FakeData = {}, overrides: { staticValidation?: StaticValidationReport; expectDatabase?: string } = {}): Promise<{ report: LiveMetadataReport; fake: FakeConnection }> {
  const fake = makeFake(data);
  const report = await readLiveSchema({
    staticValidation: overrides.staticValidation ?? OK_STATIC,
    expectDatabase: overrides.expectDatabase ?? 'courtzon_v3',
    connection: { host: '127.0.0.1', port: 3306, user: 'root', password: 'test', database: 'courtzon_v3' },
    createConnection: async () => fake.connection,
  });
  return { report, fake };
}

function codes(report: LiveMetadataReport): string[] {
  return report.findings.map((finding) => finding.code);
}

function expectFinding(report: LiveMetadataReport, code: string): LiveMetadataFinding {
  const finding = report.findings.find((candidate) => candidate.code === code);
  expect(finding, `expected finding ${code}; got ${codes(report).join(',')}`).toBeDefined();
  return finding as LiveMetadataFinding;
}

describe('live metadata — static gate and connection lifecycle', () => {
  it('refuses to open a connection when V1 static validation failed', async () => {
    let called = false;
    const fake = makeFake();
    const report = await readLiveSchema({
      staticValidation: INVALID_STATIC,
      expectDatabase: 'courtzon_v3',
      connection: { host: '127.0.0.1', port: 3306, user: 'root', password: 'test', database: 'courtzon_v3' },
      createConnection: async () => {
        called = true;
        return fake.connection;
      },
    });
    expect(called).toBe(false);
    expect(report.ok).toBe(false);
    expect(report.fatal?.code).toBe('STATIC_VALIDATION_FAILED');
  });

  it('runs the target guard before opening any connection', async () => {
    let guarded: unknown;
    let connectionCalled = false;
    const fake = makeFake();
    const report = await readLiveSchema({
      staticValidation: OK_STATIC,
      expectDatabase: 'courtzon_v3',
      connection: { host: '127.0.0.1', port: 3306, user: 'root', password: 'test', database: 'courtzon_v3' },
      targetGuard: (target) => {
        guarded = target;
      },
      createConnection: async () => {
        connectionCalled = true;
        return fake.connection;
      },
    });

    expect(guarded).toEqual({
      host: '127.0.0.1',
      port: 3306,
      database: 'courtzon_v3',
      expectDatabase: 'courtzon_v3',
    });
    expect(connectionCalled).toBe(true);
    expect(report.fatal).toBeUndefined();
  });

  it('refuses to open a connection when the target guard rejects', async () => {
    let connectionCalled = false;
    const fake = makeFake();
    const report = await readLiveSchema({
      staticValidation: OK_STATIC,
      expectDatabase: 'courtzon_v3',
      connection: { host: '127.0.0.1', port: 3306, user: 'root', password: 'test', database: 'courtzon_v3' },
      targetGuard: () => {
        throw new Error('D1 target refused: port must be 3307.');
      },
      createConnection: async () => {
        connectionCalled = true;
        return fake.connection;
      },
    });

    expect(connectionCalled).toBe(false);
    expect(report.ok).toBe(false);
    expect(report.fatal?.code).toBe('TARGET_NOT_APPROVED');
    expect(report.fatal?.details).toContain('port must be 3307');
  });

  it('closes the connection on success', async () => {
    const { report, fake } = await run();
    expect(report.ok).toBe(true);
    expect(fake.isEnded()).toBe(true);
    expect(fake.queries).toContain('ROLLBACK');
  });

  it('closes the connection on an unexpected metadata failure', async () => {
    const { report, fake } = await run({
      throwOn: (sql) => (sql.includes('FROM information_schema.COLUMNS') ? new Error('boom') : undefined),
    });
    expect(report.ok).toBe(false);
    expect(report.fatal?.code).toBe('INTERNAL_ERROR');
    expect(fake.isEnded()).toBe(true);
  });

  it('never emits write, DDL, lock or history statements', async () => {
    const { fake } = await run();
    const forbidden = fake.queries.filter((sql) =>
      /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|RENAME|GET_LOCK|SET\s+GLOBAL|FLUSH)\b/i.test(sql),
    );
    expect(forbidden).toEqual([]);
    expect(fake.queries.some((sql) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))).toBe(false);
  });
});

describe('live metadata — identity, server and privileges', () => {
  it('fails closed on a wrong database before reading schema metadata', async () => {
    const { report, fake } = await run({ identity: { databaseName: 'courtzon_v2', version: '8.0.36', versionComment: 'MySQL', lowerCaseTableNames: 0 } });
    expect(report.fatal?.code).toBe('WRONG_DATABASE');
    expect(fake.queries.some((sql) => sql.includes('FROM information_schema.TABLES'))).toBe(false);
  });

  it('fails closed on MariaDB', async () => {
    const { report } = await run({ identity: { databaseName: 'courtzon_v3', version: '10.6.12-MariaDB', versionComment: 'MariaDB Server', lowerCaseTableNames: 0 } });
    expect(report.fatal?.code).toBe('UNSUPPORTED_SERVER');
  });

  it('fails closed on MySQL 5.7', async () => {
    const { report } = await run({ identity: { databaseName: 'courtzon_v3', version: '5.7.44', versionComment: 'MySQL Community Server', lowerCaseTableNames: 0 } });
    expect(report.fatal?.code).toBe('UNSUPPORTED_SERVER');
  });

  it('reports insufficient SELECT privileges instead of missing objects', async () => {
    const { report, fake } = await run({ grants: [{ 'Grants for root@%': 'GRANT USAGE ON *.* TO `root`@`%`' }] });
    expect(report.fatal?.code).toBe('INSUFFICIENT_PRIVILEGES');
    expect(fake.queries.some((sql) => sql.includes('FROM information_schema.TABLES'))).toBe(false);
  });

  it('marks trigger visibility unknown when TRIGGER is missing', async () => {
    const { report, fake } = await run({ grants: [{ 'Grants for root@%': 'GRANT SELECT ON `courtzon_v3`.* TO `root`@`%`' }] });
    expect(report.ok).toBe(true);
    expect(report.complete).toBe(false);
    expectFinding(report, 'TRIGGER_VISIBILITY_UNKNOWN');
    expect(fake.queries.some((sql) => sql.startsWith('SHOW CREATE TRIGGER'))).toBe(false);
  });

  it('fails closed on an empty schema', async () => {
    const { report } = await run({ tables: [] });
    expect(report.fatal?.code).toBe('SCHEMA_EMPTY');
  });
});

describe('live metadata — normalized snapshot', () => {
  it('builds a deterministic snapshot and excludes migration_history by default', async () => {
    const first = await run();
    const second = await run();
    expect(first.report.ok).toBe(true);
    expect(first.report.complete).toBe(true);
    expect(first.report.snapshot?.tables.parents.signature.columns.map((column) => column.name)).toEqual(['id', 'name']);
    expect(first.report.snapshot?.tables.children.signature.indexes.map((index) => index.name)).toEqual(['idx_child_parent', 'primary']);
    expect(first.report.snapshot?.tables.children.signature.foreignKeys[0]).toMatchObject({
      name: 'fk_child_parent',
      columns: ['parent_id'],
      referencedTable: 'parents',
      referencedColumns: ['id'],
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    });
    expect(first.report.snapshot?.tables.children.signature.checks[0]).toMatchObject({
      name: 'chk_child_amount',
      expression: 'amount >= 0',
    });
    expect(first.report.snapshot?.triggers.trg_child_bi.signature).toMatchObject({
      table: 'children',
      timing: 'BEFORE',
      event: 'INSERT',
    });
    expect(first.report.snapshot?.runtimeObjects).toEqual(['migration_history']);
    expect(first.report.snapshot?.tables.migration_history).toBeUndefined();
    expect(first.report.snapshot?.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(second.report.snapshot?.snapshotSha256).toBe(first.report.snapshot?.snapshotSha256);
    expect(first.report.findings.some((finding) => finding.code === 'RUNTIME_OBJECT_EXCLUDED')).toBe(true);
  });

  it('records views explicitly and does not silently omit them', async () => {
    const { report } = await run({
      tables: [
        { tableName: 'parents', tableType: 'BASE TABLE', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci' },
        { tableName: 'children', tableType: 'BASE TABLE', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci' },
        { tableName: 'some_view', tableType: 'VIEW', engine: null, collation: null },
      ],
    });
    expect(report.snapshot?.views).toEqual(['some_view']);
    expectFinding(report, 'VIEW_PRESENT');
  });

  it('records a missing read-only session safeguard as a warning, not a fatal error', async () => {
    const { report } = await run({
      throwOn: (sql) => (sql === 'SET SESSION TRANSACTION READ ONLY' ? dbError('ER_NOT_SUPPORTED_YET') : undefined),
    });
    expect(report.ok).toBe(true);
    expectFinding(report, 'READ_ONLY_SESSION_UNSUPPORTED');
  });

  it('records unavailable CHECK_CONSTRAINTS as a warning while SHOW CREATE remains exact', async () => {
    const { report } = await run({
      throwOn: (sql) => (sql.includes('CHECK_CONSTRAINTS') ? dbError('ER_NO_SUCH_TABLE') : undefined),
    });
    expect(report.ok).toBe(true);
    expect(report.complete).toBe(true);
    expectFinding(report, 'CHECK_CONSTRAINTS_UNAVAILABLE');
  });

  it('detects ambiguous trigger ordering', async () => {
    const { report } = await run({
      triggers: [
        { triggerName: 'trg_child_bi', eventObjectTable: 'children', eventManipulation: 'INSERT', actionTiming: 'BEFORE', actionStatement: 'SET NEW.amount = 0', actionOrder: 1 },
        { triggerName: 'trg_child_bi_2', eventObjectTable: 'children', eventManipulation: 'INSERT', actionTiming: 'BEFORE', actionStatement: 'SET NEW.amount = 1', actionOrder: 2 },
      ],
      showCreateTriggers: {
        trg_child_bi: 'CREATE TRIGGER `trg_child_bi` BEFORE INSERT ON `children` FOR EACH ROW SET NEW.amount = 0',
        trg_child_bi_2: 'CREATE TRIGGER `trg_child_bi_2` BEFORE INSERT ON `children` FOR EACH ROW SET NEW.amount = 1',
      },
    });
    expect(report.complete).toBe(false);
    expectFinding(report, 'AMBIGUOUS_TRIGGER_ORDER');
  });

  it('marks an unparseable SHOW CREATE TABLE as inexact and keeps a fallback signature', async () => {
    const { report } = await run({
      throwOn: (sql) => (sql.startsWith('SHOW CREATE TABLE') && sql.includes('`children`') ? new Error('unsupported DDL') : undefined),
      columns: [
        { tableName: 'children', columnName: 'id', ordinalPosition: 1, columnType: 'int unsigned', isNullable: 'NO', columnDefault: null, extra: 'auto_increment', generationExpression: '', characterSet: null, collation: null },
        { tableName: 'children', columnName: 'parent_id', ordinalPosition: 2, columnType: 'int unsigned', isNullable: 'NO', columnDefault: null, extra: '', generationExpression: '', characterSet: null, collation: null },
        { tableName: 'children', columnName: 'amount', ordinalPosition: 3, columnType: 'decimal(10,2)', isNullable: 'NO', columnDefault: '0', extra: '', generationExpression: '', characterSet: null, collation: null },
      ],
      statistics: [
        { tableName: 'children', indexName: 'PRIMARY', nonUnique: 0, seqInIndex: 1, columnName: 'id', subPart: null, collation: 'A', indexType: 'BTREE', expression: null, isVisible: 'YES' },
      ],
    });
    expect(report.ok).toBe(true);
    expect(report.complete).toBe(false);
    expect(report.snapshot?.tables.children.exact).toBe(false);
    expectFinding(report, 'UNSUPPORTED_DDL');
  });

  it('reports a functional index explicitly', async () => {
    const { report } = await run({
      throwOn: (sql) => (sql.startsWith('SHOW CREATE TABLE') && sql.includes('`children`') ? new Error('fallback') : undefined),
      columns: [
        { tableName: 'children', columnName: 'id', ordinalPosition: 1, columnType: 'int unsigned', isNullable: 'NO', columnDefault: null, extra: '', generationExpression: '', characterSet: null, collation: null },
      ],
      statistics: [
        { tableName: 'children', indexName: 'idx_functional', nonUnique: 1, seqInIndex: 1, columnName: null, subPart: null, collation: null, indexType: 'BTREE', expression: 'lower(`id`)', isVisible: 'YES' },
      ],
    });
    expectFinding(report, 'UNSUPPORTED_OBJECT');
  });
});
