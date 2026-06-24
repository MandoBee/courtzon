import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, createWriteStream, unlinkSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createGzip } from 'node:zlib';
import { createCipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream as fsCreateWriteStream } from 'node:fs';
import { createModuleLogger } from '../../shared/utils/logger.js';

const log = createModuleLogger('backup');
const execAsync = promisify(exec);

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
    user: process.env.DB_USER || 'courtzon_app',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'courtzon_v3',
  };
}

async function uploadToS3(filepath: string, filename: string): Promise<void> {
  const S3_BUCKET = process.env.S3_BUCKET;
  const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
  const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
  const S3_ENDPOINT = process.env.S3_ENDPOINT;
  const S3_REGION = process.env.S3_REGION || 'auto';

  if (!S3_BUCKET || !S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_ENDPOINT) {
    log.info('S3 upload skipped — S3 env vars not configured');
    return;
  }

  try {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: S3_REGION,
      endpoint: S3_ENDPOINT,
      credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
      forcePathStyle: true,
    });

    const fileBuffer = await import('node:fs/promises').then(fs => fs.readFile(filepath));
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: `backups/${filename}`,
      Body: fileBuffer,
    }));

    log.info({ bucket: S3_BUCKET, key: `backups/${filename}` }, 'Backup uploaded to S3/R2');
  } catch (error) {
    log.error({ err: error }, 'S3 upload failed — backup is still stored locally');
  }
}

export async function runDatabaseBackup(): Promise<void> {
  await ensureDir();
  const db = getDatabaseConfig();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `courtzon_${timestamp}.sql.gz`;
  const filepath = join(BACKUP_DIR, filename);
  const encFilepath = `${filepath}.enc`;
  const encFilename = `${filename}.enc`;

  try {
    log.info({ database: db.database }, 'Starting database backup');

    const dumpCmd = `mysqldump --single-transaction --routines --triggers --events \
      --host=${db.host} --port=${db.port} --user=${db.user} --password="${db.password}" \
      ${db.database}`;

    const { stdout: dumpOutput } = await execAsync(dumpCmd, { maxBuffer: 500 * 1024 * 1024 });

    // Strip VIRTUAL generated column org_id_normalized from roles INSERTs
    // (MySQL 8.0 rejects explicit values for VIRTUAL generated columns on restore)
    const cleanedDump = dumpOutput.replace(
      /(?<=INSERT INTO `roles` VALUES\s*)(.*?)(?=;)/gs,
      (valuesBlock: string) => valuesBlock.replace(/,\d+\)/g, ',DEFAULT)')
    );

    const gzipped = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const gzip = createGzip();
      gzip.on('data', (chunk: Buffer) => chunks.push(chunk));
      gzip.on('end', () => resolve(Buffer.concat(chunks)));
      gzip.on('error', reject);
      gzip.end(cleanedDump);
    });

    let finalFilepath = filepath;
    let finalFilename = filename;

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
      finalFilepath = encFilepath;
      finalFilename = encFilename;
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

    await uploadToS3(finalFilepath, finalFilename);
    await pruneOldBackups();
  } catch (error) {
    log.error(error, 'Database backup failed');
    throw error;
  }
}

async function pruneOldBackups(): Promise<void> {
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
