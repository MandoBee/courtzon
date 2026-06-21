import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const c = readFileSync(resolve(__dirname, '../.env'), 'utf8');
const e = {};
for (const l of c.split('\n')) { const t = l.trim(); if (!t || t.startsWith('#')) continue; const i = t.indexOf('='); if (i === -1) continue; e[t.slice(0,i).trim()] = t.slice(i+1).trim().replace(/^"|"$/g,''); }
const f = k => process.env[k] || e[k];
const conn = await mysql.createConnection({host:f('DB_HOST')||'localhost',port:Number(f('DB_PORT')||3306),user:f('DB_USER')||'root',password:f('DB_PASSWORD')||'',database:f('DB_NAME')||'courtzon_v2'});
const [r] = await conn.execute("SELECT id, slug, name FROM roles WHERE (slug LIKE 'org-admin%' OR slug LIKE 'org-seller%' OR slug LIKE 'seller%') AND deleted_at IS NULL ORDER BY id");
for (const x of r) console.log(x.id, x.slug, '->', x.name);
await conn.end();
