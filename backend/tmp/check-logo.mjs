import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({
  host: 'host.docker.internal', port: 3306, user: 'root',
  password: 'CourtZon2026', database: 'courtzon_v2', ssl: false
});
const [rows] = await conn.execute("SELECT setting_key, value FROM app_settings WHERE setting_key LIKE '%logo%'");
for (const r of rows) console.log(r.setting_key, r.value);
await conn.end();
