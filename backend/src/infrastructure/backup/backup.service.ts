import { spawn, type ChildProcess } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  fstatSync,
  fsyncSync,
  futimesSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  statfsSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { createModuleLogger } from '../../shared/utils/logger.js';

const log = createModuleLogger('backup');

const BACKUP_DIR = process.env.BACKUP_DIR
  ? resolve(process.env.BACKUP_DIR)
  : join(process.cwd(), 'backups');

const GCM_MAGIC = Buffer.from('CZBAK2', 'ascii');
const GCM_NONCE_BYTES = 12;
const GCM_TAG_BYTES = 16;
const BACKUP_EXTENSION = '.sql.gz.enc2';

// On-disk format (the nonce and ciphertext are authenticated by GCM; the magic
// is only a format discriminator):
//   "CZBAK2" (6 bytes) | nonce (12 bytes) | AES-256-GCM ciphertext | tag (16 bytes)
// The plaintext is the gzip stream of the mysqldump output.

const S3_MIN_PART = 5 * 1024 * 1024;
const S3_BASE_PART = 8 * 1024 * 1024;
const S3_MAX_PART = 5 * 1024 * 1024 * 1024;
const S3_MAX_PARTS = 10_000;
const S3_MAX_OBJECT = 5 * 1024 * 1024 * 1024 * 1024; // 5 TiB
const S3_MAX_ATTEMPTS = 3;

const MIN_FREE_BYTES = 256 * 1024 * 1024;
const LOCK_HEARTBEAT_MS = 60_000;
const CHILD_CLOSE_TIMEOUT_MS = 5_000;
const STREAM_CLOSE_TIMEOUT_MS = 2_000;

/**
 * Conservative size ceiling. It is far above any expected CourtZon dump and
 * far below the 5 TiB S3 object limit. Override with BACKUP_MAX_BYTES when a
 * larger dump is legitimate; the limit is enforced while streaming.
 */
export const DEFAULT_MAX_BACKUP_BYTES = 64 * 1024 * 1024 * 1024; // 64 GiB
const MIN_MAX_BACKUP_BYTES = 1 * 1024 * 1024; // 1 MiB
const MAX_MAX_BACKUP_BYTES = 1024 * 1024 * 1024 * 1024; // 1 TiB

const LOCK_PATH = join(BACKUP_DIR, '.courtzon-backup.lock');

interface BackupIdentity {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

export interface RetentionSettings {
  count: number;
  days: number;
}

export interface S3Config {
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  region: string;
}

interface LockPayload {
  pid: number;
  token: string;
  startedAt: string;
  processStartTime: string | null;
}

export interface BackupLockHandle {
  isOwned(): boolean;
  onLost(callback: () => void): () => void;
  /** Safe release: removes the lock file only when it is still ours. */
  release(): void;
  /** Unsafe release: closes the descriptor but deliberately keeps the lock file. */
  abandon(): void;
}

export interface BackupResult {
  localPath: string;
  localSha256: string | null;
  sidecarPath: string | null;
  s3: 'skipped' | 'succeeded' | 'failed';
  s3Error?: string;
}

export class BackupConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupConfigurationError';
  }
}

export class BackupLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupLockError';
  }
}

export class S3ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'S3ConfigError';
  }
}

export class S3UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'S3UploadError';
  }
}

export class BackupSizeLimitError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BackupSizeLimitError';
  }
}

/**
 * Thrown when child/stream closure could not be confirmed. The temporary file
 * and the lock must NOT be removed automatically in this case.
 */
export class BackupCleanupUnsafeError extends Error {
  readonly tmpPath: string;

  constructor(message: string, tmpPath: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BackupCleanupUnsafeError';
    this.tmpPath = tmpPath;
  }
}

export class BackupRetentionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BackupRetentionError';
  }
}

/** Exact validation only: 64 hex characters. No trimming or normalization. */
export function validateEncryptionKey(raw: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new BackupConfigurationError(
      'BACKUP_ENCRYPTION_KEY must match /^[0-9a-fA-F]{64}$/ (64 hex characters)',
    );
  }
  return Buffer.from(raw, 'hex');
}

function getEncryptionKey(): Buffer {
  const raw = process.env.BACKUP_ENCRYPTION_KEY;
  if (!raw) {
    throw new BackupConfigurationError(
      'BACKUP_ENCRYPTION_KEY is required: AES-256-GCM is the only supported backup format',
    );
  }
  const requestedFormat = (process.env.BACKUP_ENCRYPTION_FORMAT || 'gcm').toLowerCase();
  if (requestedFormat !== 'gcm') {
    throw new BackupConfigurationError(
      `BACKUP_ENCRYPTION_FORMAT="${requestedFormat}" is not supported; only AES-256-GCM ("gcm") is allowed`,
    );
  }
  return validateEncryptionKey(raw);
}

function parseIntegerEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new BackupConfigurationError(`${name} must be a non-negative integer (received "${raw}")`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new BackupConfigurationError(`${name} must be between ${min} and ${max} (received "${raw}")`);
  }
  return value;
}

export function parseRetentionSettings(env: NodeJS.ProcessEnv): RetentionSettings {
  return {
    count: parseIntegerEnv(env, 'BACKUP_RETENTION_COUNT', 30, 1, 10_000),
    days: parseIntegerEnv(env, 'BACKUP_RETENTION_DAYS', 0, 0, 3650),
  };
}

/** Strictly validated backup size ceiling; enforced while streaming. */
export function parseMaxBackupBytes(env: NodeJS.ProcessEnv): number {
  return parseIntegerEnv(
    env,
    'BACKUP_MAX_BYTES',
    DEFAULT_MAX_BACKUP_BYTES,
    MIN_MAX_BACKUP_BYTES,
    MAX_MAX_BACKUP_BYTES,
  );
}

/** Strict validation: only "0" or "1" (undefined/empty means disabled). */
export function parseS3Required(raw: string | undefined): boolean {
  if (raw === undefined || raw === '') return false;
  if (raw !== '0' && raw !== '1') {
    throw new BackupConfigurationError('S3_REQUIRED must be "0" or "1"');
  }
  return raw === '1';
}

/** Fully absent => null (local-only). Partially configured => S3ConfigError. */
export function parseS3Config(env: NodeJS.ProcessEnv): S3Config | null {
  const values = {
    S3_BUCKET: env.S3_BUCKET,
    S3_ACCESS_KEY: env.S3_ACCESS_KEY,
    S3_SECRET_KEY: env.S3_SECRET_KEY,
    S3_ENDPOINT: env.S3_ENDPOINT,
  };
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length === 4) return null;
  if (missing.length > 0) {
    throw new S3ConfigError(`Incomplete S3 configuration — missing: ${missing.join(', ')}`);
  }

  return {
    bucket: values.S3_BUCKET as string,
    accessKeyId: values.S3_ACCESS_KEY as string,
    secretAccessKey: values.S3_SECRET_KEY as string,
    endpoint: values.S3_ENDPOINT as string,
    region: env.S3_REGION || 'auto',
  };
}

function getBackupIdentity(): BackupIdentity {
  const isProduction = process.env.NODE_ENV === 'production';
  const user = process.env.DB_BACKUP_USER;
  const password = process.env.DB_BACKUP_PASSWORD;

  if (Boolean(user) !== Boolean(password)) {
    throw new BackupConfigurationError(
      'DB_BACKUP_USER and DB_BACKUP_PASSWORD must be configured together; ' +
      'the backup user is never paired with the application password',
    );
  }

  if (isProduction && (!user || !password)) {
    throw new BackupConfigurationError(
      'DB_BACKUP_USER and DB_BACKUP_PASSWORD are required in production; ' +
      'the application DB credentials are never used as a fallback',
    );
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || '3306',
    user: user || process.env.DB_USER || 'courtzon_app',
    password: password || process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'courtzon_v3',
  };
}

/**
 * Preflight checks only. The free-space probe is a sanity check, not a
 * guarantee that the dump will fit; ENOSPC during streaming still fails the
 * job (and the temporary file is removed only after closure is confirmed).
 */
function assertBackupDirectoryReady(): void {
  if (resolve(BACKUP_DIR) === resolve('/')) {
    throw new BackupConfigurationError('BACKUP_DIR must not be the filesystem root');
  }

  try {
    mkdirSync(BACKUP_DIR, { recursive: true });
  } catch (error: any) {
    throw new BackupConfigurationError(`Cannot create backup directory ${BACKUP_DIR}: ${error.message}`);
  }

  try {
    const stat = statfsSync(BACKUP_DIR);
    const free = Number(stat.bavail) * Number(stat.bsize);
    if (Number.isFinite(free) && free < MIN_FREE_BYTES) {
      throw new BackupConfigurationError(
        `Insufficient free space in ${BACKUP_DIR}: ${free} bytes available, ` +
        `at least ${MIN_FREE_BYTES} required`,
      );
    }
  } catch (error) {
    if (error instanceof BackupConfigurationError) throw error;
    log.warn({ err: error }, 'Could not determine free disk space; continuing');
  }

  const probe = join(BACKUP_DIR, `.cz-write-probe-${process.pid}-${Date.now()}`);
  try {
    writeFileSync(probe, 'ok', { mode: 0o600 });
  } catch (error: any) {
    throw new BackupConfigurationError(
      `Backup directory is not writable: ${BACKUP_DIR}: ${error.message}`,
    );
  } finally {
    try { if (existsSync(probe)) unlinkSync(probe); } catch { /* ignore */ }
  }
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    return error?.code === 'EPERM';
  }
}

export interface LockFileIdentity {
  ino: number;
  dev: number;
}

/**
 * Windows quirk: fstatSync() reports the real volume serial in `dev` while
 * statSync() reports 0 for the same file, so `dev` is only compared on POSIX.
 * `ino` alone is a stable file index on Windows.
 */
function isSameFile(a: LockFileIdentity, b: LockFileIdentity): boolean {
  if (a.ino !== b.ino) return false;
  if (process.platform === 'win32') return true;
  return a.dev === b.dev;
}

/**
 * Removes the lock file only when the path still identifies the exact
 * inode/device created by this process. A replacement lock is never deleted.
 * Returns true when this process's own lock file was unlinked (or the path no
 * longer exists), and false when the path now belongs to someone else.
 */
export function unlinkLockIfOwned(identity: LockFileIdentity): boolean {
  try {
    const current = lstatSync(LOCK_PATH);
    if (!current.isFile() || !isSameFile(current, identity)) {
      log.error(
        { lock: LOCK_PATH },
        'Refusing to remove the backup lock: the path no longer identifies this process\'s lock file. Manual recovery required',
      );
      return false;
    }
    unlinkSync(LOCK_PATH);
    return true;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return true;
    log.error({ err: error, lock: LOCK_PATH }, 'Could not remove the backup lock; manual recovery may be required');
    return false;
  }
}

/** Linux-only PID-reuse detection; returns null when /proc is unavailable. */
function readProcessStartTime(pid: number): string | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const closing = stat.lastIndexOf(')');
    if (closing < 0) return null;
    const fields = stat.slice(closing + 2).trim().split(/\s+/);
    return fields[19] ?? null;
  } catch {
    return null;
  }
}

/**
 * Exclusive lock with an owned file descriptor and heartbeat.
 *
 * - The fd stays open for the backup lifetime; heartbeat uses futimesSync(fd).
 * - Ownership is verified against the token and the path inode/device.
 * - Stale locks are NEVER deleted automatically. If the owner PID is dead (or
 *   reused), the job fails closed with an explicit manual-recovery message.
 * - Residual TOCTOU: Node cannot atomically compare-and-unlink a path. The
 *   final unlink is guarded by an fd/path inode comparison, but a replacement
 *   between that check and unlink remains theoretically possible.
 */
export function acquireBackupLock(): BackupLockHandle {
  const token = randomBytes(8).toString('hex');
  const payload: LockPayload = {
    pid: process.pid,
    token,
    startedAt: new Date().toISOString(),
    processStartTime: readProcessStartTime(process.pid),
  };

  let fd: number;
  try {
    fd = openSync(LOCK_PATH, 'wx', 0o600);
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      throw new BackupLockError(`Cannot create backup lock ${LOCK_PATH}: ${error.message}`);
    }

    let existing: LockPayload | null = null;
    try {
      existing = JSON.parse(readFileSync(LOCK_PATH, 'utf8')) as LockPayload;
    } catch {
      existing = null;
    }

    if (!existing || !Number.isInteger(existing.pid) || typeof existing.token !== 'string') {
      throw new BackupLockError(
        `Backup lock is unreadable or invalid. Manual recovery required: ${LOCK_PATH}`,
      );
    }

    if (isProcessAlive(existing.pid)) {
      const currentStart = readProcessStartTime(existing.pid);
      const reused = Boolean(
        existing.processStartTime && currentStart && existing.processStartTime !== currentStart,
      );
      throw new BackupLockError(
        reused
          ? `Backup lock belongs to a dead process whose PID was reused. Manual recovery required: ${LOCK_PATH}`
          : `Another backup is already running (pid ${existing.pid}). ` +
            `If this is incorrect, manual recovery is required: ${LOCK_PATH}`,
      );
    }

    throw new BackupLockError(
      `Stale backup lock from dead pid ${existing.pid}. Automatic removal is disabled. ` +
      `Verify that no backup is running, then remove: ${LOCK_PATH}`,
    );
  }

  let ownedIdentity: LockFileIdentity;
  try {
    const created = fstatSync(fd);
    ownedIdentity = { ino: created.ino, dev: created.dev };
  } catch (error: any) {
    try { closeSync(fd); } catch { /* ignore */ }
    throw new BackupLockError(`Cannot stat the backup lock ${LOCK_PATH}: ${error?.message}`);
  }

  try {
    writeSync(fd, JSON.stringify(payload));
    fsyncSync(fd);
  } catch (error) {
    try { closeSync(fd); } catch { /* ignore */ }
    // Only this process's own inode/device may be removed; a replacement lock stays.
    unlinkLockIfOwned(ownedIdentity);
    throw error;
  }
  const lostCallbacks = new Set<() => void>();
  let lost = false;

  const verifyOwnership = (): boolean => {
    try {
      const fdStat = fstatSync(fd);
      const pathStat = statSync(LOCK_PATH);
      if (!isSameFile(fdStat, pathStat)) return false;
      const current = JSON.parse(readFileSync(LOCK_PATH, 'utf8')) as LockPayload;
      return current.token === token;
    } catch {
      return false;
    }
  };

  const markLost = (): void => {
    if (lost) return;
    lost = true;
    for (const callback of lostCallbacks) {
      try { callback(); } catch { /* ignore */ }
    }
  };

  const heartbeat = setInterval(() => {
    if (lost) return;
    if (!verifyOwnership()) {
      markLost();
      return;
    }
    try {
      const now = new Date();
      futimesSync(fd, now, now);
    } catch {
      markLost();
    }
  }, LOCK_HEARTBEAT_MS);

  return {
    isOwned(): boolean {
      if (lost) return false;
      if (!verifyOwnership()) {
        markLost();
        return false;
      }
      return true;
    },
    onLost(callback: () => void): () => void {
      lostCallbacks.add(callback);
      return () => { lostCallbacks.delete(callback); };
    },
    abandon(): void {
      clearInterval(heartbeat);
      try { closeSync(fd); } catch { /* ignore */ }
      log.error(
        { lock: LOCK_PATH },
        'Backup lock deliberately preserved for manual recovery; remove it only after confirming that no backup process is still writing',
      );
    },
    release(): void {
      clearInterval(heartbeat);
      try {
        if (!verifyOwnership()) {
          log.error({ lock: LOCK_PATH }, 'Backup lock ownership changed; leaving lock for manual recovery');
          try { closeSync(fd); } catch { /* ignore */ }
          return;
        }
        closeSync(fd);
        unlinkLockIfOwned(ownedIdentity);
      } catch {
        /* lock already gone or unreadable: leave it for manual review */
      }
    },
  };
}

/**
 * Temporary files (`*.tmp-*`) inside BACKUP_DIR may be deliberate recovery
 * artifacts preserved after unsafe child/stream cleanup. They are NEVER
 * deleted automatically by this service; this scan only reports them so an
 * operator can inspect/recover them manually.
 *
 * Manual recovery: confirm that no mysqldump process is still writing, copy
 * the artefact if it is needed, then remove it and the preserved lock by hand.
 */
export function reportPreservedTemporaryFiles(dir: string = BACKUP_DIR): string[] {
  const preserved: string[] = [];
  try {
    for (const file of readdirSync(dir)) {
      if (file.includes('.tmp-')) preserved.push(join(dir, file));
    }
  } catch {
    return preserved;
  }

  if (preserved.length > 0) {
    log.error(
      { files: preserved },
      'Preserved temporary backup artifacts found. They are NOT deleted automatically: inspect/recover them manually, then remove them only after confirming that no mysqldump process is still writing',
    );
  }
  return preserved;
}

/**
 * Waits for the real child `close` event. `isClosed` must be fed by a
 * persistent `close` listener registered at spawn time. `exitCode`,
 * `signalCode` and `destroyed` are never treated as proof of closure.
 * The flag is re-checked after listener registration to close the race where
 * `close` is emitted between the first check and `once()`.
 */
export function awaitChildClose(
  child: Pick<ChildProcess, 'once' | 'removeListener'>,
  isClosed: () => boolean,
  timeoutMs: number,
): Promise<boolean> {
  if (isClosed()) return Promise.resolve(true);
  return new Promise((resolvePromise) => {
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    function finish(closed: boolean): void {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      child.removeListener('close', onClose);
      resolvePromise(closed);
    }

    function onClose(): void {
      finish(true);
    }

    timer = setTimeout(() => finish(false), timeoutMs);
    child.once('close', onClose);
    if (isClosed()) finish(true);
  });
}

/**
 * Destroys a stream and waits for its real `close` event. `error` and
 * `destroyed` are not closure; only `closed === true` (set when `close` fires)
 * or the `close` event itself count.
 */
export function awaitStreamClose(stream: any, timeoutMs: number): Promise<boolean> {
  if (!stream) return Promise.resolve(true);
  if (stream.closed === true) return Promise.resolve(true);
  return new Promise((resolvePromise) => {
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    function finish(closed: boolean): void {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      stream.removeListener('close', onClose);
      resolvePromise(closed);
    }

    function onClose(): void {
      finish(true);
    }

    // An 'error' event is not proof of closure; keep a listener so a late
    // error cannot crash the process, then wait for 'close' or the timeout.
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
 * Cleanup may only proceed when every writer is provably closed. If closure
 * is unconfirmed, the temporary file and the lock must be preserved.
 */
export function shouldPreserveArtifacts(childClosed: boolean, streamsClosed: boolean): boolean {
  return !childClosed || !streamsClosed;
}

/**
 * Streaming size ceiling. Counts the bytes written to the final artifact
 * (header + ciphertext + tag) and aborts the pipeline as soon as the
 * configured maximum is exceeded.
 */
export function createBackupSizeLimiter(maxBytes: number, initialBytes = 0): Transform {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new BackupConfigurationError(`Invalid BACKUP_MAX_BYTES value: ${maxBytes}`);
  }
  if (!Number.isSafeInteger(initialBytes) || initialBytes < 0) {
    throw new BackupConfigurationError(`Invalid initial backup size: ${initialBytes}`);
  }

  let total = initialBytes;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      if (total > maxBytes) {
        callback(new BackupSizeLimitError(
          `Backup exceeds BACKUP_MAX_BYTES (${maxBytes} bytes); mysqldump output aborted`,
        ));
        return;
      }
      callback(null, chunk);
    },
  });
}

function dumpArgs(db: BackupIdentity): string[] {
  return [
    '--single-transaction',
    '--routines',
    '--triggers',
    '--events',
    `--host=${db.host}`,
    `--port=${db.port}`,
    `--user=${db.user}`,
    db.database,
  ];
}

async function streamDumpToFile(
  tmpPath: string,
  db: BackupIdentity,
  key: Buffer,
  lock: BackupLockHandle,
  maxBackupBytes: number,
): Promise<void> {
  const nonce = randomBytes(GCM_NONCE_BYTES);
  const header = Buffer.concat([GCM_MAGIC, nonce]);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);

  if (!lock.isOwned()) {
    throw new BackupLockError('Backup lock ownership lost before the dump started');
  }

  let child: ChildProcess | null = null;
  let gzip: ReturnType<typeof createGzip> | null = null;
  let out: ReturnType<typeof createWriteStream> | null = null;
  let closed = false;
  let removeLostListener: (() => void) | null = null;

  try {
    writeFileSync(tmpPath, header, { mode: 0o600 });

    child = spawn('mysqldump', dumpArgs(db), {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, MYSQL_PWD: db.password },
    });

    const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolvePromise, reject) => {
        child!.once('error', reject);
        child!.once('close', (code, signal) => {
          closed = true;
          resolvePromise({ code, signal });
        });
      },
    );
    // Avoid unhandled rejection if the pipeline fails before Promise.all runs.
    exitPromise.catch(() => { /* handled below */ });

    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < 16384) stderr += chunk.toString();
    });

    removeLostListener = lock.onLost(() => {
      if (child && !closed) {
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
      }
    });

    gzip = createGzip();
    out = createWriteStream(tmpPath, { flags: 'a', mode: 0o600 });
    const limiter = createBackupSizeLimiter(
      maxBackupBytes,
      GCM_MAGIC.length + GCM_NONCE_BYTES + GCM_TAG_BYTES,
    );

    const streams: any[] = [child.stdout!, gzip, cipher, limiter, out];
    const [exit] = await Promise.all([exitPromise, pipeline(streams)]);

    if (exit.code !== 0 || exit.signal) {
      throw new Error(
        `mysqldump failed (code=${exit.code ?? 'null'}, signal=${exit.signal ?? 'none'}): ${stderr.trim()}`,
      );
    }

    // The tag is only valid after the cipher finalizes (pipeline resolved).
    const tag = cipher.getAuthTag();
    if (tag.length !== GCM_TAG_BYTES) {
      throw new Error(`Unexpected GCM authentication tag length: ${tag.length}`);
    }
    appendFileSync(tmpPath, tag);
  } catch (error) {
    let childClosed = child === null || closed;
    if (child !== null && !closed) {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      childClosed = await awaitChildClose(child, () => closed, CHILD_CLOSE_TIMEOUT_MS);
      if (!childClosed) {
        log.error({ pid: child.pid }, 'mysqldump child did not close within the timeout');
      }
    }

    const closedResults = await Promise.all([
      awaitStreamClose(out, STREAM_CLOSE_TIMEOUT_MS),
      awaitStreamClose(gzip, STREAM_CLOSE_TIMEOUT_MS),
      awaitStreamClose(cipher, STREAM_CLOSE_TIMEOUT_MS),
      awaitStreamClose(child?.stdout ?? null, STREAM_CLOSE_TIMEOUT_MS),
    ]);
    const streamsClosed = closedResults.every(Boolean);

    if (shouldPreserveArtifacts(childClosed, streamsClosed)) {
      throw new BackupCleanupUnsafeError(
        'Backup cleanup is unsafe ' +
          `(mysqldump closed=${childClosed}, streams closed=${streamsClosed}). ` +
          `The temporary file and the lock were preserved for manual recovery: ${tmpPath}`,
        tmpPath,
        { cause: error },
      );
    }

    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch (cleanupError) {
      log.warn({ err: cleanupError, tmpPath }, 'Could not remove the temporary backup file');
    }
    throw error;
  } finally {
    if (removeLostListener) removeLostListener();
  }
}

/** Dynamic part size keeps the 10,000-part limit up to the 5 TiB object limit. */
export function computeS3PartSize(size: number): number {
  if (!Number.isFinite(size) || size <= 0) {
    throw new BackupConfigurationError('Invalid backup size for S3 upload');
  }
  if (size > S3_MAX_OBJECT) {
    throw new BackupConfigurationError('Backup exceeds the 5 TiB S3 object limit');
  }

  if (size <= S3_BASE_PART) return S3_BASE_PART;

  const neededBytes = Math.ceil(size / S3_MAX_PARTS);
  const neededMiB = Math.ceil(neededBytes / (1024 * 1024));
  const partSize = Math.max(S3_BASE_PART, neededMiB * 1024 * 1024);

  if (partSize > S3_MAX_PART) {
    throw new BackupConfigurationError('Backup requires S3 parts larger than 5 GiB');
  }
  if (Math.ceil(size / partSize) > S3_MAX_PARTS) {
    throw new BackupConfigurationError('Backup exceeds the 10,000-part S3 limit');
  }
  if (partSize < S3_MIN_PART) {
    throw new BackupConfigurationError('S3 part size is below the 5 MiB minimum');
  }
  return partSize;
}

async function uploadToS3(s3Config: S3Config, filepath: string, filename: string): Promise<void> {
  const {
    S3Client,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand,
  } = await import('@aws-sdk/client-s3');

  const s3 = new S3Client({
    region: s3Config.region,
    endpoint: s3Config.endpoint,
    credentials: {
      accessKeyId: s3Config.accessKeyId,
      secretAccessKey: s3Config.secretAccessKey,
    },
    forcePathStyle: true,
  });

  const key = `backups/${filename}`;
  const size = statSync(filepath).size;
  const partSize = computeS3PartSize(size);

  const created = await s3.send(new CreateMultipartUploadCommand({
    Bucket: s3Config.bucket,
    Key: key,
  }));
  const uploadId = created.UploadId;
  if (!uploadId) throw new S3UploadError('S3 did not return an UploadId');

  const parts: { ETag: string; PartNumber: number }[] = [];
  try {
    let partNumber = 1;
    for (let start = 0; start < size; start += partSize) {
      const end = Math.min(start + partSize, size);
      const result = await s3.send(new UploadPartCommand({
        Bucket: s3Config.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: createReadStream(filepath, { start, end: end - 1 }),
        ContentLength: end - start,
      }));
      if (!result.ETag) throw new S3UploadError(`S3 part ${partNumber} returned no ETag`);
      parts.push({ ETag: result.ETag, PartNumber: partNumber });
      partNumber += 1;
    }

    if (parts.length > S3_MAX_PARTS) throw new S3UploadError('S3 multipart exceeded 10,000 parts');

    await s3.send(new CompleteMultipartUploadCommand({
      Bucket: s3Config.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    }));
    log.info({ bucket: s3Config.bucket, key, parts: parts.length, partSize }, 'Backup uploaded to S3/R2');
  } catch (error) {
    await s3.send(new AbortMultipartUploadCommand({
      Bucket: s3Config.bucket,
      Key: key,
      UploadId: uploadId,
    })).catch((abortError) => log.error({ err: abortError }, 'Failed to abort multipart upload'));
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

const TRANSIENT_S3_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'TimeoutError',
  'RequestTimeout',
  'RequestTimeoutException',
  'ThrottlingException',
  'TooManyRequestsException',
  'SlowDown',
  'InternalError',
  'ServiceUnavailable',
]);

/**
 * Configuration/authorization errors are permanent: they must not be retried.
 * Only network failures, throttling and 5xx responses are retried.
 */
export function isTransientS3Error(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    code?: unknown;
    name?: unknown;
    statusCode?: unknown;
    $retryable?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  if (error instanceof BackupConfigurationError || error instanceof S3ConfigError) return false;

  const code = typeof candidate.code === 'string'
    ? candidate.code
    : typeof candidate.name === 'string'
      ? candidate.name
      : '';
  if (TRANSIENT_S3_CODES.has(code)) return true;

  const status = candidate.$metadata?.httpStatusCode ?? candidate.statusCode;
  if (typeof status === 'number' && (status === 429 || status >= 500)) return true;

  if (candidate.$retryable === true || candidate.$retryable === 'true') return true;
  return false;
}

/** Bounded transient retry for a single object; never retries the whole backup job. */
async function uploadWithRetry(s3Config: S3Config, filepath: string, filename: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= S3_MAX_ATTEMPTS; attempt += 1) {
    try {
      await uploadToS3(s3Config, filepath, filename);
      return;
    } catch (error) {
      lastError = error;
      if (!isTransientS3Error(error)) throw error;
      if (attempt < S3_MAX_ATTEMPTS) await sleep(attempt * 1000);
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new S3UploadError('S3 upload failed');
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), new Writable({
    write(chunk, _encoding, callback) {
      hash.update(chunk);
      callback();
    },
  }));
  return hash.digest('hex');
}

function fsyncFile(filePath: string): void {
  // 'r+' (not 'r'): Windows requires a writable handle for FlushFileBuffers.
  const fd = openSync(filePath, 'r+');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function fsyncDirectory(dir: string): void {
  if (process.platform === 'win32') return;
  let fd: number | null = null;
  try {
    fd = openSync(dir, 'r');
    fsyncSync(fd);
  } catch (error) {
    log.warn({ err: error, dir }, 'Directory fsync is not supported here');
  } finally {
    if (fd !== null) {
      try { closeSync(fd); } catch { /* ignore */ }
    }
  }
}

interface BackupFileEntry {
  name: string;
  path: string;
  mtimeMs: number;
}

/**
 * Lists regular GCM backup candidates directly inside BACKUP_DIR. Listing uses
 * name, entry type and mtime only: contents are NOT decrypted or authenticated
 * here, so each entry is a candidate, not a cryptographically validated backup.
 * Legacy CBC/plaintext files, subdirectories, symlinks and anything outside
 * the directory are never candidates for deletion.
 */
function listGcmBackupFiles(): BackupFileEntry[] {
  const entries = readdirSync(BACKUP_DIR, { withFileTypes: true });
  const files: BackupFileEntry[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (basename(entry.name) !== entry.name) continue;
    if (!entry.name.startsWith('courtzon_') || !entry.name.endsWith(BACKUP_EXTENSION)) continue;

    const path = join(BACKUP_DIR, entry.name);
    try {
      const stats = lstatSync(path);
      if (!stats.isFile()) continue;
      files.push({ name: entry.name, path, mtimeMs: stats.mtimeMs });
    } catch {
      /* vanished between readdir and lstat: leave it alone */
    }
  }

  return files.sort((a, b) => {
    const delta = b.mtimeMs - a.mtimeMs;
    return delta !== 0 ? delta : b.name.localeCompare(a.name);
  });
}

function assertLockOwnedForDeletion(lock: BackupLockHandle, target: string): void {
  if (!lock.isOwned()) {
    throw new BackupLockError(`Refusing to delete ${target}: backup lock ownership was lost`);
  }
}

export interface RetentionFileOperations {
  /** Test seam only; production always uses fs.unlinkSync. */
  unlink(filePath: string): void;
}

const defaultRetentionFileOperations: RetentionFileOperations = {
  unlink: (filePath) => unlinkSync(filePath),
};

function unlinkForRetention(
  lock: BackupLockHandle,
  filePath: string,
  kind: 'sidecar' | 'backup',
  operations: RetentionFileOperations,
): void {
  // Ownership is checked immediately before every unlink.
  assertLockOwnedForDeletion(lock, filePath);
  try {
    operations.unlink(filePath);
  } catch (error: any) {
    if (error?.code === 'ENOENT') return;
    throw new BackupRetentionError(
      `Failed to prune ${kind} ${filePath}: ${error?.message ?? String(error)}`,
      { cause: error },
    );
  }
}

/**
 * Deletes the sidecar first so a failure leaves the backup file untouched. If
 * the backup file cannot be deleted after its sidecar was already pruned, the
 * partial result is reported explicitly. Lock ownership is checked before
 * every unlink.
 */
function pruneBackupCandidate(
  lock: BackupLockHandle,
  file: BackupFileEntry,
  operations: RetentionFileOperations,
): void {
  const sidecarPath = `${file.path}.sha256`;

  try {
    unlinkForRetention(lock, sidecarPath, 'sidecar', operations);
  } catch (error) {
    if (error instanceof BackupRetentionError) {
      throw new BackupRetentionError(
        `${error.message}. The corresponding backup file was preserved: ${file.path}`,
        { cause: error },
      );
    }
    throw error;
  }

  try {
    unlinkForRetention(lock, file.path, 'backup', operations);
  } catch (error) {
    if (error instanceof BackupRetentionError) {
      throw new BackupRetentionError(
        `Sidecar ${sidecarPath} was pruned, but the backup file remains on disk ` +
          `(${file.path}): ${error.message}`,
        { cause: error },
      );
    }
    throw error;
  }
}

/**
 * Retention: keep the newest eligible candidate and the newest N GCM backup
 * candidates, optionally sparing anything younger than D days.
 *
 * Eligibility is name/type/mtime based only; retention never decrypts or
 * authenticates backup contents. The newest eligible candidate is always
 * preserved. Sidecars are removed before their backup file, lock ownership is
 * checked before every unlink, and failures are surfaced - never silently
 * reported as success. Legacy CBC/plaintext files are never touched.
 */
export async function pruneOldBackups(
  lock: BackupLockHandle,
  retention: RetentionSettings,
  operations: RetentionFileOperations = defaultRetentionFileOperations,
): Promise<{ pruned: number }> {
  let files: BackupFileEntry[];
  try {
    files = listGcmBackupFiles();
  } catch (error: any) {
    throw new BackupRetentionError(
      `Cannot list backups in ${BACKUP_DIR}: ${error?.message ?? String(error)}`,
      { cause: error },
    );
  }

  if (files.length === 0) return { pruned: 0 };

  const keep = new Set(files.slice(0, retention.count).map((file) => file.name));
  const cutoff = retention.days > 0
    ? Date.now() - retention.days * 24 * 60 * 60 * 1000
    : null;
  let pruned = 0;

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    // The newest eligible candidate (by mtime) is always preserved. This is a
    // retention-safety decision, not a cryptographic validation of the file.
    if (index === 0) continue;
    if (keep.has(file.name)) continue;
    if (cutoff !== null && file.mtimeMs >= cutoff) continue;

    pruneBackupCandidate(lock, file, operations);
    pruned += 1;
    log.info(
      { file: file.name, sidecar: `${file.name}.sha256` },
      'Pruned old GCM backup sidecar and backup file',
    );
  }

  return { pruned };
}

export async function pruneIfOwned(
  lock: BackupLockHandle,
  retention: RetentionSettings,
): Promise<{ pruned: number }> {
  if (!lock.isOwned()) {
    throw new BackupLockError('Refusing to prune: backup lock ownership was lost');
  }
  return pruneOldBackups(lock, retention);
}

/** Retention is best-effort only when the job is already failing. */
async function pruneAfterFailure(lock: BackupLockHandle, retention: RetentionSettings): Promise<void> {
  try {
    await pruneIfOwned(lock, retention);
  } catch (error) {
    log.error({ err: error }, 'Retention pruning also failed after the primary backup failure');
  }
}

async function performBackup(): Promise<BackupResult> {
  const key = getEncryptionKey();
  const retention = parseRetentionSettings(process.env);
  const maxBackupBytes = parseMaxBackupBytes(process.env);
  const s3Required = parseS3Required(process.env.S3_REQUIRED);
  const db = getBackupIdentity();

  assertBackupDirectoryReady();

  const lock = acquireBackupLock();
  let tmpPath = '';
  let preserveArtifacts = false;

  try {
    reportPreservedTemporaryFiles();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = randomBytes(3).toString('hex');
    const filename = `courtzon_${timestamp}_${suffix}${BACKUP_EXTENSION}`;
    const finalPath = join(BACKUP_DIR, filename);
    tmpPath = `${finalPath}.tmp-${process.pid}-${Date.now()}`;

    log.info({ database: db.database, dir: BACKUP_DIR }, 'Starting encrypted database backup');

    await streamDumpToFile(tmpPath, db, key, lock, maxBackupBytes);

    if (!lock.isOwned()) {
      throw new BackupLockError(
        'Backup lock ownership lost before finalization; aborting to avoid concurrent backups',
      );
    }

    const writtenBytes = statSync(tmpPath).size;
    if (writtenBytes <= GCM_MAGIC.length + GCM_NONCE_BYTES + GCM_TAG_BYTES) {
      throw new Error(`Backup stream produced an empty payload (${writtenBytes} bytes)`);
    }
    if (writtenBytes > maxBackupBytes) {
      throw new BackupSizeLimitError(
        `Backup exceeds BACKUP_MAX_BYTES (${maxBackupBytes} bytes): ${writtenBytes} bytes written`,
      );
    }

    fsyncFile(tmpPath);

    if (!lock.isOwned()) {
      throw new BackupLockError(
        'Backup lock ownership lost before rename; aborting to avoid concurrent backups',
      );
    }

    renameSync(tmpPath, finalPath);
    tmpPath = '';
    fsyncDirectory(BACKUP_DIR);

    let localSha256: string | null = null;
    let sidecarPath: string | null = null;
    try {
      localSha256 = await sha256File(finalPath);
      sidecarPath = `${finalPath}.sha256`;
      writeFileSync(sidecarPath, `${localSha256}  ${basename(finalPath)}\n`, { mode: 0o600 });
      fsyncFile(sidecarPath);
    } catch (error) {
      log.error({ err: error }, 'Backup saved but the SHA-256 sidecar could not be written');
      sidecarPath = null;
    }

    const result: BackupResult = {
      localPath: finalPath,
      localSha256,
      sidecarPath,
      s3: 'skipped',
    };
    log.info({ path: finalPath, sha256: localSha256 }, 'Encrypted backup created locally');

    let s3Config: S3Config | null;
    try {
      s3Config = parseS3Config(process.env);
    } catch (error) {
      await pruneAfterFailure(lock, retention);
      throw error;
    }

    if (!s3Config) {
      if (s3Required) {
        await pruneAfterFailure(lock, retention);
        throw new S3ConfigError('S3_REQUIRED=1 but no S3 configuration is present');
      }
      log.info('S3 upload skipped — no S3 configuration');
    } else {
      try {
        await uploadWithRetry(s3Config, finalPath, filename);
        if (sidecarPath) {
          try {
            await uploadWithRetry(s3Config, sidecarPath, `${filename}.sha256`);
          } catch (error) {
            log.error({ err: error }, 'Sidecar upload failed — local backup and sidecar retained');
          }
        }
        result.s3 = 'succeeded';
      } catch (error) {
        result.s3 = 'failed';
        result.s3Error = error instanceof Error ? error.message : String(error);
        log.error({ err: error }, 'S3 upload failed — local backup retained');

        if (s3Required) {
          await pruneAfterFailure(lock, retention);
          throw new S3UploadError(
            `S3 upload failed and S3_REQUIRED=1: ${result.s3Error}`,
          );
        }
      }
    }

    try {
      await pruneIfOwned(lock, retention);
    } catch (error) {
      throw new BackupRetentionError(
        `Backup ${finalPath} was created, but retention pruning failed: ` +
          (error instanceof Error ? error.message : String(error)),
        { cause: error },
      );
    }
    return result;
  } catch (error) {
    if (error instanceof BackupCleanupUnsafeError) {
      preserveArtifacts = true;
    }
    log.error(error, 'Database backup failed');
    throw error;
  } finally {
    if (preserveArtifacts) {
      lock.abandon();
      log.error(
        { lock: LOCK_PATH, tmpPath },
        'Backup failed closed: mysqldump may still be writing. The lock and the temporary file were preserved. ' +
          'Manual recovery: confirm mysqldump has stopped, inspect/recover the temporary file, then remove it and the lock by hand',
      );
    } else {
      lock.release();
      if (tmpPath) {
        try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch { /* ignore */ }
      }
    }
  }
}

/**
 * BullMQ handler contract: `(data) => Promise<void>`.
 * The detailed result is logged here; the queue contract is preserved.
 */
export async function runDatabaseBackup(): Promise<void> {
  const result = await performBackup();
  log.info(
    {
      localPath: result.localPath,
      localSha256: result.localSha256,
      sidecarPath: result.sidecarPath,
      s3: result.s3,
      s3Error: result.s3Error,
    },
    'Backup job finished',
  );
}
