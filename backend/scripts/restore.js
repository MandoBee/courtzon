#!/usr/bin/env node
/**
 * CourtZon Database Restore Script
 * 
 * Restores from an encrypted or plain gzipped mysqldump backup.
 * 
 * Usage:
 *   node backend/scripts/restore.js <backup-file>
 *   node backend/scripts/restore.js backups/courtzon_2026-01-15T00-00-00.000Z.sql.gz.enc
 * 
 * Options:
 *   --dry-run    Show what would be restored without executing
 *   --confirm    Skip confirmation prompt (for automated restore)
 * 
 * Prerequisites:
 *   - MySQL client (mysql) installed
 *   - DB credentials in .env or environment
 *   - BACKUP_ENCRYPTION_KEY if backup is encrypted
 */

const { execSync, exec } = require('node:child_process');
const { existsSync, createReadStream, createWriteStream, statSync } = require('node:fs');
const { join, resolve, basename } = require('node:path');
const { createGunzip } = require('node:zlib');
const { createDecipheriv } = require('node:crypto');
const { pipeline } = require('node:stream/promises');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const autoConfirm = args.includes('--confirm');
const backupFile = args.find(a => !a.startsWith('--'));

if (!backupFile) {
  console.error('Usage: node backend/scripts/restore.js <backup-file> [--dry-run] [--confirm]');
  console.error('Example: node backend/scripts/restore.js backups/courtzon_2026-01-15.sql.gz.enc');
  process.exit(1);
}

const filePath = resolve(backupFile);
if (!existsSync(filePath)) {
  console.error(`Backup file not found: ${filePath}`);
  process.exit(1);
}

const db = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || '3306',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  name: process.env.DB_NAME || 'courtzon_v2',
};

const ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY || '';
const isEncrypted = filePath.endsWith('.enc');
const stats = statSync(filePath);

console.log('═══════════════════════════════════════════════════');
console.log('  CourtZon Database Restore');
console.log('═══════════════════════════════════════════════════');
console.log(`  File:       ${basename(filePath)}`);
console.log(`  Size:       ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
console.log(`  Encrypted:  ${isEncrypted ? 'YES' : 'NO'}`);
console.log(`  Database:   ${db.name}@${db.host}:${db.port}`);
console.log(`  User:       ${db.user}`);
console.log(`  Dry run:    ${dryRun ? 'YES' : 'NO'}`);
console.log('═══════════════════════════════════════════════════');

if (isEncrypted && !ENCRYPTION_KEY) {
  console.error('ERROR: Backup is encrypted but BACKUP_ENCRYPTION_KEY is not set');
  process.exit(1);
}

async function confirm() {
  if (dryRun || autoConfirm) return true;
  return new Promise((resolvePromise) => {
    process.stdout.write('\n⚠️  This will OVERWRITE the current database. Type "RESTORE" to confirm: ');
    let input = '';
    process.stdin.on('data', (chunk) => {
      input += chunk;
      if (input.includes('\n')) {
        process.stdin.removeAllListeners('data');
        resolvePromise(input.trim() === 'RESTORE');
      }
    });
  });
}

async function restore() {
  const confirmed = await confirm();
  if (!confirmed) {
    console.log('Restore cancelled.');
    process.exit(0);
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Would execute:');
    console.log(`  1. Decrypt: ${isEncrypted ? 'YES (AES-256-CBC)' : 'NO'}`);
    console.log(`  2. Decompress: gzip`);
    console.log(`  3. Pipe to: mysql --host=${db.host} --port=${db.port} --user=${db.user} ${db.name}`);
    console.log('\nNo changes made.');
    process.exit(0);
  }

  console.log('\nStarting restore...');

  const mysqlCmd = `mysql --host=${db.host} --port=${db.port} --user=${db.user} --password="${db.password}" ${db.name}`;

  if (isEncrypted) {
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const readStream = createReadStream(filePath);
    const iv = Buffer.alloc(16);
    await new Promise((resolveRead, rejectRead) => {
      readStream.once('readable', () => {
        readStream.read(16).copy(iv);
        resolveRead();
      });
      readStream.once('error', rejectRead);
    });

    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    const gunzip = createGunzip();
    const mysqlProc = exec(mysqlCmd, { maxBuffer: 1024 * 1024 * 1024 });

    mysqlProc.stdin.on('error', (e) => { console.error('mysql stdin error:', e.message); });
    mysqlProc.stderr.on('data', (d) => { console.error('mysql stderr:', d.toString()); });
    mysqlProc.on('exit', (code) => {
      if (code === 0) { console.log('✅ Restore complete!'); process.exit(0); }
      else { console.error(`❌ mysql exited with code ${code}`); process.exit(1); }
    });

    readStream.pipe(decipher).pipe(gunzip).pipe(mysqlProc.stdin);
  } else {
    const readStream = createReadStream(filePath);
    const gunzip = createGunzip();
    const mysqlProc = exec(mysqlCmd, { maxBuffer: 1024 * 1024 * 1024 });

    mysqlProc.stdin.on('error', (e) => { console.error('mysql stdin error:', e.message); });
    mysqlProc.stderr.on('data', (d) => { console.error('mysql stderr:', d.toString()); });
    mysqlProc.on('exit', (code) => {
      if (code === 0) { console.log('✅ Restore complete!'); process.exit(0); }
      else { console.error(`❌ mysql exited with code ${code}`); process.exit(1); }
    });

    readStream.pipe(gunzip).pipe(mysqlProc.stdin);
  }
}

restore().catch(err => { console.error('Restore failed:', err); process.exit(1); });
