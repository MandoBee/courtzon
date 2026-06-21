const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost', port: 3306, user: 'root',
    password: 'CourtZon2026', database: 'courtzon_v2',
    connectTimeout: 30000, multipleStatements: true,
  });
  console.log('Connected');

  // 1. Add missing bookings columns
  const missingCols = [
    'ADD COLUMN commission_rate DECIMAL(5,2) DEFAULT 0.00 AFTER total_amount',
    'ADD COLUMN net_amount DECIMAL(12,2) DEFAULT 0.00 AFTER commission_amount',
    'ADD COLUMN plan_name VARCHAR(100) DEFAULT NULL AFTER net_amount',
  ];
  for (const col of missingCols) {
    try {
      await conn.query('ALTER TABLE bookings ' + col);
      console.log('  OK: ' + col);
    } catch (e) {
      if (e.message.includes('Duplicate column')) {
        console.log('  SKIP (exists): ' + col);
      } else {
        console.error('  FAIL: ' + e.message);
      }
    }
  }

  // 2. Create organisation_subscriptions
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS organisation_subscriptions (
        id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        organisation_id       INT UNSIGNED NOT NULL,
        plan_id               BIGINT UNSIGNED NOT NULL,
        start_date            DATE DEFAULT NULL,
        end_date              DATE DEFAULT NULL,
        subscription_status   ENUM('active','expired','cancelled') DEFAULT 'active',
        auto_renew            TINYINT(1) DEFAULT 1,
        created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_organisation (organisation_id),
        INDEX idx_plan (plan_id),
        INDEX idx_status (subscription_status),
        CONSTRAINT fk_os_organisation FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
        CONSTRAINT fk_os_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  OK: organisation_subscriptions created');
  } catch (e) {
    console.error('  FAIL: ' + e.message);
  }

  // 3. Seed organisation_subscriptions for existing orgs
  const [orgs] = await conn.query('SELECT id FROM organisations WHERE deleted_at IS NULL');
  for (const org of orgs) {
    const [existing] = await conn.query(
      'SELECT id FROM organisation_subscriptions WHERE organisation_id = ? LIMIT 1',
      [org.id]
    );
    if (existing.length === 0) {
      const startDate = '2026-01-01';
      const endDate = '2026-12-31';
      await conn.query(
        'INSERT INTO organisation_subscriptions (organisation_id, plan_id, start_date, end_date, subscription_status, auto_renew) VALUES (?, ?, ?, ?, ?, ?)',
        [org.id, 1, startDate, endDate, 'active', 1]
      );
      console.log('  OK: seeded subscription for org ' + org.id);
    }
  }

  // 4. Check dynamic_seed for integration
  console.log('\nNote: dynamic_seed.mjs will auto-detect organisation_subscriptions via INFORMATION_SCHEMA');
  
  await conn.end();
  console.log('\nMigration complete');
}
main().catch(e => { console.error(e.message); process.exit(1); });
