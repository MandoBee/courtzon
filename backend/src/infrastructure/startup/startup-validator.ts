import { getPool } from '../../database/mysql.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const log = createModuleLogger('startup-validator');
const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(__dirname, '..', '..', '..', '..', 'database', 'schema');

const REQUIRED_TABLES = [
  'app_settings',
  'users',
  'roles',
  'permissions',
  'user_roles',
  'role_permissions',
  'organizations',
  'branches',
  'sports',
  'courts',
  'bookings',
  'payments',
  'transactions',
  'settlements',
  'feature_flags',
  'languages',
  'countries',
  'ledger_entries',
  'migration_history',
];

const CRITICAL_TABLES = ['app_settings', 'users', 'roles', 'permissions'];

function getMigrationFiles(): string[] {
  return readdirSync(schemaDir)
    .filter(f => f.match(/^\d+_.+\.sql$/))
    .sort();
}

function hashFile(filePath: string): string {
  const content = readFileSync(filePath, 'utf8');
  return createHash('sha256').update(content).digest('hex').substring(0, 12);
}

export async function validateDatabaseSchema(): Promise<{ ok: boolean; missing: string[] }> {
  log.info('Validating database schema...');

  try {
    const pool = getPool();

    // First check: detect completely empty database
    const [allTables] = await pool.execute<any[]>('SHOW TABLES');
    const existingTables: string[] = allTables.map((r: any) => Object.values(r)[0] as string);

    if (existingTables.length === 0) {
      log.error(
        'CRITICAL: EMPTY DATABASE DETECTED. The database exists but contains zero tables. ' +
        'This is a disaster state — no schema has been applied. ' +
        'Run: node backend/scripts/migrate.js --fresh --seed'
      );
      return { ok: false, missing: REQUIRED_TABLES };
    }

    // Second check: required tables exist
    const missing = REQUIRED_TABLES.filter((t) => !existingTables.includes(t));

    if (missing.length === 0) {
      log.info('All required tables present.');
    } else {
      const criticalMissing = missing.filter((t) => CRITICAL_TABLES.includes(t));

      if (criticalMissing.length > 0) {
        log.error(
          `CRITICAL: Required tables are missing: ${criticalMissing.join(', ')}. ` +
            'Run migrations and seed before starting the server. ' +
            'Use: node backend/scripts/migrate.js --fresh --seed'
        );
      } else {
        log.warn(
          `Non-critical tables missing: ${missing.join(', ')}. ` +
            'Run migrations to create them.'
        );
      }
    }

    // Third check: migration version tracking
    if (existingTables.includes('migration_history')) {
      try {
        const [migrations] = await pool.execute<any[]>(
          'SELECT filename FROM migration_history ORDER BY id'
        );
        const appliedFiles = migrations.map((r: any) => r.filename);
        const expectedFiles = getMigrationFiles();
        const missingMigrations = expectedFiles.filter(f => !appliedFiles.includes(f));

        if (missingMigrations.length > 0) {
          log.warn(
            `Schema may be outdated: ${missingMigrations.length} migration(s) not yet applied: ` +
            missingMigrations.slice(0, 5).join(', ') +
            (missingMigrations.length > 5 ? `... (+${missingMigrations.length - 5} more)` : '')
          );
        } else {
          log.info(`All ${expectedFiles.length} migrations tracked in migration_history.`);
        }
      } catch (err: any) {
        log.warn(`Could not check migration_history: ${err.message}`);
      }
    }

    return { ok: missing.filter((t) => CRITICAL_TABLES.includes(t)).length === 0, missing };
  } catch (err: any) {
    log.error(`Failed to validate database schema: ${err.message}`);
    throw err;
  }
}
