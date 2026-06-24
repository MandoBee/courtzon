import { getPool } from '../../database/mysql.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const log = createModuleLogger('startup-validator');
const __dirname = dirname(fileURLToPath(import.meta.url));
const baselineDir = resolve(__dirname, '..', '..', '..', 'database', 'baseline');
const baselineFile = '001_courtzon_v3.sql';

const REQUIRED_TABLES = [
  'app_settings',
  'users',
  'roles',
  'permissions',
  'user_roles',
  'role_permissions',
  'organisations',
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

function validateBaselineFile(): void {
  log.info('Checking baseline schema in image...');

  const baseline = resolve(baselineDir, baselineFile);

  if (!existsSync(baseline)) {
    throw new Error(
      `Baseline schema file missing from image. Expected: ${baseline}. ` +
      'Build context must be the project root, not backend/. ' +
      'Ensure Dockerfile COPY database/ database/ runs from root context.'
    );
  }

  log.info(`Baseline found: ${baselineFile}`);
}

export async function validateDatabaseSchema(): Promise<{ ok: boolean; missing: string[] }> {
  log.info('Validating database schema...');

  try {
    // Pre-check: ensure baseline file exists before touching the database
    validateBaselineFile();

    const pool = getPool();

    // First check: detect completely empty database
    const [allTables] = await pool.execute<any[]>('SHOW TABLES');
    const existingTables: string[] = allTables.map((r: any) => Object.values(r)[0] as string);

    if (existingTables.length === 0) {
      log.warn(
        'Empty database detected — no tables exist yet. ' +
        'The baseline schema must be imported before the server can serve requests. ' +
        'Run: node backend/scripts/migrate.sh or manually import database/baseline/001_courtzon_v3.sql'
      );
      return { ok: true, missing: [] };
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

    // Third check: baseline version tracking
    if (existingTables.includes('migration_history')) {
      try {
        const [migrations] = await pool.execute<any[]>(
          'SELECT filename FROM migration_history ORDER BY id DESC LIMIT 1'
        );
        if (migrations.length > 0) {
          log.info(`Last applied migration: ${migrations[0].filename}`);
        } else {
          log.info('No migrations recorded — baseline schema in use.');
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
