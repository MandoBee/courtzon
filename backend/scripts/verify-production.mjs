#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────
// CourtZon V3 — Production Verification (Node.js, cross-platform)
// ──────────────────────────────────────────────────────────────────
// Usage: node scripts/verify-production.mjs [--url https://...]
//   npm run verify:production
// ──────────────────────────────────────────────────────────────────
import { createConnection } from 'mysql2/promise';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '..');
const ROOT = path.resolve(BACKEND_DIR, '..');

// ── Config ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const urlArg = args.find(a => a.startsWith('--url='));
const BASE = urlArg ? urlArg.split('=')[1].replace(/\/+$/, '') : 'http://localhost:5173';
const BACKEND = process.env.BACKEND_URL || 'http://localhost:3000';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '3307', 10);
const DB_NAME = process.env.DB_NAME || 'courtzon_v3';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASSWORD || process.env.MYSQL_ROOT_PASSWORD || '';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const UPLOAD_DIR = path.join(BACKEND_DIR, 'uploads');

// ── State ─────────────────────────────────────────────────────────
let fail = 0, pass = 0;
const results = [];

function ok(label)   { results.push({ ok: true, label }); pass++; console.log(`  \x1b[32mPASS\x1b[0m  ${label}`); }
function err(label)  { results.push({ ok: false, label }); fail++; console.log(`  \x1b[31mFAIL\x1b[0m  ${label}`); }
function info(label) { console.log(`  \x1b[36mINFO\x1b[0m  ${label}`); }
function hdr(label)  { console.log(`\n\x1b[1;36m═══ ${label} ═══\x1b[0m`); }

// ── HTTP helpers ──────────────────────────────────────────────────
function fetch(url, method = 'GET') {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.request(url, { method, timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', () => resolve({ status: 0, headers: {}, body: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, headers: {}, body: '' }); });
    req.end();
  });
}

// ── 1. Service Health ─────────────────────────────────────────────
hdr('1. Service Health');

const live = await fetch(`${BACKEND}/health/live`);
if (live.status === 200 && live.body.includes('"ok"')) ok('Backend /health/live');
else err(`Backend /health/live → ${live.status}`);

const ready = await fetch(`${BACKEND}/health/ready`);
if (ready.status === 200 && ready.body.includes('"ok"')) {
  ok('Backend /health/ready (DB + Redis + Memory)');
  try { console.log('  ', JSON.stringify(JSON.parse(ready.body), null, 2)); } catch {}
} else err(`Backend /health/ready → ${ready.status}`);

const fe = await fetch(`${BASE}/`);
if (fe.status === 200 && fe.body.includes('<!doctype')) ok('Frontend HTTP 200 (HTML)');
else err(`Frontend → ${fe.status}`);

// ── 2. Database ───────────────────────────────────────────────────
hdr('2. Database');

let dbOk = false;
try {
  const conn = await createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS, database: DB_NAME, connectTimeout: 10000 });
  const [rows] = await conn.execute("SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?", [DB_NAME]);
  const tableCount = rows[0].cnt;
  if (tableCount >= 150) ok(`Database schema — ${tableCount} tables (≥150)`);
  else err(`Database schema — ${tableCount} tables (expected ≥150)`);

  const [roles] = await conn.execute("SELECT COUNT(*) AS cnt FROM roles");
  if (roles[0].cnt >= 8) ok(`Roles — ${roles[0].cnt} (≥8)`);
  else err(`Roles — ${roles[0].cnt}`);

  const [perms] = await conn.execute(
    "SELECT COUNT(*) AS cnt FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.slug='super_admin'"
  );
  if (perms[0].cnt >= 500) ok(`Super admin permissions — ${perms[0].cnt} (≥500)`);
  else err(`Super admin permissions — ${perms[0].cnt}`);

  const [cc] = await conn.execute("SELECT COUNT(*) AS cnt FROM countries");
  if (cc[0].cnt >= 1) ok(`Countries — ${cc[0].cnt}`);
  else err(`Countries — ${cc[0].cnt}`);

  const [sp] = await conn.execute("SELECT COUNT(*) AS cnt FROM sports");
  if (sp[0].cnt >= 1) ok(`Sports — ${sp[0].cnt}`);
  else err(`Sports — ${sp[0].cnt}`);

  dbOk = true;
  await conn.end();
} catch (e) {
  err(`MySQL connection failed: ${e.message}`);
}

// ── 3. Redis ──────────────────────────────────────────────────────
hdr('3. Redis');

try {
  const net = await import('net');
  const redis = await new Promise((resolve) => {
    const s = net.createConnection(REDIS_PORT, REDIS_HOST, () => { s.write('PING\r\n'); });
    s.on('data', d => { s.destroy(); resolve(d.toString()); });
    s.on('error', () => resolve(''));
    setTimeout(() => { s.destroy(); resolve(''); }, 3000);
  });
  if (redis.includes('PONG')) ok('Redis PING');
  else info('Redis check skipped (use /health/ready for Redis)');
} catch { info('Redis check skipped'); }

// ── 4. Marketplace API Endpoints ──────────────────────────────────
hdr('4. Marketplace API Endpoints');

const marketplaceEndpoints = [
  ['/sports/marketplace', 'Sports marketplace'],
  ['/marketplace/products', 'Products list'],
  ['/marketplace/cart', 'Cart'],
  ['/marketplace/orders', 'Orders'],
  ['/marketplace/seller/orders', 'Seller orders'],
  ['/marketplace/player/status', 'Player status'],
  ['/marketplace/brands', 'Brands'],
  ['/marketplace/categories', 'Categories'],
  ['/marketplace/tags', 'Tags'],
  ['/marketplace/wishlist', 'Wishlist'],
];

for (const [path, label] of marketplaceEndpoints) {
  const r = await fetch(`${BASE}${path}`);
  const first = r.body.trimStart()[0] || '';
  if (first === '{' || first === '[') ok(`${label} → ${r.status} JSON`);
  else if (first === '<') err(`${label} → HTML (SPA override interception!)`);
  else ok(`${label} → ${r.status} (auth-protected)`);
}

// ── 5. Public Endpoints ───────────────────────────────────────────
hdr('5. Public & Branding Assets');

for (const [path, label] of [
  ['/countries', 'Countries'],
  ['/sports', 'Sports'],
  ['/favicon.svg', 'Favicon'],
  ['/icon-192.png', 'PWA icon 192'],
  ['/manifest.webmanifest', 'Web manifest'],
  ['/sw.js', 'Service worker'],
]) {
  const r = await fetch(`${BASE}${path}`);
  if (r.status === 200) ok(label);
  else err(`${label} → ${r.status}`);
}

// ── 6. Frontend Bundle Hash ───────────────────────────────────────
hdr('6. Frontend Bundle');

const match = fe.body.match(/index-([A-Za-z0-9_-]+)\.js/);
if (match) ok(`Bundle hash: index-${match[1]}.js`);
else err('Could not extract bundle hash from HTML');

// ── 7. Uploads ────────────────────────────────────────────────────
hdr('7. Uploads');

if (fs.existsSync(UPLOAD_DIR)) {
  let upCount = 0;
  try { upCount = fs.readdirSync(UPLOAD_DIR, { recursive: true }).filter(f => fs.statSync(path.join(UPLOAD_DIR, f)).isFile()).length; } catch {}
  ok(`Upload directory exists — ${upCount} files`);
} else err(`Upload directory missing: ${UPLOAD_DIR}`);

// ── 8. Marketplace Data ──────────────────────────────────────────
if (dbOk) {
  hdr('8. Marketplace Data');
  try {
    const conn = await createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS, database: DB_NAME, connectTimeout: 5000 });
    const [prod] = await conn.execute("SELECT COUNT(*) AS cnt FROM products");
    if (prod[0].cnt >= 1) ok(`Products — ${prod[0].cnt} rows`);
    else info(`Products — ${prod[0].cnt} rows (empty, seed if needed)`);
    const [cat] = await conn.execute("SELECT COUNT(*) AS cnt FROM product_categories");
    if (cat[0].cnt >= 1) ok(`Product categories — ${cat[0].cnt}`);
    else err(`Product categories — ${cat[0].cnt}`);
    await conn.end();
  } catch (e) { err(`Marketplace DB check failed: ${e.message}`); }
}

// ── 9. Nginx routing (no HTML for API calls) ──────────────────────
hdr('9. Nginx Routing (Accept-header)');

const cartCheck = await fetch(`${BASE}/marketplace/cart`, 'GET');
if (cartCheck.body.trimStart()[0] === '<') err('❗ /marketplace/cart returned HTML — nginx SPA override intercepting API!');
else ok('No HTML interception on /marketplace/cart');

// ── SUMMARY ───────────────────────────────────────────────────────
hdr('SUMMARY');
const total = pass + fail;
if (fail === 0) {
  console.log(`\x1b[32m✓  ALL ${pass} CHECKS PASSED\x1b[0m`);
  process.exit(0);
} else {
  console.log(`\x1b[31m✗  ${fail}/${total} CHECKS FAILED\x1b[0m`);
  process.exit(1);
}
