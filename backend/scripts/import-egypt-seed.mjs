import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');

// ─── CONFIG ────────────────────────────────────────────────────────────────────

const DB = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'CourtZon2026',
  database: process.env.DB_NAME || 'courtzon_v2',
};

// ─── HELPERS ───────────────────────────────────────────────────────────────────

async function columnExists(conn, table, col) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [DB.database, table, col],
  );
  return rows.length > 0;
}

async function indexExists(conn, table, idx) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [DB.database, table, idx],
  );
  return rows.length > 0;
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  const conn = await mysql.createConnection(DB);
  console.log('Connected to database\n');

  // ── STEP 1: Add type column ──
  console.log('─── Step 1: Ensure type column exists ───');
  const hasType = await columnExists(conn, 'cities', 'type');
  if (!hasType) {
    await conn.execute("ALTER TABLE cities ADD COLUMN type VARCHAR(50) NULL AFTER native_name");
    console.log('✔ Added type column to cities\n');
  } else {
    console.log('⏭ type column already exists\n');
  }

  // ── STEP 2: Import provinces ──
  console.log('─── Step 2: Import provinces ───');
  const provincesSQL = fs.readFileSync(path.join(OUTPUT_DIR, 'provinces.sql'), 'utf8');
  const provinceStatements = provincesSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.startsWith('INSERT'));

  let importedProvinces = 0;
  for (const stmt of provinceStatements) {
    try {
      const [result] = await conn.execute(stmt + ';');
      if (result.affectedRows > 0) importedProvinces++;
    } catch (err) {
      console.error(`  ✗ Error importing province: ${err.message}`);
    }
  }
  console.log(`  ✔ ${importedProvinces} provinces imported (${provinceStatements.length - importedProvinces} already existed)\n`);

  // ── STEP 3: Import cities (with dedup via unique constraint) ──
  console.log('─── Step 3: Import cities ───');
  const citiesSQL = fs.readFileSync(path.join(OUTPUT_DIR, 'cities.sql'), 'utf8');
  const cityStatements = citiesSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.startsWith('INSERT'));

  let importedCities = 0;
  let skippedCities = 0;

  for (const stmt of cityStatements) {
    try {
      const [result] = await conn.execute(stmt);
      if (result.affectedRows > 0) importedCities++;
      else skippedCities++;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        skippedCities++;
      } else {
        console.error(`  ✗ Error: ${err.message.substring(0, 100)}`);
      }
    }
  }
  console.log(`  ✔ ${importedCities} cities imported, ${skippedCities} already existed\n`);

  // ── STEP 4: Add indexes ──
  console.log('─── Step 4: Add recommended indexes ───');

  const indexes = [
    { table: 'cities', name: 'idx_cities_type', sql: 'CREATE INDEX idx_cities_type ON cities(type)' },
    { table: 'cities', name: 'idx_cities_name', sql: 'CREATE INDEX idx_cities_name ON cities(name)' },
  ];

  for (const idx of indexes) {
    const exists = await indexExists(conn, idx.table, idx.name);
    if (!exists) {
      try {
        await conn.execute(idx.sql);
        console.log(`  ✔ Created ${idx.name}`);
      } catch (err) {
        console.log(`  ✗ Failed to create ${idx.name}: ${err.message.substring(0, 80)}`);
      }
    } else {
      console.log(`  ⏭ ${idx.name} already exists`);
    }
  }

  // ── Summary ──
  const [countResult] = await conn.execute(
    `SELECT
      (SELECT COUNT(*) FROM provinces WHERE country_id=1) AS provinces,
      (SELECT COUNT(*) FROM cities WHERE province_id IN (SELECT id FROM provinces WHERE country_id=1)) AS cities`,
  );
  const counts = countResult[0];
  console.log(`\n─── Import Complete ───`);
  console.log(`Provinces: ${counts.provinces}`);
  console.log(`Cities: ${counts.cities}`);

  await conn.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
