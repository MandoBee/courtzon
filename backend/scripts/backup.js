import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || '3306';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'courtzon_v3';
const BACKUP_DIR = process.env.BACKUP_DIR || './backups';

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const filename = `${DB_NAME}_${timestamp}.sql.gz`;
const filepath = join(BACKUP_DIR, filename);

if (!existsSync(BACKUP_DIR)) {
  mkdirSync(BACKUP_DIR, { recursive: true });
}

const cmd = [
  'mariadb-dump',
  `--host=${DB_HOST}`,
  `--port=${DB_PORT}`,
  `--user=${DB_USER}`,
  DB_PASS ? `--password=${DB_PASS}` : '',
  '--skip-ssl',
  '--single-transaction',
  '--routines',
  '--triggers',
  '--events',
  DB_NAME,
].filter(Boolean).join(' ');

try {
  const rawOutput = execSync(cmd, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] }).toString();

  // Strip VIRTUAL generated column org_id_normalized from roles INSERTs
  // (MySQL 8.0 rejects explicit values for VIRTUAL generated columns on restore)
  const cleaned = rawOutput.replace(
    /(?<=INSERT INTO `roles` VALUES\s*)(.*?)(?=;)/gs,
    (valuesBlock) => valuesBlock.replace(/,\d+\)/g, ',DEFAULT)')
  );

  const output = gzipSync(cleaned);
  writeFileSync(filepath, output);
  console.log(`Backup created: ${filepath} (${(output.length / 1024 / 1024).toFixed(2)} MB)`);
} catch (err) {
  console.error('Backup failed:', err.message);
  process.exit(1);
}
