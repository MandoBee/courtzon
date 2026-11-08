// ============================================================================
// CourtZon — Backup service unit tests (Phase 1)
//
// SAFETY: these tests never touch a database, Redis, Docker, mysqldump, S3 or
// any network endpoint. They only exercise pure configuration parsers, the S3
// part-size calculator, the transient-error classifier and the local filesystem
// lock inside an isolated OS temp directory.
//
// The logger is mocked so a pino transport worker is never started.
// ============================================================================
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

vi.mock('../../../shared/utils/logger.js', () => {
  const logger = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined };
  return { createModuleLogger: () => logger, logger };
});

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
const TiB = 1024 * GiB;
const DAY_MS = 24 * 60 * 60 * 1000;

type BackupModule = typeof import('../backup.service.js');

let service: BackupModule;
let tempRoot: string;
let backupDir: string;
let lockPath: string;
const originalBackupDir = process.env.BACKUP_DIR;

function clearLockFile(): void {
  try {
    if (existsSync(lockPath)) unlinkSync(lockPath);
  } catch {
    /* the lock is still held by a descriptor — release() is expected first */
  }
}

function findDeadPid(isAlive: (pid: number) => boolean): number | null {
  for (let pid = 400_000; pid < 400_200; pid += 1) {
    if (!isAlive(pid)) return pid;
  }
  return null;
}

function writeBackupFile(name: string, ageMs: number): string {
  const path = join(backupDir, name);
  writeFileSync(path, 'backup-bytes');
  const time = new Date(Date.now() - ageMs);
  utimesSync(path, time, time);
  return path;
}

function clearBackupArtifacts(): void {
  for (const name of readdirSync(backupDir)) {
    if (name.startsWith('courtzon_')) {
      rmSync(join(backupDir, name), { recursive: true, force: true });
    }
  }
}

function collectingWritable(): Writable {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
}

beforeAll(async () => {
  tempRoot = mkdtempSync(join(tmpdir(), 'courtzon-backup-unit-'));
  backupDir = join(tempRoot, 'backups');
  mkdirSync(backupDir, { recursive: true });
  lockPath = join(backupDir, '.courtzon-backup.lock');
  process.env.BACKUP_DIR = backupDir;
  service = await import('../backup.service.js');
});

afterEach(() => {
  clearLockFile();
});

afterAll(() => {
  clearLockFile();
  if (originalBackupDir === undefined) {
    delete process.env.BACKUP_DIR;
  } else {
    process.env.BACKUP_DIR = originalBackupDir;
  }
  try {
    rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    /* best effort on Windows when a handle is still open */
  }
});

describe('validateEncryptionKey', () => {
  it('accepts exactly 64 hex characters (lower and upper case)', () => {
    expect(service.validateEncryptionKey('a'.repeat(64)).length).toBe(32);
    expect(service.validateEncryptionKey('A1b2'.repeat(16)).length).toBe(32);
  });

  it.each([
    ['empty', ''],
    ['63 chars', 'a'.repeat(63)],
    ['65 chars', 'a'.repeat(65)],
    ['non-hex character', `${'a'.repeat(63)}z`],
    ['leading whitespace', ` ${'a'.repeat(64)}`],
    ['trailing whitespace', `${'a'.repeat(64)} `],
    ['0x prefix', `0x${'a'.repeat(64)}`],
    ['base64 padded', `${'a'.repeat(64)}==`],
  ])('rejects %s without trimming or normalizing', (_label, raw) => {
    expect(() => service.validateEncryptionKey(raw)).toThrow(service.BackupConfigurationError);
  });

  it('rejects the value 0x-prefixed or uppercase-normalized forms silently accepted elsewhere', () => {
    expect(() => service.validateEncryptionKey('A'.repeat(63))).toThrow(
      /BACKUP_ENCRYPTION_KEY must match/,
    );
  });
});

describe('parseRetentionSettings', () => {
  it('defaults to count=30 and days=0', () => {
    expect(service.parseRetentionSettings({})).toEqual({ count: 30, days: 0 });
  });

  it('accepts explicit valid values', () => {
    expect(service.parseRetentionSettings({ BACKUP_RETENTION_COUNT: '1', BACKUP_RETENTION_DAYS: '0' }))
      .toEqual({ count: 1, days: 0 });
    expect(service.parseRetentionSettings({ BACKUP_RETENTION_COUNT: '10', BACKUP_RETENTION_DAYS: '7' }))
      .toEqual({ count: 10, days: 7 });
  });

  it('treats empty strings as unset', () => {
    expect(service.parseRetentionSettings({ BACKUP_RETENTION_COUNT: '', BACKUP_RETENTION_DAYS: '' }))
      .toEqual({ count: 30, days: 0 });
  });

  it.each(['abc', '-1', '1.5', '+5', ' 5', '5 ', '1e3', '0x10'])(
    'rejects non-decimal count value %s',
    (raw) => {
      expect(() => service.parseRetentionSettings({ BACKUP_RETENTION_COUNT: raw }))
        .toThrow(service.BackupConfigurationError);
    },
  );

  it('rejects count below 1', () => {
    expect(() => service.parseRetentionSettings({ BACKUP_RETENTION_COUNT: '0' }))
      .toThrow(/BACKUP_RETENTION_COUNT must be between 1 and 10000/);
  });

  it('rejects days below 0 and above the safety ceiling', () => {
    expect(() => service.parseRetentionSettings({ BACKUP_RETENTION_DAYS: '-1' }))
      .toThrow(service.BackupConfigurationError);
    expect(() => service.parseRetentionSettings({ BACKUP_RETENTION_DAYS: '3651' }))
      .toThrow(service.BackupConfigurationError);
  });
});

describe('parseMaxBackupBytes', () => {
  it('defaults to the documented conservative ceiling', () => {
    expect(service.parseMaxBackupBytes({})).toBe(service.DEFAULT_MAX_BACKUP_BYTES);
    expect(service.DEFAULT_MAX_BACKUP_BYTES).toBe(64 * GiB);
  });

  it('accepts an explicit in-range value', () => {
    expect(service.parseMaxBackupBytes({ BACKUP_MAX_BYTES: String(2 * GiB) })).toBe(2 * GiB);
    expect(service.parseMaxBackupBytes({ BACKUP_MAX_BYTES: String(MiB) })).toBe(MiB);
    expect(service.parseMaxBackupBytes({ BACKUP_MAX_BYTES: String(1024 * GiB) })).toBe(1024 * GiB);
  });

  it.each(['abc', '1.5', '-1', '0', '+5', ' 5', '5 ', '1e9', '0x10'])(
    'rejects invalid value %s',
    (raw) => {
      expect(() => service.parseMaxBackupBytes({ BACKUP_MAX_BYTES: raw }))
        .toThrow(service.BackupConfigurationError);
    },
  );

  it('rejects values below 1 MiB and above 1 TiB', () => {
    expect(() => service.parseMaxBackupBytes({ BACKUP_MAX_BYTES: String(MiB - 1) }))
      .toThrow(service.BackupConfigurationError);
    expect(() => service.parseMaxBackupBytes({ BACKUP_MAX_BYTES: String(1024 * GiB + 1) }))
      .toThrow(service.BackupConfigurationError);
  });
});

describe('createBackupSizeLimiter', () => {
  it('passes data that stays within the limit', async () => {
    await expect(
      pipeline(
        Readable.from([Buffer.alloc(4), Buffer.alloc(4)]),
        service.createBackupSizeLimiter(8),
        collectingWritable(),
      ),
    ).resolves.toBeUndefined();
  });

  it('aborts as soon as the streamed size exceeds the limit', async () => {
    await expect(
      pipeline(
        Readable.from([Buffer.alloc(6), Buffer.alloc(6)]),
        service.createBackupSizeLimiter(10),
        collectingWritable(),
      ),
    ).rejects.toThrow(/BACKUP_MAX_BYTES/);
  });

  it('counts the fixed header/nonce/tag overhead', async () => {
    await expect(
      pipeline(
        Readable.from([Buffer.alloc(5)]),
        service.createBackupSizeLimiter(10, 6),
        collectingWritable(),
      ),
    ).rejects.toBeInstanceOf(service.BackupSizeLimitError);

    await expect(
      pipeline(
        Readable.from([Buffer.alloc(4)]),
        service.createBackupSizeLimiter(10, 6),
        collectingWritable(),
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects invalid limiter configuration', () => {
    expect(() => service.createBackupSizeLimiter(0)).toThrow(service.BackupConfigurationError);
    expect(() => service.createBackupSizeLimiter(-1)).toThrow(service.BackupConfigurationError);
    expect(() => service.createBackupSizeLimiter(10, -1)).toThrow(service.BackupConfigurationError);
  });
});

describe('parseS3Required', () => {
  it('is disabled when unset or empty', () => {
    expect(service.parseS3Required(undefined)).toBe(false);
    expect(service.parseS3Required('')).toBe(false);
    expect(service.parseS3Required('0')).toBe(false);
  });

  it('is enabled only by the exact value "1"', () => {
    expect(service.parseS3Required('1')).toBe(true);
  });

  it.each(['true', 'yes', 'on', '01', ' 1', '1 ', '2', 'TRUE'])(
    'rejects %s instead of coercing it',
    (raw) => {
      expect(() => service.parseS3Required(raw)).toThrow(/S3_REQUIRED must be "0" or "1"/);
    },
  );
});

describe('parseS3Config', () => {
  const complete = {
    S3_BUCKET: 'bucket',
    S3_ACCESS_KEY: 'access',
    S3_SECRET_KEY: 'secret',
    S3_ENDPOINT: 'https://example.invalid',
  };

  it('returns null when every S3 value is absent (local-only mode)', () => {
    expect(service.parseS3Config({})).toBeNull();
    expect(service.parseS3Config({ S3_REGION: 'auto' })).toBeNull();
  });

  it('returns the config when all required values are present', () => {
    expect(service.parseS3Config({ ...complete })).toEqual({
      bucket: 'bucket',
      accessKeyId: 'access',
      secretAccessKey: 'secret',
      endpoint: 'https://example.invalid',
      region: 'auto',
    });
  });

  it('honours S3_REGION when provided', () => {
    expect(service.parseS3Config({ ...complete, S3_REGION: 'eu-central-1' })?.region)
      .toBe('eu-central-1');
  });

  it.each(Object.keys(complete))('rejects a configuration missing %s', (missing) => {
    const partial: NodeJS.ProcessEnv = { ...complete };
    delete partial[missing];
    expect(() => service.parseS3Config(partial)).toThrow(service.S3ConfigError);
  });

  it('treats empty strings as missing, never as valid credentials', () => {
    expect(() =>
      service.parseS3Config({ ...complete, S3_SECRET_KEY: '' }),
    ).toThrow(/Incomplete S3 configuration — missing: S3_SECRET_KEY/);
  });
});

describe('computeS3PartSize', () => {
  it('uses the 8 MiB base part size for small backups', () => {
    expect(service.computeS3PartSize(1)).toBe(8 * MiB);
    expect(service.computeS3PartSize(8 * MiB)).toBe(8 * MiB);
    expect(service.computeS3PartSize(9 * MiB)).toBe(8 * MiB);
  });

  it('scales part size so a 5 TiB object stays under the 10,000-part limit', () => {
    const size = 5 * TiB;
    const partSize = service.computeS3PartSize(size);
    expect(partSize).toBeGreaterThanOrEqual(5 * MiB);
    expect(partSize).toBeLessThanOrEqual(5 * GiB);
    expect(Math.ceil(size / partSize)).toBeLessThanOrEqual(10_000);
  });

  it('rejects objects above the 5 TiB limit', () => {
    expect(() => service.computeS3PartSize(5 * TiB + 1)).toThrow(/5 TiB/);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid size %s',
    (size) => {
      expect(() => service.computeS3PartSize(size)).toThrow(service.BackupConfigurationError);
    },
  );
});

describe('isTransientS3Error', () => {
  it('retries network failures, throttling and 5xx responses', () => {
    expect(service.isTransientS3Error(Object.assign(new Error('reset'), { code: 'ECONNRESET' })))
      .toBe(true);
    expect(service.isTransientS3Error(Object.assign(new Error('timeout'), { name: 'TimeoutError' })))
      .toBe(true);
    expect(service.isTransientS3Error({ $metadata: { httpStatusCode: 503 } })).toBe(true);
    expect(service.isTransientS3Error({ $metadata: { httpStatusCode: 429 } })).toBe(true);
    expect(service.isTransientS3Error({ $retryable: true })).toBe(true);
  });

  it('does not retry authorization, configuration or not-found errors', () => {
    expect(service.isTransientS3Error(Object.assign(new Error('denied'), { name: 'AccessDenied' })))
      .toBe(false);
    expect(service.isTransientS3Error({ $metadata: { httpStatusCode: 403 } })).toBe(false);
    expect(service.isTransientS3Error({ $metadata: { httpStatusCode: 404 } })).toBe(false);
    expect(service.isTransientS3Error(new service.BackupConfigurationError('bad part size')))
      .toBe(false);
    expect(service.isTransientS3Error(new service.S3ConfigError('incomplete'))).toBe(false);
    expect(service.isTransientS3Error(new Error('generic'))).toBe(false);
    expect(service.isTransientS3Error(null)).toBe(false);
  });
});

describe('isProcessAlive', () => {
  it('recognizes the running process and rejects invalid PIDs', () => {
    expect(service.isProcessAlive(process.pid)).toBe(true);
    expect(service.isProcessAlive(0)).toBe(false);
    expect(service.isProcessAlive(-1)).toBe(false);
    expect(service.isProcessAlive(1.5)).toBe(false);
  });
});

describe('awaitChildClose', () => {
  it('returns true when the close flag is already set', async () => {
    const child = new EventEmitter();
    await expect(service.awaitChildClose(child as never, () => true, 50)).resolves.toBe(true);
  });

  it('returns true when the close event arrives after registration', async () => {
    const child = new EventEmitter();
    const promise = service.awaitChildClose(child as never, () => false, 100);
    setTimeout(() => child.emit('close'), 5);
    await expect(promise).resolves.toBe(true);
  });

  it('returns false on timeout and never treats exitCode/signalCode/destroyed as closure', async () => {
    const child = Object.assign(new EventEmitter(), {
      exitCode: 0,
      signalCode: 'SIGKILL',
      destroyed: true,
    });
    await expect(service.awaitChildClose(child as never, () => false, 10)).resolves.toBe(false);
  });

  it('detects a close emitted between the first check and listener registration', async () => {
    let checks = 0;
    const child = new EventEmitter();
    const promise = service.awaitChildClose(
      child as never,
      () => {
        checks += 1;
        return checks > 1;
      },
      100,
    );
    await expect(promise).resolves.toBe(true);
  });
});

describe('shouldPreserveArtifacts', () => {
  it('allows cleanup only when both the child and the streams are closed', () => {
    expect(service.shouldPreserveArtifacts(true, true)).toBe(false);
    expect(service.shouldPreserveArtifacts(false, true)).toBe(true);
    expect(service.shouldPreserveArtifacts(true, false)).toBe(true);
    expect(service.shouldPreserveArtifacts(false, false)).toBe(true);
  });
});

describe('reportPreservedTemporaryFiles', () => {
  const artifactName = 'courtzon_2020-01-01T00-00-00-000Z_aaaaaa.sql.gz.enc2.tmp-1234-5678';

  afterEach(() => {
    rmSync(join(backupDir, artifactName), { force: true });
  });

  it('reports and never deletes a preserved recovery artifact', () => {
    const artifactPath = join(backupDir, artifactName);
    writeFileSync(artifactPath, 'preserved-recovery-artifact');
    const old = new Date(Date.now() - 365 * DAY_MS);
    utimesSync(artifactPath, old, old);

    const reported = service.reportPreservedTemporaryFiles();

    expect(reported).toContain(artifactPath);
    expect(existsSync(artifactPath)).toBe(true);
  });
});

describe('unlinkLockIfOwned', () => {
  it('removes the lock when the path still matches this process identity', () => {
    const fd = openSync(lockPath, 'wx', 0o600);
    const identity = fstatSync(fd);
    closeSync(fd);
    expect(service.unlinkLockIfOwned(identity)).toBe(true);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('never removes a replacement lock created after the identity was captured', () => {
    const fd = openSync(lockPath, 'wx', 0o600);
    const identity = fstatSync(fd);
    closeSync(fd);
    unlinkSync(lockPath);
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, token: 'replacement' }));

    expect(service.unlinkLockIfOwned(identity)).toBe(false);
    expect(existsSync(lockPath)).toBe(true);
  });

  it('refuses to remove a lock path that is no longer a regular file', () => {
    const fd = openSync(lockPath, 'wx', 0o600);
    const identity = fstatSync(fd);
    closeSync(fd);
    unlinkSync(lockPath);
    mkdirSync(lockPath);

    try {
      expect(service.unlinkLockIfOwned(identity)).toBe(false);
      expect(existsSync(lockPath)).toBe(true);
    } finally {
      rmSync(lockPath, { recursive: true, force: true });
    }
  });
});

describe('acquireBackupLock', () => {
  it('creates an exclusive lock, keeps ownership and releases it', () => {
    const lock = service.acquireBackupLock();
    try {
      expect(lock.isOwned()).toBe(true);
      expect(existsSync(lockPath)).toBe(true);
      const payload = JSON.parse(readFileSync(lockPath, 'utf8')) as { pid: number; token: string };
      expect(payload.pid).toBe(process.pid);
      expect(payload.token).toMatch(/^[0-9a-f]{16}$/);
    } finally {
      lock.release();
    }
    expect(existsSync(lockPath)).toBe(false);
  });

  it('refuses a second lock while the first is held by a live process', () => {
    const lock = service.acquireBackupLock();
    try {
      expect(() => service.acquireBackupLock()).toThrow(/Another backup is already running/);
      expect(() => service.acquireBackupLock()).toThrow(/manual recovery is required/);
    } finally {
      lock.release();
    }
  });

  it('fails closed on a stale lock from a dead process and never deletes it', () => {
    const deadPid = findDeadPid(service.isProcessAlive);
    if (deadPid === null) {
      // No dead PID could be found in this environment; this test needs one.
      return;
    }
    writeFileSync(
      lockPath,
      JSON.stringify({
        pid: deadPid,
        token: 'deadbeefdeadbeef',
        startedAt: new Date().toISOString(),
        processStartTime: null,
      }),
    );

    expect(() => service.acquireBackupLock()).toThrow(/Stale backup lock from dead pid/);
    expect(() => service.acquireBackupLock()).toThrow(/Automatic removal is disabled/);
    expect(existsSync(lockPath)).toBe(true);
  });

  it('fails closed on an unreadable lock file', () => {
    writeFileSync(lockPath, 'not-json');
    expect(() => service.acquireBackupLock()).toThrow(/unreadable or invalid/);
    expect(existsSync(lockPath)).toBe(true);
  });

  it('fails closed on a structurally invalid lock payload', () => {
    writeFileSync(lockPath, JSON.stringify({ pid: 'not-a-pid' }));
    expect(() => service.acquireBackupLock()).toThrow(service.BackupLockError);
  });

  it('notifies subscribers and blocks ownership after the lock is stolen', () => {
    const lock = service.acquireBackupLock();
    const onLost = vi.fn();
    const unsubscribe = lock.onLost(onLost);
    try {
      writeFileSync(
        lockPath,
        JSON.stringify({
          pid: process.pid,
          token: 'stolen0000000000',
          startedAt: new Date().toISOString(),
          processStartTime: null,
        }),
      );

      expect(lock.isOwned()).toBe(false);
      expect(onLost).toHaveBeenCalledTimes(1);
      expect(lock.isOwned()).toBe(false);
      expect(onLost).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
      lock.release();
    }
    // release() must leave a stolen lock in place for manual recovery.
    expect(existsSync(lockPath)).toBe(true);
  });

  it('stops notifying after unsubscribe', () => {
    const lock = service.acquireBackupLock();
    const onLost = vi.fn();
    const unsubscribe = lock.onLost(onLost);
    unsubscribe();
    try {
      writeFileSync(
        lockPath,
        JSON.stringify({
          pid: process.pid,
          token: 'stolen1111111111',
          startedAt: new Date().toISOString(),
          processStartTime: null,
        }),
      );
      expect(lock.isOwned()).toBe(false);
      expect(onLost).not.toHaveBeenCalled();
    } finally {
      lock.release();
    }
  });

  it('abandon() keeps the lock file when cleanup is unsafe', () => {
    const lock = service.acquireBackupLock();
    lock.abandon();

    expect(existsSync(lockPath)).toBe(true);
    expect(() => service.acquireBackupLock()).toThrow(/Another backup is already running/);
  });
});

describe('retention', () => {
  beforeEach(() => {
    clearBackupArtifacts();
  });

  afterEach(() => {
    clearBackupArtifacts();
  });

  it('keeps the newest backups, removes their sidecars and never touches legacy formats', async () => {
    const lock = service.acquireBackupLock();
    try {
      const older = writeBackupFile('courtzon_2020-01-01T00-00-00-000Z_aaaaaa.sql.gz.enc2', 3 * DAY_MS);
      const newer = writeBackupFile('courtzon_2020-01-02T00-00-00-000Z_bbbbbb.sql.gz.enc2', DAY_MS);
      const newest = writeBackupFile('courtzon_2020-01-03T00-00-00-000Z_cccccc.sql.gz.enc2', 0);
      writeFileSync(`${older}.sha256`, 'sum');
      writeFileSync(`${newest}.sha256`, 'sum');
      const legacyCbc = writeBackupFile('courtzon_legacy.sql.gz.enc', DAY_MS);
      const legacyPlain = writeBackupFile('courtzon_legacy.sql.gz', DAY_MS);

      const result = await service.pruneOldBackups(lock, { count: 2, days: 0 });

      expect(result.pruned).toBe(1);
      expect(existsSync(older)).toBe(false);
      expect(existsSync(`${older}.sha256`)).toBe(false);
      expect(existsSync(newer)).toBe(true);
      expect(existsSync(newest)).toBe(true);
      expect(existsSync(`${newest}.sha256`)).toBe(true);
      expect(existsSync(legacyCbc)).toBe(true);
      expect(existsSync(legacyPlain)).toBe(true);
    } finally {
      lock.release();
    }
  });

  it('spares backups younger than BACKUP_RETENTION_DAYS even beyond the count', async () => {
    const lock = service.acquireBackupLock();
    try {
      const older = writeBackupFile('courtzon_2020-01-01T00-00-00-000Z_dddddd.sql.gz.enc2', 2 * DAY_MS);
      const newest = writeBackupFile('courtzon_2020-01-02T00-00-00-000Z_eeeeee.sql.gz.enc2', 0);

      const result = await service.pruneOldBackups(lock, { count: 1, days: 7 });

      expect(result.pruned).toBe(0);
      expect(existsSync(older)).toBe(true);
      expect(existsSync(newest)).toBe(true);
    } finally {
      lock.release();
    }
  });

  it('refuses to delete anything once lock ownership is lost', async () => {
    const lock = service.acquireBackupLock();
    try {
      const older = writeBackupFile('courtzon_2020-01-01T00-00-00-000Z_ffffff.sql.gz.enc2', 2 * DAY_MS);
      writeBackupFile('courtzon_2020-01-02T00-00-00-000Z_gggggg.sql.gz.enc2', 0);
      writeFileSync(
        lockPath,
        JSON.stringify({
          pid: process.pid,
          token: 'stolen2222222222',
          startedAt: new Date().toISOString(),
          processStartTime: null,
        }),
      );

      await expect(service.pruneIfOwned(lock, { count: 1, days: 0 }))
        .rejects.toThrow(/ownership was lost/);
      expect(existsSync(older)).toBe(true);
    } finally {
      lock.release();
    }
  });

  it('surfaces pruning failures and preserves the backup when the sidecar cannot be deleted', async () => {
    const lock = service.acquireBackupLock();
    try {
      const older = writeBackupFile('courtzon_2020-01-01T00-00-00-000Z_hhhhhh.sql.gz.enc2', 2 * DAY_MS);
      writeBackupFile('courtzon_2020-01-02T00-00-00-000Z_iiiiii.sql.gz.enc2', 0);
      // Force the sidecar unlink to fail: unlink() cannot remove a directory.
      mkdirSync(`${older}.sha256`);

      await expect(service.pruneOldBackups(lock, { count: 1, days: 0 }))
        .rejects.toThrow(/corresponding backup file was preserved/);
      expect(existsSync(`${older}.sha256`)).toBe(true);
      expect(existsSync(older)).toBe(true);
    } finally {
      lock.release();
    }
  });

  it('deletes the sidecar before its backup file', async () => {
    const lock = service.acquireBackupLock();
    try {
      const older = writeBackupFile('courtzon_2020-01-01T00-00-00-000Z_jjjjjj.sql.gz.enc2', 2 * DAY_MS);
      writeBackupFile('courtzon_2020-01-02T00-00-00-000Z_kkkkkk.sql.gz.enc2', 0);
      writeFileSync(`${older}.sha256`, 'sum');
      const unlinkOrder: string[] = [];
      const operations = {
        unlink(filePath: string): void {
          unlinkOrder.push(filePath);
          unlinkSync(filePath);
        },
      };

      const result = await service.pruneOldBackups(lock, { count: 1, days: 0 }, operations);

      expect(result.pruned).toBe(1);
      expect(unlinkOrder).toEqual([`${older}.sha256`, older]);
    } finally {
      lock.release();
    }
  });

  it('reports a clear failure and keeps the backup when deletion fails after its sidecar', async () => {
    const lock = service.acquireBackupLock();
    try {
      const older = writeBackupFile('courtzon_2020-01-01T00-00-00-000Z_llllll.sql.gz.enc2', 2 * DAY_MS);
      writeBackupFile('courtzon_2020-01-02T00-00-00-000Z_mmmmmm.sql.gz.enc2', 0);
      writeFileSync(`${older}.sha256`, 'sum');
      const operations = {
        unlink(filePath: string): void {
          if (filePath === older) {
            throw Object.assign(new Error('simulated EBUSY'), { code: 'EBUSY' });
          }
          unlinkSync(filePath);
        },
      };

      await expect(service.pruneOldBackups(lock, { count: 1, days: 0 }, operations))
        .rejects.toThrow(/was pruned, but the backup file remains on disk/);
      expect(existsSync(`${older}.sha256`)).toBe(false);
      expect(existsSync(older)).toBe(true);
    } finally {
      lock.release();
    }
  });
});
