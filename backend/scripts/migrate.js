import { readFileSync, existsSync } from 'node:fs';
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

const schemaDir = resolve(projectRoot, 'database/schema');
const seedDir = resolve(projectRoot, 'database/seed');
const dbName = env('DB_NAME', 'courtzon_v2');

/** Schema/seed files hard-code USE courtzon_v2; rewrite to the active database. */
function prepareSql(raw) {
  return raw
    .split('\n')
    .filter((l) => !/^DELIMITER\b/i.test(l.trim()))
    .join('\n')
    .replace(/END\s*\/\/\s*/g, 'END;')
    .replace(/\bUSE\s+`?courtzon_v2`?\s*;/gi, `USE \`${dbName}\`;`);
}

const config = {
  host: env('DB_HOST', 'localhost'),
  port: Number(env('DB_PORT', '3306')),
  user: env('DB_USER', 'root'),
  password: env('DB_PASSWORD', ''),
  multipleStatements: true,
};

const migrations = [
  '000_core_foundation.sql',
  '001_sports_organisation.sql',
  '002_rbac.sql',
  '003_booking.sql',
  '003a_seller_profiles.sql',
  '004_marketplace.sql',
  '004_subscription_plan_rates.sql',
  '005_payment_gateway.sql',
  '005_tournaments_academies_coaches.sql',
  '006_community_ads_cms.sql',
  '006_marketplace_amazon.sql',
  '007_financial.sql',
  '008_password_reset.sql',
  '009_court_amenities.sql',
  '010_organisation_subscriptions.sql',
  '011_rename_club_court_to_org_resource.sql',
  '012_org_types_name_description.sql',
  '013_currency_cleanup.sql',
  '014_currencies_sort_order.sql',
  '015_org_cr_number.sql',
  '016_org_country_logo_docs.sql',
  '017_financial_uploads_sellers.sql',
  '018_seller_org_link.sql',
  '019_permission_description.sql',
  '020_geo_provinces_cities.sql',
  '021_geo_slugs.sql',
  '022_cms_landing.sql',
  '023_payment_methods.sql',
  '024_drop_plan_org_type.sql',
  '025_ui_permissions.sql',
  '026_product_categories_discounted_price.sql',
  '027_player_seller_overhaul.sql',
  '028_move_sport_to_products.sql',
  '029_security_indexes.sql',
  '030_session_device_fingerprint.sql',
  '031_rename_court_amenities_to_amenities.sql',
  '032_resource_pricing_peak_hours.sql',
  '033_branch_resource_hours.sql',
  '034_banks.sql',
  '035_move_swift_to_banks.sql',
  '036_add_field_element_type.sql',
  '037_settlements.sql',
  '038_add_player_seller_role.sql',
  '039_sport_categories.sql',
  '040_product_catalog_enhancements.sql',
  '041_org_roles.sql',
  '042_org_types_shop_player_seller.sql',
  '043_organisation_registrations.sql',
  '044_additional_feature_flags.sql',
  '045_sidebar_layout.sql',
  '046_sidebar_layout_notnull.sql',
  '047_booking_status_checked_in_no_show.sql',
  '048_booking_matchmaking.sql',
  '049_fix_player_profile_sport_ids.sql',
  '050_cancellation_policy_branch.sql',
  '051_bank_accounts_branch_id.sql',
  '052_coupon_redesign.sql',
  '053_coach_status.sql',
  '054_coach_role_permissions.sql',
  '055_coach_session_durations.sql',
  '056_settlements_reconcile.sql',
  '057_appearance_studio.sql',
  '058_status_tint_tokens.sql',
  '059_coach_profiles_status.sql',
  '060_coach_availability.sql',
  '061_coach_org_invites.sql',
  '062_platform_admin_permission.sql',
  '063_component_style_tokens.sql',
  '064_role_appearance.sql',
  '065_extended_component_tokens.sql',
  '066_theme_color_modes.sql',
  '067_hero_theme_dual.sql',
  '068_landing_studio_tokens.sql',
  '069_drop_cascade_settings_tables.sql',
  '070_app_settings.sql',
  '071_grant_app_settings_permissions.sql',
  '072_update_site_logo_default.sql',
  '073_site_logo_dark_mode.sql',
  '074_grant_site_logo_dark_permission.sql',
  '075_favicon_dark_mode.sql',
  '076_grant_favicon_dark_permission.sql',
  '077_grant_favicon_dark_permission_retry.sql',
  '078_fix_sell_with_us_cms.sql',
  '079_translation_keys.sql',
  '080_player_sport_interests.sql',
  '081_hide_home_recent_activity_for_player.sql',
  '082_contact_submissions_enhanced.sql',
  '083_normalize_commission_entities.sql',
  '084_branch_financial_details.sql',
  '085_subscription_plans_is_internal.sql',
  '086_subscription_dual_pricing.sql',
  '087_role_permissions_super_admin.sql',
  '088_subscription_plan_features.sql',
  '089_missing_cms_pages.sql',
  '090_cleanup_old_pages.sql',
  '091_blog_cms_page.sql',
  '092_blog_blocks.sql',
  '093_sell_with_us_pricing_block.sql',
  '094_sell_with_us_steps_block.sql',
  '095_cms_page_sort_order.sql',
  '096_coach_availability_branch.sql',
  '097_user_has_seen_welcome.sql',
  '098_coach_session_dual_confirm.sql',
  '099_player_selling.sql',
  '100_product_pending_approval.sql',
  '101_cleanup_player_org_types.sql',
  '102_user_settings_notifications.sql',
  '103_sports_show_in_marketplace.sql',
  '104_org_staff_roles.sql',
  '105_consolidate_roles.sql',
  '106_subscription_features_tables.sql',
  '107_subscription_feature_resources.sql',
  '108_subscription_plans_sort_order.sql',
  '109_roles_final_cleanup.sql',
  '110_drop_sport_categories.sql',
  '111_fix_roles_unique_key.sql',
  '112_add_payment_order_id.sql',
  '113_shipping_rates.sql',
  '114_shipping_estimated_days.sql',
  '115_replace_product_categories.sql',
  '116_marketplace_accounting.sql',
  '117_product_branch_id.sql',
  '118_order_financials.sql',
  '119_settlement_items_order_id.sql',
  '120_cleanup_duplicate_roles.sql',
  '121_settlement_accounting_redesign.sql',
  '122_add_booking_payment_method.sql',
  '123_booking_penalty_status.sql',
  '124_booking_intents.sql',
  '125_multi_seller_settlement.sql',
  '126_hash_session_tokens.sql',
  '127_missing_production_indexes.sql',
];

async function migrate() {
  const fresh = process.argv.includes('--fresh');
  const seed = process.argv.includes('--seed');
  const conn = await mysql.createConnection(config);
  console.log('Connected to MySQL');

  if (fresh) {
    console.log(`\nDropping ALL tables in \`${dbName}\`...`);
    await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await conn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log('Recreated empty database.\n');
  }

  await conn.query(`USE \`${dbName}\``);

  for (const file of migrations) {
    const filePath = resolve(schemaDir, file);
    if (!filePath.endsWith('.sql')) continue;
    try {
      const raw = readFileSync(filePath, 'utf8');
      await conn.query(prepareSql(raw));
      console.log(`  OK ${file}`);
    } catch (err) {
      if (err.errno === 1050) { console.log(`  SKIP ${file} (table exists)`); continue; }
      if (err.errno === 1060) { console.log(`  SKIP ${file} (column exists)`); continue; }
      if (err.errno === 1054) { console.log(`  SKIP ${file} (unknown column)`); continue; }
      if (err.errno === 1061) { console.log(`  SKIP ${file} (duplicate key name)`); continue; }
      if (err.errno === 1062) { console.log(`  SKIP ${file} (duplicate entry)`); continue; }
      if (err.errno === 1091) { console.log(`  SKIP ${file} (can't DROP)`); continue; }
      if (err.errno === 1452) { console.log(`  SKIP ${file} (FK dependency)`); continue; }
      const lenient = fresh && process.env.INTEGRATION_TEST === '1';
      console.error(`  FAIL ${file}: ${err.message}`);
      if (lenient) {
        console.log(`  SKIP ${file} (integration lenient)`);
        continue;
      }
      if (fresh) process.exit(1);
      if (!fresh) console.log(`  SKIP ${file} (non-fresh mode)`);
    }
  }

  await conn.end();
  console.log('\nMigration complete.');

  const needsInlineSeed = fresh && !seed;
  const needsFullSeed = seed;

  if (needsInlineSeed || needsFullSeed) {
    console.log('\nRunning seed...');
    const seedConn = await mysql.createConnection(config);
    await seedConn.query(`USE \`${dbName}\``);

    // Inline reference data (only on --fresh without --seed to avoid ID conflicts)
    if (needsInlineSeed) {
      await seedConn.query(`
        INSERT IGNORE INTO countries (id, iso_code, iso_code_3, name, phone_code, default_currency) VALUES
        (1, 'EG', 'EGY', 'Egypt', '+20', 'EGP'),
        (2, 'SA', 'SAU', 'Saudi Arabia', '+966', 'SAR'),
        (3, 'AE', 'ARE', 'UAE', '+971', 'AED');

        INSERT IGNORE INTO languages (id, code, name, native_name, is_rtl) VALUES
        (1, 'en', 'English', 'English', FALSE),
        (2, 'ar', 'Arabic', 'العربية', TRUE);

        INSERT IGNORE INTO system_settings (\`key\`, value, description) VALUES
        ('app.name', '"CourtZon"', 'Application name'),
        ('app.currency', '"EGP"', 'Default currency'),
        ('app.timezone', '"Africa/Cairo"', 'Default timezone');
      `);
      console.log('  Reference data seeded.');
    }

    const baselineSnapshot = resolve(seedDir, '003_baseline_snapshot.sql');
    const useLegacySeed = process.argv.includes('--seed-legacy');
    const useDemoSeed = process.argv.includes('--seed-demo');

    if (needsFullSeed) {
      if (existsSync(baselineSnapshot) && !useLegacySeed) {
        try {
          const seedRaw = prepareSql(readFileSync(baselineSnapshot, 'utf8'));
          await seedConn.query(seedRaw);
          console.log('  OK 003_baseline_snapshot.sql (baseline from database/seed/baseline-manifest.json)');
        } catch (err) {
          console.error(`  FAIL 003_baseline_snapshot.sql: ${err.message}`);
          process.exit(1);
        }
      } else {
        if (!existsSync(baselineSnapshot)) {
          console.log('  No 003_baseline_snapshot.sql — using legacy SQL seeds (001, 002).');
        } else {
          console.log('  --seed-legacy: skipping baseline snapshot.');
        }

        const seedFilePaths = [
          resolve(schemaDir, '001_sports_organisation.sql'),
          resolve(schemaDir, '002_rbac.sql'),
          resolve(schemaDir, '004_marketplace.sql'),
          resolve(schemaDir, '004_subscription_plan_rates.sql'),
        ];
        for (const fp of seedFilePaths) {
          try {
            const raw = prepareSql(readFileSync(fp, 'utf8'));
            const statements = raw
              .split(';')
              .map(s => s.trim().replace(/^--.*$/gm, '').trim())
              .filter(s => s.length > 0)
              .filter(s => /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(s));
            if (statements.length === 0) continue;
            const sql = statements
              .map(s => s.replace(/^\s*INSERT\s+(IGNORE\s+)?(INTO\s+)?/i, 'INSERT IGNORE $2'))
              .join(';\n') + ';';
            await seedConn.query(sql);
            console.log(`  SEED ${fp.split(/[/\\]/).pop()}`);
          } catch (err) {
            console.log(`  SKIP ${fp.split(/[/\\]/).pop()} (${err.message})`);
          }
        }

        const seedFiles = ['001_seed_core.sql', '002_seed_provinces_cities.sql'];
        for (const seedFile of seedFiles) {
          const seedPath = resolve(seedDir, seedFile);
          try {
            const seedRaw = prepareSql(readFileSync(seedPath, 'utf8'));
            await seedConn.query(seedRaw);
            console.log(`  OK ${seedFile}`);
          } catch (err) {
            console.log(`  SKIP ${seedFile}: ${err.message}`);
          }
        }
      }
    }

    if (needsFullSeed) {
      try {
        const { spawn } = await import('node:child_process');
        const syncPerms = resolve(__dirname, 'sync-role-permissions.mjs');
        console.log('  Syncing role permission templates...');
        await new Promise((resolvePromise, reject) => {
          const child = spawn(process.execPath, [syncPerms], {
            stdio: 'inherit',
            cwd: resolve(__dirname, '..'),
            env: { ...process.env, DB_HOST: config.host, DB_PORT: String(config.port), DB_USER: config.user, DB_PASSWORD: config.password, DB_NAME: dbName },
          });
          child.on('exit', (code) => (code === 0 ? resolvePromise() : reject(new Error(`sync-role-permissions exited with code ${code}`))));
        });
      } catch (err) {
        console.log(`  Role permission sync skipped: ${err.message}`);
      }
    }

    // Optional synthetic demo data (legacy JS modules)
    if (needsFullSeed && useDemoSeed) {
      try {
        const { spawn } = await import('node:child_process');
        const seedRunner = resolve(__dirname, 'run-js-seed.mjs');
        console.log('  Running JS seed modules...');
        await new Promise((resolvePromise, reject) => {
          const child = spawn(process.execPath, [seedRunner], {
            stdio: 'inherit',
            cwd: resolve(__dirname, '..'),
            env: { ...process.env, DB_HOST: config.host, DB_PORT: String(config.port), DB_USER: config.user, DB_PASSWORD: config.password, DB_NAME: dbName },
          });
          child.on('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`JS seed exited with code ${code}`)));
        });
        console.log('  JS seed modules complete.');
      } catch (err) {
        console.log(`  JS seed modules skipped: ${err.message}`);
      }
    }

    await seedConn.end();
    console.log('Seed complete.');
  }
}

migrate();
