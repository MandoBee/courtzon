import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || '3306';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'courtzon_v2';
const BACKUP_DIR = process.env.BACKUP_DIR || './backups';

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const filename = `${DB_NAME}_${timestamp}.sql.gz`;
const filepath = join(BACKUP_DIR, filename);

if (!existsSync(BACKUP_DIR)) {
  mkdirSync(BACKUP_DIR, { recursive: true });
}

const cmd = [
  'mysqldump',
  `--host=${DB_HOST}`,
  `--port=${DB_PORT}`,
  `--user=${DB_USER}`,
  DB_PASS ? `--password=${DB_PASS}` : '',
  '--single-transaction',
  '--routines',
  '--triggers',
  '--events',
  DB_NAME,
  '| gzip',
].filter(Boolean).join(' ');

try {
  const output = execSync(cmd, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
  writeFileSync(filepath, output);
  console.log(`Backup created: ${filepath} (${(output.length / 1024 / 1024).toFixed(2)} MB)`);
} catch (err) {
  console.error('Backup failed:', err.message);
  process.exit(1);
}
