/**
 * Truncate all tables except a fixed preserve list (reference/config/RBAC/users).
 *
 * Usage (from project root):
 *   node backend/scripts/clear-database-data.js --dry-run
 *   node backend/scripts/clear-database-data.js --confirm
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { loadFileEnv, envFrom } from './load-file-env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');

const fileEnv = loadFileEnv([
  resolve(process.cwd(), '.env'),
  resolve(__dirname, '../.env'),
]);

function env(key, fallback) {
  return envFrom(fileEnv, key, fallback);
}

/** Tables to keep (schema names; aliases normalized below). */
const PRESERVE_TABLES = new Set([
  'amenities',
  'app_settings',
  'bank_branches',
  'banks',
  'brands',
  'cities',
  'cms_blogs',
  'cms_pages',
  'cms_section_blocks',
  'cms_sections',
  'commission_rules',
  'countries',
  'cron_jobs',
  'currencies',
  'design_theme_reset_baseline',
  'design_token_versions',
  'design_tokens',
  'exchange_rates',
  'feature_flags',
  'languages',
  'notification_actions',
  'notification_categories',
  'organisation_type_attributes',
  'organisation_types',
  'payment_gateway_config',
  'payment_methods',
  'permission_modules',
  'permissions',
  'platform_accounts',
  'player_levels',
  'product_categories',
  'provinces',
  'resource_attribute_values',
  'resource_type_attributes',
  'resource_types',
  'role_permissions',
  'roles',
  'scheduled_jobs',
  'sidebar_layout',
  'sport_categories',
  'sport_positions',
  'sports',
  'subscription_plan_rates',
  'subscription_plans',
  'system_settings',
  'tags',
  'tournament_bracket_types',
  'translation_keys',
  'translations',
  'user_roles',
  'users',
]);

/** User-friendly aliases → schema table names */
const TABLE_ALIASES = {
  bankbranches: 'bank_branches',
  cms_section_bloks: 'cms_section_blocks',
  organization_type_attributes: 'organisation_type_attributes',
  organization_types: 'organisation_types',
};

const dbName = env('DB_NAME', 'courtzon_v2');
const dryRun = process.argv.includes('--dry-run');
const confirm = process.argv.includes('--confirm');

if (!dryRun && !confirm) {
  console.error(
    'Refusing to run without --dry-run or --confirm.\n' +
      '  node backend/scripts/clear-database-data.js --dry-run\n' +
      '  node backend/scripts/clear-database-data.js --confirm'
  );
  process.exit(1);
}

const config = {
  host: env('DB_HOST', 'localhost'),
  port: Number(env('DB_PORT', '3306')),
  user: env('DB_USER', 'root'),
  password: env('DB_PASSWORD', ''),
  database: dbName,
};

async function main() {
  const conn = await mysql.createConnection(config);
  console.log(`Database: ${dbName} @ ${config.host}:${config.port}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'CONFIRM — truncating'}\n`);

  const [rows] = await conn.query(
    `SELECT TABLE_NAME AS name
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`,
    [dbName]
  );

  const allTables = rows.map((r) => r.name);
  const preserved = [];
  const toTruncate = [];

  for (const table of allTables) {
    const normalized = TABLE_ALIASES[table] ?? table;
    if (PRESERVE_TABLES.has(table) || PRESERVE_TABLES.has(normalized)) {
      preserved.push(table);
    } else {
      toTruncate.push(table);
    }
  }

  const unknownPreserve = [...PRESERVE_TABLES].filter(
    (t) => !allTables.includes(t) && !Object.values(TABLE_ALIASES).includes(t)
  );
  if (unknownPreserve.length) {
    console.warn('Preserve list entries not found in DB (skipped):', unknownPreserve.join(', '));
  }

  console.log(`Tables in database: ${allTables.length}`);
  console.log(`Preserved: ${preserved.length}`);
  console.log(`To truncate: ${toTruncate.length}\n`);

  console.log('── Preserved ──');
  for (const t of preserved) console.log(`  ${t}`);

  console.log('\n── Will truncate ──');
  for (const t of toTruncate) console.log(`  ${t}`);

  if (dryRun) {
    await conn.end();
    console.log('\nDry run complete. Re-run with --confirm to apply.');
    return;
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  let ok = 0;
  let failed = 0;
  for (const table of toTruncate) {
    try {
      await conn.query(`TRUNCATE TABLE \`${table}\``);
      ok += 1;
      console.log(`  ✓ ${table}`);
    } catch (err) {
      failed += 1;
      console.warn(`  ✗ ${table}: ${err.message}`);
      try {
        await conn.query(`DELETE FROM \`${table}\``);
        console.log(`    → DELETE fallback OK for ${table}`);
        ok += 1;
        failed -= 1;
      } catch (err2) {
        console.warn(`    → DELETE failed: ${err2.message}`);
      }
    }
  }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  await conn.end();

  console.log(`\nDone. Truncated: ${ok}, failed: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
