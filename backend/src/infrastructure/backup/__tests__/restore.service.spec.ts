// ============================================================================
// CourtZon — Restore service unit tests (Phase 2)
//
// SAFETY: no database, Redis, Docker, S3, network, or mysql client is used.
// The mysql child process is simulated with an EventEmitter; all files live in
// an isolated OS temp directory.
// ============================================================================
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCipheriv, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { EventEmitter } from 'node:events';
import { PassThrough, Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import * as restore from '../../../../scripts/restore.js';

const KEY_HEX = 'a'.repeat(64);
const KEY = Buffer.from(KEY_HEX, 'hex');
const DB_CONFIG = { host: '127.0.0.1', port: '3306', user: 'tester', password: 'top-secret' };

/** Safe probe output: scheduler off, no binary logging, target exists, no events. */
const SAFE_PROBE_OUTPUT = [
  '@@event_scheduler\tOFF',
  '@@log_bin\tOFF',
  '@@log_bin_trust_function_creators\tOFF',
  '@@schema_exists\t1',
  '@@target_events\t0',
].join('\n');

const ROLES_DDL = [
  'CREATE TABLE `roles` (',
  '  `id` int unsigned NOT NULL AUTO_INCREMENT,',
  '  `organisation_id` int unsigned DEFAULT NULL,',
  '  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,',
  '  `slug` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,',
  '  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,',
  "  `is_system` tinyint(1) NOT NULL DEFAULT '0',",
  "  `is_active` tinyint(1) NOT NULL DEFAULT '1',",
  '  `deleted_at` timestamp NULL DEFAULT NULL,',
  '  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,',
  '  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,',
  '  `org_id_normalized` int unsigned GENERATED ALWAYS AS (ifnull(`organisation_id`,0)) VIRTUAL,',
  '  PRIMARY KEY (`id`),',
  '  UNIQUE KEY `uk_role_org_slug` (`org_id_normalized`,`slug`),',
  '  KEY `idx_org_role` (`organisation_id`),',
  '  CONSTRAINT `fk_role_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
].join('\n');

const SQL = [
  '/*!40101 SET NAMES utf8mb4 */;',
  ROLES_DDL,
  "INSERT INTO `roles` VALUES (1,NULL,'Player','player',NULL,1,1,NULL,'2020-01-01 00:00:00','2020-01-01 00:00:00',0)," +
    "(2,5,'Coach','coach','has,42) and ; inside',0,1,NULL,'2020-01-01 00:00:00','2020-01-01 00:00:00',5);",
  "INSERT INTO `users` VALUES (1,'name,7)');",
].join('\n');

function rolesTuple(id: number, last: string, description = 'NULL'): string {
  return `(${id},NULL,'Player','player',${description},1,1,NULL,'2020-01-01 00:00:00','2020-01-01 00:00:00',${last})`;
}

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'courtzon-restore-unit-'));
});

afterAll(() => {
  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    /* best effort on Windows */
  }
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeSpoolBase(prefix = 'spool'): string {
  const dir = join(workDir, `${prefix}-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFixture(name: string, buffer: Buffer): string {
  const path = join(workDir, name);
  writeFileSync(path, buffer);
  return path;
}

function gzipSql(sql: string = SQL): Buffer {
  return gzipSync(Buffer.from(sql, 'utf8'));
}

function encryptGcm(payload: Buffer, keyHex: string = KEY_HEX): Buffer {
  const key = Buffer.from(keyHex, 'hex');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([
    Buffer.from('CZBAK2', 'ascii'),
    nonce,
    ciphertext,
    cipher.getAuthTag(),
  ]);
}

function encryptCbc(payload: Buffer, keyHex: string = KEY_HEX): Buffer {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([iv, cipher.update(payload), cipher.final()]);
}

async function prepare(options: Record<string, unknown> = {}) {
  return restore.prepareSpool({
    format: 'gcm',
    key: KEY,
    spoolBaseDir: makeSpoolBase(),
    maxSpoolBytes: restore.DEFAULT_MAX_SPOOL_BYTES,
    ...options,
  });
}

function cleanupPrepared(spool: { spoolDir: string } | null | undefined): void {
  if (!spool?.spoolDir) return;
  try { rmSync(spool.spoolDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function readSpool(spool: { spoolPath: string }): string {
  return readFileSync(spool.spoolPath, 'utf8');
}

async function rewriteWithTransform(sqlText: string, options = {}, chunkSize = 7): Promise<string> {
  const inputChunks: Buffer[] = [];
  for (let index = 0; index < sqlText.length; index += chunkSize) {
    inputChunks.push(Buffer.from(sqlText.slice(index, index + chunkSize), 'utf8'));
  }
  const outputChunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      outputChunks.push(Buffer.from(chunk));
      callback();
    },
  });
  await pipeline(
    Readable.from(inputChunks),
    restore.createRolesGeneratedColumnRewriter(options),
    sink,
  );
  return Buffer.concat(outputChunks).toString('utf8');
}

function createFakeChild(options: { code?: number | null; signal?: string | null; stderr?: string; error?: Error; closeDelayMs?: number } = {}) {
  const child = new EventEmitter();
  child.stdin = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  child.stderr = new PassThrough();
  child.kill = vi.fn();
  const delay = options.closeDelayMs ?? 0;
  setTimeout(() => {
    if (options.stderr) child.stderr.write(options.stderr);
    child.stderr.end();
    if (options.error) child.emit('error', options.error);
    child.emit('close', options.code ?? 0, options.signal ?? null);
  }, delay);
  return child;
}

// ── CLI argument parsing ─────────────────────────────────────────────────────

describe('parseRestoreArgs', () => {
  it('accepts the minimal required arguments and defaults the target database', () => {
    const parsed = restore.parseRestoreArgs(['--file', 'backup.sql.gz.enc2']);
    expect(parsed.file).toBe('backup.sql.gz.enc2');
    expect(parsed.db).toBe('courtzon_restore_test');
    expect(parsed.dryRun).toBe(false);
    expect(parsed.maxSpoolBytes).toBe(restore.DEFAULT_MAX_SPOOL_BYTES);
  });

  it('accepts --opt=value form', () => {
    const parsed = restore.parseRestoreArgs([
      '--file=backup.sql.gz.enc2',
      '--db=courtzon_restore_test',
      '--max-spool-bytes=2097152',
      '--dry-run',
    ]);
    expect(parsed.file).toBe('backup.sql.gz.enc2');
    expect(parsed.maxSpoolBytes).toBe(2 * 1024 * 1024);
    expect(parsed.dryRun).toBe(true);
  });

  it('returns help only when --help is used alone', () => {
    expect(restore.parseRestoreArgs(['--help']).help).toBe(true);
    expect(() => restore.parseRestoreArgs(['--help', '--dry-run'])).toThrow(/--help must be used alone/);
  });

  it.each([
    [['--unknown'], /Unknown argument/],
    [['--file'], /Missing value/],
    [['--file', '--dry-run'], /Missing value/],
    [['--file', ''], /Missing value/],
    [['--file', 'a', '--file', 'b'], /Duplicate argument/],
    [['--dry-run', '--dry-run', '--file', 'a'], /Duplicate argument/],
    [['--file', 'a', '--db'], /Missing value/],
    [['--file', 'a', 'positional'], /Unexpected positional argument/],
    [['--file', 'a', '--'], /not supported/],
    [['--file', 'a', '--dry-run=yes'], /does not accept a value/],
    [['--file', 'a', '--max-spool-bytes', 'abc'], /positive integer/],
    [['--file', 'a', '--max-spool-bytes', '0'], /between/],
    [['--file', 'a', '--max-spool-bytes', '999999999999999'], /between/],
  ])('rejects invalid arguments %j', (argv, pattern) => {
    expect(() => restore.parseRestoreArgs(argv)).toThrow(pattern);
  });

  it('requires --file', () => {
    expect(() => restore.parseRestoreArgs(['--dry-run'])).toThrow(/--file <backup-file> is required/);
  });
});

describe('validateDatabaseName / resolveTargetDatabase', () => {
  it('accepts safe names', () => {
    expect(restore.validateDatabaseName('courtzon_restore_test')).toBe('courtzon_restore_test');
    expect(restore.validateDatabaseName('Custom_DB_1')).toBe('Custom_DB_1');
  });

  it.each(['', 'bad-name', 'db name', 'db;drop', 'db`x', 'mysql', 'information_schema', 'performance_schema', 'sys', 'a'.repeat(65)])(
    'rejects unsafe name %j',
    (name) => {
      expect(() => restore.validateDatabaseName(name)).toThrow(restore.RestoreArgumentError);
    },
  );

  it('allows the default target without confirmation', () => {
    const parsed = restore.parseRestoreArgs(['--file', 'x']);
    expect(restore.resolveTargetDatabase(parsed)).toBe('courtzon_restore_test');
  });

  it('requires an exact destructive confirmation for any other target', () => {
    const parsed = restore.parseRestoreArgs(['--file', 'x', '--db', 'courtzon_v3']);
    expect(() => restore.resolveTargetDatabase(parsed)).toThrow(/confirm-destructive=courtzon_v3/);
  });

  it('accepts a non-default target when the confirmation matches exactly', () => {
    const parsed = restore.parseRestoreArgs([
      '--file', 'x',
      '--db', 'courtzon_v3',
      '--confirm-destructive', 'courtzon_v3',
    ]);
    expect(restore.resolveTargetDatabase(parsed)).toBe('courtzon_v3');
  });

  it('rejects a mismatched confirmation', () => {
    const parsed = restore.parseRestoreArgs([
      '--file', 'x',
      '--db', 'courtzon_v3',
      '--confirm-destructive', 'courtzon_restore_test',
    ]);
    expect(() => restore.resolveTargetDatabase(parsed)).toThrow(/Refusing to restore/);
  });

  it('rejects --confirm-destructive for the default target', () => {
    const parsed = restore.parseRestoreArgs([
      '--file', 'x',
      '--confirm-destructive', 'courtzon_restore_test',
    ]);
    expect(() => restore.resolveTargetDatabase(parsed)).toThrow(/only valid for a non-default target/);
  });
});

describe('validateEncryptionKey', () => {
  it('accepts exactly 64 hex characters (case-insensitive)', () => {
    expect(restore.validateEncryptionKey(KEY_HEX).length).toBe(32);
    expect(restore.validateEncryptionKey('A1b2'.repeat(16)).length).toBe(32);
  });

  it.each(['', 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), ` ${'a'.repeat(64)}`, `${'a'.repeat(64)} `])(
    'rejects invalid key %j',
    (key) => {
      expect(() => restore.validateEncryptionKey(key)).toThrow(restore.RestoreKeyError);
    },
  );
});

describe('resolveDbConnection', () => {
  it('requires an explicit DB_USER (no implicit root)', () => {
    expect(() => restore.resolveDbConnection({ DB_PASSWORD: 'p' })).toThrow(/DB_USER is required/);
    expect(() => restore.resolveDbConnection({ DB_USER: '   ', DB_PASSWORD: 'p' })).toThrow(/DB_USER is required/);
    expect(() => restore.resolveDbConnection({ DB_USER: '-root', DB_PASSWORD: 'p' })).toThrow(/DB_USER is required/);
  });

  it('requires an explicit DB_PASSWORD', () => {
    expect(() => restore.resolveDbConnection({ DB_USER: 'courtzon_migration' }))
      .toThrow(/DB_PASSWORD is required/);
    expect(() => restore.resolveDbConnection({ DB_USER: 'courtzon_migration', DB_PASSWORD: '   ' }))
      .toThrow(/DB_PASSWORD is required/);
  });

  it('returns validated connection settings', () => {
    expect(restore.resolveDbConnection({
      DB_HOST: 'db.internal',
      DB_PORT: '3307',
      DB_USER: 'courtzon_migration',
      DB_PASSWORD: 'secret',
    })).toEqual({
      host: 'db.internal',
      port: '3307',
      user: 'courtzon_migration',
      password: 'secret',
    });
  });

  it('keeps host and port validation', () => {
    expect(() => restore.resolveDbConnection({ DB_HOST: 'bad host', DB_USER: 'u', DB_PASSWORD: 'p' }))
      .toThrow(/DB_HOST/);
    expect(() => restore.resolveDbConnection({ DB_PORT: '0', DB_USER: 'u', DB_PASSWORD: 'p' }))
      .toThrow(/DB_PORT/);
  });
});

describe('detectBackupFormat', () => {
  it('maps extensions without inspecting content', () => {
    expect(restore.detectBackupFormat('/x/a.sql.gz.enc2')).toBe('gcm');
    expect(restore.detectBackupFormat('/x/a.SQL.GZ.ENC2')).toBe('gcm');
    expect(restore.detectBackupFormat('/x/a.sql.gz.enc')).toBe('cbc');
    expect(restore.detectBackupFormat('/x/a.sql.gz')).toBe('plain');
    expect(restore.detectBackupFormat('/x/a.sql')).toBe('sql');
  });

  it('rejects unknown extensions', () => {
    expect(() => restore.detectBackupFormat('/x/a.zip')).toThrow(restore.RestoreFormatError);
  });
});

// ── Spool capacity limits ────────────────────────────────────────────────────

describe('evaluateSpoolSpace', () => {
  it('requires 2x the backup size with a 256 MiB floor', () => {
    const { requiredBytes } = restore.evaluateSpoolSpace({
      freeBytes: 1024 * 1024 * 1024,
      backupBytes: 1024 * 1024,
      maxSpoolBytes: 10 * 1024 * 1024 * 1024,
    });
    expect(requiredBytes).toBe(256 * 1024 * 1024);
  });

  it('caps the requirement at the configured maximum', () => {
    const { requiredBytes } = restore.evaluateSpoolSpace({
      freeBytes: 128,
      backupBytes: 1024 * 1024,
      maxSpoolBytes: 64,
    });
    expect(requiredBytes).toBe(64);
  });

  it('rejects insufficient free space', () => {
    expect(() =>
      restore.evaluateSpoolSpace({
        freeBytes: 100,
        backupBytes: 1024,
        maxSpoolBytes: 10 * 1024 * 1024,
      }),
    ).toThrow(restore.RestoreSpoolLimitError);
  });

  it('rejects an unreadable free-space value', () => {
    expect(() =>
      restore.evaluateSpoolSpace({ freeBytes: Number.NaN, backupBytes: 1, maxSpoolBytes: 10 }),
    ).toThrow(/Could not determine free disk space/);
  });
});

describe('createSpoolSizeLimiter', () => {
  it('permits output within the limit', async () => {
    const output: Buffer[] = [];
    const sink = new Writable({
      write(chunk, _encoding, callback) { output.push(Buffer.from(chunk)); callback(); },
    });
    await expect(
      pipeline(
        Readable.from([Buffer.alloc(4), Buffer.alloc(4)]),
        restore.createSpoolSizeLimiter(8),
        sink,
      ),
    ).resolves.toBeUndefined();
    expect(Buffer.concat(output).length).toBe(8);
  });

  it('aborts the spool as soon as the limit is exceeded', async () => {
    await expect(
      pipeline(
        Readable.from([Buffer.alloc(6), Buffer.alloc(6)]),
        restore.createSpoolSizeLimiter(10),
        new Writable({ write(_chunk, _encoding, callback) { callback(); } }),
      ),
    ).rejects.toThrow(/exceeds the configured maximum/);
  });

  it('rejects invalid limits', () => {
    expect(() => restore.createSpoolSizeLimiter(0)).toThrow(restore.RestoreArgumentError);
    expect(() => restore.createSpoolSizeLimiter(-1)).toThrow(restore.RestoreArgumentError);
  });
});

// ── GCM preparation ──────────────────────────────────────────────────────────

describe('prepareSpool — GCM', () => {
  it('spools a valid GCM backup and rewrites the roles generated column', async () => {
    const filePath = writeFixture('valid.sql.gz.enc2', encryptGcm(gzipSql()));
    const spool = await prepare({ filePath });
    try {
      const sql = readSpool(spool);
      expect(sql).toContain("INSERT INTO `roles` VALUES (1,NULL,'Player','player',NULL,1,1,NULL,'2020-01-01 00:00:00','2020-01-01 00:00:00',DEFAULT)");
      expect(sql).toContain(",DEFAULT);");
      expect(sql).toContain("'has,42) and ; inside'");
      expect(sql).toContain("INSERT INTO `users` VALUES (1,'name,7)');");
      expect(spool.spoolBytes).toBeGreaterThan(0);
    } finally {
      cleanupPrepared(spool);
    }
  });

  it('rejects a wrong key (GCM authentication failure) and removes the spool', async () => {
    const filePath = writeFixture('wrong-key.sql.gz.enc2', encryptGcm(gzipSql()));
    const spoolBaseDir = makeSpoolBase();
    const wrongKey = Buffer.from('b'.repeat(64), 'hex');

    await expect(prepare({ filePath, key: wrongKey, spoolBaseDir }))
      .rejects.toThrow(/authentication failed/);
    expect(readdirSync(spoolBaseDir)).toEqual([]);
  });

  it('rejects modified ciphertext and removes the spool', async () => {
    const encrypted = encryptGcm(gzipSql());
    encrypted[encrypted.length - 20] ^= 0xff;
    const filePath = writeFixture('tampered.sql.gz.enc2', encrypted);
    const spoolBaseDir = makeSpoolBase();

    await expect(prepare({ filePath, spoolBaseDir })).rejects.toThrow(/authentication failed/);
    expect(readdirSync(spoolBaseDir)).toEqual([]);
  });

  it('rejects an invalid magic', async () => {
    const encrypted = encryptGcm(gzipSql());
    encrypted.write('BADMAG', 0, 'ascii');
    const filePath = writeFixture('bad-magic.sql.gz.enc2', encrypted);

    await expect(prepare({ filePath })).rejects.toThrow(/Invalid GCM backup magic/);
  });

  it('rejects a truncated header/body that cannot contain a tag', async () => {
    const filePath = writeFixture('truncated.sql.gz.enc2', Buffer.alloc(20));
    await expect(prepare({ filePath })).rejects.toThrow(/Truncated GCM backup/);
  });

  it('rejects a tag that was removed (authentication fails, never executed)', async () => {
    const encrypted = encryptGcm(gzipSql());
    const tagRemoved = encrypted.subarray(0, encrypted.length - 16);
    const filePath = writeFixture('truncated-tag.sql.gz.enc2', tagRemoved);
    const spoolBaseDir = makeSpoolBase();

    await expect(prepare({ filePath, spoolBaseDir }))
      .rejects.toThrow(/authentication failed/);
    expect(readdirSync(spoolBaseDir)).toEqual([]);
  });

  it('rejects gzip corruption after successful GCM authentication', async () => {
    const corruptGzip = gzipSql();
    corruptGzip[corruptGzip.length - 8] ^= 0xff; // corrupt CRC32
    const filePath = writeFixture('bad-gzip.sql.gz.enc2', encryptGcm(corruptGzip));
    const spoolBaseDir = makeSpoolBase();

    await expect(prepare({ filePath, spoolBaseDir }))
      .rejects.toThrow(/decompression failed/);
    expect(readdirSync(spoolBaseDir)).toEqual([]);
  });

  it('enforces the maximum spool size during streaming', async () => {
    const bigSql = `-- ${'x'.repeat(2 * 1024 * 1024)}\n`;
    const filePath = writeFixture('big.sql.gz.enc2', encryptGcm(gzipSql(bigSql)));
    const spoolBaseDir = makeSpoolBase();

    await expect(prepare({ filePath, spoolBaseDir, maxSpoolBytes: 1024 }))
      .rejects.toThrow(/exceeds the configured maximum/);
    expect(readdirSync(spoolBaseDir)).toEqual([]);
  });
});

// ── Legacy CBC / plaintext preparation ───────────────────────────────────────

describe('prepareSpool — legacy formats', () => {
  it('spools a valid legacy CBC backup', async () => {
    const filePath = writeFixture('legacy.sql.gz.enc', encryptCbc(gzipSql()));
    const spool = await prepare({ filePath, format: 'cbc' });
    try {
      expect(readSpool(spool)).toContain("INSERT INTO `users` VALUES (1,'name,7)');");
      expect(readSpool(spool)).toContain(',DEFAULT)');
    } finally {
      cleanupPrepared(spool);
    }
  });

  it('rejects a CBC payload whose length is not a multiple of the AES block size', async () => {
    const filePath = writeFixture('bad-cbc.sql.gz.enc', Buffer.concat([randomBytes(16), randomBytes(31)]));
    await expect(prepare({ filePath, format: 'cbc' }))
      .rejects.toThrow(/not a multiple of the AES block size/);
  });

  it('rejects a too-short CBC payload', async () => {
    const filePath = writeFixture('short-cbc.sql.gz.enc', randomBytes(10));
    await expect(prepare({ filePath, format: 'cbc' })).rejects.toThrow(/Truncated legacy CBC backup/);
  });

  it('does not treat a GCM file as CBC (extension + gzip verification fail)', async () => {
    const filePath = writeFixture('gcm-as-cbc.sql.gz.enc', encryptGcm(gzipSql()));
    await expect(prepare({ filePath, format: 'cbc' })).rejects.toThrow(restore.RestoreError);
  });

  it('spools a legacy plaintext gzip backup', async () => {
    const filePath = writeFixture('plain.sql.gz', gzipSql());
    const spool = await prepare({ filePath, format: 'plain', key: null });
    try {
      expect(readSpool(spool)).toContain('INSERT INTO `users`');
    } finally {
      cleanupPrepared(spool);
    }
  });

  it('spools a legacy uncompressed .sql backup', async () => {
    const filePath = writeFixture('plain.sql', Buffer.from(SQL, 'utf8'));
    const spool = await prepare({ filePath, format: 'sql', key: null });
    try {
      expect(readSpool(spool)).toContain('INSERT INTO `users`');
      expect(readSpool(spool)).toContain(',DEFAULT)');
    } finally {
      cleanupPrepared(spool);
    }
  });
});

// ── Generated column rewriting ───────────────────────────────────────────────

describe('validateRolesTableDefinition', () => {
  it('accepts the authoritative 11-column generated-last schema', () => {
    const result = restore.validateRolesTableDefinition(ROLES_DDL);
    expect(result.columnCount).toBe(11);
    expect(result.columns[result.columns.length - 1]).toBe('org_id_normalized');
  });

  it('rejects a generated column that is not the final column', () => {
    const ddl = ROLES_DDL.replace(
      '  `org_id_normalized` int unsigned GENERATED ALWAYS AS (ifnull(`organisation_id`,0)) VIRTUAL,',
      '  `org_id_normalized` int unsigned GENERATED ALWAYS AS (ifnull(`organisation_id`,0)) VIRTUAL,\n  `extra_col` int DEFAULT NULL,',
    );
    expect(() => restore.validateRolesTableDefinition(ddl)).toThrow(/not the final declared column/);
  });

  it('rejects a missing generated column', () => {
    const ddl = ROLES_DDL.replace(
      '  `org_id_normalized` int unsigned GENERATED ALWAYS AS (ifnull(`organisation_id`,0)) VIRTUAL,\n',
      '',
    );
    expect(() => restore.validateRolesTableDefinition(ddl)).toThrow(/must declare `org_id_normalized` exactly once/);
  });

  it('rejects a final column that is not actually generated', () => {
    const ddl = ROLES_DDL.replace(
      'int unsigned GENERATED ALWAYS AS (ifnull(`organisation_id`,0)) VIRTUAL',
      'int unsigned DEFAULT 0',
    );
    expect(() => restore.validateRolesTableDefinition(ddl)).toThrow(/not declared as a generated column/);
  });

  it('rejects a column-count mismatch (schema drift)', () => {
    const ddl = ROLES_DDL.replace("  `is_active` tinyint(1) NOT NULL DEFAULT '1',\n", '');
    expect(() => restore.validateRolesTableDefinition(ddl)).toThrow(/declares 10 columns/);
  });

  it('rejects a missing or malformed CREATE TABLE statement', () => {
    expect(() => restore.validateRolesTableDefinition('CREATE TABLE `roles` ('))
      .toThrow(/Malformed/);
    expect(() => restore.validateRolesTableDefinition('CREATE TABLE `accounts` (`id` int);'))
      .toThrow(/does not contain the expected CREATE TABLE/);
  });
});

describe('rewriteRolesValues', () => {
  it('replaces the final (generated) value with DEFAULT for all 11 columns', () => {
    const result = restore.rewriteRolesValues(` ${rolesTuple(1, '0')}`);
    expect(result.text).toBe(` ${rolesTuple(1, 'DEFAULT')}`);
    expect(result.rewrittenCount).toBe(1);
    expect(result.tupleCount).toBe(1);
  });

  it('handles multiple 11-value tuples in one INSERT', () => {
    const result = restore.rewriteRolesValues(` ${rolesTuple(1, '0')},${rolesTuple(2, '7')}`);
    expect(result.text).toBe(` ${rolesTuple(1, 'DEFAULT')},${rolesTuple(2, 'DEFAULT')}`);
    expect(result.rewrittenCount).toBe(2);
    expect(result.tupleCount).toBe(2);
  });

  it('replaces NULL with DEFAULT and leaves an existing DEFAULT untouched', () => {
    expect(restore.rewriteRolesValues(` ${rolesTuple(1, 'NULL')}`).text)
      .toBe(` ${rolesTuple(1, 'DEFAULT')}`);
    expect(restore.rewriteRolesValues(` ${rolesTuple(1, 'DEFAULT')}`).text)
      .toBe(` ${rolesTuple(1, 'DEFAULT')}`);
  });

  it('never touches commas, parentheses or semicolons inside string data', () => {
    const text = ` ${rolesTuple(1, '8', "'a,42) ; b'")}`;
    expect(restore.rewriteRolesValues(text).text)
      .toBe(` ${rolesTuple(1, 'DEFAULT', "'a,42) ; b'")}`);
  });

  it('handles escaped quotes and doubled quotes', () => {
    const escaped = ` ${rolesTuple(1, '8', "'it\\'s,9)'")}`;
    expect(restore.rewriteRolesValues(escaped).text)
      .toBe(` ${rolesTuple(1, 'DEFAULT', "'it\\'s,9)'")}`);

    const doubled = ` ${rolesTuple(1, '8', "'it''s,9)'")}`;
    expect(restore.rewriteRolesValues(doubled).text)
      .toBe(` ${rolesTuple(1, 'DEFAULT', "'it''s,9)'")}`);
  });

  it('fails closed on 10 or 12 values', () => {
    const ten = "(1,NULL,'Player','player',NULL,1,1,NULL,'2020-01-01 00:00:00',0)";
    const twelve = `${rolesTuple(1, '0').slice(0, -1)},99)`;
    expect(() => restore.rewriteRolesValues(` ${ten}`)).toThrow(/has 10 values, expected 11/);
    expect(() => restore.rewriteRolesValues(` ${twelve}`)).toThrow(/has 12 values, expected 11/);
  });

  it('fails closed on an unexpected generated-column value', () => {
    expect(() => restore.rewriteRolesValues(` ${rolesTuple(1, "'not-a-number'")}`))
      .toThrow(/unexpected generated-column value/);
  });

  it('fails closed when no tuple is present', () => {
    expect(() => restore.rewriteRolesValues(' ')).toThrow(/contains no tuple/);
  });
});

describe('createRolesGeneratedColumnRewriter', () => {
  it('rewrites only roles INSERT statements after verifying the CREATE TABLE', async () => {
    const sql = `${SQL}\nINSERT INTO \`permissions\` VALUES (1,0);\n`;
    const rewritten = await rewriteWithTransform(sql, {}, 3);
    expect(rewritten).toContain("INSERT INTO `roles` VALUES (1,NULL,'Player','player',NULL,1,1,NULL,'2020-01-01 00:00:00','2020-01-01 00:00:00',DEFAULT)");
    expect(rewritten).toContain("'has,42) and ; inside'");
    expect(rewritten).toContain('INSERT INTO `permissions` VALUES (1,0);');
    expect(rewritten).toContain("INSERT INTO `users` VALUES (1,'name,7)');");
  });

  it('fails closed when a roles INSERT appears without a verified CREATE TABLE', async () => {
    await expect(rewriteWithTransform(`INSERT INTO \`roles\` VALUES ${rolesTuple(1, '0')};`, {}, 5))
      .rejects.toThrow(/before a verified CREATE TABLE/);
  });

  it('fails closed when the roles CREATE TABLE is incompatible', async () => {
    const badDdl = ROLES_DDL.replace(
      '  `org_id_normalized` int unsigned GENERATED ALWAYS AS (ifnull(`organisation_id`,0)) VIRTUAL,',
      '  `org_id_normalized` int unsigned GENERATED ALWAYS AS (ifnull(`organisation_id`,0)) VIRTUAL,\n  `extra_col` int DEFAULT NULL,',
    );
    const sql = `${badDdl}\nINSERT INTO \`roles\` VALUES ${rolesTuple(1, '0')};`;
    await expect(rewriteWithTransform(sql, {}, 8)).rejects.toThrow(/not the final declared column/);
  });

  it('fails closed when any tuple does not have exactly 11 values', async () => {
    const sql = `${ROLES_DDL}\nINSERT INTO \`roles\` VALUES (1,2);`;
    await expect(rewriteWithTransform(sql, {}, 8)).rejects.toThrow(/has 2 values, expected 11/);
  });

  it('fails closed on an INSERT with an explicit roles column list', async () => {
    const sql = `${ROLES_DDL}\nINSERT INTO \`roles\` (\`id\`) VALUES (1);`;
    await expect(rewriteWithTransform(sql, {}, 8)).rejects.toThrow(/explicit column list/);
  });

  it('does not rewrite a marker that is not at a statement boundary', async () => {
    const sql = "SELECT 'INSERT INTO `roles` VALUES (1,2);';\n";
    const rewritten = await rewriteWithTransform(sql, {}, 5);
    expect(rewritten).toBe(sql);
  });

  it('leaves SQL without roles INSERT statements byte-identical', async () => {
    const sql = 'CREATE TABLE `x` (`id` int);\nINSERT INTO `x` VALUES (1);\n';
    expect(await rewriteWithTransform(sql, {}, 4)).toBe(sql);
  });

  it('fails closed on a truncated roles statement', async () => {
    await expect(rewriteWithTransform(`${ROLES_DDL}\nINSERT INTO \`roles\` VALUES (1,2`, {}, 4))
      .rejects.toThrow(/ended inside an INSERT INTO `roles` statement/);
  });

  it('fails closed when the roles INSERT exceeds the safe rewrite limit', async () => {
    const values = ` (${'1,'.repeat(3000)}1)`;
    await expect(
      rewriteWithTransform(
        `${ROLES_DDL}\nINSERT INTO \`roles\` VALUES${values}`,
        { maxStatementBytes: 4096 },
        8,
      ),
    ).rejects.toThrow(/exceeds the safe rewrite limit/);
  });
});

describe('classifyCreateHeader', () => {
  it('classifies CREATE TABLE without scanning its column definitions', () => {
    expect(restore.classifyCreateHeader('CREATE TABLE `t` (`definer` int)').status).toBe('object');
  });

  it('accepts SQL SECURITY DEFINER when there is no DEFINER clause', () => {
    expect(
      restore.classifyCreateHeader('CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `v` AS SELECT 1').status,
    ).toBe('object');
  });

  it('detects a real DEFINER clause', () => {
    expect(
      restore.classifyCreateHeader('CREATE DEFINER=`alice`@`localhost` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1').status,
    ).toBe('definer');
  });

  it('detects malformed DEFINER without an equals sign', () => {
    expect(restore.classifyCreateHeader('CREATE DEFINER TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1').status)
      .toBe('definer');
  });

  it('ignores DEFINER in regular comments and string literals', () => {
    expect(
      restore.classifyCreateHeader('CREATE /* DEFINER=`alice`@`localhost` */ TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1').status,
    ).toBe('object');
    expect(
      restore.classifyCreateHeader("CREATE TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a='DEFINER=`alice`@`localhost`'").status,
    ).toBe('object');
  });

  it('treats executable version comments as code', () => {
    expect(
      restore.classifyCreateHeader('CREATE/*!50017 DEFINER=`alice`@`localhost`*/ /*!50003 TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1').status,
    ).toBe('definer');
    expect(
      restore.classifyCreateHeader('CREATE/*!50003 TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1').status,
    ).toBe('object');
  });

  it('fails closed when a CREATE terminates before an object keyword', () => {
    expect(restore.classifyCreateHeader('CREATE ;').status).toBe('terminated');
    expect(restore.classifyCreateHeader('CREATE').status).toBe('incomplete');
  });
});

async function runDefinerGuard(sqlText: string, chunkSize = 7): Promise<string> {
  const inputChunks: Buffer[] = [];
  for (let index = 0; index < sqlText.length; index += chunkSize) {
    inputChunks.push(Buffer.from(sqlText.slice(index, index + chunkSize), 'utf8'));
  }
  const outputChunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      outputChunks.push(Buffer.from(chunk));
      callback();
    },
  });
  await pipeline(Readable.from(inputChunks), restore.createDefinerGuard(), sink);
  return Buffer.concat(outputChunks).toString('utf8');
}

describe('DEFINER guard', () => {
  it.each([
    ['trigger (plain)', 'CREATE DEFINER=alice@localhost TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;'],
    ['trigger (backticked)', 'CREATE DEFINER=`alice`@`localhost` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;'],
    ['trigger (mysqldump)', '/*!50003 CREATE*/ /*!50017 DEFINER=`alice`@`localhost`*/ /*!50003 TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1 */;;'],
    ['view', 'CREATE ALGORITHM=UNDEFINED DEFINER=`alice`@`%` SQL SECURITY DEFINER VIEW `v` AS SELECT 1;'],
    ['view (mysqldump)', '/*!50001 CREATE ALGORITHM=UNDEFINED */\n/*!50013 DEFINER=`alice`@`localhost` SQL SECURITY DEFINER */\n/*!50001 VIEW `v` AS SELECT 1 */;'],
    ['procedure', 'CREATE DEFINER=`alice`@`localhost` PROCEDURE `p`() SELECT 1;'],
    ['function', 'CREATE DEFINER=`alice`@`localhost` FUNCTION `f`() RETURNS int DETERMINISTIC RETURN 1;'],
    ['event', 'CREATE DEFINER=`alice`@`localhost` EVENT `e` ON SCHEDULE EVERY 1 DAY DO SELECT 1;'],
    ['whitespace/case', 'cReAtE   dEfInEr = alice@localhost   tRiGgEr `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;'],
    ['multiple clauses', 'CREATE DEFINER=alice@localhost TRIGGER `a` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;\nCREATE DEFINER=bob@localhost TRIGGER `b` BEFORE INSERT ON `x` FOR EACH ROW SET @b=1;'],
  ])('rejects executable DEFINER metadata: %s', async (_label, sql) => {
    await expect(runDefinerGuard(sql, 1)).rejects.toThrow(/DEFINER metadata/);
  });

  it('never includes the definer identity or SQL text in the error', async () => {
    const sql = 'CREATE DEFINER=`secret_user`@`secret_host` TRIGGER `secret_trigger` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;';
    let error: Error | null = null;
    try {
      await runDefinerGuard(sql);
    } catch (caught) {
      error = caught as Error;
    }
    expect(error).not.toBeNull();
    expect(error!.message).not.toContain('secret_user');
    expect(error!.message).not.toContain('secret_host');
    expect(error!.message).not.toContain('secret_trigger');
    expect(error!.message).not.toContain('CREATE');
    expect(error!.message).not.toContain('TRIGGER');
  });

  it.each([
    ["string literal", "INSERT INTO `t` VALUES ('CREATE DEFINER=alice@localhost TRIGGER x');"],
    ['line comment', '-- CREATE DEFINER=alice@localhost TRIGGER x\nSELECT 1;'],
    ['block comment', '/* CREATE DEFINER=alice@localhost TRIGGER x */ SELECT 1;'],
    ['column named definer', 'CREATE TABLE `definer` (`DEFINER` int, `definer` varchar(10));'],
    ['ordinary INSERT data', "INSERT INTO `t` (`definer`) VALUES ('DEFINER = alice@localhost');"],
    ['SQL SECURITY DEFINER only', 'CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `v` AS SELECT `definer` FROM `t`;'],
    ['mysqldump trigger without DEFINER', 'DELIMITER ;;\n/*!50003 CREATE*/ /*!50003 TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1 */;;\nDELIMITER ;'],
    ['mysqldump view without DEFINER', '/*!50001 CREATE ALGORITHM=UNDEFINED */\n/*!50013 SQL SECURITY DEFINER */\n/*!50001 VIEW `v` AS SELECT 1 */;'],
    ['trailing line comment', 'SELECT 1; -- trailing DEFINER=alice@localhost'],
    ['user variable named @create', 'SET @create = 1; SELECT @create;'],
    ['trigger body containing the word', "CREATE TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a='DEFINER=alice@localhost';"],
  ])('accepts harmless mentions: %s', async (_label, sql) => {
    await expect(runDefinerGuard(sql, 1)).resolves.toBe(sql);
  });

  it('fails closed on a truncated DEFINER statement', async () => {
    await expect(runDefinerGuard('CREATE DEFINER=`alice`@`localhost`', 3))
      .rejects.toThrow(/DEFINER metadata/);
  });

  it('fails closed when the dump ends inside a string or comment', async () => {
    await expect(runDefinerGuard("SELECT 'unterminated", 2))
      .rejects.toThrow(/ended inside a quoted string or comment/);
    await expect(runDefinerGuard('SELECT 1; /* unterminated', 2))
      .rejects.toThrow(/ended inside a quoted string or comment/);
  });

  it('rejects a plain SQL backup containing DEFINER before MySQL starts', async () => {
    const filePath = writeFixture(
      'definer-plain.sql',
      Buffer.from('CREATE DEFINER=`alice`@`localhost` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;', 'utf8'),
    );
    const spawnImpl = vi.fn();

    await expect(
      restore.restoreFromBackup({
        filePath,
        format: 'sql',
        key: null,
        spoolBaseDir: makeSpoolBase(),
        maxSpoolBytes: restore.DEFAULT_MAX_SPOOL_BYTES,
        database: restore.DEFAULT_TARGET_DB,
        dbConfig: DB_CONFIG,
        spawnImpl,
      }),
    ).rejects.toThrow(/DEFINER metadata/);

    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('rejects a GCM backup containing DEFINER before MySQL starts', async () => {
    const definerSql = 'CREATE DEFINER=`alice`@`localhost` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;';
    const filePath = writeFixture('definer-gcm.sql.gz.enc2', encryptGcm(gzipSql(definerSql)));
    const spawnImpl = vi.fn();
    const spoolBaseDir = makeSpoolBase();

    await expect(
      restore.restoreFromBackup({
        filePath,
        format: 'gcm',
        key: KEY,
        spoolBaseDir,
        maxSpoolBytes: restore.DEFAULT_MAX_SPOOL_BYTES,
        database: restore.DEFAULT_TARGET_DB,
        dbConfig: DB_CONFIG,
        spawnImpl,
      }),
    ).rejects.toThrow(/DEFINER metadata/);

    expect(spawnImpl).not.toHaveBeenCalled();
    expect(readdirSync(spoolBaseDir)).toEqual([]);
  });

  it('authenticates GCM before scanning the spool for DEFINER metadata', async () => {
    const definerSql = 'CREATE DEFINER=`alice`@`localhost` TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a=1;';
    const encrypted = encryptGcm(gzipSql(definerSql));
    encrypted[encrypted.length - 20] ^= 0xff;
    const filePath = writeFixture('definer-gcm-tampered.sql.gz.enc2', encrypted);

    await expect(
      restore.prepareSpool({
        filePath,
        format: 'gcm',
        key: KEY,
        spoolBaseDir: makeSpoolBase(),
        maxSpoolBytes: restore.DEFAULT_MAX_SPOOL_BYTES,
      }),
    ).rejects.toThrow(/authentication failed/);
  });
});

// ── Stream/child closure helpers ─────────────────────────────────────────────

describe('closure helpers', () => {
  it('awaitStreamClose resolves only on a real close event', async () => {
    const stream = new PassThrough();
    const promise = restore.awaitStreamClose(stream, 100);
    setTimeout(() => stream.destroy(), 5);
    await expect(promise).resolves.toBe(true);
  });

  it('awaitStreamClose times out without treating destroyed as closed', async () => {
    const stream = new EventEmitter();
    stream.destroyed = true;
    stream.closed = false;
    stream.destroy = () => undefined;
    await expect(restore.awaitStreamClose(stream, 10)).resolves.toBe(false);
  });

  it('awaitChildClose ignores exitCode/signalCode and times out', async () => {
    const child = Object.assign(new EventEmitter(), {
      exitCode: 0,
      signalCode: 'SIGKILL',
      destroyed: true,
    });
    await expect(restore.awaitChildClose(child, () => false, 10)).resolves.toBe(false);
  });

  it('shouldPreserveSpool is true when closure is unconfirmed', () => {
    expect(restore.shouldPreserveSpool(false)).toBe(true);
    expect(restore.shouldPreserveSpool(true)).toBe(false);
  });
});

// ── MySQL execution ──────────────────────────────────────────────────────────

describe('runMysqlRestore', () => {
  function makeSpoolFile(name: string): string {
    const path = join(workDir, name);
    writeFileSync(path, 'SELECT 1;\n');
    return path;
  }

  it('passes credentials through MYSQL_PWD and never on the command line', async () => {
    const spawnImpl = vi.fn(() => createFakeChild({ code: 0 }));
    const result = await restore.runMysqlRestore({
      spoolPath: makeSpoolFile('spool-ok.sql'),
      database: restore.DEFAULT_TARGET_DB,
      dbConfig: DB_CONFIG,
      spawnImpl,
    });

    expect(result.exitCode).toBe(0);
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawnImpl.mock.calls[0];
    expect(command).toBe('mysql');
    expect(args).toContain(`--database=${restore.DEFAULT_TARGET_DB}`);
    expect(args.join(' ')).not.toContain('--password');
    expect(args.join(' ')).not.toContain(DB_CONFIG.password);
    expect(options.env.MYSQL_PWD).toBe(DB_CONFIG.password);
  });

  it('waits for the actual close event before settling', async () => {
    let settled = false;
    const promise = restore.runMysqlRestore({
      spoolPath: makeSpoolFile('spool-slow.sql'),
      database: restore.DEFAULT_TARGET_DB,
      dbConfig: DB_CONFIG,
      spawnImpl: () => createFakeChild({ code: 0, closeDelayMs: 60 }),
    });
    promise.then(() => { settled = true; });

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    expect(settled).toBe(false);
    await promise;
    expect(settled).toBe(true);
  });

  it('reports a failed mysql exit and warns about partial modification', async () => {
    await expect(
      restore.runMysqlRestore({
        spoolPath: makeSpoolFile('spool-fail.sql'),
        database: restore.DEFAULT_TARGET_DB,
        dbConfig: DB_CONFIG,
        spawnImpl: () => createFakeChild({ code: 1, stderr: 'ERROR 3105: invalid generated value' }),
      }),
    ).rejects.toThrow(/may have been partially modified[\s\S]*ERROR 3105/);
  });

  it('reports a mysql spawn error after the actual close', async () => {
    const error = Object.assign(new Error('spawn mysql ENOENT'), { code: 'ENOENT' });
    await expect(
      restore.runMysqlRestore({
        spoolPath: makeSpoolFile('spool-spawn-error.sql'),
        database: restore.DEFAULT_TARGET_DB,
        dbConfig: DB_CONFIG,
        spawnImpl: () => createFakeChild({ code: null, error }),
      }),
    ).rejects.toThrow(/Failed to start the mysql client/);
  });

  it('refuses to spawn mysql without explicit credentials', async () => {
    const spawnImpl = vi.fn();

    await expect(
      restore.runMysqlRestore({
        spoolPath: makeSpoolFile('spool-no-creds.sql'),
        database: restore.DEFAULT_TARGET_DB,
        dbConfig: { host: 'localhost', port: '3306', user: '', password: '' },
        spawnImpl,
      }),
    ).rejects.toThrow(/DB_USER is required/);
    expect(spawnImpl).not.toHaveBeenCalled();

    await expect(
      restore.runMysqlRestore({
        spoolPath: makeSpoolFile('spool-no-password.sql'),
        database: restore.DEFAULT_TARGET_DB,
        dbConfig: { host: 'localhost', port: '3306', user: 'courtzon_migration', password: '' },
        spawnImpl,
      }),
    ).rejects.toThrow(/DB_PASSWORD is required/);
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('refuses an unsafe target database defensively', async () => {
    await expect(
      restore.runMysqlRestore({
        spoolPath: makeSpoolFile('spool-unsafe.sql'),
        database: 'bad-name',
        dbConfig: DB_CONFIG,
        spawnImpl: () => createFakeChild({ code: 0 }),
      }),
    ).rejects.toThrow(restore.RestoreArgumentError);
  });
});

// ── Dry-run CLI semantics ────────────────────────────────────────────────────

describe('main — dry-run (plan only)', () => {
  it('states explicitly that no cryptographic or gzip verification was performed', async () => {
    const filePath = writeFixture('dry-run.sql.gz', gzipSql());
    const output: string[] = [];

    const code = await restore.main(['--file', filePath, '--dry-run'], {
      env: { DB_USER: 'courtzon_migration', DB_PASSWORD: 'top-secret' },
      stdout: (line: string) => output.push(line),
      stderr: () => undefined,
    });

    const text = output.join('\n');
    expect(code).toBe(0);
    expect(text).toContain('Plan only');
    expect(text).toContain('does NOT decrypt or authenticate');
    expect(text).toContain('does NOT verify gzip integrity or CRC');
    expect(text).toContain('does NOT prove that the backup can be restored');
    expect(text).toContain('does NOT execute SQL');
    expect(text).toContain(restore.DEFAULT_TARGET_DB);
    expect(text).not.toContain('top-secret');
  });

  it('fails before printing a plan when DB_USER/DB_PASSWORD are missing', async () => {
    const filePath = writeFixture('dry-run-no-creds.sql.gz', gzipSql());

    await expect(restore.main(['--file', filePath, '--dry-run'], {
      env: {},
      stdout: () => undefined,
      stderr: () => undefined,
    })).rejects.toThrow(/DB_USER is required/);

    await expect(restore.main(['--file', filePath, '--dry-run'], {
      env: { DB_USER: 'courtzon_migration' },
      stdout: () => undefined,
      stderr: () => undefined,
    })).rejects.toThrow(/DB_PASSWORD is required/);
  });
});

// ── Orchestration safety ─────────────────────────────────────────────────────

describe('restoreFromBackup', () => {
  it('does not start mysql when authentication fails', async () => {
    const encrypted = encryptGcm(gzipSql());
    encrypted[encrypted.length - 20] ^= 0xff;
    const filePath = writeFixture('no-sql-before-auth.sql.gz.enc2', encrypted);
    const spawnImpl = vi.fn();

    await expect(
      restore.restoreFromBackup({
        filePath,
        format: 'gcm',
        key: KEY,
        spoolBaseDir: makeSpoolBase(),
        maxSpoolBytes: restore.DEFAULT_MAX_SPOOL_BYTES,
        database: restore.DEFAULT_TARGET_DB,
        dbConfig: DB_CONFIG,
        spawnImpl,
      }),
    ).rejects.toThrow(/authentication failed/);

    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('does not start mysql when gzip verification fails', async () => {
    const corruptGzip = gzipSql();
    corruptGzip[corruptGzip.length - 8] ^= 0xff;
    const filePath = writeFixture('no-sql-before-gzip.sql.gz.enc2', encryptGcm(corruptGzip));
    const spawnImpl = vi.fn();

    await expect(
      restore.restoreFromBackup({
        filePath,
        format: 'gcm',
        key: KEY,
        spoolBaseDir: makeSpoolBase(),
        maxSpoolBytes: restore.DEFAULT_MAX_SPOOL_BYTES,
        database: restore.DEFAULT_TARGET_DB,
        dbConfig: DB_CONFIG,
        spawnImpl,
      }),
    ).rejects.toThrow(/decompression failed/);

    expect(spawnImpl).not.toHaveBeenCalled();
  });

  function restoreSqlWithGcm(sqlText: string, spawnImpl: ReturnType<typeof vi.fn>) {
    const filePath = writeFixture(`guarded-${randomBytes(4).toString('hex')}.sql.gz.enc2`, encryptGcm(gzipSql(sqlText)));
    return restore.restoreFromBackup({
      filePath,
      format: 'gcm',
      key: KEY,
      spoolBaseDir: makeSpoolBase(),
      maxSpoolBytes: restore.DEFAULT_MAX_SPOOL_BYTES,
      database: restore.DEFAULT_TARGET_DB,
      dbConfig: DB_CONFIG,
      spawnImpl,
    });
  }

  it('does not start mysql when the roles CREATE TABLE is missing', async () => {
    const spawnImpl = vi.fn();
    await expect(
      restoreSqlWithGcm(`INSERT INTO \`roles\` VALUES ${rolesTuple(1, '0')};\n`, spawnImpl),
    ).rejects.toThrow(/before a verified CREATE TABLE/);
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('does not start mysql when a roles tuple has the wrong arity', async () => {
    const spawnImpl = vi.fn();
    await expect(
      restoreSqlWithGcm(`${ROLES_DDL}\nINSERT INTO \`roles\` VALUES (1,2);\n`, spawnImpl),
    ).rejects.toThrow(/has 2 values, expected 11/);
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('does not start mysql when the generated column is not last', async () => {
    const spawnImpl = vi.fn();
    const badDdl = ROLES_DDL.replace(
      '  `org_id_normalized` int unsigned GENERATED ALWAYS AS (ifnull(`organisation_id`,0)) VIRTUAL,',
      '  `org_id_normalized` int unsigned GENERATED ALWAYS AS (ifnull(`organisation_id`,0)) VIRTUAL,\n  `extra_col` int DEFAULT NULL,',
    );
    await expect(
      restoreSqlWithGcm(`${badDdl}\nINSERT INTO \`roles\` VALUES ${rolesTuple(1, '0')};\n`, spawnImpl),
    ).rejects.toThrow(/not the final declared column/);
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('spools, executes via the injected child, and removes the spool on success', async () => {
    const filePath = writeFixture('orchestrated.sql.gz.enc2', encryptGcm(gzipSql()));
    const spawnImpl = vi.fn(() => createFakeChild({ code: 0 }));

    const result = await restore.restoreFromBackup({
      filePath,
      format: 'gcm',
      key: KEY,
      spoolBaseDir: makeSpoolBase(),
      maxSpoolBytes: restore.DEFAULT_MAX_SPOOL_BYTES,
      database: restore.DEFAULT_TARGET_DB,
      dbConfig: DB_CONFIG,
      spawnImpl,
      tlsCliArgs: [],
      probeRunner: async () => SAFE_PROBE_OUTPUT,
    });

    expect(spawnImpl).toHaveBeenCalledTimes(1);
    expect(result.spoolDir).toBeDefined();
    expect(existsSync(result.spoolDir)).toBe(false);
  });

  it('does nothing in dry-run mode', async () => {
    const spawnImpl = vi.fn();
    const result = await restore.restoreFromBackup({
      filePath: 'does-not-need-to-exist.sql.gz.enc2',
      format: 'gcm',
      key: KEY,
      database: restore.DEFAULT_TARGET_DB,
      dbConfig: DB_CONFIG,
      spawnImpl,
      dryRun: true,
    });
    expect(result).toEqual({ dryRun: true });
    expect(spawnImpl).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Phase 2.12 Group B — restore TLS, pre-import safety probes, scheduler and
// binary-logging guards, partial-restore handling.
//
// SAFETY: still no database, mysql client, Redis or network. Probe output is
// injected; the mysql child is the existing in-memory fake.
// ════════════════════════════════════════════════════════════════════════════

function probeOutput(overrides: {
  event_scheduler?: string;
  log_bin?: string;
  trust?: string;
  schema_exists?: string;
  target_events?: string;
} = {}): string {
  const pick = (key: keyof typeof overrides, fallback: string) => overrides[key] ?? fallback;
  return [
    `@@event_scheduler\t${pick('event_scheduler', 'OFF')}`,
    `@@log_bin\t${pick('log_bin', 'OFF')}`,
    `@@log_bin_trust_function_creators\t${pick('trust', 'OFF')}`,
    `@@schema_exists\t${pick('schema_exists', '1')}`,
    `@@target_events\t${pick('target_events', '0')}`,
  ].join('\n');
}

const NO_OBJECTS = { triggers: 0, procedures: 0, functions: 0, events: 0, views: 0 };
const SAFE_PROBES = {
  eventScheduler: 'OFF',
  logBin: 'OFF',
  trustFunctionCreators: 'OFF',
  targetEventCount: 0,
  databaseExists: true,
  eventVisibility: 'proven',
};

describe('restore TLS policy', () => {
  it('fails closed outside local when DB_TLS_MODE is unset', () => {
    expect(() => restore.resolveRestoreTlsPolicy({ COURTZON_MIGRATION_ENV: 'production' }))
      .toThrow(/TLS policy is not safe for restore/);
  });

  it('fails closed on an invalid mode', () => {
    expect(() => restore.resolveRestoreTlsPolicy({
      COURTZON_MIGRATION_ENV: 'production',
      DB_TLS_MODE: 'prefer',
    })).toThrow(/Invalid DB_TLS_MODE/);
  });

  it('reuses the shared MariaDB argument table for require', () => {
    const policy = restore.resolveRestoreTlsPolicy({
      COURTZON_MIGRATION_ENV: 'production',
      DB_TLS_MODE: 'require',
    });
    expect(policy.cliArgs).toEqual(['--ssl', '--skip-ssl-verify-server-cert']);
  });

  it('never falls back to plaintext in an unclassified environment', () => {
    expect(() => restore.resolveRestoreTlsPolicy({})).toThrow(/cannot be/i);
  });

  it('passes the resolved TLS arguments to the actual import client', async () => {
    const spoolPath = join(workDir, 'tls-import-spool.sql');
    writeFileSync(spoolPath, 'SELECT 1;\n');
    const spawnImpl = vi.fn(() => createFakeChild({ code: 0 }));

    await restore.runMysqlRestore({
      spoolPath,
      database: restore.DEFAULT_TARGET_DB,
      dbConfig: DB_CONFIG,
      spawnImpl,
      tlsCliArgs: ['--ssl', '--skip-ssl-verify-server-cert'],
    });

    const [, args] = spawnImpl.mock.calls[0] as [string, string[]];
    expect(args).toContain('--ssl');
    expect(args).toContain('--skip-ssl-verify-server-cert');
    expect(args.join(' ')).not.toContain(DB_CONFIG.password);
  });
});

describe('pre-import safety probes', () => {
  const database = restore.DEFAULT_TARGET_DB;

  it('passes the resolved TLS arguments to the probe client', async () => {
    let seen: Record<string, unknown> | null = null;
    await restore.runSafetyProbes({
      database,
      dbConfig: DB_CONFIG,
      tlsCliArgs: ['--ssl', '--ssl-ca=/tmp/test-ca.pem'],
      probeRunner: async (options: Record<string, unknown>) => {
        seen = options;
        return SAFE_PROBE_OUTPUT;
      },
    });
    expect(seen).not.toBeNull();
    expect((seen as Record<string, unknown>).tlsCliArgs)
      .toEqual(['--ssl', '--ssl-ca=/tmp/test-ca.pem']);
  });

  it('uses read-only SQL and never changes the scheduler or global variables', async () => {
    const statements: string[] = [];
    await restore.runSafetyProbes({
      database,
      dbConfig: DB_CONFIG,
      tlsCliArgs: [],
      probeRunner: async (options: Record<string, unknown>) => {
        statements.push(String(options.sql));
        return SAFE_PROBE_OUTPUT;
      },
    });
    const probeSql = statements[0];
    const visibilitySql = statements[1];
    expect(probeSql).toMatch(/SELECT/i);
    expect(probeSql).not.toMatch(/SET\s+GLOBAL|ALTER\s+EVENT|CREATE\s+EVENT|DROP\s+EVENT|SET\s+@@/i);
    expect(visibilitySql).toMatch(/^SHOW EVENTS FROM/i);
    expect(visibilitySql).not.toMatch(/SET\s+GLOBAL|ALTER\s+EVENT|CREATE\s+EVENT|DROP\s+EVENT|SET\s+@@/i);
  });

  it('fails closed when the probe cannot run', async () => {
    await expect(restore.runSafetyProbes({
      database,
      dbConfig: DB_CONFIG,
      probeRunner: async () => { throw new Error('access denied'); },
    })).rejects.toThrow(/safety probe could not be completed/i);
  });

  it('fails closed on malformed or incomplete probe output', async () => {
    await expect(restore.runSafetyProbes({
      database, dbConfig: DB_CONFIG, probeRunner: async () => 'garbage',
    })).rejects.toThrow(/malformed/);

    await expect(restore.runSafetyProbes({
      database, dbConfig: DB_CONFIG, probeRunner: async () => '@@event_scheduler\tOFF',
    })).rejects.toThrow(/did not return/);
  });

  it('fails closed on an unrecognised scheduler value', async () => {
    await expect(restore.runSafetyProbes({
      database,
      dbConfig: DB_CONFIG,
      probeRunner: async () => probeOutput({ event_scheduler: 'MAYBE' }),
    })).rejects.toThrow(/Could not interpret @@GLOBAL\.event_scheduler/);
  });

  it('fails closed when the target database does not exist', async () => {
    await expect(restore.runSafetyProbes({
      database,
      dbConfig: DB_CONFIG,
      probeRunner: async () => probeOutput({ schema_exists: '0' }),
    })).rejects.toThrow(/does not exist/);
  });

  it('normalises 1/0 values to ON/OFF', async () => {
    const probes = await restore.runSafetyProbes({
      database,
      dbConfig: DB_CONFIG,
      probeRunner: async () => probeOutput({ log_bin: '1', trust: '0' }),
    });
    expect(probes.logBin).toBe('ON');
    expect(probes.trustFunctionCreators).toBe('OFF');
  });
});

describe('event visibility probe', () => {
  const database = restore.DEFAULT_TARGET_DB;

  it('accepts visibility proven by a global EVENT privilege', async () => {
    const probes = await restore.runSafetyProbes({
      database,
      dbConfig: DB_CONFIG,
      probeRunner: async () => SAFE_PROBE_OUTPUT,
      eventVisibilityProbe: async () => true,
    });
    expect(probes.eventVisibility).toBe('proven');
    expect(probes.visibilityError).toBeNull();
  });

  it('accepts visibility proven on the target schema', async () => {
    // SCHEMA-level EVENT grants make SHOW EVENTS succeed; the probe consumes the
    // server's decision, not the grant text.
    const probes = await restore.runSafetyProbes({
      database,
      dbConfig: DB_CONFIG,
      probeRunner: async () => SAFE_PROBE_OUTPUT,
      eventVisibilityProbe: async () => true,
    });
    expect(probes.eventVisibility).toBe('proven');
  });

  it('accepts visibility granted through active roles', async () => {
    // MySQL/MariaDB evaluate active roles inside the privilege check, so a
    // role-derived EVENT privilege also returns success here.
    const probes = await restore.runSafetyProbes({
      database,
      dbConfig: DB_CONFIG,
      probeRunner: async () => SAFE_PROBE_OUTPUT,
      eventVisibilityProbe: async () => true,
    });
    expect(probes.eventVisibility).toBe('proven');
  });

  it('marks visibility unproven when the EVENT privilege is absent', async () => {
    const probes = await restore.runSafetyProbes({
      database,
      dbConfig: DB_CONFIG,
      probeRunner: async () => SAFE_PROBE_OUTPUT,
      eventVisibilityProbe: async () => {
        throw new restore.RestoreSafetyError(
          'Access denied; you need (at least one of) the EVENT privilege(s) for this operation',
        );
      },
    });
    expect(probes.eventVisibility).toBe('unproven');
    expect(probes.visibilityError).toMatch(/EVENT privilege/);
  });

  it('marks visibility unproven when the privilege probe output is unavailable or malformed', async () => {
    const probes = await restore.runSafetyProbes({
      database,
      dbConfig: DB_CONFIG,
      probeRunner: async () => SAFE_PROBE_OUTPUT,
      eventVisibilityProbe: async () => {
        throw new Error('unexpected output from the visibility probe');
      },
    });
    expect(probes.eventVisibility).toBe('unproven');
    expect(probes.visibilityError).toMatch(/unexpected output/);
  });

  it('passes the TLS arguments to the visibility probe', async () => {
    let seenTls: unknown = null;
    await restore.runSafetyProbes({
      database,
      dbConfig: DB_CONFIG,
      tlsCliArgs: ['--ssl', '--skip-ssl-verify-server-cert'],
      probeRunner: async () => SAFE_PROBE_OUTPUT,
      eventVisibilityProbe: async (options: Record<string, unknown>) => {
        seenTls = options.tlsCliArgs;
        return true;
      },
    });
    expect(seenTls).toEqual(['--ssl', '--skip-ssl-verify-server-cert']);
  });
});

describe('event visibility safety', () => {
  it('blocks when visibility is unproven and the scheduler is ON, even with zero visible events', () => {
    expect(() => restore.evaluateRestoreSafety({
      probes: {
        ...SAFE_PROBES,
        eventScheduler: 'ON',
        targetEventCount: 0,
        eventVisibility: 'unproven',
      },
      objects: NO_OBJECTS,
    })).toThrow(/Could not prove that the restore account can see every event/);
  });

  it('allows the explicit override when visibility is unproven, with a warning', () => {
    const result = restore.evaluateRestoreSafety({
      probes: { ...SAFE_PROBES, eventScheduler: 'ON', eventVisibility: 'unproven' },
      objects: NO_OBJECTS,
      allowEventSchedulerRisk: true,
    });
    expect(result.warnings.join(' ')).toMatch(/event visibility could not be proven/i);
    expect(result.warnings.join(' ')).toMatch(/scheduler was NOT modified/i);
  });

  it('keeps the safe path when visibility is proven and no events exist', () => {
    const result = restore.evaluateRestoreSafety({
      probes: { ...SAFE_PROBES, eventScheduler: 'ON', eventVisibility: 'proven' },
      objects: NO_OBJECTS,
    });
    expect(result.warnings).toEqual([]);
  });

  it('reports unproven visibility but proceeds when the scheduler is OFF', () => {
    const result = restore.evaluateRestoreSafety({
      probes: { ...SAFE_PROBES, eventVisibility: 'unproven' },
      objects: NO_OBJECTS,
    });
    expect(result.warnings.join(' ')).toMatch(/visibility could not be proven/i);
    expect(result.warnings.join(' ')).toMatch(/Event Scheduler is OFF/i);
  });

  it('does not let the scheduler override bypass an unsafe TLS policy', async () => {
    await expect(restore.restoreFromBackup({
      filePath: join(workDir, 'unused-tls-check.sql.gz.enc2'),
      format: 'gcm',
      key: KEY,
      database: restore.DEFAULT_TARGET_DB,
      dbConfig: DB_CONFIG,
      env: { COURTZON_MIGRATION_ENV: 'production' },
      allowEventSchedulerRisk: true,
      probeRunner: async () => SAFE_PROBE_OUTPUT,
    })).rejects.toThrow(/TLS policy is not safe/);
  });
});

describe('event scheduler safety', () => {
  it('blocks when the scheduler is ON and the target already has events', () => {
    expect(() => restore.evaluateRestoreSafety({
      probes: { ...SAFE_PROBES, eventScheduler: 'ON', targetEventCount: 2 },
      objects: NO_OBJECTS,
    })).toThrow(/Event Scheduler is ON/);
  });

  it('blocks when the scheduler is ON and the artifact creates events', () => {
    expect(() => restore.evaluateRestoreSafety({
      probes: { ...SAFE_PROBES, eventScheduler: 'ON' },
      objects: { ...NO_OBJECTS, events: 1 },
    })).toThrow(/Event Scheduler is ON/);
  });

  it('allows the explicit override with a clear warning and never changes the scheduler', () => {
    const result = restore.evaluateRestoreSafety({
      probes: { ...SAFE_PROBES, eventScheduler: 'ON' },
      objects: { ...NO_OBJECTS, events: 1 },
      allowEventSchedulerRisk: true,
    });
    expect(result.warnings.join(' ')).toMatch(/scheduler was NOT modified/i);
    expect(result.warnings.join(' ')).toMatch(/may execute/i);
  });

  it('follows the safe path when the scheduler is OFF', () => {
    const result = restore.evaluateRestoreSafety({
      probes: SAFE_PROBES,
      objects: { ...NO_OBJECTS, events: 1 },
    });
    expect(result.warnings).toEqual([]);
  });

  it('does not treat --confirm-destructive as scheduler consent', () => {
    const parsed = restore.parseRestoreArgs([
      '--file', 'backup.sql.gz.enc2',
      '--db', 'courtzon_v3',
      '--confirm-destructive=courtzon_v3',
    ]);
    expect(parsed.allowEventSchedulerRisk).toBe(false);
    expect(parsed.allowTriggerCreateWithBinlog).toBe(false);
  });

  it('continues with the explicit override, warns, and starts the import', async () => {
    const eventSql = [
      ROLES_DDL,
      'CREATE EVENT `ev_test` ON SCHEDULE EVERY 1 DAY DO DELETE FROM `roles` WHERE 1 = 0;',
    ].join('\n');
    const filePath = writeFixture('scheduler-override.sql.gz.enc2', encryptGcm(gzipSql(eventSql)));
    const spawnImpl = vi.fn(() => createFakeChild({ code: 0 }));
    const messages: string[] = [];

    await restore.restoreFromBackup({
      filePath,
      format: 'gcm',
      key: KEY,
      spoolBaseDir: makeSpoolBase('scheduler-override'),
      maxSpoolBytes: restore.DEFAULT_MAX_SPOOL_BYTES,
      database: restore.DEFAULT_TARGET_DB,
      dbConfig: DB_CONFIG,
      spawnImpl,
      tlsCliArgs: [],
      probeRunner: async () => probeOutput({ event_scheduler: 'ON' }),
      allowEventSchedulerRisk: true,
      stderr: (line: string) => messages.push(line),
    });

    expect(spawnImpl).toHaveBeenCalledTimes(1);
    expect(messages.join(' ')).toMatch(/Event Scheduler is ON/i);
    expect(messages.join(' ')).toMatch(/NOT modified/i);
  });
});

describe('binary logging safety', () => {
  const binlogProbes = {
    ...SAFE_PROBES,
    logBin: 'ON',
    trustFunctionCreators: 'OFF',
  };

  it('blocks triggers when binary logging is on and trust is off', () => {
    expect(() => restore.evaluateRestoreSafety({
      probes: binlogProbes,
      objects: { ...NO_OBJECTS, triggers: 1 },
    })).toThrow(/log_bin_trust_function_creators=OFF/);
  });

  it('blocks functions too', () => {
    expect(() => restore.evaluateRestoreSafety({
      probes: binlogProbes,
      objects: { ...NO_OBJECTS, functions: 2 },
    })).toThrow(/log_bin_trust_function_creators=OFF/);
  });

  it('allows procedures only', () => {
    expect(() => restore.evaluateRestoreSafety({
      probes: binlogProbes,
      objects: { ...NO_OBJECTS, procedures: 3 },
    })).not.toThrow();
  });

  it('allows the combination when trust_function_creators is ON', () => {
    expect(() => restore.evaluateRestoreSafety({
      probes: { ...binlogProbes, trustFunctionCreators: 'ON' },
      objects: { ...NO_OBJECTS, triggers: 1 },
    })).not.toThrow();
  });

  it('allows triggers when binary logging is OFF', () => {
    expect(() => restore.evaluateRestoreSafety({
      probes: SAFE_PROBES,
      objects: { ...NO_OBJECTS, triggers: 1, functions: 1 },
    })).not.toThrow();
  });

  it('allows the explicit override with a warning and changes no variable', () => {
    const result = restore.evaluateRestoreSafety({
      probes: binlogProbes,
      objects: { ...NO_OBJECTS, triggers: 1 },
      allowTriggerCreateWithBinlog: true,
    });
    expect(result.warnings.join(' ')).toMatch(/No server variable was modified/i);
  });
});

describe('partial restore handling', () => {
  it('retains the verified spool and reports possible partial modification', async () => {
    const filePath = writeFixture('partial-failure.sql.gz.enc2', encryptGcm(gzipSql()));
    const spoolBaseDir = makeSpoolBase('partial');
    const messages: string[] = [];

    await expect(restore.restoreFromBackup({
      filePath,
      format: 'gcm',
      key: KEY,
      spoolBaseDir,
      maxSpoolBytes: restore.DEFAULT_MAX_SPOOL_BYTES,
      database: restore.DEFAULT_TARGET_DB,
      dbConfig: DB_CONFIG,
      spawnImpl: () => createFakeChild({ code: 1, stderr: 'ERROR 1146: table missing' }),
      tlsCliArgs: [],
      probeRunner: async () => SAFE_PROBE_OUTPUT,
      stderr: (line: string) => messages.push(line),
    })).rejects.toThrow(/partially modified/);

    const retained = readdirSync(spoolBaseDir);
    expect(retained).toHaveLength(1);
    expect(messages.join('\n')).toContain(retained[0]);
    expect(messages.join('\n')).toMatch(/No automatic retry was attempted/);

    const retainedPath = join(spoolBaseDir, retained[0]);
    if (process.platform !== 'win32') {
      expect(statSync(retainedPath).mode & 0o777).toBe(0o700);
    }
    rmSync(retainedPath, { recursive: true, force: true });
  });

  it('does not run safety probes when DEFINER verification fails first', async () => {
    const definerSql = [
      ROLES_DDL,
      'DELIMITER ;;',
      '/*!50003 CREATE*/ /*!50017 DEFINER=`alice`@`localhost`*/ /*!50003 TRIGGER `t` BEFORE INSERT ON `roles` FOR EACH ROW SET @a=1 */;;',
      'DELIMITER ;',
    ].join('\n');
    const filePath = writeFixture('definer-block.sql.gz.enc2', encryptGcm(gzipSql(definerSql)));
    const probeRunner = vi.fn(async () => SAFE_PROBE_OUTPUT);

    await expect(restore.restoreFromBackup({
      filePath,
      format: 'gcm',
      key: KEY,
      spoolBaseDir: makeSpoolBase('definer'),
      maxSpoolBytes: restore.DEFAULT_MAX_SPOOL_BYTES,
      database: restore.DEFAULT_TARGET_DB,
      dbConfig: DB_CONFIG,
      spawnImpl: vi.fn(),
      tlsCliArgs: [],
      probeRunner,
    })).rejects.toThrow(/DEFINER/);

    expect(probeRunner).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Phase 2.12 Group C — visibility transport hardening
// ════════════════════════════════════════════════════════════════════════════

describe('event visibility transport', () => {
  it('resolves proven for a successful SHOW EVENTS with empty output', async () => {
    const spawnImpl = vi.fn(() => createFakeChild({ code: 0 }));

    await expect(restore.defaultEventVisibilityProbe({
      database: restore.DEFAULT_TARGET_DB,
      dbConfig: DB_CONFIG,
      tlsCliArgs: ['--ssl', '--skip-ssl-verify-server-cert'],
      spawnImpl,
    })).resolves.toBe(true);

    expect(spawnImpl).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawnImpl.mock.calls[0] as [string, string[], { env: Record<string, string> }];
    expect(command).toBe('mysql');
    expect(args.join(' ')).toContain(`SHOW EVENTS FROM \`${restore.DEFAULT_TARGET_DB}\``);
    expect(args).toContain('--ssl');
    expect(args).toContain('--skip-ssl-verify-server-cert');
    expect(args.join(' ')).not.toContain('--password');
    expect(args.join(' ')).not.toContain(DB_CONFIG.password);
    expect(options.env.MYSQL_PWD).toBe(DB_CONFIG.password);
  });

  it('treats a permission-denied exit code as a failure', async () => {
    await expect(restore.defaultEventVisibilityProbe({
      database: restore.DEFAULT_TARGET_DB,
      dbConfig: DB_CONFIG,
      spawnImpl: () => createFakeChild({
        code: 1,
        stderr: 'ERROR 1227 (42000): Access denied; you need (at least one of) the EVENT privilege(s)',
      }),
    })).rejects.toThrow(/ERROR 1227/);
  });

  it('treats any non-zero exit as a failure', async () => {
    await expect(restore.defaultEventVisibilityProbe({
      database: restore.DEFAULT_TARGET_DB,
      dbConfig: DB_CONFIG,
      spawnImpl: () => createFakeChild({ code: 2 }),
    })).rejects.toThrow(/exit code 2/);
  });

  it('treats a synchronous spawn failure as a failure', async () => {
    await expect(restore.defaultEventVisibilityProbe({
      database: restore.DEFAULT_TARGET_DB,
      dbConfig: DB_CONFIG,
      spawnImpl: () => { throw new Error('spawn boom'); },
    })).rejects.toThrow(/Could not start the safety probe/);
  });

  it('treats a child-process error event as a failure', async () => {
    await expect(restore.defaultEventVisibilityProbe({
      database: restore.DEFAULT_TARGET_DB,
      dbConfig: DB_CONFIG,
      spawnImpl: () => createFakeChild({ error: new Error('ENOENT: mysql not found') }),
    })).rejects.toThrow(/mysql client failed/);
  });

  it('treats a timeout as a failure', async () => {
    await expect(restore.defaultEventVisibilityProbe({
      database: restore.DEFAULT_TARGET_DB,
      dbConfig: DB_CONFIG,
      closeTimeoutMs: 10,
      spawnImpl: () => createFakeChild({ code: 0, closeDelayMs: 100 }),
    })).rejects.toThrow(/timed out/);
  });
});

describe('event visibility result handling', () => {
  const database = restore.DEFAULT_TARGET_DB;

  it('marks visibility unproven when the probe explicitly returns false', async () => {
    const probes = await restore.runSafetyProbes({
      database,
      dbConfig: DB_CONFIG,
      probeRunner: async () => SAFE_PROBE_OUTPUT,
      eventVisibilityProbe: async () => false,
    });
    expect(probes.eventVisibility).toBe('unproven');
    expect(probes.visibilityFailureKind).toBe('unexpected-result');
    expect(probes.visibilityError).toMatch(/reported false/);
  });

  it('marks visibility unproven for a malformed or missing result', async () => {
    const malformed = await restore.runSafetyProbes({
      database,
      dbConfig: DB_CONFIG,
      probeRunner: async () => SAFE_PROBE_OUTPUT,
      eventVisibilityProbe: async () => 'ok',
    });
    expect(malformed.eventVisibility).toBe('unproven');
    expect(malformed.visibilityFailureKind).toBe('unexpected-result');

    const missing = await restore.runSafetyProbes({
      database,
      dbConfig: DB_CONFIG,
      probeRunner: async () => SAFE_PROBE_OUTPUT,
      eventVisibilityProbe: async () => undefined,
    });
    expect(missing.eventVisibility).toBe('unproven');
    expect(missing.visibilityError).toMatch(/undefined/);
  });

  it('classifies permission denial, timeout and transport failures distinctly', async () => {
    const denied = await restore.runSafetyProbes({
      database,
      dbConfig: DB_CONFIG,
      probeRunner: async () => SAFE_PROBE_OUTPUT,
      eventVisibilityProbe: async () => {
        throw new Error('ERROR 1227 (42000): Access denied; you need the EVENT privilege');
      },
    });
    expect(denied.visibilityFailureKind).toBe('permission-denied');

    const timeout = await restore.runSafetyProbes({
      database,
      dbConfig: DB_CONFIG,
      probeRunner: async () => SAFE_PROBE_OUTPUT,
      eventVisibilityProbe: async () => {
        throw new Error('Safety probe timed out. Refusing to restore.');
      },
    });
    expect(timeout.visibilityFailureKind).toBe('timeout');

    const transport = await restore.runSafetyProbes({
      database,
      dbConfig: DB_CONFIG,
      probeRunner: async () => SAFE_PROBE_OUTPUT,
      eventVisibilityProbe: async () => {
        throw new Error('Could not start the safety probe mysql client: ENOENT');
      },
    });
    expect(transport.visibilityFailureKind).toBe('transport');
  });

  it('surfaces a sanitized reason in the refusal and the OFF note', async () => {
    const unproven = {
      ...SAFE_PROBES,
      eventScheduler: 'ON',
      eventVisibility: 'unproven',
      visibilityFailureKind: 'permission-denied',
      visibilityError: 'ERROR 1227 (42000): Access denied; EVENT privilege needed',
    };

    expect(() => restore.evaluateRestoreSafety({ probes: unproven, objects: NO_OBJECTS }))
      .toThrow(/permission-denied[\s\S]*ERROR 1227/);

    const off = restore.evaluateRestoreSafety({
      probes: { ...unproven, eventScheduler: 'OFF' },
      objects: NO_OBJECTS,
    });
    expect(off.warnings.join(' ')).toMatch(/permission-denied[\s\S]*ERROR 1227/);
  });

  it('redacts credentials and key material from the surfaced reason', async () => {
    const secret = 'hunter2-secret';
    const fakeKey = 'a'.repeat(64);
    const probes = await restore.runSafetyProbes({
      database,
      dbConfig: DB_CONFIG,
      probeRunner: async () => SAFE_PROBE_OUTPUT,
      eventVisibilityProbe: async () => {
        throw new Error(
          `mysql --password=${secret} MYSQL_PWD=${secret} failed; key=${fakeKey}\n` +
          '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----',
        );
      },
    });

    expect(probes.eventVisibility).toBe('unproven');
    expect(probes.visibilityError).not.toContain(secret);
    expect(probes.visibilityError).not.toContain(fakeKey);
    expect(probes.visibilityError).not.toContain('MIIBfake');
  });

  it('rejects an unsafe database identifier before any probe process starts', async () => {
    const probeRunner = vi.fn(async () => SAFE_PROBE_OUTPUT);

    await expect(restore.runSafetyProbes({
      database: 'x`; DROP TABLE users; --',
      dbConfig: DB_CONFIG,
      probeRunner,
    })).rejects.toThrow(/Unsafe target database name/);

    expect(probeRunner).not.toHaveBeenCalled();
  });

  it('accepts a valid identifier unchanged', async () => {
    const probes = await restore.runSafetyProbes({
      database: 'courtzon_restore_test',
      dbConfig: DB_CONFIG,
      probeRunner: async () => SAFE_PROBE_OUTPUT,
      eventVisibilityProbe: async () => true,
    });
    expect(probes.databaseExists).toBe(true);
    expect(probes.eventVisibility).toBe('proven');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Phase 2.13 — sanitizer hardening, direct probe validation, process edges
// ════════════════════════════════════════════════════════════════════════════

describe('sanitizeSafetyError hardening', () => {
  it('redacts a double-quoted --password value that contains spaces', () => {
    const out = restore.sanitizeSafetyError('cmd --password="multi word secret" failed');
    expect(out).not.toContain('multi word secret');
    expect(out).toContain('--password=***');
    expect(out).toContain('failed');
  });

  it('redacts a single-quoted --password value that contains spaces', () => {
    const out = restore.sanitizeSafetyError("cmd --password='multi word secret' failed");
    expect(out).not.toContain('multi word secret');
    expect(out).toContain('--password=***');
  });

  it('redacts -pSECRET and -p SECRET forms', () => {
    expect(restore.sanitizeSafetyError('cmd -psecret123 rest')).not.toContain('secret123');
    expect(restore.sanitizeSafetyError('cmd -p secret123 rest')).not.toContain('secret123');
    expect(restore.sanitizeSafetyError('cmd -psecret123 rest')).toContain('-p***');
  });

  it('redacts quoted password assignments', () => {
    for (const raw of ['PASSWORD="two words"', "password: 'two words'", 'passwd="a b"']) {
      const out = restore.sanitizeSafetyError(`before ${raw} after`);
      expect(out).not.toContain('two words');
      expect(out).not.toContain('a b');
      expect(out).toContain('***');
    }
  });

  it('redacts hex key material longer than 64 characters', () => {
    const key = 'f'.repeat(80);
    expect(restore.sanitizeSafetyError(`key=${key} done`)).not.toContain(key);
  });

  it('strips ANSI escapes and control characters but keeps readable text', () => {
    const out = restore.sanitizeSafetyError('bad \u001b[31mred\u001b[0m\u0007 text');
    expect(out).not.toMatch(/\u001b/);
    expect(out).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
    expect(out).toContain('bad red text');
  });

  it('keeps legitimate diagnostics readable and preserves the 300-character cap', () => {
    const legit = 'Safety probe failed (mysql exit code 1) — required variables or privileges may be unavailable. '
      + 'mysql stderr: ERROR 1227 (42000): Access denied';
    const out = restore.sanitizeSafetyError(legit);
    expect(out).toContain('ERROR 1227');
    expect(out).toContain('required variables or privileges');
    expect(restore.sanitizeSafetyError('x'.repeat(1000))).toHaveLength(300);
  });
});

describe('defaultEventVisibilityProbe validation', () => {
  it('rejects an unsafe database identifier before spawning', async () => {
    const spawnImpl = vi.fn();
    await expect(restore.defaultEventVisibilityProbe({
      database: 'x`; DROP TABLE users; --',
      dbConfig: DB_CONFIG,
      spawnImpl,
    })).rejects.toThrow(/Unsafe target database name/);
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('accepts a valid database identifier', async () => {
    await expect(restore.defaultEventVisibilityProbe({
      database: 'courtzon_restore_test',
      dbConfig: DB_CONFIG,
      spawnImpl: () => createFakeChild({ code: 0 }),
    })).resolves.toBe(true);
  });
});

describe('probe process edge cases', () => {
  it('rejects a signal-only termination', async () => {
    await expect(restore.defaultEventVisibilityProbe({
      database: restore.DEFAULT_TARGET_DB,
      dbConfig: DB_CONFIG,
      spawnImpl: () => createFakeChild({ code: 0, signal: 'SIGKILL' }),
    })).rejects.toThrow(/signal SIGKILL/);
  });

  it('rejects immediately when the child emits error and never closes', async () => {
    const spawnImpl = vi.fn(() => {
      const child = new EventEmitter();
      child.stdin = new Writable({ write(_c: unknown, _e: unknown, cb: () => void) { cb(); } });
      child.stderr = new PassThrough();
      child.kill = vi.fn();
      setTimeout(() => child.emit('error', new Error('boom-no-close')), 0);
      return child;
    });

    await expect(restore.defaultEventVisibilityProbe({
      database: restore.DEFAULT_TARGET_DB,
      dbConfig: DB_CONFIG,
      closeTimeoutMs: 500,
      spawnImpl,
    })).rejects.toThrow(/mysql client failed: boom-no-close/);
  });

  it('settles exactly once when a timed-out child closes later', async () => {
    let settlements = 0;
    const promise = restore.defaultEventVisibilityProbe({
      database: restore.DEFAULT_TARGET_DB,
      dbConfig: DB_CONFIG,
      closeTimeoutMs: 10,
      spawnImpl: () => createFakeChild({ code: 0, closeDelayMs: 60 }),
    });
    promise.then(() => { settlements += 1; }, () => { settlements += 1; });

    await expect(promise).rejects.toThrow(/timed out/);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 90));
    expect(settlements).toBe(1);
  });

  it('settles exactly once on success and does not fire the timeout afterwards', async () => {
    let settlements = 0;
    const promise = restore.defaultEventVisibilityProbe({
      database: restore.DEFAULT_TARGET_DB,
      dbConfig: DB_CONFIG,
      closeTimeoutMs: 20,
      spawnImpl: () => createFakeChild({ code: 0, closeDelayMs: 1 }),
    });
    promise.then(() => { settlements += 1; }, () => { settlements += 1; });

    await expect(promise).resolves.toBe(true);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 45));
    expect(settlements).toBe(1);
  });
});
