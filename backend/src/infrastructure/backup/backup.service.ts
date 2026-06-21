import { execSync } from 'node:child_process';
import { mkdirSync, createWriteStream, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createGzip } from 'node:zlib';
import { createCipheriv, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createModuleLogger } from '../../shared/utils/logger.js';

const log = createModuleLogger('backup');

const BACKUP_DIR = join(import.meta.dirname, '..', '..', '..', '..', 'backups');
const ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY || '';
const BACKUP_RETENTION_DAYS = 30;

async function ensureDir(): Promise<void> {
  mkdirSync(BACKUP_DIR, { recursive: true });
}

function getDatabaseConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || '3306',
    user: process.env.DB_USER || 'app_user',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'courtzon_v2',
  };
}

export async function runDatabaseBackup(): Promise<void> {
  await ensureDir();
  const db = getDatabaseConfig();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `courtzon_${timestamp}.sql.gz`;
  const filepath = join(BACKUP_DIR, filename);
  const encFilepath = `${filepath}.enc`;

  try {
    log.info({ database: db.database }, 'Starting database backup');

    const dumpCmd = `mysqldump --single-transaction --routines --triggers --events \
      --host=${db.host} --port=${db.port} --user=${db.user} --password="${db.password}" \
      ${db.database}`;

    const dumpStream = execSync(dumpCmd, { maxBuffer: 500 * 1024 * 1024 });

    const gzipped = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const gzip = createGzip();
      gzip.on('data', (chunk: Buffer) => chunks.push(chunk));
      gzip.on('end', () => resolve(Buffer.concat(chunks)));
      gzip.on('error', reject);
      gzip.end(dumpStream);
    });

    if (ENCRYPTION_KEY) {
      const iv = randomBytes(16);
      const key = Buffer.from(ENCRYPTION_KEY, 'hex');
      const cipher = createCipheriv('aes-256-cbc', key, iv);
      const encrypted = Buffer.concat([iv, cipher.update(gzipped), cipher.final()]);

      const writeStream = createWriteStream(encFilepath);
      writeStream.write(encrypted);
      writeStream.end();
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
      });
      log.info({ path: encFilepath }, 'Encrypted backup saved');
    } else {
      const writeStream = createWriteStream(filepath);
      writeStream.write(gzipped);
      writeStream.end();
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
      });
      log.info({ path: filepath }, 'Backup saved (unencrypted)');
    }

    await pruneOldBackups();
  } catch (error) {
    log.error(error, 'Database backup failed');
    throw error;
  }
}

async function pruneOldBackups(): Promise<void> {
  const { readdirSync, statSync, unlinkSync } = await import('node:fs');
  const { join } = await import('node:path');

  try {
    const files = readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('courtzon_') && (f.endsWith('.sql.gz') || f.endsWith('.sql.gz.enc')))
      .map(f => ({ name: f, path: join(BACKUP_DIR, f), mtime: statSync(join(BACKUP_DIR, f)).mtime }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const file of files) {
      if (file.mtime.getTime() < cutoff) {
        try { unlinkSync(file.path); log.info({ file: file.name }, 'Pruned old backup'); } catch { /* ignore */ }
      }
    }
  } catch (error) {
    log.error(error, 'Backup pruning failed');
  }
}
