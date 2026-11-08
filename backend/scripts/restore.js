#!/usr/bin/env node
/**
 * CourtZon Database Restore Service
 *
 * Supports:
 *   - AES-256-GCM backups:   *.sql.gz.enc2  ("CZBAK2" | 12-byte nonce | ciphertext | 16-byte tag)
 *   - Legacy AES-256-CBC:    *.sql.gz.enc   (16-byte IV | ciphertext, no authentication)
 *   - Legacy plain gzip:     *.sql.gz
 *   - Legacy plain SQL:      *.sql
 *
 * Safety model:
 *   1. Arguments are parsed strictly (no positional arguments, no duplicates).
 *   2. The target database defaults to `courtzon_restore_test`; any other target
 *      requires `--confirm-destructive=<target>` with the exact database name.
 *   3. Encrypted backups are decrypted and decompressed into a private spool
 *      (directory 0700, file 0600). GCM authentication, gzip CRC and the whole
 *      gzip stream are verified BEFORE the mysql client is started.
 *   4. The dump's own `CREATE TABLE `roles`` definition must declare exactly
 *      11 columns with `org_id_normalized` last and generated; only then is the
 *      final tuple value rewritten to `DEFAULT` by a quote-aware parser.
 *      Missing/malformed/incompatible DDL or a non-11-value tuple fails closed
 *      before the mysql client is started. No broad SQL replacement is used.
 *   5. DB_USER and DB_PASSWORD are required; there is no implicit `root`
 *      fallback. Passwords are passed through MYSQL_PWD only, never on the
 *      command line.
 *   6. A failed restore may have partially modified the target database; this
 *      is always reported. The spool is removed only after the child process
 *      and every stream are confirmed closed.
 *   7. Executable DEFINER metadata in CREATE TRIGGER/VIEW/PROCEDURE/FUNCTION/
 *      EVENT statements is rejected before mysql starts. No SUPER or
 *      SET_USER_ID workaround is used, and no DEFINER transformation is
 *      performed.
 *
 * Usage:
 *   node backend/scripts/restore.js --file <backup-file> [options]
 *
 * Options:
 *   --file <path>                 Backup file (required)
 *   --db <name>                   Target database (default: courtzon_restore_test)
 *   --confirm-destructive <name>  Required for any non-default target; must
 *                                 exactly match --db
 *   --spool-dir <dir>             Existing directory for the private spool
 *                                 (default: OS temp directory)
 *   --max-spool-bytes <n>         Maximum decompressed spool size in bytes
 *                                 (default: 128 GiB, range 1 MiB - 1 TiB)
 *   --dry-run                     Plan only: validates arguments/configuration/
 *                                 target/file access but does NOT decrypt,
 *                                 authenticate, verify gzip CRC or execute SQL
 *   --help                        Show help
 *
 * Environment:
 *   BACKUP_ENCRYPTION_KEY  Exactly 64 hex characters (required for .enc/.enc2)
 *   DB_HOST / DB_PORT      MySQL host and port (defaults: localhost / 3306)
 *   DB_USER / DB_PASSWORD  Required restore account (no root fallback; use an
 *                          account with CREATE/DROP/ALTER/INSERT, e.g.
 *                          courtzon_migration)
 */

import { spawn } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  createReadStream,
  createWriteStream,
  lstatSync,
  mkdtempSync,
  openSync,
  readSync,
  realpathSync,
  rmSync,
  statfsSync,
  statSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { createDecipheriv } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';

// ── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_TARGET_DB = 'courtzon_restore_test';
export const GCM_MAGIC = Buffer.from('CZBAK2', 'ascii');

const GCM_MAGIC_BYTES = GCM_MAGIC.length;
const GCM_NONCE_BYTES = 12;
const GCM_TAG_BYTES = 16;
const GCM_HEADER_BYTES = GCM_MAGIC_BYTES + GCM_NONCE_BYTES;
const CBC_IV_BYTES = 16;

export const DEFAULT_MAX_SPOOL_BYTES = 128 * 1024 * 1024 * 1024; // 128 GiB
const MIN_MAX_SPOOL_BYTES = 1 * 1024 * 1024; // 1 MiB
const MAX_MAX_SPOOL_BYTES = 1024 * 1024 * 1024 * 1024; // 1 TiB
const MIN_FREE_SPOOL_BYTES = 256 * 1024 * 1024; // 256 MiB
const DEFAULT_ROLES_REWRITE_LIMIT = 16 * 1024 * 1024; // 16 MiB
const CHILD_CLOSE_TIMEOUT_MS = 10000;
const STREAM_CLOSE_TIMEOUT_MS = 5000;
const SYSTEM_SCHEMAS = new Set(['mysql', 'information_schema', 'performance_schema', 'sys']);

const ROLE_INSERT_MARKERS = ['INSERT INTO `roles` VALUES', 'INSERT INTO roles VALUES'];
export const EXPECTED_ROLES_COLUMN_COUNT = 11;
const ROLE_INSERT_COLUMN_LIST_MARKERS = ['INSERT INTO `roles` (', 'INSERT INTO roles ('];
const ROLE_CREATE_MARKERS = ['CREATE TABLE `roles` (', 'CREATE TABLE roles ('];
const ROLE_MARKER_GROUPS = [
  ['insert', ROLE_INSERT_MARKERS],
  ['insert-column-list', ROLE_INSERT_COLUMN_LIST_MARKERS],
  ['create', ROLE_CREATE_MARKERS],
];
const ROLE_MARKER_KEEP = Math.max(
  ...ROLE_MARKER_GROUPS.flatMap(([, markers]) => markers.map((marker) => marker.length - 1)),
);

// ── Errors ───────────────────────────────────────────────────────────────────

export class RestoreError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class RestoreArgumentError extends RestoreError {}
export class RestoreFormatError extends RestoreError {}
export class RestoreKeyError extends RestoreError {}
export class RestoreSpoolLimitError extends RestoreError {}
export class RestoreDatabaseError extends RestoreError {}

export class RestoreCleanupUnsafeError extends RestoreError {
  constructor(message, spoolDir, options) {
    super(message, options);
    this.spoolDir = spoolDir;
  }
}

// ── CLI parsing ──────────────────────────────────────────────────────────────

const VALUE_OPTIONS = new Set([
  '--file',
  '--db',
  '--confirm-destructive',
  '--spool-dir',
  '--max-spool-bytes',
]);
const FLAG_OPTIONS = new Set(['--dry-run', '--help']);

export function parseRestoreArgs(argv) {
  if (!Array.isArray(argv)) {
    throw new RestoreArgumentError('Internal error: argv must be an array');
  }

  const parsed = {
    file: null,
    db: DEFAULT_TARGET_DB,
    dbProvided: false,
    confirmDestructive: null,
    spoolDir: null,
    maxSpoolBytes: DEFAULT_MAX_SPOOL_BYTES,
    dryRun: false,
    help: false,
  };
  const seen = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new RestoreArgumentError('Empty argument is not allowed');
    }
    if (raw === '--') {
      throw new RestoreArgumentError('The "--" argument terminator is not supported; use explicit options');
    }
    if (!raw.startsWith('--')) {
      throw new RestoreArgumentError(`Unexpected positional argument "${raw}"; use --file <path>`);
    }

    const equals = raw.indexOf('=');
    const name = equals >= 0 ? raw.slice(0, equals) : raw;
    const inlineValue = equals >= 0 ? raw.slice(equals + 1) : null;

    if (seen.has(name)) {
      throw new RestoreArgumentError(`Duplicate argument: ${name}`);
    }
    seen.add(name);

    if (FLAG_OPTIONS.has(name)) {
      if (inlineValue !== null) {
        throw new RestoreArgumentError(`${name} does not accept a value`);
      }
      if (name === '--dry-run') parsed.dryRun = true;
      else parsed.help = true;
      continue;
    }

    if (!VALUE_OPTIONS.has(name)) {
      throw new RestoreArgumentError(`Unknown argument: ${name}`);
    }

    let value = inlineValue;
    if (value === null) {
      value = argv[index + 1];
      index += 1;
    }
    if (value === undefined || value === '' || value.startsWith('--')) {
      throw new RestoreArgumentError(`Missing value for ${name}`);
    }

    switch (name) {
      case '--file':
        if (value === '-') {
          throw new RestoreArgumentError('Restoring from stdin is not supported; pass a file path to --file');
        }
        parsed.file = value;
        break;
      case '--db':
        parsed.db = value;
        parsed.dbProvided = true;
        break;
      case '--confirm-destructive':
        parsed.confirmDestructive = value;
        break;
      case '--spool-dir':
        parsed.spoolDir = value;
        break;
      case '--max-spool-bytes': {
        if (!/^\d+$/.test(value)) {
          throw new RestoreArgumentError(`--max-spool-bytes must be a positive integer (received "${value}")`);
        }
        const bytes = Number(value);
        if (!Number.isSafeInteger(bytes) || bytes < MIN_MAX_SPOOL_BYTES || bytes > MAX_MAX_SPOOL_BYTES) {
          throw new RestoreArgumentError(
            `--max-spool-bytes must be between ${MIN_MAX_SPOOL_BYTES} and ${MAX_MAX_SPOOL_BYTES} bytes`,
          );
        }
        parsed.maxSpoolBytes = bytes;
        break;
      }
      default:
        throw new RestoreArgumentError(`Unknown argument: ${name}`);
    }
  }

  if (parsed.help) {
    if (argv.length !== 1) {
      throw new RestoreArgumentError('--help must be used alone');
    }
    return parsed;
  }

  if (!parsed.file) {
    throw new RestoreArgumentError('--file <backup-file> is required');
  }

  return parsed;
}

export function validateDatabaseName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new RestoreArgumentError('Target database name must be a non-empty string');
  }
  if (name.length > 64) {
    throw new RestoreArgumentError('Target database name must be at most 64 characters');
  }
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new RestoreArgumentError(
      `Unsafe target database name "${name}"; only letters, digits and underscore are allowed`,
    );
  }
  if (SYSTEM_SCHEMAS.has(name.toLowerCase())) {
    throw new RestoreArgumentError(`Refusing to restore into system schema "${name}"`);
  }
  return name;
}

/**
 * The default target is the designated restore sandbox. Any other target must
 * be confirmed with a flag whose value is exactly the target database name.
 */
export function resolveTargetDatabase(parsed) {
  const database = validateDatabaseName(parsed.db ?? DEFAULT_TARGET_DB);

  if (database !== DEFAULT_TARGET_DB) {
    if (parsed.confirmDestructive !== database) {
      throw new RestoreArgumentError(
        `Refusing to restore into "${database}": only "${DEFAULT_TARGET_DB}" may be targeted without an explicit destructive confirmation. ` +
          `Re-run with --confirm-destructive=${database}`,
      );
    }
  } else if (parsed.confirmDestructive !== null) {
    throw new RestoreArgumentError(
      '--confirm-destructive is only valid for a non-default target database',
    );
  }

  return database;
}

export function validateEncryptionKey(raw) {
  if (typeof raw !== 'string' || !/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new RestoreKeyError(
      'BACKUP_ENCRYPTION_KEY must match /^[0-9a-fA-F]{64}$/ (64 hex characters, no trimming)',
    );
  }
  return Buffer.from(raw, 'hex');
}

export function detectBackupFormat(filePath) {
  const lower = String(filePath).toLowerCase();
  if (lower.endsWith('.sql.gz.enc2')) return 'gcm';
  if (lower.endsWith('.sql.gz.enc')) return 'cbc';
  if (lower.endsWith('.sql.gz')) return 'plain';
  if (lower.endsWith('.sql')) return 'sql';
  throw new RestoreFormatError(
    'Unsupported backup file extension; expected .sql.gz.enc2 (GCM), .sql.gz.enc (legacy CBC), .sql.gz or .sql',
  );
}

function assertRestoreCredentials(user, password) {
  if (typeof user !== 'string' || user.trim() === '' || user.startsWith('-') || /[\s;]/.test(user)) {
    throw new RestoreArgumentError(
      'DB_USER is required for restore; set DB_USER to an account with CREATE/DROP/ALTER/INSERT privileges ' +
        '(for example courtzon_migration). The mysql client will not start with implicit or unsafe credentials',
    );
  }
  if (typeof password !== 'string' || /^\s*$/.test(password)) {
    throw new RestoreArgumentError(
      'DB_PASSWORD is required for restore; set DB_PASSWORD explicitly. It is passed via MYSQL_PWD, never on the command line',
    );
  }
  return { user, password };
}

export function resolveDbConnection(env) {
  const host = env.DB_HOST || 'localhost';
  if (!host || /[\s;]/.test(host)) {
    throw new RestoreArgumentError('DB_HOST contains unsupported characters');
  }
  const port = env.DB_PORT || '3306';
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new RestoreArgumentError(`Invalid DB_PORT "${port}"`);
  }

  const { user, password } = assertRestoreCredentials(env.DB_USER, env.DB_PASSWORD);
  return { host, port, user, password };
}

// ── File / envelope helpers ──────────────────────────────────────────────────

function readExactSync(fd, position, length) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const read = readSync(fd, buffer, offset, length - offset, position + offset);
    if (read <= 0) {
      throw new RestoreFormatError(
        `Unexpected end of backup file while reading ${length} bytes at offset ${position}`,
      );
    }
    offset += read;
  }
  return buffer;
}

function openBackupFile(filePath) {
  const resolved = resolve(filePath);
  let stats;
  try {
    stats = lstatSync(resolved);
  } catch {
    throw new RestoreArgumentError(`Backup file not found: ${resolved}`);
  }
  if (stats.isSymbolicLink()) {
    throw new RestoreArgumentError(`Refusing to restore from a symbolic link: ${resolved}`);
  }
  if (!stats.isFile()) {
    throw new RestoreArgumentError(`Backup path is not a regular file: ${resolved}`);
  }
  if (stats.size === 0) {
    throw new RestoreArgumentError(`Backup file is empty: ${resolved}`);
  }
  let fd;
  try {
    fd = openSync(resolved, 'r');
  } catch (error) {
    throw new RestoreArgumentError(`Backup file is not readable: ${resolved}: ${error.message}`);
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* ignore */ }
    }
  }
  return { filePath: resolved, size: stats.size };
}

function readGcmEnvelope(filePath, size) {
  const minimum = GCM_HEADER_BYTES + GCM_TAG_BYTES;
  if (size < minimum) {
    throw new RestoreFormatError(
      `Truncated GCM backup: ${size} bytes is smaller than the ${minimum}-byte header+tag minimum`,
    );
  }
  const fd = openSync(filePath, 'r');
  try {
    const header = readExactSync(fd, 0, GCM_HEADER_BYTES);
    const tag = readExactSync(fd, size - GCM_TAG_BYTES, GCM_TAG_BYTES);
    if (!header.subarray(0, GCM_MAGIC_BYTES).equals(GCM_MAGIC)) {
      throw new RestoreFormatError(
        `Invalid GCM backup magic: expected "CZBAK2", found "${header.subarray(0, GCM_MAGIC_BYTES).toString('latin1')}"`,
      );
    }
    const ciphertextLength = size - GCM_HEADER_BYTES - GCM_TAG_BYTES;
    if (ciphertextLength <= 0) {
      throw new RestoreFormatError('GCM backup contains no ciphertext');
    }
    return {
      nonce: header.subarray(GCM_MAGIC_BYTES, GCM_HEADER_BYTES),
      tag,
      ciphertextStart: GCM_HEADER_BYTES,
      ciphertextLength,
    };
  } finally {
    try { closeSync(fd); } catch { /* ignore */ }
  }
}

function readCbcIv(filePath, size) {
  if (size <= CBC_IV_BYTES) {
    throw new RestoreFormatError(
      `Truncated legacy CBC backup: ${size} bytes does not contain an IV and ciphertext`,
    );
  }
  if ((size - CBC_IV_BYTES) % 16 !== 0) {
    throw new RestoreFormatError(
      'Invalid legacy CBC backup: ciphertext length is not a multiple of the AES block size',
    );
  }
  const fd = openSync(filePath, 'r');
  try {
    return readExactSync(fd, 0, CBC_IV_BYTES);
  } finally {
    try { closeSync(fd); } catch { /* ignore */ }
  }
}

// ── Spool capacity ───────────────────────────────────────────────────────────

/**
 * Conservative preflight: require at least 2x the encrypted file size, with a
 * 256 MiB floor, capped by the configured maximum spool size.
 */
export function evaluateSpoolSpace({ freeBytes, backupBytes, maxSpoolBytes }) {
  if (!Number.isFinite(freeBytes) || freeBytes < 0) {
    throw new RestoreSpoolLimitError('Could not determine free disk space for the restore spool');
  }
  if (!Number.isFinite(backupBytes) || backupBytes < 0) {
    throw new RestoreSpoolLimitError('Could not determine the backup file size');
  }
  if (!Number.isSafeInteger(maxSpoolBytes) || maxSpoolBytes <= 0) {
    throw new RestoreSpoolLimitError(`Invalid maximum spool size: ${maxSpoolBytes}`);
  }
  const requiredBytes = Math.min(
    maxSpoolBytes,
    Math.max(MIN_FREE_SPOOL_BYTES, Math.ceil(backupBytes * 2)),
  );
  if (freeBytes < requiredBytes) {
    throw new RestoreSpoolLimitError(
      `Insufficient free space for the restore spool: ${freeBytes} bytes available, at least ${requiredBytes} required`,
    );
  }
  return { requiredBytes, freeBytes };
}

export function createSpoolSizeLimiter(maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RestoreArgumentError(`Invalid maximum spool size: ${maxBytes}`);
  }
  let total = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length;
      if (total > maxBytes) {
        callback(
          new RestoreSpoolLimitError(
            `Restore spool exceeds the configured maximum (${maxBytes} bytes); the restore was aborted before any SQL was executed`,
          ),
        );
        return;
      }
      callback(null, chunk);
    },
  });
}

function createPrivateSpoolDir(baseDir) {
  const resolved = resolve(baseDir);
  let stats;
  try {
    stats = lstatSync(resolved);
  } catch {
    throw new RestoreArgumentError(`Spool directory does not exist: ${resolved}`);
  }
  if (!stats.isDirectory()) {
    throw new RestoreArgumentError(`Spool path is not a directory: ${resolved}`);
  }
  const dir = mkdtempSync(join(resolved, 'courtzon-restore-'));
  try { chmodSync(dir, 0o700); } catch { /* best effort on Windows */ }
  return dir;
}

function readFreeBytes(dir) {
  const stats = statfsSync(dir);
  return Number(stats.bavail) * Number(stats.bsize);
}

// ── Stream closure helpers ───────────────────────────────────────────────────

/**
 * Waits for a real `close` event. `destroyed`, `exitCode` and `signalCode`
 * never count as closure.
 */
export function awaitStreamClose(stream, timeoutMs) {
  if (!stream) return Promise.resolve(true);
  if (stream.closed === true) return Promise.resolve(true);
  return new Promise((resolvePromise) => {
    let settled = false;
    let timer = null;

    function finish(closed) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      stream.removeListener('close', onClose);
      resolvePromise(closed);
    }

    function onClose() {
      finish(true);
    }

    stream.on('error', () => undefined);
    stream.once('close', onClose);
    timer = setTimeout(() => finish(false), timeoutMs);
    try {
      if (stream.destroyed !== true) stream.destroy();
    } catch {
      finish(false);
      return;
    }
    if (stream.closed === true) finish(true);
  });
}

/**
 * Waits for a child `close` event (fed by a persistent listener).
 */
export function awaitChildClose(child, isClosed, timeoutMs) {
  if (isClosed()) return Promise.resolve(true);
  return new Promise((resolvePromise) => {
    let settled = false;
    let timer = null;

    function finish(closed) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      child.removeListener('close', onClose);
      resolvePromise(closed);
    }

    function onClose() {
      finish(true);
    }

    timer = setTimeout(() => finish(false), timeoutMs);
    child.once('close', onClose);
    if (isClosed()) finish(true);
  });
}

export function shouldPreserveSpool(streamsClosed) {
  return !streamsClosed;
}

function waitForSettled(promise, timeoutMs) {
  return new Promise((resolvePromise) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolvePromise(false);
    }, timeoutMs);
    promise.then(
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolvePromise(true);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolvePromise(false);
      },
    );
  });
}

// ── Generated column handling (roles.org_id_normalized) ──────────────────────

/**
 * Rewrites only the final value of each top-level tuple in an
 * `INSERT INTO \`roles\` VALUES ...` statement to `DEFAULT`.
 *
 * The authoritative current schema declares `roles.org_id_normalized` as the
 * last column and a generated column:
 *   `org_id_normalized` int unsigned GENERATED ALWAYS AS (ifnull(`organisation_id`,0)) VIRTUAL
 *
 * MySQL rejects explicit values for generated columns (error 3105); `DEFAULT`
 * lets the server compute it. The parser tracks quoted strings, escapes and
 * nested parentheses, so commas/parentheses/semicolons inside string data can
 * never be mistaken for tuple separators.
 *
 * Fails closed when a tuple does not have exactly `expectedColumnCount`
 * top-level values, or when the final value is neither a generated integer,
 * NULL nor DEFAULT. It never falls back to rewriting another column.
 */
export function rewriteRolesValues(text, expectedColumnCount = EXPECTED_ROLES_COLUMN_COUNT) {
  if (!Number.isSafeInteger(expectedColumnCount) || expectedColumnCount < 1) {
    throw new RestoreArgumentError(`Invalid expected roles column count: ${expectedColumnCount}`);
  }

  const replacements = [];
  let depth = 0;
  let tupleStart = -1;
  let lastComma = -1;
  let valueCount = 0;
  let tupleIndex = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;

  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    const next = text[index + 1];

    if (inSingle) {
      if (ch === '\\') { index += 1; continue; }
      if (ch === "'") {
        if (next === "'") { index += 1; continue; }
        inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      if (ch === '\\') { index += 1; continue; }
      if (ch === '"') {
        if (next === '"') { index += 1; continue; }
        inDouble = false;
      }
      continue;
    }
    if (inBacktick) {
      if (ch === '`') {
        if (next === '`') { index += 1; continue; }
        inBacktick = false;
      }
      continue;
    }

    if (ch === "'") { inSingle = true; continue; }
    if (ch === '"') { inDouble = true; continue; }
    if (ch === '`') { inBacktick = true; continue; }

    if (ch === '(') {
      if (depth === 0) {
        tupleStart = index;
        lastComma = index;
        valueCount = 1;
      }
      depth += 1;
      continue;
    }
    if (ch === ')') {
      if (depth === 1 && tupleStart >= 0) {
        tupleIndex += 1;
        if (valueCount !== expectedColumnCount) {
          throw new RestoreFormatError(
            `Unsafe restore: roles tuple #${tupleIndex} has ${valueCount} values, expected ${expectedColumnCount}; refusing to rewrite`,
          );
        }
        const raw = text.slice(lastComma + 1, index).trim();
        if (/^\d+$/.test(raw) || /^NULL$/i.test(raw)) {
          replacements.push({ start: lastComma + 1, end: index, value: 'DEFAULT' });
        } else if (!/^DEFAULT$/i.test(raw)) {
          throw new RestoreFormatError(
            `Unsafe restore: roles tuple #${tupleIndex} has an unexpected generated-column value; refusing to rewrite or execute`,
          );
        }
        tupleStart = -1;
        valueCount = 0;
      }
      if (depth > 0) depth -= 1;
      continue;
    }
    if (depth === 1 && ch === ',') {
      lastComma = index;
      valueCount += 1;
    }
  }

  if (tupleIndex === 0) {
    throw new RestoreFormatError(
      'Unsafe restore: INSERT INTO `roles` contains no tuple to validate; refusing to rewrite',
    );
  }

  let output = text;
  if (replacements.length > 0) {
    output = '';
    let cursor = 0;
    for (const replacement of replacements) {
      output += text.slice(cursor, replacement.start);
      output += replacement.value;
      cursor = replacement.end;
    }
    output += text.slice(cursor);
  }

  return { text: output, rewrittenCount: replacements.length, tupleCount: tupleIndex };
}

function findStatementTerminator(text) {
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    const next = text[index + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (inSingle) {
      if (ch === '\\') { index += 1; continue; }
      if (ch === "'") {
        if (next === "'") { index += 1; continue; }
        inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      if (ch === '\\') { index += 1; continue; }
      if (ch === '"') {
        if (next === '"') { index += 1; continue; }
        inDouble = false;
      }
      continue;
    }
    if (inBacktick) {
      if (ch === '`') {
        if (next === '`') { index += 1; continue; }
        inBacktick = false;
      }
      continue;
    }

    if (ch === '-' && next === '-') { inLineComment = true; index += 1; continue; }
    if (ch === '#') { inLineComment = true; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; index += 1; continue; }
    if (ch === "'") { inSingle = true; continue; }
    if (ch === '"') { inDouble = true; continue; }
    if (ch === '`') { inBacktick = true; continue; }
    if (ch === ';') return index;
  }

  return -1;
}

function splitTopLevelDefinitions(body) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;

  for (let index = 0; index < body.length; index += 1) {
    const ch = body[index];
    const next = body[index + 1];

    if (inSingle) {
      if (ch === '\\') { index += 1; continue; }
      if (ch === "'") {
        if (next === "'") { index += 1; continue; }
        inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      if (ch === '\\') { index += 1; continue; }
      if (ch === '"') {
        if (next === '"') { index += 1; continue; }
        inDouble = false;
      }
      continue;
    }
    if (inBacktick) {
      if (ch === '`') {
        if (next === '`') { index += 1; continue; }
        inBacktick = false;
      }
      continue;
    }

    if (ch === "'") { inSingle = true; continue; }
    if (ch === '"') { inDouble = true; continue; }
    if (ch === '`') { inBacktick = true; continue; }
    if (ch === '(') { depth += 1; continue; }
    if (ch === ')') { depth -= 1; continue; }
    if (ch === ',' && depth === 0) {
      parts.push(body.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(body.slice(start));
  return parts;
}

function extractCreateTableBody(statement) {
  const open = statement.indexOf('(');
  if (open < 0) {
    throw new RestoreFormatError('Malformed CREATE TABLE `roles`: missing column list');
  }

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;

  for (let index = open; index < statement.length; index += 1) {
    const ch = statement[index];
    const next = statement[index + 1];

    if (inSingle) {
      if (ch === '\\') { index += 1; continue; }
      if (ch === "'") {
        if (next === "'") { index += 1; continue; }
        inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      if (ch === '\\') { index += 1; continue; }
      if (ch === '"') {
        if (next === '"') { index += 1; continue; }
        inDouble = false;
      }
      continue;
    }
    if (inBacktick) {
      if (ch === '`') {
        if (next === '`') { index += 1; continue; }
        inBacktick = false;
      }
      continue;
    }

    if (ch === "'") { inSingle = true; continue; }
    if (ch === '"') { inDouble = true; continue; }
    if (ch === '`') { inBacktick = true; continue; }
    if (ch === '(') { depth += 1; continue; }
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) return statement.slice(open + 1, index);
    }
  }

  throw new RestoreFormatError('Malformed CREATE TABLE `roles`: unbalanced parentheses');
}

const NON_COLUMN_DEFINITION = /^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|FULLTEXT|SPATIAL|CHECK|FOREIGN)\b/i;

function parseColumnName(definition) {
  if (definition.startsWith('`')) {
    const match = /^`((?:[^`]|``)+)`/.exec(definition);
    if (!match) return null;
    return match[1].replace(/``/g, '`');
  }
  const match = /^([A-Za-z0-9_$]+)/.exec(definition);
  return match ? match[1] : null;
}

/**
 * Verifies the dump's own `CREATE TABLE \`roles\`` definition before any
 * generated-column rewrite. Requires exactly 11 columns, with
 * `org_id_normalized` last and declared as a generated column. Fails closed on
 * any missing/malformed/ambiguous/incompatible definition.
 */
export function validateRolesTableDefinition(statement) {
  const trimmed = String(statement).trim();
  if (!/^CREATE\s+TABLE\s+(`roles`|roles)\s*\(/i.test(trimmed)) {
    throw new RestoreFormatError(
      'Unsafe restore: the dump does not contain the expected CREATE TABLE `roles` (...) statement',
    );
  }

  const body = extractCreateTableBody(trimmed);
  const definitions = splitTopLevelDefinitions(body)
    .map((definition) => definition.trim())
    .filter((definition) => definition.length > 0);

  const columns = [];
  for (const definition of definitions) {
    if (NON_COLUMN_DEFINITION.test(definition)) continue;
    const name = parseColumnName(definition);
    if (name === null) {
      throw new RestoreFormatError(
        'Malformed CREATE TABLE `roles`: cannot parse a column definition',
      );
    }
    columns.push({ name, definition });
  }

  const generatedIndexes = [];
  columns.forEach((column, index) => {
    if (column.name === 'org_id_normalized') generatedIndexes.push(index);
  });

  if (generatedIndexes.length !== 1) {
    throw new RestoreFormatError(
      'Unsafe restore: CREATE TABLE `roles` must declare `org_id_normalized` exactly once; refusing to rewrite',
    );
  }

  const generatedIndex = generatedIndexes[0];
  if (generatedIndex !== columns.length - 1) {
    throw new RestoreFormatError(
      'Unsafe restore: `roles.org_id_normalized` is not the final declared column; refusing to rewrite tuple values',
    );
  }

  if (!/\bGENERATED\s+(ALWAYS\s+)?AS\b/i.test(columns[generatedIndex].definition)) {
    throw new RestoreFormatError(
      'Unsafe restore: `roles.org_id_normalized` is not declared as a generated column; refusing to rewrite tuple values',
    );
  }

  if (columns.length !== EXPECTED_ROLES_COLUMN_COUNT) {
    throw new RestoreFormatError(
      `Unsafe restore: CREATE TABLE \`roles\` declares ${columns.length} columns but this restore build verifies exactly ${EXPECTED_ROLES_COLUMN_COUNT}; update the restore rewriter before using this backup`,
    );
  }

  return { columnCount: columns.length, columns: columns.map((column) => column.name) };
}

function findRoleMarker(text) {
  let best = null;
  for (const [kind, markers] of ROLE_MARKER_GROUPS) {
    for (const marker of markers) {
      const index = text.indexOf(marker);
      if (index < 0) continue;
      if (best === null || index < best.index) best = { index, marker, kind };
    }
  }
  return best;
}

/**
 * Streaming transform: validates the dump's `CREATE TABLE \`roles\`` definition
 * and patches only `INSERT INTO \`roles\` VALUES` statements, preserving
 * everything else byte-for-byte (after UTF-8 decoding). Fails closed when the
 * roles schema (11 columns, generated `org_id_normalized` last) cannot be
 * verified, or when any tuple does not match the verified column count.
 */
export function createRolesGeneratedColumnRewriter(options = {}) {
  const maxStatementBytes = options.maxStatementBytes ?? DEFAULT_ROLES_REWRITE_LIMIT;
  if (!Number.isSafeInteger(maxStatementBytes) || maxStatementBytes <= 0) {
    throw new RestoreArgumentError(`Invalid roles rewrite limit: ${maxStatementBytes}`);
  }

  const decoder = new StringDecoder('utf8');
  let buffer = '';
  let mode = 'idle';
  let pendingText = '';
  let rolesTableVerified = false;
  let lastChar = '';

  return new Transform({
    transform(chunk, _encoding, callback) {
      try {
        buffer += decoder.write(chunk);
        processBuffer(this, false);
        callback();
      } catch (error) {
        callback(error);
      }
    },
    flush(callback) {
      try {
        buffer += decoder.end();
        processBuffer(this, true);
        if (mode !== 'idle') {
          throw new RestoreFormatError(
            `The SQL dump ended inside ${mode === 'create' ? 'the CREATE TABLE `roles` statement' : 'an INSERT INTO `roles` statement'}; refusing to execute a truncated restore`,
          );
        }
        callback();
      } catch (error) {
        callback(error);
      }
    },
  });

  function emit(stream, text) {
    if (text.length === 0) return;
    lastChar = text[text.length - 1];
    stream.push(text);
  }

  function processBuffer(stream, final) {
    for (;;) {
      if (mode === 'idle') {
        const found = findRoleMarker(buffer);
        if (found === null) {
          if (final) {
            emit(stream, buffer);
            buffer = '';
          } else if (buffer.length > ROLE_MARKER_KEEP) {
            const cut = buffer.length - ROLE_MARKER_KEEP;
            emit(stream, buffer.slice(0, cut));
            buffer = buffer.slice(cut);
          }
          return;
        }

        const before = found.index > 0 ? buffer[found.index - 1] : lastChar;
        const atStatementBoundary =
          before === '' || before === '\n' || before === '\r' || before === ';';
        if (!atStatementBoundary) {
          emit(stream, buffer.slice(0, found.index + 1));
          buffer = buffer.slice(found.index + 1);
          continue;
        }

        if (found.kind === 'insert-column-list') {
          throw new RestoreFormatError(
            'Unsafe restore: INSERT INTO `roles` with an explicit column list is not supported; cannot verify which value belongs to the generated column',
          );
        }

        if (found.kind === 'insert') {
          if (!rolesTableVerified) {
            throw new RestoreFormatError(
              'Unsafe restore: encountered INSERT INTO `roles` before a verified CREATE TABLE `roles` definition; refusing to rewrite or execute',
            );
          }
          emit(stream, buffer.slice(0, found.index + found.marker.length));
          buffer = buffer.slice(found.index + found.marker.length);
          mode = 'insert';
          pendingText = '';
          continue;
        }

        emit(stream, buffer.slice(0, found.index));
        buffer = buffer.slice(found.index);
        mode = 'create';
        pendingText = '';
        continue;
      }

      pendingText += buffer;
      buffer = '';

      const end = findStatementTerminator(pendingText);
      if (end < 0) {
        if (final) {
          throw new RestoreFormatError(
            `The SQL dump ended inside ${mode === 'create' ? 'the CREATE TABLE `roles` statement' : 'an INSERT INTO `roles` statement'}; refusing to execute a truncated restore`,
          );
        }
        if (pendingText.length > maxStatementBytes) {
          throw new RestoreFormatError(
            `${mode === 'create' ? 'CREATE TABLE roles' : 'INSERT INTO roles'} statement exceeds the safe rewrite limit (${maxStatementBytes} bytes)`,
          );
        }
        return;
      }

      const statement = pendingText.slice(0, end);
      const remainder = pendingText.slice(end + 1);

      if (mode === 'create') {
        validateRolesTableDefinition(statement);
        rolesTableVerified = true;
        emit(stream, `${statement};`);
      } else {
        const rewritten = rewriteRolesValues(statement, EXPECTED_ROLES_COLUMN_COUNT);
        emit(stream, `${rewritten.text};`);
      }

      mode = 'idle';
      pendingText = '';
      if (!remainder) return;
      buffer = remainder;
    }
  }
}

// ── DEFINER policy (fail closed) ─────────────────────────────────────────────

const DEFAULT_DEFINER_HEADER_LIMIT = 64 * 1024;

const CREATE_OBJECT_KEYWORDS = new Set([
  'TABLE',
  'TRIGGER',
  'VIEW',
  'PROCEDURE',
  'FUNCTION',
  'EVENT',
  'DATABASE',
  'SCHEMA',
  'INDEX',
  'USER',
  'ROLE',
  'SERVER',
  'TABLESPACE',
  'LOGFILE',
  'SPATIAL',
  'RESOURCE',
  'TEMPORARY',
]);

const DEFINER_POLICY_MESSAGE =
  'Unsafe restore: the backup contains DEFINER metadata in a stored-object definition. ' +
  'The current restore policy does not permit DEFINER clauses and no parser-aware transformation is implemented. ' +
  'No SQL was executed.';

const DEFINER_INCOMPLETE_MESSAGE =
  'Unsafe restore: the SQL dump contains a CREATE statement whose DEFINER metadata could not be verified ' +
  '(incomplete, malformed or ambiguous). No SQL was executed.';

const DEFINER_TRUNCATED_MESSAGE =
  'Unsafe restore: the SQL dump ended inside a quoted string or comment, so DEFINER metadata could not be verified. ' +
  'No SQL was executed.';

function isIdentifierCharacter(ch) {
  return /[A-Za-z0-9_$]/.test(ch);
}

function nextMeaningfulCharacter(text, index) {
  let position = index;
  while (position < text.length) {
    const ch = text[position];
    if (/\s/.test(ch)) {
      position += 1;
      continue;
    }
    if (ch === '-' && text[position + 1] === '-') {
      while (position < text.length && text[position] !== '\n') position += 1;
      continue;
    }
    if (ch === '#') {
      while (position < text.length && text[position] !== '\n') position += 1;
      continue;
    }
    if (ch === '/' && text[position + 1] === '*') {
      const end = text.indexOf('*/', position + 2);
      if (end < 0) return '';
      position = end + 2;
      continue;
    }
    return ch;
  }
  return '';
}

/**
 * Classifies a buffered CREATE header (starting at the CREATE token) without
 * executing SQL. Returns one of:
 *   - { status: 'object', end, insideVersion }
 *   - { status: 'definer' }
 *   - { status: 'terminated' }
 *   - { status: 'incomplete' }
 *   - { status: 'oversize' }
 *
 * DEFINER detection requires the keyword in the CREATE header, before the
 * object keyword. `SQL SECURITY DEFINER` (without `=`) is not a DEFINER
 * clause and is ignored. Strings, quoted identifiers, line comments and
 * regular block comments are ignored; MySQL executable version comments
 * are treated as executable code because mysqldump places DEFINER metadata
 * inside them.
 */
export function classifyCreateHeader(text, maxHeaderBytes = DEFAULT_DEFINER_HEADER_LIMIT) {
  if (typeof text !== 'string') return { status: 'incomplete' };
  if (text.length > maxHeaderBytes) return { status: 'oversize' };

  let mode = 'code';
  let quoteReturn = 'code';
  let lineReturn = 'code';
  let blockReturn = 'code';
  let token = '';
  let previousToken = '';
  let sawCreate = false;

  const flushToken = (index) => {
    if (!token) return null;
    const upper = token.toUpperCase();
    if (upper === 'CREATE') sawCreate = true;
    if (sawCreate) {
      if (upper === 'DEFINER') {
        const next = nextMeaningfulCharacter(text, index);
        if (next === '=') return { status: 'definer' };
        if (previousToken === 'SECURITY') {
          previousToken = upper;
          token = '';
          return null;
        }
        return { status: 'definer' };
      }
      if (CREATE_OBJECT_KEYWORDS.has(upper)) {
        return { status: 'object', end: index, insideVersion: mode === 'version' };
      }
    }
    previousToken = upper;
    token = '';
    return null;
  };

  let index = 0;
  while (index < text.length) {
    const ch = text[index];
    const next = text[index + 1];

    if (mode === 'single' || mode === 'double' || mode === 'backtick') {
      const quote = mode === 'single' ? "'" : mode === 'double' ? '"' : '`';
      if (ch === '\\' && mode !== 'backtick') {
        index += 2;
        continue;
      }
      if (ch === quote) {
        if (next === quote) {
          index += 2;
          continue;
        }
        mode = quoteReturn;
      }
      index += 1;
      continue;
    }
    if (mode === 'line') {
      if (ch === '\n') mode = lineReturn;
      index += 1;
      continue;
    }
    if (mode === 'block') {
      if (ch === '*' && next === '/') {
        mode = blockReturn;
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }
    if (mode === 'version' && ch === '*' && next === '/') {
      mode = 'code';
      index += 2;
      continue;
    }

    if (isIdentifierCharacter(ch)) {
      token += ch;
      index += 1;
      continue;
    }

    const decision = flushToken(index);
    if (decision) return decision;

    if (mode === 'code' && ch === ';') return { status: 'terminated' };
    if (ch === "'" || ch === '"' || ch === '`') {
      quoteReturn = mode;
      mode = ch === "'" ? 'single' : ch === '"' ? 'double' : 'backtick';
      index += 1;
      continue;
    }
    if (ch === '-' && next === '-') {
      lineReturn = mode;
      mode = 'line';
      index += 2;
      continue;
    }
    if (ch === '#') {
      lineReturn = mode;
      mode = 'line';
      index += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      if (text[index + 2] === '!') {
        mode = 'version';
      } else {
        blockReturn = mode;
        mode = 'block';
      }
      index += 2;
      continue;
    }
    index += 1;
  }

  const finalDecision = flushToken(index);
  if (finalDecision) return finalDecision;
  return { status: 'incomplete' };
}

/**
 * Streaming guard that detects executable DEFINER metadata and fails closed
 * before the mysql client is spawned. It only buffers a CREATE header (from
 * the CREATE token to the first object keyword), never an entire dump or a
 * large INSERT. Version comments are treated as executable code; strings and
 * ordinary comments are ignored. No SQL contents or identities are included
 * in errors.
 */
export function createDefinerGuard(options = {}) {
  const maxHeaderBytes = options.maxHeaderBytes ?? DEFAULT_DEFINER_HEADER_LIMIT;
  if (!Number.isSafeInteger(maxHeaderBytes) || maxHeaderBytes <= 0) {
    throw new RestoreArgumentError(`Invalid DEFINER header limit: ${maxHeaderBytes}`);
  }

  const decoder = new StringDecoder('utf8');
  let mode = 'code';
  let quoteReturn = 'code';
  let lineReturn = 'code';
  let blockReturn = 'code';
  let quoteChar = '';
  let token = '';
  let dashPending = false;
  let slashPending = false;
  let starPending = false;
  let blockJustStarted = false;
  let quotePendingClose = false;
  let escapePending = false;
  let buffering = false;
  let header = '';
  let lastSignificantChar = '';

  return new Transform({
    transform(chunk, _encoding, callback) {
      try {
        processText(this, decoder.write(chunk), false);
        callback();
      } catch (error) {
        callback(error);
      }
    },
    flush(callback) {
      try {
        processText(this, decoder.end(), true);
        if (quotePendingClose) {
          mode = quoteReturn;
          quotePendingClose = false;
        }
        dashPending = false;
        slashPending = false;
        if (mode === 'line' && lineReturn !== 'code') {
          throw new RestoreFormatError(DEFINER_TRUNCATED_MESSAGE);
        }
        if (mode === 'single' || mode === 'double' || mode === 'backtick' || mode === 'block' || mode === 'version') {
          throw new RestoreFormatError(DEFINER_TRUNCATED_MESSAGE);
        }
        callback();
      } catch (error) {
        callback(error);
      }
    },
  });

  function resetLexer() {
    quoteReturn = 'code';
    lineReturn = 'code';
    blockReturn = 'code';
    quoteChar = '';
    token = '';
    dashPending = false;
    slashPending = false;
    starPending = false;
    blockJustStarted = false;
    quotePendingClose = false;
    escapePending = false;
    lastSignificantChar = '';
  }

  function processText(stream, text, final) {
    let pending = text;
    let output = '';

    const append = (value) => {
      if (value) output += value;
    };
    const flushOutput = () => {
      if (output) {
        stream.push(output);
        output = '';
      }
    };

    while (pending.length > 0 || buffering) {
      if (buffering) {
        header += pending;
        pending = '';
        const decision = classifyCreateHeader(header, maxHeaderBytes);
        if (decision.status === 'incomplete') {
          if (final) throw new RestoreFormatError(DEFINER_INCOMPLETE_MESSAGE);
          flushOutput();
          return;
        }
        if (decision.status === 'definer') throw new RestoreFormatError(DEFINER_POLICY_MESSAGE);
        if (decision.status !== 'object') throw new RestoreFormatError(DEFINER_INCOMPLETE_MESSAGE);
        flushOutput();
        stream.push(header.slice(0, decision.end));
        pending = header.slice(decision.end);
        header = '';
        buffering = false;
        mode = decision.insideVersion ? 'version' : 'code';
        resetLexer();
        continue;
      }

      let i = 0;
      let startedBuffering = false;

      for (; i < pending.length; i += 1) {
        const ch = pending[i];

        if (mode === 'single' || mode === 'double' || mode === 'backtick') {
          if (escapePending) {
            escapePending = false;
            append(ch);
            continue;
          }
          if (ch === '\\' && mode !== 'backtick') {
            escapePending = true;
            append(ch);
            continue;
          }
          if (quotePendingClose) {
            quotePendingClose = false;
            if (ch === quoteChar) {
              append(ch);
              continue;
            }
            mode = quoteReturn;
            i -= 1;
            continue;
          }
          if (ch === quoteChar) {
            quotePendingClose = true;
            append(ch);
            continue;
          }
          append(ch);
          continue;
        }

        if (mode === 'line') {
          append(ch);
          if (ch === '\n') mode = lineReturn;
          continue;
        }

        if (mode === 'block') {
          append(ch);
          if (blockJustStarted) {
            blockJustStarted = false;
            if (ch === '!') mode = 'version';
            continue;
          }
          if (starPending) {
            starPending = false;
            if (ch === '/') mode = blockReturn;
            else if (ch === '*') starPending = true;
            continue;
          }
          if (ch === '*') starPending = true;
          continue;
        }

        const currentMode = mode;
        if (dashPending) {
          dashPending = false;
          if (ch === '-') {
            append(ch);
            lineReturn = currentMode;
            mode = 'line';
            continue;
          }
        }
        if (slashPending) {
          slashPending = false;
          if (ch === '*') {
            append(ch);
            blockReturn = currentMode;
            mode = 'block';
            blockJustStarted = true;
            starPending = false;
            continue;
          }
        }
        if (currentMode === 'version' && starPending) {
          starPending = false;
          if (ch === '/') {
            append(ch);
            mode = 'code';
            continue;
          }
          if (ch === '*') {
            append(ch);
            starPending = true;
            continue;
          }
        }

        if (isIdentifierCharacter(ch)) {
          token += ch;
          continue;
        }

        if (token) {
          const upper = token.toUpperCase();
          if (upper === 'CREATE' && lastSignificantChar !== '@' && lastSignificantChar !== '.') {
            flushOutput();
            buffering = true;
            header = token;
            token = '';
            header += pending.slice(i);
            pending = '';
            startedBuffering = true;
            break;
          }
          append(token);
          lastSignificantChar = token[token.length - 1] ?? lastSignificantChar;
          token = '';
        }

        if (ch === "'" || ch === '"' || ch === '`') {
          quoteChar = ch;
          quoteReturn = currentMode;
          quotePendingClose = false;
          escapePending = false;
          mode = ch === "'" ? 'single' : ch === '"' ? 'double' : 'backtick';
          append(ch);
          lastSignificantChar = ch;
          continue;
        }
        if (ch === '-') {
          dashPending = true;
          append(ch);
          lastSignificantChar = ch;
          continue;
        }
        if (ch === '/') {
          slashPending = true;
          append(ch);
          lastSignificantChar = ch;
          continue;
        }
        if (ch === '#') {
          lineReturn = currentMode;
          mode = 'line';
          append(ch);
          lastSignificantChar = ch;
          continue;
        }
        if (currentMode === 'version' && ch === '*') {
          starPending = true;
          append(ch);
          lastSignificantChar = ch;
          continue;
        }
        append(ch);
        if (!/\s/.test(ch)) lastSignificantChar = ch;

        if (output.length >= 64 * 1024) flushOutput();
      }

      if (startedBuffering) continue;

      if (!buffering) {
        if (final && token) {
          if (token.toUpperCase() === 'CREATE' && lastSignificantChar !== '@' && lastSignificantChar !== '.') {
            flushOutput();
            buffering = true;
            header = token;
            token = '';
            continue;
          }
          append(token);
          lastSignificantChar = token[token.length - 1] ?? lastSignificantChar;
          token = '';
        }
        flushOutput();
        return;
      }
    }

    flushOutput();
  }
}

// ── Spool preparation (pass 1, no SQL execution) ─────────────────────────────

function normalizePrepareError(error) {
  if (error instanceof RestoreError) return error;
  const message = error?.message ?? String(error);
  const code = error?.code;

  if (code === 'ENOSPC') {
    return new RestoreSpoolLimitError(
      'Insufficient disk space while writing the restore spool; MySQL was not started and the target database was not modified',
      { cause: error },
    );
  }
  if (/unable to authenticate data|Unsupported state/i.test(message)) {
    return new RestoreFormatError(
      `AES-256-GCM authentication failed (wrong key or modified backup); no SQL was executed: ${message}`,
      { cause: error },
    );
  }
  if (code === 'ERR_OSSL_EVP_BAD_DECRYPT' || /bad decrypt|wrong final block length/i.test(message)) {
    return new RestoreFormatError(
      `Legacy CBC decryption failed (wrong key or corrupted backup); no SQL was executed: ${message}`,
      { cause: error },
    );
  }
  if (
    code === 'Z_DATA_ERROR' ||
    code === 'Z_BUF_ERROR' ||
    /incorrect data check|incorrect header check|invalid distance|unexpected end of file|invalid stored block/i.test(message)
  ) {
    return new RestoreFormatError(
      `Backup decompression failed (gzip CRC/structure invalid); no SQL was executed: ${message}`,
      { cause: error },
    );
  }
  return new RestoreError(`Restore preparation failed before SQL execution: ${message}`, {
    cause: error,
  });
}

async function closeStreamsAndConfirm(streams, timeoutMs) {
  const results = await Promise.all(streams.map((stream) => awaitStreamClose(stream, timeoutMs)));
  return results.every(Boolean);
}

/**
 * Second pass over the verified spool. Runs only after GCM authentication and
 * gzip CRC verification succeeded. Throws on executable DEFINER metadata, so
 * the caller can clean up the spool before any MySQL process starts.
 */
async function verifySpoolDefinerPolicy(spoolPath) {
  const sink = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  await pipeline(createReadStream(spoolPath), createDefinerGuard(), sink);
}

/**
 * Pass 1: decrypt (if needed), decompress, rewrite generated-column values and
 * write everything to a private spool. Resolves only after GCM authentication
 * and gzip end-of-stream/CRC verification succeed.
 */
export async function prepareSpool(options) {
  const {
    filePath,
    format,
    key = null,
    spoolBaseDir = tmpdir(),
    maxSpoolBytes = DEFAULT_MAX_SPOOL_BYTES,
    streamCloseTimeoutMs = STREAM_CLOSE_TIMEOUT_MS,
  } = options;

  if (!['gcm', 'cbc', 'plain', 'sql'].includes(format)) {
    throw new RestoreArgumentError(`Unknown backup format: ${String(format)}`);
  }
  if ((format === 'gcm' || format === 'cbc') && !(Buffer.isBuffer(key) && key.length === 32)) {
    throw new RestoreKeyError('A 32-byte encryption key is required for encrypted backups');
  }

  const opened = openBackupFile(filePath);
  const spoolDir = createPrivateSpoolDir(spoolBaseDir);
  const spoolPath = join(spoolDir, 'restore.sql');
  const streams = [];

  try {
    let freeBytes;
    try {
      freeBytes = readFreeBytes(spoolBaseDir);
    } catch (error) {
      throw new RestoreSpoolLimitError(
        `Cannot determine free disk space for the spool directory ${resolve(spoolBaseDir)}: ${error.message}`,
        { cause: error },
      );
    }
    evaluateSpoolSpace({ freeBytes, backupBytes: opened.size, maxSpoolBytes });

    let source;
    let decipher = null;
    if (format === 'gcm') {
      const envelope = readGcmEnvelope(opened.filePath, opened.size);
      decipher = createDecipheriv('aes-256-gcm', key, envelope.nonce);
      decipher.setAuthTag(envelope.tag);
      source = createReadStream(opened.filePath, {
        start: envelope.ciphertextStart,
        end: opened.size - GCM_TAG_BYTES - 1,
      });
    } else if (format === 'cbc') {
      const iv = readCbcIv(opened.filePath, opened.size);
      decipher = createDecipheriv('aes-256-cbc', key, iv);
      source = createReadStream(opened.filePath, { start: CBC_IV_BYTES });
    } else {
      source = createReadStream(opened.filePath);
    }

    const gunzip = format === 'sql' ? null : createGunzip();
    const rewriter = createRolesGeneratedColumnRewriter();
    const limiter = createSpoolSizeLimiter(maxSpoolBytes);
    const writeStream = createWriteStream(spoolPath, { flags: 'wx', mode: 0o600 });

    if (decipher && gunzip) {
      streams.push(source, decipher, gunzip, rewriter, limiter, writeStream);
      await pipeline(source, decipher, gunzip, rewriter, limiter, writeStream);
    } else if (gunzip) {
      streams.push(source, gunzip, rewriter, limiter, writeStream);
      await pipeline(source, gunzip, rewriter, limiter, writeStream);
    } else {
      streams.push(source, rewriter, limiter, writeStream);
      await pipeline(source, rewriter, limiter, writeStream);
    }

    // The spool is only readable here after GCM authentication and gzip CRC
    // verification completed. Scan it for executable DEFINER metadata before
    // returning it to the caller (and before any MySQL process can start).
    await verifySpoolDefinerPolicy(spoolPath);

    return {
      spoolDir,
      spoolPath,
      format,
      spoolBytes: statSync(spoolPath).size,
    };
  } catch (error) {
    const streamsClosed = await closeStreamsAndConfirm(streams, streamCloseTimeoutMs);
    let removed = false;
    if (streamsClosed) {
      try {
        rmSync(spoolDir, { recursive: true, force: true });
        removed = true;
      } catch {
        removed = false;
      }
    }

    if (!removed) {
      throw new RestoreCleanupUnsafeError(
        'Restore preparation failed and the private spool could not be safely cleaned up. ' +
          `Artifacts were preserved for manual inspection: ${spoolDir}. Cause: ${error?.message ?? String(error)}`,
        spoolDir,
        { cause: error },
      );
    }

    throw normalizePrepareError(error);
  }
}

// ── MySQL execution (pass 2) ─────────────────────────────────────────────────

/**
 * Streams the verified spool into the mysql client. The promise settles only
 * after the child `close` event and the spool stream `close` event.
 */
export async function runMysqlRestore(options) {
  const {
    spoolPath,
    database,
    dbConfig,
    spawnImpl = spawn,
    closeTimeoutMs = CHILD_CLOSE_TIMEOUT_MS,
    streamCloseTimeoutMs = STREAM_CLOSE_TIMEOUT_MS,
  } = options;

  validateDatabaseName(database);
  assertRestoreCredentials(dbConfig?.user, dbConfig?.password);

  let spoolStats;
  try {
    spoolStats = lstatSync(spoolPath);
  } catch {
    throw new RestoreError(`Restore spool not found: ${spoolPath}`);
  }
  if (!spoolStats.isFile()) {
    throw new RestoreError(`Restore spool is not a regular file: ${spoolPath}`);
  }

  const args = [
    `--host=${dbConfig.host}`,
    `--port=${dbConfig.port}`,
    `--user=${dbConfig.user}`,
    `--database=${database}`,
  ];

  let child;
  try {
    child = spawnImpl('mysql', args, {
      stdio: ['pipe', 'ignore', 'pipe'],
      env: { ...process.env, MYSQL_PWD: dbConfig.password ?? '' },
    });
  } catch (error) {
    throw new RestoreDatabaseError(`Failed to start the mysql client: ${error.message}`, {
      cause: error,
    });
  }

  let closed = false;
  let spawnError = null;
  const exitPromise = new Promise((resolveExit) => {
    child.once('close', (code, signal) => {
      closed = true;
      resolveExit({ code, signal });
    });
    child.once('error', (error) => {
      spawnError = error;
    });
  });

  let stderr = '';
  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 32 * 1024) stderr += chunk.toString();
    });
  }

  const source = createReadStream(spoolPath);
  let pipeError = null;
  let pipePromise;
  try {
    pipePromise = pipeline(source, child.stdin).catch((error) => {
      pipeError = error;
    });
  } catch (error) {
    pipeError = error;
    pipePromise = Promise.resolve();
  }

  let killTimer = null;
  pipePromise.then(() => {
    if (pipeError !== null && !closed) {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      killTimer = setTimeout(() => {
        if (!closed) {
          try { child.kill('SIGKILL'); } catch { /* ignore */ }
        }
      }, closeTimeoutMs);
      if (typeof killTimer.unref === 'function') killTimer.unref();
    }
  });

  const exit = await exitPromise;
  if (killTimer) clearTimeout(killTimer);

  const pipeSettled = await waitForSettled(pipePromise, streamCloseTimeoutMs);
  if (!pipeSettled) {
    try { child.stdin?.destroy(); } catch { /* ignore */ }
    await waitForSettled(pipePromise, streamCloseTimeoutMs);
  }

  // Only a real close event counts; `destroyed`/`exitCode` are never used.
  const sourceClosed = await awaitStreamClose(source, streamCloseTimeoutMs);
  if (shouldPreserveSpool(sourceClosed)) {
    throw new RestoreCleanupUnsafeError(
      'mysql exited but the spool read stream did not close in time. ' +
        `Artifacts were preserved for manual inspection: ${spoolPath}`,
      dirname(spoolPath),
      { cause: pipeError ?? undefined },
    );
  }

  if (spawnError) {
    throw new RestoreDatabaseError(`Failed to start the mysql client: ${spawnError.message}`, {
      cause: spawnError,
    });
  }

  if (exit.code !== 0 || exit.signal || pipeError !== null || !pipeSettled) {
    const details = [];
    if (pipeError) details.push(`spool streaming error: ${pipeError.message}`);
    if (stderr.trim()) details.push(`mysql stderr: ${stderr.trim()}`);
    if (!pipeSettled) details.push('spool streaming did not complete before mysql closed');
    throw new RestoreDatabaseError(
      `Restore failed (mysql exit code ${exit.code ?? 'null'}${exit.signal ? `, signal ${exit.signal}` : ''}). ` +
        `The target database "${database}" may have been partially modified by the SQL mysql already executed.` +
        (details.length ? `\n${details.join('\n')}` : ''),
      { cause: pipeError ?? undefined },
    );
  }

  return { database, exitCode: exit.code };
}

/**
 * Full non-dry-run orchestration: spool (verify) -> mysql -> cleanup.
 */
export async function restoreFromBackup(options) {
  const {
    filePath,
    format,
    key = null,
    spoolBaseDir = tmpdir(),
    maxSpoolBytes = DEFAULT_MAX_SPOOL_BYTES,
    database,
    dbConfig,
    spawnImpl,
    dryRun = false,
  } = options;

  if (dryRun) return { dryRun: true };

  const spool = await prepareSpool({ filePath, format, key, spoolBaseDir, maxSpoolBytes });
  let preserveSpool = false;

  try {
    await runMysqlRestore({
      spoolPath: spool.spoolPath,
      database,
      dbConfig,
      spawnImpl,
    });
    return { spoolDir: spool.spoolDir, spoolBytes: spool.spoolBytes };
  } catch (error) {
    preserveSpool = error instanceof RestoreCleanupUnsafeError;
    throw error;
  } finally {
    if (!preserveSpool) {
      try {
        rmSync(spool.spoolDir, { recursive: true, force: true });
      } catch (error) {
        process.stderr.write(
          `WARNING: restore finished but the private spool could not be removed: ${spool.spoolDir}: ${error.message}\n`,
        );
      }
    }
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function printUsage(write) {
  write(`CourtZon Database Restore

Usage:
  node backend/scripts/restore.js --file <backup-file> [options]

Options:
  --file <path>                  Backup file (.sql.gz.enc2, .sql.gz.enc, .sql.gz, .sql)
  --db <name>                    Target database (default: ${DEFAULT_TARGET_DB})
  --confirm-destructive <name>   Required for non-default targets; must equal --db
  --spool-dir <dir>              Existing directory for the private spool
  --max-spool-bytes <n>          Maximum decompressed spool size (bytes)
  --dry-run                      Plan only: validates arguments, configuration,
                                 target selection and file accessibility. Does NOT
                                 decrypt/authenticate the backup, verify gzip CRC,
                                 prove restorability, or execute SQL.
  --help                         Show this help

Environment:
  BACKUP_ENCRYPTION_KEY          Exactly 64 hex characters (encrypted backups)
  DB_HOST, DB_PORT, DB_USER, DB_PASSWORD
`);
}

function formatLabel(format) {
  if (format === 'gcm') return 'AES-256-GCM (CZBAK2)';
  if (format === 'cbc') return 'legacy AES-256-CBC (no authentication)';
  if (format === 'sql') return 'legacy plaintext SQL (uncompressed)';
  return 'legacy plaintext gzip';
}

export async function main(argv, options = {}) {
  const env = options.env ?? process.env;
  const stdout = options.stdout ?? ((line) => console.log(line));
  const stderr = options.stderr ?? ((line) => console.error(line));

  const parsed = parseRestoreArgs(argv);
  if (parsed.help) {
    printUsage(stdout);
    return 0;
  }

  const database = resolveTargetDatabase(parsed);
  const filePath = resolve(parsed.file);
  const format = detectBackupFormat(filePath);
  const opened = openBackupFile(filePath);
  const maxSpoolBytes = parsed.maxSpoolBytes;
  const spoolBaseDir = resolve(parsed.spoolDir ?? tmpdir());

  const key = format === 'gcm' || format === 'cbc'
    ? validateEncryptionKey(env.BACKUP_ENCRYPTION_KEY ?? '')
    : null;
  const dbConfig = resolveDbConnection(env);

  stdout('═══════════════════════════════════════════════════');
  stdout('  CourtZon Database Restore');
  stdout('═══════════════════════════════════════════════════');
  stdout(`  File:         ${basename(opened.filePath)} (${opened.size} bytes)`);
  stdout(`  Format:       ${formatLabel(format)}`);
  stdout(`  Target:       ${database}@${dbConfig.host}:${dbConfig.port} (user: ${dbConfig.user})`);
  stdout(`  Spool dir:    ${spoolBaseDir}`);
  stdout(`  Spool limit:  ${maxSpoolBytes} bytes`);
  stdout(`  Dry run:      ${parsed.dryRun ? 'YES' : 'NO'}`);
  stdout('═══════════════════════════════════════════════════');

  if (format === 'cbc') {
    stdout('NOTE: legacy CBC backups are not authenticated; gzip CRC is the only integrity check.');
  }

  if (parsed.dryRun) {
    stdout('\n[DRY RUN] Plan only. No SQL was executed.');
    stdout('Validated: arguments, configuration, target selection, file accessibility.');
    stdout('This plan-only check does NOT decrypt or authenticate the backup.');
    stdout('It does NOT verify gzip integrity or CRC.');
    stdout('It does NOT prove that the backup can be restored.');
    stdout('It does NOT execute SQL.');
    stdout('\nA real restore would:');
    stdout(`  1. Decrypt: ${format === 'plain' || format === 'sql' ? 'NO' : 'YES (required)'}`);
    stdout('  2. Verify GCM authentication (if GCM) and gzip CRC/end-of-stream');
    stdout('  3. Spool into a private directory (0700), spool file 0600');
    stdout("  4. Validate the dump's CREATE TABLE `roles` and rewrite only the generated column to DEFAULT");
    stdout(`  5. Pipe the verified spool to: mysql --host=... --port=... --user=... --database=${database}`);
    stdout('\nNo SQL was executed.');
    return 0;
  }

  await restoreFromBackup({
    filePath: opened.filePath,
    format,
    key,
    spoolBaseDir,
    maxSpoolBytes,
    database,
    dbConfig,
  });

  stdout(`\n✅ Restore completed into "${database}".`);
  return 0;
}

function isInvokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isInvokedDirectly()) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      if (error instanceof RestoreCleanupUnsafeError) {
        console.error(`❌ ${error.message}`);
        if (error.spoolDir) {
          console.error(`   Preserved spool directory: ${error.spoolDir}`);
        }
      } else {
        console.error(`❌ ${error?.message ?? String(error)}`);
        if (process.env.RESTORE_DEBUG === '1' && error?.stack) {
          console.error(error.stack);
        }
      }
      process.exitCode = 1;
    });
}
