const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1', port: 3307, user: 'root',
    password: 'CourtZon2026', multipleStatements: true
  });

  // Migrations hardcode "courtzon_v2" — so we create that DB name
  const testDb = 'courtzon_v2';
  await conn.query(`DROP DATABASE IF EXISTS \`${testDb}\``);
  await conn.query(`CREATE DATABASE \`${testDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${testDb}\``);

  const migrationsDir = path.resolve(__dirname, '..', '..', 'database', 'schema');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.match(/^\d+_.+\.sql$/))
    .sort();

  let ok = 0, fail = 0;
  const failures = [];

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    try {
      const clean = sql
        .replace(/^DELIMITER\s+\S+\s*$/gmi, '')
        .replace(/DELIMITER\s+;/g, '');
      await conn.query(clean);
      ok++;
      process.stdout.write('.');
    } catch (err) {
      console.log(`\nFAIL: ${file}: ${err.message.substring(0, 150)}`);
      fail++;
      failures.push({ file, error: err.message.substring(0, 150) });
      if (fail > 10) { console.log('Too many failures, stopping'); break; }
    }
  }

  const [tables] = await conn.query(
    `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = '${testDb}'`
  );
  console.log(`\n\n${ok} passed, ${fail} failed, ${tables[0].cnt} tables created`);

  if (tables[0].cnt > 0) {
    const [names] = await conn.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = '${testDb}' ORDER BY table_name`
    );
    console.log(`Tables (${names.length}):`);
    for (const t of names) console.log(`  ${t.table_name}`);
  }

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  ${f.file}: ${f.error}`);
  }

  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
