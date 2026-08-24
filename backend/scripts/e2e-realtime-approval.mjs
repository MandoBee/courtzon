import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { io } = require('../../frontend/node_modules/socket.io-client/build/cjs/index.js');
import mysql from 'mysql2/promise';

const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
const stamp = Date.now();
const ownerPhone = '0154444' + String(stamp % 10000).padStart(4, '0');

function hashPassword(password) {
  const { pbkdf2Sync, randomBytes } = require('node:crypto');  const toB64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  const salt = randomBytes(32);
  const hash = pbkdf2Sync(password, salt, 210000, 64, 'sha512');
  const v = Buffer.from([2]); const it = Buffer.alloc(4); it.writeUInt32BE(210000);
  const kl = Buffer.alloc(2); kl.writeUInt16BE(64);
  return `$pbkdf2-sha512$${toB64url(Buffer.concat([v, it, kl, salt, hash]))}`;
}

async function login(phoneNumber) {
  const res = await fetch('http://localhost:3000/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phoneNumber, countryCode: '+20', password: 'Test123456!' }),
  });
  return (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
}

async function main() {
  // seed owner + org in stranded state
  await pool.execute(
    `INSERT INTO users (public_id, country_id, email, phone_number, full_phone, password_hash, full_name, gender)
     SELECT UUID(), 1, ?, ?, ?, ?, 'Realtime E2E Owner', 'male'`,
    [`rt-e2e-${stamp}@test.com`, ownerPhone, `+20${ownerPhone}`, hashPassword('Test123456!')]);
  const [[u]] = await pool.execute(`SELECT id FROM users WHERE phone_number = ?`, [ownerPhone]);
  const ownerId = u.id;
  const slug = `rt-e2e-${stamp}`;
  await pool.execute(
    `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, country_id, is_verified, is_active)
     SELECT UUID(), id, ?, ?, ?, 1, 0, 0 FROM organisation_types WHERE is_active = TRUE ORDER BY sort_order LIMIT 1`,
    [ownerId, `Realtime E2E Org ${stamp}`, slug]);
  const [[o]] = await pool.execute(`SELECT id FROM organisations WHERE slug = ?`, [slug]);
  const orgId = o.id;
  console.log(`seeded owner=${ownerId} org=${orgId} (pending: active=0 verified=0)`);

  // owner socket with cookie auth (node client → explicit Cookie header)
  const ownerCookies = await login(ownerPhone);
  const socket = io('http://localhost:3000', {
    withCredentials: true,
    transports: ['websocket'],
    reconnection: false,
    timeout: 8000,
    extraHeaders: { cookie: ownerCookies },
  });
  socket.on('connect', () => console.log('owner socket CONNECTED id=' + socket.id));
  socket.on('connect_error', (err) => console.log('owner socket ERROR:', err.message));

  const received = [];
  const done = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 15000);
    for (const evt of ['organisation.status-changed', 'organisation.approved']) {
      socket.on(evt, (payload) => {
        received.push(evt);
        console.log(`OWNER SOCKET RECEIVED: ${evt} payload=`, JSON.stringify(payload));
        if (received.includes('organisation.status-changed')) { clearTimeout(timer); resolve(true); }
      });
    }
  });

  await new Promise((r) => setTimeout(r, 1500));

  // admin performs the activation
  const adminCookies = await login('01511111101');
  const res = await fetch(`http://localhost:3000/organisations/${orgId}`, {
    method: 'PUT', headers: { 'content-type': 'application/json', cookie: adminCookies },
    body: JSON.stringify({ isActive: true }),
  });
  console.log('admin activation status:', res.status);

  const got = await done;
  console.log(got ? 'PASS realtime push reached OWNER room without refresh'
                  : 'FAIL owner socket did not receive status-changed within 15s');
  socket.disconnect();

  // cleanup
  await pool.execute(`UPDATE organisations SET deleted_at = NOW() WHERE id = ?`, [orgId]);
  await pool.end();
  process.exit(got ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
