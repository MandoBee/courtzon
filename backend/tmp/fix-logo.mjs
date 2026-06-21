import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({
  host: 'host.docker.internal', port: 3306, user: 'root',
  password: 'CourtZon2026', database: 'courtzon_v2', ssl: false
});
await conn.execute("UPDATE app_settings SET value = ? WHERE setting_key = ?", ['"/uploads/app_settings/site-logo/919c383e-e711-4327-8fc1-8aaaf48e1c6e.webp"', 'site_logo_url']);
await conn.execute("UPDATE app_settings SET value = ? WHERE setting_key = ?", ['"/uploads/app_settings/site-logo-dark/5b387543-4659-4ffd-b110-212749f4ea69.webp"', 'site_logo_dark_url']);
console.log('Updated');
await conn.end();
