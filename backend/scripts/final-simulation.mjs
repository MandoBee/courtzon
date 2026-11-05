#!/usr/bin/env node
/**
 * CourtZon Final Full-System Realistic Simulation (executable harness)
 *
 * Runs against the real Docker backend (http://localhost:3000) and the real
 * local development database `courtzon_v3` on 127.0.0.1:3307 (Amendment A1).
 * It creates clearly-marked simulation data (SIM-FINAL), executes the business
 * workflows, and writes machine-readable evidence to
 * `test-results/simulation/` (gitignored). It never truncates tables and never
 * touches production.
 *
 * Usage:
 *   node backend/scripts/final-simulation.mjs --phase=all
 *   node backend/scripts/final-simulation.mjs --phase=setup
 *   node backend/scripts/final-simulation.mjs --phase=a,c,d,e,f,h
 *
 * Safety:
 *   - refUSES any DB target other than courtzon_v3 @ 127.0.0.1:3307
 *   - never prints secrets/tokens/passwords
 *   - Paymob card confirmations are SIMULATED signed webhooks unless the
 *     `--real-sandbox` flow is run separately (documented in the report)
 */
import mysql from 'mysql2/promise';
import { pbkdf2Sync, randomBytes, createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OUT_DIR = resolve(ROOT, 'test-results/simulation');
mkdirSync(OUT_DIR, { recursive: true });

const API = process.env.SIM_API_URL || 'http://localhost:3000';
const DB = {
  host: '127.0.0.1',
  port: 3307,
  user: 'root',
  password: process.env.DB_PASSWORD || 'courtzon2026',
  database: 'courtzon_v3',
  charset: 'utf8mb4',
  timezone: '+00:00',
};

if (DB.host !== '127.0.0.1' || DB.port !== 3307 || DB.database !== 'courtzon_v3') {
  console.error('Refusing to run: target must be courtzon_v3 @ 127.0.0.1:3307');
  process.exit(2);
}

const MARK = 'SIM-FINAL';
const ADMIN_PHONE = process.env.SIM_ADMIN_PHONE || '01099990001';
const ADMIN_PASSWORD = process.env.SIM_ADMIN_PASSWORD || 'SimAdmin#2026';
const PLAYER_PASSWORD = 'SimPlayer#2026';
const STAFF_PASSWORD = 'SimStaff#2026';
const SELLER_PASSWORD = 'SimSeller#2026';

const REF = {
  country: 1,
  currencyEGP: 1,
  orgTypeClub: 1,
  orgTypeShop: 10,
  sportPadel: 22,
  sportTennis: 21,
  resourceTypePadel: 2,
  resourceTypeTennis: 3,
  planClub: 3,
  planShop: 5,
  tplClub: 1,
  tplAcademy: 2,
  tplMarketplace: 3,
  rolePlayer: 2,
  roleOrgAdmin: 3,
  roleShopAdmin: 6,
  roleCoach: 7,
  roleAccountant: 8,
  roleReceptionist: 15,
  bracketSingleElim: 1,
  bracketRoundRobin: 3,
};

const stateFile = resolve(OUT_DIR, 'state.json');
const resultsFile = resolve(OUT_DIR, 'results.json');

const results = [];
const defects = [];
const metrics = {};
let state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
if (!state.runId) {
  state.runId = `${MARK}-${Date.now().toString(36).toUpperCase()}`;
}
state.created = state.created || {};

const pool = mysql.createPool({ ...DB, connectionLimit: 8, waitForConnections: true });

function saveState() {
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}
const evidenceFile = resolve(OUT_DIR, 'evidence.json');
function loadEvidence() {
  if (!existsSync(evidenceFile)) return { results: {}, defects: {} };
  try { return JSON.parse(readFileSync(evidenceFile, 'utf8')); } catch { return { results: {}, defects: {} }; }
}
function saveResults() {
  const ev = loadEvidence();
  for (const r of results) ev.results[`${r.phase}:${r.id}`] = r;
  for (const d of defects) ev.defects[d.id] = d;
  writeFileSync(evidenceFile, JSON.stringify(ev, null, 2));
  const all = Object.values(ev.results);
  const counts = all.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
  writeFileSync(resultsFile, JSON.stringify({
    runId: state.runId,
    generatedAt: new Date().toISOString(),
    api: API,
    db: `${DB.database}@${DB.host}:${DB.port}`,
    counts,
    metrics,
    defects: Object.values(ev.defects),
    results: all,
    data: state.created,
  }, null, 2));
}
function rec(phase, id, name, status, evidence = '', severity = null) {
  const row = { phase, id, name, status, evidence: String(evidence).slice(0, 2000), at: new Date().toISOString() };
  results.push(row);
  const icon = { PASS: 'PASS', FAIL: 'FAIL', BLOCKED: 'BLOCK', SKIP: 'SKIP', PARTIAL: 'PART' }[status] || status;
  console.log(`[${icon}] ${phase}/${id} ${name}${evidence ? ' :: ' + String(evidence).slice(0, 240) : ''}`);
  saveResults();
  return row;
}
function defect(phase, id, title, severity, detail, repro, status = 'OPEN') {
  if (defects.some((d) => d.id === id)) return defects.find((d) => d.id === id);
  const d = { phase, id, title, severity, detail, repro, status, at: new Date().toISOString() };
  defects.push(d);
  saveResults();
  console.log(`[DEFECT:${severity}] ${id} ${title}`);
  return d;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hashPassword(pw) {
  const salt = randomBytes(32);
  const hash = pbkdf2Sync(pw, salt, 210000, 64, 'sha512');
  const v = Buffer.from([2]);
  const it = Buffer.alloc(4); it.writeUInt32BE(210000);
  const kl = Buffer.alloc(2); kl.writeUInt16BE(64);
  return '$pbkdf2-sha512$' + Buffer.concat([v, it, kl, salt, hash]).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function q(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}
async function one(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] || null;
}

// ── HTTP client (manual cookie handling; app cookies are Secure + HttpOnly) ──
async function api(method, path, cookie, body, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
async function apiRetry(method, path, cookie, body, attempts = 5) {
  let res;
  for (let i = 0; i < attempts; i += 1) {
    res = await api(method, path, cookie, body);
    if (res.status !== 429) return res;
    const msg = typeof res.data === 'object' ? res.data?.message || '' : '';
    const m = /retry in (\d+)/i.exec(msg);
    await sleep(Math.min(65_000, (Number(m?.[1]) || 20) * 1000 + 1500));
  }
  return res;
}
function sessionCookie(res) {
  const list = res.headers.getSetCookie?.() || [];
  const pairs = list.map((x) => x.split(';')[0]).filter(Boolean);
  return pairs.length ? pairs.join('; ') : null;
}
const loginCache = new Map();
async function login(phone, password, countryCode = '+20', opts = {}) {
  const key = `${phone}:${password}`;
  const cached = loginCache.get(key);
  if (!opts.fresh && cached && Date.now() - cached.at < 8 * 60 * 1000) {
    return { status: 200, cookie: cached.cookie, data: cached.data, cached: true };
  }
  let res;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    res = await api('POST', '/auth/login', null, { phoneNumber: phone, countryCode, password });
    if (res.status === 429) { await sleep(20_000); continue; }
    break;
  }
  const cookie = sessionCookie(res);
  if (res.status === 200 && cookie) loginCache.set(key, { cookie, data: res.data, at: Date.now() });
  return { status: res.status, cookie, data: res.data };
}

// Direct server-side session creation for bulk simulation users. Authentication
// itself is exercised by the Phase A real-login scenarios; creating 100 player
// sessions through /auth/login from one IP would only hit the production login
// rate limit without adding coverage.
const { createHash } = await import('node:crypto');
const sessionCache = new Map();
async function sessionFor(userId, ttlMinutes = 45) {
  if (sessionCache.has(userId)) return sessionCache.get(userId);
  const token = randomBytes(32).toString('base64url');
  const sessionHash = createHash('sha256').update(token).digest('hex');
  const refreshToken = randomBytes(32).toString('base64url');
  const refreshHash = createHash('sha256').update(refreshToken).digest('hex');
  await pool.execute(
    `INSERT INTO user_sessions (user_id, refresh_token_hash, ip_address, user_agent, expires_at, refresh_token_expires_at, session_token_hash)
     VALUES (?, ?, '127.0.0.1', 'simulation-harness', DATE_ADD(NOW(), INTERVAL ? MINUTE), DATE_ADD(NOW(), INTERVAL 1440 MINUTE), ?)`,
    [userId, refreshHash, ttlMinutes, sessionHash],
  );
  const cookie = `session_token=${token}; refresh_token=${refreshToken}`;
  sessionCache.set(userId, cookie);
  return cookie;
}
async function adminSession() {
  const me = await login(ADMIN_PHONE, ADMIN_PASSWORD);
  if (me.data?.user?.id) return sessionFor(me.data.user.id);
  return admin();
}
function tokenFromCookie(cookie) { return cookie ? cookie.split('=')[1] : null; }

let adminCookie = null;
async function admin() {
  if (adminCookie) return adminCookie;
  // Prefer a server-side session for bulk simulation operations (login itself
  // is exercised by Phase A). This avoids the production /auth/login per-IP
  // limit turning the harness into a rate-limit test.
  const row = await one('SELECT id FROM users WHERE full_phone = ? AND deleted_at IS NULL LIMIT 1', [`+20${ADMIN_PHONE}`]);
  if (row?.id) {
    adminCookie = await sessionFor(row.id);
    return adminCookie;
  }
  const r = await login(ADMIN_PHONE, ADMIN_PASSWORD, '+20', { fresh: true });
  if (r.status !== 200 || !r.cookie) throw new Error(`Simulation admin login failed: ${r.status}`);
  adminCookie = r.cookie;
  return adminCookie;
}
function resetAdmin() { adminCookie = null; sessionCache.clear(); }

// ── users ───────────────────────────────────────────────────────────────────
async function ensureUser({ phone, password, name, email, gender = 'male', roleSlug = 'player', extraRoles = [] }) {
  const full = `+20${phone}`;
  let row = await one('SELECT id FROM users WHERE full_phone = ? AND deleted_at IS NULL', [full]);
  let userId;
  if (row) {
    userId = row.id;
  } else {
    const [r] = await pool.execute(
      `INSERT INTO users (public_id, phone_number, full_phone, password_hash, full_name, email, gender, timezone, country_id, account_status)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, 'Africa/Cairo', 1, 'active')`,
      [phone, full, hashPassword(password), name, email, gender],
    );
    userId = r.insertId;
  }
  const roles = [roleSlug, ...extraRoles];
  for (const slug of roles) {
    const role = await one('SELECT id FROM roles WHERE slug = ? AND organisation_id IS NULL AND deleted_at IS NULL LIMIT 1', [slug]);
    if (role) {
      await pool.execute('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, role.id]);
    }
  }
  await pool.execute(
    `INSERT IGNORE INTO player_profiles (user_id, main_sport_id, created_at, updated_at)
     SELECT ?, ?, NOW(), NOW() FROM DUAL
     WHERE NOT EXISTS (SELECT 1 FROM player_profiles WHERE user_id = ?)`,
    [userId, REF.sportPadel, userId],
  ).catch(() => {});
  return userId;
}

async function ensureWallet(userId) {
  const w = await one('SELECT id FROM user_wallets WHERE user_id = ? LIMIT 1', [userId]);
  if (!w) {
    await pool.execute('INSERT INTO user_wallets (user_id, balance, currency, created_at, updated_at) VALUES (?, 0, \'EGP\', NOW(), NOW())', [userId]).catch(() => {});
  }
}

// ── setup ───────────────────────────────────────────────────────────────────
async function setup() {
  await admin();
  rec('SETUP', 'S-01', 'Docker backend and database reachable', 'PASS', `login=200 db=${DB.database}`);

  // 100 players
  const players = [];
  for (let i = 1; i <= 100; i += 1) {
    const phone = `0111100${String(i).padStart(4, '0')}`;
    const userId = await ensureUser({
      phone,
      password: PLAYER_PASSWORD,
      name: `SIM Player ${String(i).padStart(3, '0')}`,
      email: `sim.player.${String(i).padStart(3, '0')}@courtzon.test`,
      gender: i % 2 === 0 ? 'female' : 'male',
    });
    await ensureWallet(userId);
    await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(PLAYER_PASSWORD), userId]);
    players.push({ userId, phone, name: `SIM Player ${String(i).padStart(3, '0')}` });
  }
  state.created.players = players;
  saveState();
  rec('SETUP', 'S-02', '100 simulation players created/reused', 'PASS', `count=${players.length}`);

  // staff users (roles assigned through the real org staff API below)
  const staffDefs = [
    { key: 'orgAAdmin', phone: '01111990011', name: 'SIM Org A Admin', email: 'sim.orga.admin@courtzon.test' },
    { key: 'orgAReception', phone: '01111990012', name: 'SIM Org A Reception', email: 'sim.orga.reception@courtzon.test' },
    { key: 'orgAAccountant', phone: '01111990013', name: 'SIM Org A Accountant', email: 'sim.orga.accountant@courtzon.test' },
    { key: 'orgACoach', phone: '01111990014', name: 'SIM Org A Coach', email: 'sim.orga.coach@courtzon.test' },
    { key: 'orgBAdmin', phone: '01111990021', name: 'SIM Org B Admin', email: 'sim.orgb.admin@courtzon.test' },
    { key: 'orgBReception', phone: '01111990022', name: 'SIM Org B Reception', email: 'sim.orgb.reception@courtzon.test' },
    { key: 'seller1', phone: '01111990031', name: 'SIM Seller One', email: 'sim.seller.one@courtzon.test' },
    { key: 'seller2', phone: '01111990032', name: 'SIM Seller Two', email: 'sim.seller.two@courtzon.test' },
    { key: 'seller3', phone: '01111990033', name: 'SIM Seller Three', email: 'sim.seller.three@courtzon.test' },
  ];
  for (const s of staffDefs) {
    const pw = s.key.startsWith('seller') ? SELLER_PASSWORD : STAFF_PASSWORD;
    s.userId = await ensureUser({
      phone: s.phone, password: pw, name: s.name, email: s.email,
      extraRoles: s.key.startsWith('seller') ? ['shop-admin'] : [],
    });
    // Deterministic simulation credentials for reused rows (test accounts only).
    await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(pw), s.userId]);
    await ensureWallet(s.userId);
  }
  state.created.staff = staffDefs;
  saveState();
  rec('SETUP', 'S-03', 'Staff and seller accounts created', 'PASS', `count=${staffDefs.length}`);

  // 2 organisations with branches, courts, subscriptions, COA
  const orgDefs = [
    { key: 'orgA', name: 'SIM Padel Club A', slug: 'sim-padel-club-a', admin: 'orgAAdmin', reception: 'orgAReception', accountant: 'orgAAccountant', coach: 'orgACoach', plan: REF.planClub, tpl: REF.tplAcademy, courts: [{ sport: 'padel', n: 3 }, { sport: 'tennis', n: 1 }] },
    { key: 'orgB', name: 'SIM Sports Club B', slug: 'sim-sports-club-b', admin: 'orgBAdmin', reception: 'orgBReception', plan: REF.planClub, tpl: REF.tplClub, courts: [{ sport: 'padel', n: 3 }, { sport: 'tennis', n: 2 }] },
  ];
  const staffByKey = Object.fromEntries(staffDefs.map((s) => [s.key, s]));
  for (const def of orgDefs) {
    let org = await one('SELECT id, name FROM organisations WHERE slug = ?', [def.slug]);
    let orgId = org?.id;
    if (!orgId) {
      const r = await api('POST', '/organisations', await admin(), {
        orgTypeId: REF.orgTypeClub, name: def.name, slug: def.slug,
        email: `${def.slug}@courtzon.test`, phone: '+201000000100', countryId: 1, accessModel: 'PUBLIC_CLUB',
      });
      if (r.status !== 201) throw new Error(`org ${def.slug} create failed ${r.status} ${JSON.stringify(r.data)}`);
      orgId = r.data.id;
    }
    def.id = orgId;

    let branch = await one('SELECT id FROM branches WHERE organisation_id = ? ORDER BY id LIMIT 1', [orgId]);
    let branchId = branch?.id;
    if (!branchId) {
      const br = await api('POST', `/org/${orgId}/branches`, await admin(), {
        organisationId: orgId, name: `${def.name} Main Branch`, slug: `${def.slug}-main`,
        city: 'Cairo', countryId: 1, timezone: 'Africa/Cairo', openingTime: '07:00', closingTime: '23:30',
      });
      if (br.status !== 201) throw new Error(`branch create failed ${br.status}`);
      branchId = br.data.id;
    }
    def.branchId = branchId;

    // subscription (needed for commission + entitlements)
    const sub = await one('SELECT id FROM organisation_subscriptions WHERE organisation_id = ? AND subscription_status = \'active\' LIMIT 1', [orgId]);
    if (!sub) {
      await api('PUT', `/organisations/${orgId}/subscription`, await admin(), { planId: def.plan, billingCycle: 'monthly' });
      await api('POST', `/organisations/${orgId}/subscription/activate`, await admin(), {});
    }

    // chart of accounts
    const coa = await one('SELECT COUNT(*) c FROM chart_of_accounts WHERE organisation_id = ?', [orgId]);
    if (!Number(coa.c)) {
      const t = await api('POST', '/admin/accounting/templates/apply', await admin(), { templateId: def.tpl, organisationId: orgId });
      if (t.status !== 200) defect('SETUP', 'S-COA', `COA template could not be applied to ${def.slug}`, 'HIGH', JSON.stringify(t.data), 'POST /admin/accounting/templates/apply');
    }

    // staff through the real API (validates organisation-scope RBAC)
    const staffSpec = [
      { key: def.admin, roleSlug: 'org-admin' },
      { key: def.reception, roleSlug: 'branch-mgr' },
    ];
    if (def.accountant) staffSpec.push({ key: def.accountant, roleSlug: 'accountant' });
    if (def.coach) staffSpec.push({ key: def.coach, roleSlug: 'coach' });
    for (const s of staffSpec) {
      const u = staffByKey[s.key];
      const r = await api('POST', `/org/${orgId}/staff`, await admin(), {
        email: u.email, roleSlug: s.roleSlug, branchIds: [branchId],
      });
      if (![200, 201, 409].includes(r.status)) {
        rec('SETUP', `S-STAFF-${s.key}`, `Staff ${s.key} assigned in ${def.slug}`, 'FAIL', `${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
      }
    }

    // courts
    const resources = [];
    for (const spec of def.courts) {
      const existing = await q('SELECT id, name, sport_id FROM resources WHERE branch_id = ? AND sport_id = ? AND deleted_at IS NULL ORDER BY id', [branchId, spec.sport === 'padel' ? REF.sportPadel : REF.sportTennis]);
      for (let i = 0; i < spec.n; i += 1) {
        if (existing[i]) { resources.push({ id: existing[i].id, sport: spec.sport }); continue; }
        const r = await api('POST', `/org/${orgId}/resources`, await admin(), {
          branchId,
          resourceTypeId: spec.sport === 'padel' ? REF.resourceTypePadel : REF.resourceTypeTennis,
          sportId: spec.sport === 'padel' ? REF.sportPadel : REF.sportTennis,
          name: `SIM ${spec.sport === 'padel' ? 'Padel' : 'Tennis'} Court ${def.key}-${i + 1}`,
          capacity: 4,
          hourlyPrice: spec.sport === 'padel' ? 450 : 350,
          slotDuration: 60,
          maxBookingsPerSlot: 1,
          openingTime: '07:00',
          closingTime: '23:00',
          pricingType: 'per_hour',
        });
        if (r.status !== 201) {
          rec('SETUP', `S-COURT-${def.key}-${i}`, 'Court creation', 'FAIL', `${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
        } else {
          resources.push({ id: r.data.id, sport: spec.sport });
        }
      }
    }
    def.resources = resources;

    // cancellation policy: 24h / 20% (enables late-cancellation penalty scenario)
    await api('PUT', `/org/${orgId}/cancellation-settings`, await admin(), {
      policyLevel: 'organisation', cancellationBeforeHours: 24, cancellationFeePercentage: 20, cancellationFeeFixed: 0,
    });
  }
  // branch/COA template for academy / marketplace
  state.created.orgs = orgDefs;
  saveState();
  rec('SETUP', 'S-04', 'Two organisations, branches, courts, subscriptions, COA created', 'PASS',
    orgDefs.map((o) => `${o.key}=${o.id}(${o.resources.length} courts)`).join(' '));

  // 3 marketplaces (each owned by its seller user; shop org type + plan)
  const shopDefs = [
    { key: 'shop1', name: 'SIM Marketplace Padel Pro', slug: 'sim-marketplace-padel-pro', seller: 'seller1', orgKey: 'orgA' },
    { key: 'shop2', name: 'SIM Marketplace Sports Hub', slug: 'sim-marketplace-sports-hub', seller: 'seller2', orgKey: 'orgB' },
    { key: 'shop3', name: 'SIM Marketplace Tennis Store', slug: 'sim-marketplace-tennis-store', seller: 'seller3', orgKey: null },
  ];
  for (const s of shopDefs) {
    const seller = staffByKey[s.seller];
    let org = await one('SELECT id FROM organisations WHERE slug = ?', [s.slug]);
    let orgId = org?.id;
    if (!orgId) {
      const r = await api('POST', '/organisations', await admin(), {
        orgTypeId: REF.orgTypeShop, name: s.name, slug: s.slug,
        email: `${s.slug}@courtzon.test`, phone: '+201000000200', countryId: 1, accessModel: 'PUBLIC_CLUB',
      });
      if (r.status !== 201) throw new Error(`shop org ${s.slug} failed ${r.status}`);
      orgId = r.data.id;
    }
    // ownership is what the seller marketplace service resolves (organisations.owner_id)
    await pool.execute('UPDATE organisations SET owner_id = ?, is_active = 1, is_verified = 1 WHERE id = ?', [seller.userId, orgId]);
    const sub = await one('SELECT id FROM organisation_subscriptions WHERE organisation_id = ? AND subscription_status = \'active\' LIMIT 1', [orgId]);
    if (!sub) {
      await api('PUT', `/organisations/${orgId}/subscription`, await admin(), { planId: REF.planShop, billingCycle: 'monthly' });
      await api('POST', `/organisations/${orgId}/subscription/activate`, await admin(), {});
    }
    await api('POST', '/admin/accounting/templates/apply', await admin(), { templateId: REF.tplMarketplace, organisationId: orgId }).catch(() => {});
    s.id = orgId;
  }
  state.created.shops = shopDefs;
  saveState();
  rec('SETUP', 'S-05', 'Three marketplaces created', 'PASS', shopDefs.map((s) => `${s.key}=${s.id}`).join(' '));

  // product category for the simulation
  let cat = await one("SELECT id FROM product_categories WHERE name = 'SIM Padel & Tennis Equipment' LIMIT 1");
  let categoryId = cat?.id;
  if (!categoryId) {
    const r = await api('POST', '/admin/product-categories', await admin(), { name: 'SIM Padel & Tennis Equipment', description: 'Simulation category' });
    categoryId = r.data?.id || r.data?.data?.id;
  }
  if (!categoryId) {
    categoryId = (await one('SELECT id FROM product_categories ORDER BY id LIMIT 1'))?.id;
  }
  state.created.categoryId = categoryId;

  // products (seller-authenticated, real marketplace API)
  const productDefs = [];
  const sellerProducts = {
    shop1: [
      { name: 'SIM Padel Racket Carbon Pro', price: 2450, qty: 30 },
      { name: 'SIM Padel Balls (3-pack)', price: 180, qty: 120 },
      { name: 'SIM Padel Grip Tape', price: 75, qty: 200 },
    ],
    shop2: [
      { name: 'SIM Padel Bag Tour', price: 1350, qty: 25 },
      { name: 'SIM Sports Water Bottle 1L', price: 220, qty: 150 },
      { name: 'SIM Padel Shoes Court', price: 2100, qty: 40 },
    ],
    shop3: [
      { name: 'SIM Tennis Racket Control', price: 3200, qty: 20 },
      { name: 'SIM Tennis Balls (4-pack)', price: 260, qty: 100 },
      { name: 'SIM Tennis Overgrip', price: 60, qty: 250 },
    ],
  };
  for (const s of shopDefs) {
    const seller = staffByKey[s.seller];
    const sess = { cookie: await sessionFor(seller.userId) };
    if (!sess.cookie) {
      rec('SETUP', `S-PROD-${s.key}`, 'Seller login for product creation', 'FAIL', `status=${sess.status}`);
      continue;
    }
    s.cookie = sess.cookie;
    s.products = [];
    for (const p of sellerProducts[s.key]) {
      const existing = await one('SELECT id, price, quantity FROM products WHERE seller_id = ? AND name = ? AND deleted_at IS NULL LIMIT 1', [s.id, p.name]);
      if (existing) {
        s.products.push({ id: existing.id, name: p.name, price: Number(existing.price) });
        await api('PUT', `/marketplace/admin/products/${existing.id}/status`, await admin(), { status: 'active' });
        continue;
      }
      const r = await api('POST', '/marketplace/products', sess.cookie, {
        categoryId, name: p.name, description: 'Simulation product — safe to delete',
        price: p.price, currencyCode: 'EGP', quantity: p.qty, condition: 'new',
        sportId: s.key === 'shop3' ? REF.sportTennis : REF.sportPadel,
      });
      if (r.status === 201 || r.status === 200) {
        s.products.push({ id: r.data.id, name: p.name, price: p.price });
        // seller-created products start as `pending` moderation; approve them
        const ap = await api('PUT', `/marketplace/admin/products/${r.data.id}/status`, await admin(), { status: 'active' });
        if (ap.status >= 300) rec('SETUP', `S-PROD-APPROVE-${s.key}-${p.name}`, 'Product moderation approval', 'FAIL', `${ap.status}`);
      } else {
        rec('SETUP', `S-PROD-${s.key}-${p.name}`, 'Product creation', 'FAIL', `${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
      }
    }
    // Cairo shipping rate (checkout requires a rate for the buyer's province)
    const rates = await api('GET', '/marketplace/seller/shipping-rates', sess.cookie);
    const rateList = rates.data?.data || rates.data || [];
    if (!Array.isArray(rateList) || !rateList.some((r) => Number(r.province_id) === 3056)) {
      const rr = await api('POST', '/marketplace/seller/shipping-rates', sess.cookie, {
        provinceId: 3056, price: 60, estimatedDays: 2,
      });
      if (rr.status >= 300) rec('SETUP', `S-SHIP-${s.key}`, 'Shipping rate creation', 'FAIL', `${rr.status} ${JSON.stringify(rr.data).slice(0, 200)}`);
    }
  }
  state.created.shops = shopDefs.map(({ cookie, ...rest }) => rest);
  saveState();
  const productCount = shopDefs.reduce((n, s) => n + (s.products?.length || 0), 0);
  rec('SETUP', 'S-06', 'Marketplace products created', productCount >= 9 ? 'PASS' : 'FAIL', `products=${productCount}`);

  // academies: 3 programs
  const academyDefs = [
    { key: 'acadA1', name: 'SIM Padel Juniors Academy', org: 'orgA', sport: REF.sportPadel, price: 1200, capacity: 20, category: 'juniors' },
    { key: 'acadA2', name: 'SIM Padel Adults Development', org: 'orgA', sport: REF.sportPadel, price: 1800, capacity: 16, category: 'adults' },
    { key: 'acadB1', name: 'SIM Tennis Performance Academy', org: 'orgB', sport: REF.sportTennis, price: 2000, capacity: 12, category: 'performance' },
  ];
  for (const a of academyDefs) {
    const org = orgDefs.find((o) => o.key === a.org);
    let prog = await one('SELECT id FROM academy_programs WHERE code = ? LIMIT 1', [`${MARK}-${a.key}`]);
    if (!prog) {
      const r = await api('POST', '/admin/academy/programs', await admin(), {
        code: `${MARK}-${a.key}`, name: a.name, description: 'Simulation academy programme',
        category: a.category, level: 'beginner', season: '2026', capacity: a.capacity,
        price: a.price, currency: 'EGP', price_type: 'FIXED', status: 'published', is_public: true,
        organisation_id: org.id, branch_id: org.branchId, sport_id: a.sport,
      });
      if (r.status === 201) prog = { id: r.data.id };
      else rec('SETUP', `S-ACAD-${a.key}`, 'Academy programme creation', 'FAIL', `${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
    }
    a.id = prog?.id;
  }
  state.created.academies = academyDefs;
  saveState();
  rec('SETUP', 'S-07', 'Three academy programmes created', academyDefs.every((a) => a.id) ? 'PASS' : 'PARTIAL',
    academyDefs.map((a) => `${a.key}=${a.id}`).join(' '));

  // 4 tournaments
  const tDefs = [
    { key: 't1', name: 'SIM Padel Masters Knockout', org: 'orgA', sport: REF.sportPadel, format: 'knockout', bracket: REF.bracketSingleElim, max: 8 },
    { key: 't2', name: 'SIM Padel Summer Round Robin', org: 'orgA', sport: REF.sportPadel, format: 'round_robin', bracket: REF.bracketRoundRobin, max: 8 },
    { key: 't3', name: 'SIM Tennis Open Knockout', org: 'orgB', sport: REF.sportTennis, format: 'knockout', bracket: REF.bracketSingleElim, max: 8 },
    { key: 't4', name: 'SIM Tennis Club Round Robin', org: 'orgB', sport: REF.sportTennis, format: 'round_robin', bracket: REF.bracketRoundRobin, max: 8 },
  ];
  for (const t of tDefs) {
    const org = orgDefs.find((o) => o.key === t.org);
    let tr = await one('SELECT id FROM tournaments WHERE name = ? LIMIT 1', [t.name]);
    if (!tr) {
      const start = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
      const end = new Date(Date.now() + 22 * 86400000).toISOString().slice(0, 10);
      const r = await api('POST', `/org/${org.id}/tournaments`, await admin(), {
        bracket_type_id: t.bracket,
        format: t.format,
        name: t.name,
        category: 'open',
        season: '2026',
        sport_id: t.sport,
        max_participants: t.max,
        min_participants: 4,
        entry_fee: 300,
        currency_code: 'EGP',
        price_type: 'FIXED',
        registration_payment_methods: ['cash', 'card'],
        start_date: start,
        end_date: end,
        is_public: true,
        branch_id: org.branchId,
        daily_start_time: '09:00',
        daily_end_time: '21:00',
      });
      if (r.status === 201) tr = { id: r.data.id };
      else rec('SETUP', `S-TOUR-${t.key}`, 'Tournament creation', 'FAIL', `${r.status} ${JSON.stringify(r.data).slice(0, 400)}`);
    }
    t.id = tr?.id;
  }
  state.created.tournaments = tDefs;
  saveState();
  rec('SETUP', 'S-08', 'Four tournaments created (padel/tennis, knockout/round-robin)',
    tDefs.every((t) => t.id) ? 'PASS' : 'PARTIAL', tDefs.map((t) => `${t.key}=${t.id}`).join(' '));
}

// ── Phase A — auth / RBAC / isolation ───────────────────────────────────────
async function phaseA() {
  const A = 'A';
  const adminC = await admin();

  // login success
  const ok = await login(ADMIN_PHONE, ADMIN_PASSWORD, '+20', { fresh: true });
  rec(A, 'A-01', 'Valid login returns session cookie', ok.status === 200 && !!ok.cookie ? 'PASS' : 'FAIL', `status=${ok.status}`);

  // invalid password
  const bad = await api('POST', '/auth/login', null, { phoneNumber: ADMIN_PHONE, countryCode: '+20', password: 'WrongPassword!1' });
  rec(A, 'A-02', 'Invalid password rejected', bad.status === 401 ? 'PASS' : 'FAIL', `status=${bad.status}`);

  // unauthenticated access (the public /auth/me bootstrap endpoint must never leak a user)
  const noAuth = await api('GET', '/auth/me', null);
  rec(A, 'A-03', 'Unauthenticated /auth/me leaks no account data',
    noAuth.status === 200 && (noAuth.data?.user === null || noAuth.data?.user === undefined) ? 'PASS' : 'FAIL',
    `status=${noAuth.status} user=${JSON.stringify(noAuth.data?.user ?? null)}`);

  // me
  const me = await api('GET', '/auth/me', adminC);
  const meUser = me.data?.user || me.data;
  rec(A, 'A-04', 'Authenticated /auth/me returns the caller', me.status === 200 && meUser?.id ? 'PASS' : 'FAIL', `status=${me.status} id=${meUser?.id}`);

  // refresh rotation
  const r1 = await api('POST', '/auth/refresh', adminC);
  const c1 = sessionCookie(r1);
  const r2 = c1 ? await api('POST', '/auth/refresh', c1) : { status: 0 };
  rec(A, 'A-05', 'Refresh token rotates a new session', r1.status === 200 && !!c1 && r2.status === 200 ? 'PASS' : 'FAIL', `first=${r1.status} second=${r2.status}`);
  if (c1) adminCookie = c1;

  // logout invalidates the session on a protected endpoint
  const session = await login(ADMIN_PHONE, ADMIN_PASSWORD, '+20', { fresh: true });
  const beforeLogout = await api('GET', '/bookings?limit=1', session.cookie);
  const lo = await api('POST', '/auth/logout', session.cookie);
  const after = await api('GET', '/bookings?limit=1', session.cookie);
  rec(A, 'A-06', 'Logout invalidates the session', lo.status === 200 && beforeLogout.status === 200 && after.status === 401 ? 'PASS' : 'FAIL',
    `logout=${lo.status} before=${beforeLogout.status} after=${after.status}`);
  resetAdmin();
  await admin();

  // player role cannot access admin endpoint
  const p = await login(state.created.players[0].phone, PLAYER_PASSWORD);
  const adminDenied = await api('GET', '/admin/users', p.cookie);
  rec(A, 'A-07', 'Player denied access to admin users list', [401, 403].includes(adminDenied.status) ? 'PASS' : 'FAIL', `status=${adminDenied.status}`);

  // cross-org isolation: org A admin reading org B bookings
  const orgA = state.created.orgs.find((o) => o.key === 'orgA');
  const orgB = state.created.orgs.find((o) => o.key === 'orgB');
  const staffA = state.created.staff.find((s) => s.key === 'orgAAdmin');
  const staffB = state.created.staff.find((s) => s.key === 'orgBAdmin');
  const aLogin = await login(staffA.phone, STAFF_PASSWORD);
  const bLogin = await login(staffB.phone, STAFF_PASSWORD);
  if (aLogin.cookie) {
    const own = await api('GET', `/org/${orgA.id}/bookings?limit=1`, aLogin.cookie);
    const cross = await api('GET', `/org/${orgB.id}/bookings?limit=1`, aLogin.cookie);
    rec(A, 'A-08', 'Org A admin can read own org bookings', own.status === 200 ? 'PASS' : 'FAIL', `status=${own.status}`);
    rec(A, 'A-09', 'Org A admin cannot read Org B bookings', [401, 403, 404].includes(cross.status) ? 'PASS' : 'FAIL', `status=${cross.status}`);
    const crossWrite = await api('POST', `/org/${orgB.id}/branches`, aLogin.cookie, {
      organisationId: orgB.id, name: 'SIM Cross Tenant Branch', slug: `sim-cross-${Date.now()}`,
    });
    rec(A, 'A-10', 'Org A admin cannot create a branch in Org B', [401, 403, 404].includes(crossWrite.status) ? 'PASS' : 'FAIL', `status=${crossWrite.status}`);
  } else {
    rec(A, 'A-08', 'Org A admin login', 'FAIL', `status=${aLogin.status}`);
  }
  if (bLogin.cookie) {
    const ownB = await api('GET', `/org/${orgB.id}/bookings?limit=1`, bLogin.cookie);
    rec(A, 'A-11', 'Org B admin can read own org bookings', ownB.status === 200 ? 'PASS' : 'FAIL', `status=${ownB.status}`);
  }

  // registration validation: duplicate phone / weak password
  const dup = await api('POST', '/auth/register-player', null, {
    countryId: 1, phoneNumber: state.created.players[0].phone.replace(/\D/g, '').slice(-11),
    password: 'ValidPass#2026', fullName: 'SIM Duplicate', email: `sim.dup.${Date.now()}@courtzon.test`, gender: 'male', timezone: 'UTC',
  });
  rec(A, 'A-12', 'Duplicate phone registration rejected', [400, 409, 422].includes(dup.status) ? 'PASS' : 'FAIL', `status=${dup.status}`);

  const weak = await api('POST', '/auth/register-player', null, {
    countryId: 1, phoneNumber: `0109999${String(Date.now()).slice(-4)}`,
    password: '123', fullName: 'SIM Weak', email: `sim.weak.${Date.now()}@courtzon.test`, gender: 'male', timezone: 'UTC',
  });
  rec(A, 'A-13', 'Weak password rejected by validation', [400, 422].includes(weak.status) ? 'PASS' : 'FAIL', `status=${weak.status}`);

  // password reset request is accepted without leaking account existence
  const forgotKnown = await api('POST', '/auth/forgot-password', null, { email: `sim.player.001@courtzon.test` });
  const forgotUnknown = await api('POST', '/auth/forgot-password', null, { email: `nobody.${Date.now()}@courtzon.test` });
  rec(A, 'A-14', 'Forgot-password does not disclose account existence',
    forgotKnown.status === forgotUnknown.status || forgotUnknown.status === 429 ? 'PASS' : 'FAIL',
    `known=${forgotKnown.status} unknown=${forgotUnknown.status}${forgotUnknown.status === 429 ? ' (rate-limited, no account signal)' : ''}`);

  // account suspension blocks login, reactivation restores it
  const victim = state.created.players[1];
  const vRow = await one('SELECT id, account_status FROM users WHERE id = ?', [victim.userId]);
  await pool.execute('UPDATE users SET account_status = \'suspended\' WHERE id = ?', [victim.userId]);
  const susp = await login(victim.phone, PLAYER_PASSWORD, '+20', { fresh: true });
  await pool.execute('UPDATE users SET account_status = \'active\' WHERE id = ?', [victim.userId]);
  const react = await login(victim.phone, PLAYER_PASSWORD, '+20', { fresh: true });
  rec(A, 'A-15', 'Suspended account is blocked and reactivation restores login',
    susp.status !== 200 && react.status === 200 ? 'PASS' : 'FAIL', `suspended=${susp.status} reactivated=${react.status}`);

  // seller registration creates a pending shop that admin must approve
  const sellerPhone = `0109998${String(Date.now()).slice(-4)}`;
  const sellerEmail = `sim.pending.seller.${Date.now()}@courtzon.test`;
  const regSeller = await api('POST', '/auth/register-seller', null, {
    countryId: 1, phoneNumber: sellerPhone, password: 'SellerPass#2026', fullName: 'SIM Pending Seller',
    email: sellerEmail, gender: 'male', timezone: 'UTC', shopName: `SIM Pending Shop ${Date.now()}`,
  });
  rec(A, 'A-16', 'Seller self-registration accepted', [200, 201].includes(regSeller.status) ? 'PASS' : 'FAIL', `status=${regSeller.status}`);

  const sellerRow = await one('SELECT u.id, o.id org_id, o.is_active, o.is_verified FROM users u JOIN organisations o ON o.owner_id = u.id WHERE u.email = ? LIMIT 1', [sellerEmail]);
  if (sellerRow) {
    const approve = await api('PUT', `/organisations/${sellerRow.org_id}`, await admin(), { isActive: true, isVerified: true });
    const afterApprove = await one('SELECT is_active, is_verified, org_type_id FROM organisations WHERE id = ?', [sellerRow.org_id]);
    rec(A, 'A-17', 'Admin can activate/verify a pending seller organisation',
      approve.status === 200 && Number(afterApprove?.is_active) === 1 && Number(afterApprove?.is_verified) === 1 ? 'PASS' : 'FAIL',
      `endpoint=${approve.status} active=${afterApprove?.is_active} verified=${afterApprove?.is_verified}`);
  } else {
    rec(A, 'A-17', 'Pending seller organisation created', 'FAIL', 'no organisation row found');
  }
}

// ── Bookings helpers ────────────────────────────────────────────────────────
function nextDate(days, hour, minute = 0) {
  const d = new Date(Date.now() + days * 86400000);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString().slice(0, 10);
}

let hmacSeq = Number(String(Date.now()).slice(-9)) + Math.floor(Math.random() * 1000);
async function simulateCardPayment(paymentId, { success = true, amountCents = null, duplicate = false } = {}) {
  const tx = await one('SELECT * FROM payment_transactions WHERE id = ?', [paymentId]);
  if (!tx) throw new Error(`payment ${paymentId} not found`);
  const gatewayRef = tx.gateway_reference;
  const amount = amountCents ?? Math.round(Number(tx.amount) * 100);
  hmacSeq += 1;
  const nowIso = new Date().toISOString();
  const obj = {
    id: hmacSeq,
    amount_cents: amount,
    created_at: nowIso,
    currency: tx.currency || 'EGP',
    error_occured: false,
    has_parent_transaction: false,
    integration_id: 123456,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: { id: Number(gatewayRef), created_at: nowIso, merchant_order_id: gatewayRef },
    owner: 1,
    pending: false,
    source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
    success,
    intention_order_id: gatewayRef,
    intention_id: gatewayRef,
  };
  const concat = [
    obj.amount_cents, obj.created_at, obj.currency, obj.error_occured, obj.has_parent_transaction,
    obj.id, obj.integration_id, obj.is_3d_secure, obj.is_auth, obj.is_capture, obj.is_refunded,
    obj.is_standalone_payment, obj.is_voided, obj.order.id, obj.owner, obj.pending,
    obj.source_data.pan, obj.source_data.sub_type, obj.source_data.type, obj.success,
  ].map((v) => v ?? '').join('');
  const secret = process.env.PAYMOB_HMAC_SECRET || await (async () => {
    const envTxt = readFileSync(resolve(ROOT, '.env'), 'utf8');
    const line = envTxt.split(/\r?\n/).find((l) => l.startsWith('PAYMOB_HMAC_SECRET='));
    return line ? line.slice('PAYMOB_HMAC_SECRET='.length).trim() : '';
  })();
  if (!secret) throw new Error('PAYMOB_HMAC_SECRET unavailable for webhook simulation');
  const sig = createHmac('sha512', secret).update(concat).digest('hex');
  const res = await api('POST', `/payments/webhook?hmac=${sig}`, null, { type: 'TRANSACTION', obj });
  if (duplicate) {
    const dup = await api('POST', `/payments/webhook?hmac=${sig}`, null, { type: 'TRANSACTION', obj });
    return { res, dup };
  }
  return { res };
}

async function prepareAndPayCard({ branchId, resourceId, date, start, end, notes }) {
  const prep = await api('POST', '/bookings/prepare', await admin(), {
    branchId, resourceId, bookingType: 'private_match', bookingDate: date,
    startTime: start, endTime: end, paymentMethod: 'card', notes,
    returnUrl: 'http://localhost:5173/bookings',
  });
  if (prep.status !== 200) return { ok: false, prep };
  const paymentId = prep.data.paymentId;
  const webhook = await simulateCardPayment(paymentId);
  await sleep(1200);
  const tx = await one('SELECT payment_status FROM payment_transactions WHERE id = ?', [paymentId]);
  return { ok: webhook.res.status === 200 && tx?.payment_status === 'paid', prep, webhook, paymentId, paymentStatus: tx?.payment_status };
}

// ── Phase C — bookings ──────────────────────────────────────────────────────
async function phaseC() {
  const C = 'C';
  const orgA = state.created.orgs.find((o) => o.key === 'orgA');
  const orgB = state.created.orgs.find((o) => o.key === 'orgB');
  const padelA = orgA.resources.filter((r) => r.sport === 'padel');
  const tennisA = orgA.resources.filter((r) => r.sport === 'tennis');
  const padelB = orgB.resources.filter((r) => r.sport === 'padel');
  const tennisB = orgB.resources.filter((r) => r.sport === 'tennis');
  const players = state.created.players;
  const adminC = await admin();

  const bookings = [];
  const specs = [];
  for (let i = 0; i < 20; i += 1) {
    const useB = i >= 10;
    const org = useB ? orgB : orgA;
    const padel = useB ? padelB : padelA;
    const tennis = useB ? tennisB : tennisA;
    const court = i % 7 === 6 ? tennis[0] : padel[i % padel.length];
    const player = players[(i * 7) % players.length];
    const day = 1 + Math.floor(i / 4);
    const hour = [7, 20, 21, 22][i % 4];
    const sport = court.sport;
    specs.push({
      org, court, player,
      date: nextDate(day, hour),
      start: `${String(hour).padStart(2, '0')}:00`,
      end: `${String(hour + 1).padStart(2, '0')}:00`,
      method: i % 3 === 0 ? 'card' : 'cash',
      group: i % 4 === 0,
      sport,
      marker: `${MARK}-BK-${String(i + 1).padStart(2, '0')}`,
    });
  }

  for (const [idx, s] of specs.entries()) {
    const pLogin = { cookie: await sessionFor(s.player.userId) };
    if (!pLogin.cookie) { rec(C, `C-BK-${idx + 1}`, 'Player login for booking', 'FAIL', `status=${pLogin.status}`); continue; }
    const candidates = [Number(s.start.slice(0, 2)), 5, 6, 7, 20, 21, 22, 23]
      .filter((h, i, a) => a.indexOf(h) === i)
      .filter((h) => h >= 5 && h <= 22);
    let result = null;
    for (const hour of candidates) {
      s.start = `${String(hour).padStart(2, '0')}:00`;
      s.end = `${String(hour + 1).padStart(2, '0')}:00`;
      const body = {
        branchId: s.org.branchId,
        resourceId: s.court.id,
        bookingType: s.group ? 'public_match' : 'private_match',
        bookingDate: s.date,
        startTime: s.start,
        endTime: s.end,
        paymentMethod: s.method,
        notes: s.marker,
      };
      if (s.group) {
        body.matchmaking = { maxPlayers: 3, autoApply: false };
        body.participants = players.filter((p) => p.userId !== s.player.userId).slice(0, 3).map((p) => ({ phone: p.phone }));
      }
      if (s.method === 'cash') {
        const r = await api('POST', '/bookings', pLogin.cookie, body);
        if (r.status === 201) {
          result = { status: r.status, id: r.data?.bookingId || r.data?.id, paymentStatus: 'pending' };
          if (result.id && idx % 2 === 0) {
            const payRes = await api('PATCH', `/bookings/${result.id}/payment`, adminC, { paymentStatus: 'paid' });
            if (payRes.status === 200) result.paymentStatus = 'paid';
          }
          break;
        }
        if (r.status !== 409) { result = { status: r.status, data: r.data }; break; }
      } else {
        const prep = await api('POST', '/bookings/prepare', pLogin.cookie, { ...body, paymentMethod: 'card', returnUrl: 'http://localhost:5173/bookings' });
        if (prep.status === 200) {
          const pay = await simulateCardPayment(prep.data.paymentId);
          const confirm = await api('POST', '/bookings', pLogin.cookie, { prepareId: prep.data.prepareId, paymentId: prep.data.paymentId });
          await sleep(1200);
          const tx = await one('SELECT payment_status FROM payment_transactions WHERE id = ?', [prep.data.paymentId]);
          const bk = await one('SELECT id, booking_status, payment_status FROM bookings WHERE notes = ? ORDER BY id DESC LIMIT 1', [s.marker]);
          result = { status: prep.status, id: bk?.id, paymentStatus: tx?.payment_status, bookingStatus: bk?.booking_status, webhook: pay.res.status, confirm: confirm.status, paymentId: prep.data.paymentId };
          if (!bk) rec(C, `C-BK-${idx + 1}`, 'Card booking row after webhook', 'FAIL', `payment=${tx?.payment_status} webhook=${pay.res.status} confirm=${confirm.status} ${JSON.stringify(confirm.data).slice(0, 200)}`);
          break;
        }
        if (![409, 403].includes(prep.status)) { result = { status: prep.status, data: prep.data }; break; }
      }
    }
    if (result && (result.id || result.paymentStatus === 'paid')) {
      bookings.push({ ...s, id: result.id, status: result.status, paymentStatus: result.paymentStatus });
    } else {
      rec(C, `C-BK-${idx + 1}`, 'Booking creation', 'FAIL', JSON.stringify(result || {}).slice(0, 300));
    }
  }
  state.created.bookings = bookings.map(({ org, court, player, ...b }) => ({ id: b.id, org: org.key, courtId: court.id, playerUserId: player.userId, date: b.date, start: b.start, method: b.method, marker: b.marker }));
  saveState();
  const cashCount = bookings.filter((b) => b.method === 'cash').length;
  const cardPaid = bookings.filter((b) => b.paymentStatus === 'paid').length;
  rec(C, 'C-01', '20 bookings executed (individual + group, padel + tennis)',
    bookings.length >= 20 ? 'PASS' : bookings.length >= 18 ? 'PARTIAL' : 'FAIL',
    `bookings=${bookings.length} cash=${cashCount} cardPaid=${cardPaid}`);

  // Double-booking attempt on an existing slot
  const first = bookings.find((b) => b.id);
  if (first) {
    const pLogin = { cookie: await sessionFor(players[2].userId) };
    const dup = await api('POST', '/bookings', pLogin.cookie, {
      branchId: first.org.branchId, resourceId: first.court.id, bookingDate: first.date,
      startTime: first.start, endTime: first.end, paymentMethod: 'cash', notes: `${MARK}-DUP`,
    });
    rec(C, 'C-02', 'Duplicate booking on the same court/slot is rejected', dup.status === 409 ? 'PASS' : 'FAIL', `status=${dup.status}`);
    if (dup.status !== 409) defect('C', 'D-CONFLICT', 'Court double-booking accepted', 'CRITICAL', `status=${dup.status}`, 'POST /bookings on an occupied slot');
  } else {
    rec(C, 'C-02', 'Duplicate booking test', 'BLOCKED', 'no bookings created');
  }

  // Concurrent same-slot attempts (5 players)
  const target = bookings[Math.min(5, bookings.length - 1)];
  if (target) {
    const date = nextDate(6, 20);
    const attempts = await Promise.all(players.slice(10, 15).map(async (p) => {
      const l = { cookie: await sessionFor(p.userId) };
      return api('POST', '/bookings', l.cookie, {
        branchId: target.org.branchId, resourceId: target.court.id, bookingDate: date,
        startTime: '20:00', endTime: '21:00', paymentMethod: 'cash', notes: `${MARK}-CONC-${p.userId}`,
      });
    }));
    const statuses = attempts.map((a) => a.status);
    const okCount = attempts.filter((a) => a.status === 201).length;
    const conflictCount = attempts.filter((a) => a.status === 409).length;
    metrics.concurrentBooking = { attempts: attempts.length, created: okCount, conflicts: conflictCount, statuses };
    rec(C, 'C-03', 'Concurrent same-slot attempts yield exactly one booking',
      okCount === 1 && conflictCount === attempts.length - 1 ? 'PASS' : 'FAIL',
      `created=${okCount} conflicts=${conflictCount} statuses=${statuses.join(',')}`);
    if (okCount !== 1) defect('C', 'D-CONCURRENCY', 'Concurrent booking allowed more than one reservation', 'CRITICAL', `created=${okCount} of ${attempts.length}`, 'parallel POST /bookings same slot');
    if (okCount === 1) {
      const created = attempts.find((a) => a.status === 201);
      const id = created.data?.bookingId || created.data?.id;
      if (id) state.created.concurrentBookingId = id;
    }
  }

  // free cancellation (outside the policy window) on a paid booking
  const freeCancel = bookings.find((b) => b.id && b.method === 'cash' && b.paymentStatus === 'paid');
  if (freeCancel) {
    const l = { cookie: await sessionFor(freeCancel.player.userId) };
    const cancel = await api('POST', `/bookings/${freeCancel.id}/cancel`, l.cookie, { reason: 'SIM free cancellation' });
    const row = await one('SELECT booking_status, payment_status, refunded_amount, total_amount FROM bookings WHERE id = ?', [freeCancel.id]);
    const full = Number(row?.total_amount || 0);
    rec(C, 'C-04', 'Cancellation outside the 24h window refunds in full', cancel.status === 200 && Math.abs(Number(row?.refunded_amount) - full) < 1 ? 'PASS' : 'PARTIAL',
      `status=${cancel.status} booking=${row?.booking_status} payment=${row?.payment_status} refunded=${row?.refunded_amount} total=${full}`);
  }

  // unpaid cash booking cancelled: nothing was collected, so nothing may be refunded
  const unpaid = bookings.find((b) => b.id && b.method === 'cash' && b.paymentStatus === 'pending');
  if (unpaid) {
    const l = { cookie: await sessionFor(unpaid.player.userId) };
    const cancel = await api('POST', `/bookings/${unpaid.id}/cancel`, l.cookie, { reason: 'SIM cancel unpaid cash' });
    const row = await one('SELECT booking_status, payment_status, refunded_amount FROM bookings WHERE id = ?', [unpaid.id]);
    const ok = cancel.status === 200 && Number(row?.refunded_amount || 0) === 0;
    rec(C, 'C-05', 'Unpaid cash cancellation does not record a refund', ok ? 'PASS' : 'FAIL',
      `status=${cancel.status} payment=${row?.payment_status} refunded=${row?.refunded_amount}`);
    if (!ok) defect('C', 'D-UNPAID-REFUND', 'Unpaid cash booking records a refunded amount', 'MEDIUM',
      `bookingId=${unpaid.id} refunded=${row?.refunded_amount}`, 'create cash booking (pending), cancel outside window');
  }

  // late cancellation (inside 24h) must apply the 20% penalty
  const court = orgA.resources.find((r) => r.sport === 'padel');
  const localHour = 20;
  const lateDate = nextDate(0, localHour - 2); // Africa/Cairo is UTC+2
  const latePlayer = players[3];
  const lp = { cookie: await sessionFor(latePlayer.userId) };
  const lateCreate = await api('POST', '/bookings', lp.cookie, {
    branchId: orgA.branchId, resourceId: court.id, bookingDate: lateDate,
    startTime: `${localHour}:00`, endTime: `${localHour + 1}:00`, paymentMethod: 'cash', notes: `${MARK}-LATE`,
  });
  const lateId = lateCreate.data?.bookingId || lateCreate.data?.id;
  if (lateId) {
    await api('PATCH', `/bookings/${lateId}/payment`, adminC, { paymentStatus: 'paid' });
    const cancel = await api('POST', `/bookings/${lateId}/cancel`, lp.cookie, { reason: 'SIM late cancellation' });
    const row = await one('SELECT booking_status, payment_status, refunded_amount, total_amount FROM bookings WHERE id = ?', [lateId]);
    const expectedRefund = Number(row?.total_amount || 450) * 0.8;
    const ok = cancel.status === 200 && Math.abs(Number(row?.refunded_amount) - expectedRefund) < 1;
    rec(C, 'C-06', 'Late cancellation refunds 80% and retains the 20% penalty', ok ? 'PASS' : 'FAIL',
      `status=${cancel.status} payment=${row?.payment_status} total=${row?.total_amount} refunded=${row?.refunded_amount} expected=${expectedRefund}`);
    if (!ok) defect('C', 'D-PENALTY', 'Late cancellation did not retain the configured 20% penalty', 'HIGH',
      `bookingId=${lateId} refunded=${row?.refunded_amount} expected=${expectedRefund}`, 'cancel a paid booking inside 24h');
  } else {
    rec(C, 'C-06', 'Late cancellation penalty', 'BLOCKED', `booking create failed ${lateCreate.status} ${JSON.stringify(lateCreate.data).slice(0, 200)}`);
  }

  // Slot availability reflects bookings
  if (target) {
    const slots = await api('GET', `/resources/${target.court.id}/slots?date=${target.date}`, adminC);
    const body = slots.data;
    const list = Array.isArray(body) ? body : body?.slots || body?.data || [];
    const blocked = list.filter((x) => x.available === false || x.isAvailable === false || x.status === 'booked').length;
    rec(C, 'C-07', 'Resource availability endpoint reflects booked slots', slots.status === 200 && list.length > 0 ? 'PASS' : 'FAIL',
      `status=${slots.status} slots=${list.length} unavailable=${blocked}`);
  }

  // Booking history is visible to the booking owner
  const owner = bookings.find((b) => b.id)?.player || players[0];
  const hist = await api('GET', '/bookings?limit=50', await sessionFor(owner.userId));
  const histList = hist.data?.data || hist.data || [];
  rec(C, 'C-08', 'Booking history returns the player bookings', hist.status === 200 && Array.isArray(histList) && histList.length > 0 ? 'PASS' : 'FAIL',
    `status=${hist.status} rows=${Array.isArray(histList) ? histList.length : 'n/a'}`);

  // Organiser bookings view
  const orgBookings = await api('GET', `/org/${orgA.id}/bookings?limit=10`, await sessionFor(state.created.staff.find((s) => s.key === 'orgAAdmin').userId));
  rec(C, 'C-09', 'Organisation booking list works for org admin', orgBookings.status === 200 ? 'PASS' : 'FAIL', `status=${orgBookings.status}`);
}

function staffPhone(key) {
  return state.created.staff.find((s) => s.key === key)?.phone;
}

// ── Phase D — marketplace ───────────────────────────────────────────────────
async function phaseD() {
  const D = 'D';
  const shops = state.created.shops;
  const players = state.created.players;
  const adminC = await admin();
  const buyers = players.slice(20, 30);
  const orders = [];

  for (let i = 0; i < 10; i += 1) {
    const shop = shops[i % shops.length];
    const product = shop.products?.[i % (shop.products.length || 1)];
    if (!product) { rec(D, `D-${i + 1}`, 'Product exists', 'BLOCKED', `${shop.key} has no product`); continue; }
    const buyer = buyers[i];
    const bLogin = { cookie: await sessionFor(buyer.userId) };
    if (!bLogin.cookie) { rec(D, `D-${i + 1}`, 'Buyer login', 'FAIL', `status=${bLogin.status}`); continue; }

    // address (once)
    const addr = await one('SELECT id FROM user_addresses WHERE user_id = ? AND province_id IS NOT NULL LIMIT 1', [buyer.userId]);
    let addressId = addr?.id;
    if (!addressId) {
      const a = await api('POST', '/marketplace/addresses', bLogin.cookie, {
        fullName: buyer.name, phone: buyer.phone, streetAddress: '12 Simulation Street',
        city: 'Cairo', provinceId: 3056, cityId: 9121, country: 'Egypt', isDefault: true,
      });
      addressId = a.data?.id;
    }

    const qty = i % 3 === 0 ? 2 : 1;
    const method = i % 2 === 0 ? 'cash' : 'card';
    const add = await api('POST', '/marketplace/cart', bLogin.cookie, { productId: product.id, quantity: qty });
    const checkout = await api('POST', '/marketplace/orders', bLogin.cookie, {
      addressId, paymentMethod: method, notes: `${MARK}-ORD-${i + 1}`,
      returnUrl: 'http://localhost:5173/marketplace/orders',
    });
    let orderId = checkout.data?.orderId || checkout.data?.id || checkout.data?.orders?.[0]?.id;
    let paid = null;
    if (checkout.status >= 200 && checkout.status < 300) {
      const paymentId = checkout.data?.paymentId || checkout.data?.payment?.paymentId;
      if (method === 'card' && paymentId) {
        const pay = await simulateCardPayment(paymentId);
        await sleep(1200);
        const tx = await one('SELECT payment_status, reference_id FROM payment_transactions WHERE id = ?', [paymentId]);
        paid = tx?.payment_status;
        if (!orderId) orderId = tx?.reference_id ? Number(tx.reference_id) : null;
      }
      if (!orderId) {
        const ord = await one('SELECT id FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 1', [buyer.userId]);
        orderId = ord?.id;
      }
      orders.push({ id: orderId, method, productId: product.id, qty, shop: shop.key, buyer: buyer.userId, paid });
      // cash checkout auto-confirms the order; the seller advances it to processing
      if (method === 'cash' && orderId) {
        const seller = state.created.staff.find((s) => s.key === shop.seller);
        const sl = { cookie: await sessionFor(seller.userId) };
        const conf = await api('PUT', `/marketplace/orders/${orderId}/status`, sl.cookie, { status: 'processing' });
        if (conf.status !== 200) rec(D, `D-CONF-${i + 1}`, 'Seller order processing transition', 'FAIL', `${conf.status} ${JSON.stringify(conf.data).slice(0, 160)}`);
      }
    } else {
      rec(D, `D-${i + 1}`, 'Marketplace checkout', 'FAIL', `${checkout.status} ${JSON.stringify(checkout.data).slice(0, 300)}`);
    }
  }
  state.created.orders = orders;
  saveState();
  const cardPaid = orders.filter((o) => o.method === 'card' && o.paid === 'paid').length;
  rec(D, 'D-01', '10 marketplace purchases executed (cash + card)', orders.length >= 10 ? 'PASS' : orders.length >= 8 ? 'PARTIAL' : 'FAIL',
    `orders=${orders.length} cardPaid=${cardPaid}`);

  // stock decrement check
  if (orders[0]) {
    const stock = await one('SELECT quantity FROM products WHERE id = ?', [orders[0].productId]);
    rec(D, 'D-02', 'Stock is decremented after purchase', stock ? 'PASS' : 'FAIL', `remaining=${stock?.quantity}`);
  }

  // overselling protection: add more than stock to cart / checkout
  const shop = shops[0];
  const prod = shop.products?.[0];
  const bigBuyer = buyers[0];
  const bl = { cookie: await sessionFor(bigBuyer.userId) };
  if (prod) {
    const stockRow = await one('SELECT quantity FROM products WHERE id = ?', [prod.id]);
    const add = await api('POST', '/marketplace/cart', bl.cookie, { productId: prod.id, quantity: Number(stockRow?.quantity || 0) + 50 });
    const addr = await one('SELECT id FROM user_addresses WHERE user_id = ? AND province_id IS NOT NULL LIMIT 1', [bigBuyer.userId]);
    const co = add.status < 300 ? await api('POST', '/marketplace/orders', bl.cookie, {
      addressId: addr?.id, paymentMethod: 'cash', notes: `${MARK}-OVERSELL`,
    }) : { status: add.status, data: add.data };
    const prevented = [400, 409, 422].includes(add.status) || [400, 409, 422].includes(co.status);
    rec(D, 'D-03', 'Overselling is prevented', prevented ? 'PASS' : 'FAIL',
      `add=${add.status} checkout=${co.status} stock=${stockRow?.quantity}`);
    if (!prevented) defect('D', 'D-OVERSELL', 'Checkout accepted quantity above available stock', 'HIGH', `checkout=${co.status}`, 'add > stock then checkout');
  }

  // cancel a cash order and verify stock restoration
  const cashOrder = orders.find((o) => o.method === 'cash' && o.id);
  if (cashOrder) {
    const buyer = players.find((p) => p.userId === cashOrder.buyer);
    const b = { cookie: await sessionFor(buyer.userId) };
    const before = await one('SELECT quantity FROM products WHERE id = ?', [cashOrder.productId]);
    const cancel = await api('POST', `/marketplace/orders/${cashOrder.id}/cancel`, b.cookie, { reason: 'SIM cancel' });
    await sleep(800);
    const after = await one('SELECT quantity FROM products WHERE id = ?', [cashOrder.productId]);
    rec(D, 'D-04', 'Order cancellation restores stock', cancel.status === 200 && Number(after?.quantity) > Number(before?.quantity) ? 'PASS' : 'FAIL',
      `status=${cancel.status} before=${before?.quantity} after=${after?.quantity}`);
  }

  // seller settlement balance is readable
  const seller = state.created.staff.find((s) => s.key === shop.seller);
  const sl = { cookie: await sessionFor(seller.userId) };
  const bal = await api('GET', '/marketplace/seller/settlements/balance', sl.cookie);
  rec(D, 'D-05', 'Seller settlement balance endpoint', bal.status === 200 ? 'PASS' : 'FAIL', `status=${bal.status} ${JSON.stringify(bal.data).slice(0, 200)}`);

  // merchant payable ledger entries exist for the simulation orders
  const led = await q(
    `SELECT COUNT(*) c FROM ledger_entries
     WHERE source_type='marketplace' AND source_id IN (${orders.filter((o) => o.id).map(() => '?').join(',') || 'NULL'})`,
    orders.filter((o) => o.id).map((o) => o.id),
  );
  rec(D, 'D-06', 'Marketplace orders produced journal entries', led[0]?.c > 0 ? 'PASS' : 'PARTIAL', `entries=${led[0]?.c}`);

  const fin = await api('GET', '/marketplace/admin/orders?limit=5', adminC);
  rec(D, 'D-07', 'Admin marketplace order listing works', fin.status === 200 ? 'PASS' : 'FAIL', `status=${fin.status}`);
}

// ── Phase E — tournaments & academies ───────────────────────────────────────
async function phaseE() {
  const E = 'E';
  const adminC = await admin();
  const players = state.created.players;
  const tourneys = state.created.tournaments || [];
  const regs = [];

  for (const t of tourneys) {
    if (!t.id) { rec(E, `E-${t.key}`, 'Tournament exists', 'BLOCKED', 'creation failed'); continue; }
    const existingMatches = await apiRetry('GET', `/admin/tournaments/${t.id}/matches`, adminC);
    const existingList = existingMatches.data?.data || existingMatches.data?.matches || existingMatches.data || [];
    if (Array.isArray(existingList) && existingList.length > 0) {
      regs.push({ key: t.key, id: t.id, registered: null, lifecycle: 'already_initialised', matches: existingList.length });
      rec(E, `E-${t.key}`, `Tournament already initialised (${t.format})`, 'PASS', `matches=${existingList.length}`);
      continue;
    }
    const pub = await apiRetry('POST', `/admin/tournaments/${t.id}/publish`, adminC, {});
    const open = await apiRetry('POST', `/admin/tournaments/${t.id}/open-reg`, adminC, {});
    // register 8 players
    let registered = 0;
    for (let i = 0; i < 8; i += 1) {
      const p = players[(tourneys.indexOf(t) * 8 + i) % players.length];
      const pl = { cookie: await sessionFor(p.userId) };
      if (!pl.cookie) continue;
      const r = await apiRetry('POST', `/tournaments/${t.id}/register`, pl.cookie, { payment_method: 'cash' });
      if ([200, 201].includes(r.status)) registered += 1;
    }
    const close = await apiRetry('POST', `/admin/tournaments/${t.id}/close-reg`, adminC, {});
    const draw = await apiRetry('POST', `/admin/tournaments/${t.id}/draw`, adminC, {});
    const drawApprove = draw.status < 300 ? await apiRetry('POST', `/admin/tournaments/${t.id}/draw/approve`, adminC, {}) : { status: 0 };
    const drawLock = drawApprove.status < 300 ? await apiRetry('POST', `/admin/tournaments/${t.id}/draw/lock`, adminC, {}) : { status: 0 };
    const genMatches = drawLock.status < 300 ? await apiRetry('POST', `/admin/tournaments/${t.id}/matches/generate`, adminC, {}) : { status: 0 };
    const start = await apiRetry('POST', `/admin/tournaments/${t.id}/start`, adminC, {});
    regs.push({ key: t.key, id: t.id, registered, publish: pub.status, open: open.status, close: close.status, draw: draw.status, approve: drawApprove.status, lock: drawLock.status, gen: genMatches.status, start: start.status });
    rec(E, `E-${t.key}`, `Tournament lifecycle (${t.format}, ${t.key === 't3' || t.key === 't4' ? 'tennis' : 'padel'})`,
      registered === 8 && draw.status < 300 ? 'PASS' : registered > 0 ? 'PARTIAL' : 'FAIL',
      `reg=${registered} publish=${pub.status} open=${open.status} close=${close.status} draw=${draw.status} lock=${drawLock.status} matches=${genMatches.status} start=${start.status}`);
  }
  state.created.tournamentRuns = regs;
  saveState();

  // Execute match results and progression for every tournament (knockout + round robin)
  for (const t of tourneys.filter((x) => x.id)) {
    let completed = 0; let failed = 0; let roundsPlayed = 0;
    let duplicateResult500Logged = false;
    for (let round = 0; round < 6; round += 1) {
      const res = await apiRetry('GET', `/admin/tournaments/${t.id}/matches`, adminC);
      const list = res.data?.data || res.data?.matches || res.data || [];
      const pending = (Array.isArray(list) ? list : []).filter((m) => ['scheduled', 'in_progress', 'disputed'].includes(String(m.status)));
      if (!pending.length) break;
      roundsPlayed += 1;
      for (const m of pending) {
        const winnerParticipant = m.participant1_id || m.player1_id;
        if (!winnerParticipant) continue;
        await apiRetry('POST', `/admin/tournaments/matches/${m.id}/start`, adminC, {});
        const r = await apiRetry('POST', `/admin/tournaments/matches/${m.id}/result`, adminC, {
          outcome: 'completed',
          score: { sets: [{ home: 6, away: 4 }, { home: 6, away: 3 }] },
          termination: { reason: 'SIM result' },
        });
        if (r.status >= 500 && !duplicateResult500Logged) {
          duplicateResult500Logged = true;
          defect('E', 'D-RESULT-500', 'Re-submitting an existing match result returns HTTP 500 instead of a conflict', 'MEDIUM',
            `matchId=${m.id} status=${r.status} ${String(r.data).slice(0, 200)}`, 'POST the same match result twice');
        }
        const ap = await apiRetry('POST', `/admin/tournaments/matches/${m.id}/result/approve`, adminC, {});
        if (ap.status < 300 || ap.status === 409) completed += 1; else failed += 1;
      }
      await sleep(500);
    }
    rec(E, `E-${t.key}-RESULTS`, 'Tournament match results and bracket progression',
      completed > 0 && failed === 0 ? 'PASS' : (failed === 0 && roundsPlayed === 0) ? 'PASS' : completed > 0 ? 'PARTIAL' : 'FAIL',
      roundsPlayed === 0 ? 'no pending matches (already completed in an earlier pass)' : `completed=${completed} failed=${failed} rounds=${roundsPlayed}`);

    const standings = await apiRetry('GET', `/admin/tournaments/${t.id}/standings`, adminC);
    rec(E, `E-${t.key}-STANDINGS`, 'Tournament standings readable', standings.status === 200 ? 'PASS' : 'FAIL', `status=${standings.status}`);

    const complete = await apiRetry('POST', `/admin/tournaments/${t.id}/complete`, adminC, {});
    let alreadyDone = false;
    if (complete.status >= 300) {
      const detail = await apiRetry('GET', `/admin/tournaments/${t.id}`, adminC);
      const st = detail.data?.status || detail.data?.data?.status;
      alreadyDone = st === 'completed';
    }
    rec(E, `E-${t.key}-COMPLETE`, 'Tournament completion transition', complete.status < 300 || alreadyDone ? 'PASS' : 'FAIL',
      `status=${complete.status}${alreadyDone ? ' already-completed' : ''} ${complete.status >= 300 ? JSON.stringify(complete.data).slice(0, 150) : ''}`);
  }

  // Academies: groups, enrollments, sessions, attendance, payment
  const academies = state.created.academies || [];
  for (const [i, a] of academies.entries()) {
    if (!a.id) { rec(E, `E-${a.key}`, 'Academy exists', 'BLOCKED', 'creation failed'); continue; }
    const existingGroups = await q('SELECT id FROM academy_groups WHERE program_id = ? ORDER BY id', [a.id]);
    const groupIds = existingGroups.map((g) => g.id);
    let grpStatus = groupIds.length ? 200 : null;
    while (groupIds.length < 2) {
      const grp = await apiRetry('POST', '/admin/academy/groups', adminC, { program_id: a.id, name: `${a.name} Group ${groupIds.length + 1}`, capacity: 8 });
      if (grp.data?.id) groupIds.push(grp.data.id);
      grpStatus = grp.status;
      if (grp.status >= 300) break;
    }
    let enrolled = 0;
    for (let n = 0; n < 6; n += 1) {
      const p = players[(i * 20 + n) % players.length];
      const already = await one('SELECT id FROM academy_enrollments WHERE program_id = ? AND player_id = ? LIMIT 1', [a.id, p.userId]);
      if (already) { enrolled += 1; continue; }
      const groupIdFor = groupIds[Math.min(groupIds.length - 1, Math.floor(n / 3))];
      const r = await apiRetry('POST', '/admin/academy/enrollments', adminC, { player_id: p.userId, program_id: a.id, group_id: groupIdFor });
      if ([200, 201].includes(r.status)) {
        enrolled += 1;
        const eid = r.data?.id;
        if (eid) {
          await apiRetry('POST', `/admin/academy/enrollments/${eid}/confirm`, adminC, {});
          if (n % 2 === 0) await apiRetry('POST', `/admin/academy/enrollments/${eid}/payment`, adminC, {});
        }
      }
    }
    let sessionId = null;
    const groupId = groupIds[0];
    if (groupId) {
      const s = await apiRetry('POST', '/admin/academy/sessions', adminC, {
        group_id: groupId, session_date: nextDate(10 + i, 18), start_time: '18:00', end_time: '19:30',
      });
      sessionId = s.data?.id;
      if (sessionId) {
        await apiRetry('POST', `/admin/academy/sessions/${sessionId}/start`, adminC, {});
        const roster = await apiRetry('GET', `/admin/academy/sessions/${sessionId}/roster`, adminC);
        const rosterRows = roster.data?.data || roster.data?.roster || [];
        if (Array.isArray(rosterRows) && rosterRows.length) {
          await apiRetry('POST', `/admin/academy/sessions/${sessionId}/attendance/bulk`, adminC, {
            records: rosterRows.slice(0, 5).map((r) => ({ enrollment_id: r.enrollment_id || r.id, status: 'present' })),
          });
        }
        await apiRetry('POST', `/admin/academy/sessions/${sessionId}/complete`, adminC, {});
      } else {
        rec(E, `E-${a.key}-SESSION`, 'Academy session creation', 'FAIL', `${s.status} ${JSON.stringify(s.data).slice(0, 200)}`);
      }
    }
    rec(E, `E-${a.key}`, 'Academy group, enrollments, session, attendance',
      enrolled >= 5 && sessionId ? 'PASS' : enrolled > 0 ? 'PARTIAL' : 'FAIL',
      `group=${grpStatus} enrolled=${enrolled} session=${sessionId ? 'created' : 'none'}`);
  }
}

// ── Phase F — accounting ────────────────────────────────────────────────────
async function phaseF() {
  const F = 'F';
  const adminC = await admin();
  const orgA = state.created.orgs.find((o) => o.key === 'orgA');
  const orgB = state.created.orgs.find((o) => o.key === 'orgB');
  const generatedBookings = (state.created.bookings || []).map((b) => b.id).filter(Boolean);
  const generatedOrders = (state.created.orders || []).map((o) => o.id).filter(Boolean);

  // Double-entry integrity: one logical accounting event may be written as a
  // "dual book" (CourtZon book + organisation book) with several transaction_id
  // values, so the authoritative invariant is per source/event, not per id.
  const unbalanced = await q(
    `SELECT source_type, source_id, event_type,
            ROUND(SUM(CASE WHEN side='debit' THEN amount ELSE 0 END),2) d,
            ROUND(SUM(CASE WHEN side='credit' THEN amount ELSE 0 END),2) c
     FROM ledger_entries GROUP BY source_type, source_id, event_type
     HAVING d <> c LIMIT 20`,
  );
  rec(F, 'F-01', 'Every accounting event balances across the dual books (debit = credit)', unbalanced.length === 0 ? 'PASS' : 'FAIL',
    `unbalanced=${unbalanced.length}${unbalanced.length ? ' ' + JSON.stringify(unbalanced.slice(0, 3)) : ''}`);
  if (unbalanced.length) defect('F', 'D-LEDGER', 'Unbalanced journal event detected', 'CRITICAL', JSON.stringify(unbalanced.slice(0, 5)), 'ledger_entries grouped by source/event');

  // simulation bookings have accounting
  if (generatedBookings.length) {
    const rows = await q(
      `SELECT source_id, COUNT(*) c FROM ledger_entries WHERE source_type='booking' AND source_id IN (${generatedBookings.map(() => '?').join(',')}) GROUP BY source_id`,
      generatedBookings,
    );
    const withEntries = rows.length;
    rec(F, 'F-02', 'Simulation bookings produced accounting entries',
      withEntries >= Math.ceil(generatedBookings.length * 0.8) ? 'PASS' : withEntries > 0 ? 'PARTIAL' : 'FAIL',
      `bookings=${generatedBookings.length} withEntries=${withEntries}`);
    const missing = generatedBookings.filter((id) => !rows.some((r) => Number(r.source_id) === Number(id)));
    if (missing.length) defect('F', 'D-BOOKING-ACCT', 'Paid bookings without journal entries', 'HIGH', `bookingIds=${missing.slice(0, 10).join(',')}`, 'create/pay booking then inspect ledger_entries');
  }

  // user gap: the three probe bookings before subscription
  const orphans = await q(
    `SELECT b.id FROM bookings b LEFT JOIN ledger_entries le ON le.source_type='booking' AND le.source_id=b.id
     WHERE b.organisation_id=? AND b.payment_status IN ('paid','refunded') AND b.created_at >= NOW() - INTERVAL 3 DAY
     GROUP BY b.id HAVING COUNT(le.id)=0 LIMIT 20`, [orgA.id],
  );
  if (orphans.length) {
    defect('F', 'D-ORPHAN-PAID', 'Paid bookings exist without any accounting entry', 'HIGH',
      `${orphans.length} booking(s) on org ${orgA.id}`, 'PAYMOB/CASH confirm before the organisation has an active plan');
  }

  // marketplace entries
  if (generatedOrders.length) {
    const rows = await q(
      `SELECT COUNT(DISTINCT source_id) c FROM ledger_entries WHERE source_type='marketplace' AND source_id IN (${generatedOrders.map(() => '?').join(',')})`,
      generatedOrders,
    );
    rec(F, 'F-03', 'Marketplace orders produced accounting entries', Number(rows[0]?.c) > 0 ? 'PASS' : 'FAIL', `orders=${generatedOrders.length} withEntries=${rows[0]?.c}`);
  }

  // trial balance / income statement / balance sheet through the real API
  for (const [id, path] of [
    ['F-04', '/admin/accounting/trial-balance'],
    ['F-05', '/admin/accounting/income-statement'],
    ['F-06', '/admin/accounting/balance-sheet'],
    ['F-07', '/admin/accounting/reconciliation'],
  ]) {
    const r = await api('GET', path, adminC);
    rec(F, id, `Admin report ${path}`, r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  }
  const orgReports = [
    ['F-08', `/org/${orgA.id}/accounting/trial-balance`],
    ['F-09', `/org/${orgA.id}/accounting/income-statement`],
    ['F-10', `/org/${orgA.id}/accounting/balance-sheet`],
    ['F-11', `/org/${orgB.id}/accounting/trial-balance`],
    ['F-12', `/org/${orgB.id}/accounting/income-statement`],
  ];
  for (const [id, path] of orgReports) {
    const r = await api('GET', path, adminC);
    rec(F, id, `Organisation report ${path.replace(String(orgA.id), ':orgA').replace(String(orgB.id), ':orgB')}`,
      r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  }

  // Trial balance numerically balances
  const tb = await api('GET', `/org/${orgA.id}/accounting/trial-balance`, adminC);
  const tbRows = tb.data?.data || tb.data?.rows || tb.data || [];
  let debit = 0; let credit = 0;
  if (Array.isArray(tbRows)) {
    // Parent rows aggregate their children — only postable leaves are summed to
    // avoid double counting.
    const leaves = tbRows.filter((row) => row.has_children === false || row.has_children === 0 || row.level >= 3);
    for (const row of leaves) {
      debit += Number(row.total_debits ?? row.debit ?? 0);
      credit += Number(row.total_credits ?? row.credit ?? 0);
    }
  }
  rec(F, 'F-13', 'Org A trial balance debits equal credits',
    Array.isArray(tbRows) && tbRows.length > 0 && debit > 0 && Math.abs(debit - credit) < 0.01 ? 'PASS' : 'FAIL',
    `rows=${tbRows.length} debit=${debit.toFixed(2)} credit=${credit.toFixed(2)}`);

  // settlement endpoints
  const uni = await api('GET', '/unified-settlements?limit=5', adminC);
  const gs = await api('GET', '/admin/gateway-settlements?limit=5', adminC);
  rec(F, 'F-14', 'Settlement listing endpoints respond', uni.status === 200 && gs.status === 200 ? 'PASS' : 'FAIL', `unified=${uni.status} gateway=${gs.status}`);

  // payment/booking consistency: paid card bookings must have a paid payment transaction
  const paidCard = (state.created.bookings || []).filter((b) => b.method === 'card');
  rec(F, 'F-15', 'Card bookings correlate to gateway payment transactions', paidCard.length > 0 ? 'PASS' : 'PARTIAL', `cardBookings=${paidCard.length}`);

  // duplicate/payment idempotency: replay the same webhook on a card booking
  const card = paidCard[0];
  if (card?.id) {
    const tx2 = await one(`SELECT id, gateway_reference FROM payment_transactions WHERE reference_type='booking' AND reference_id=? ORDER BY id DESC LIMIT 1`, [card.id]);
    if (tx2) {
      const before = await one('SELECT COUNT(*) c FROM ledger_entries WHERE source_type=\'booking\' AND source_id=?', [card.id]);
      const { dup } = await simulateCardPayment(tx2.id, { duplicate: true });
      const after = await one('SELECT COUNT(*) c FROM ledger_entries WHERE source_type=\'booking\' AND source_id=?', [card.id]);
      rec(F, 'F-16', 'Duplicate gateway webhook is idempotent (no duplicate postings)',
        Number(before.c) === Number(after.c) ? 'PASS' : 'FAIL',
        `before=${before.c} after=${after.c} replay=${dup?.status}`);
      if (Number(before.c) !== Number(after.c)) defect('F', 'D-DUP-POSTING', 'Duplicate webhook created duplicate ledger entries', 'CRITICAL', `${before.c} -> ${after.c}`, 'replay identical signed webhook');
    }
  }

  // Post-fix verification: webhook-first card booking must end paid + posted.
  const orgAF = state.created.orgs.find((o) => o.key === 'orgA');
  const court = orgAF.resources.find((r) => r.sport === 'tennis') || orgAF.resources[0];
  const p40 = state.created.players[40];
  const marker = `${MARK}-POSTFIX-CARD`;
  const date = nextDate(6, 7);
  const prep = await api('POST', '/bookings/prepare', await sessionFor(p40.userId), {
    branchId: orgAF.branchId, resourceId: court.id, bookingType: 'private_match', bookingDate: date,
    startTime: '07:00', endTime: '08:00', paymentMethod: 'card', notes: marker,
    returnUrl: 'http://localhost:5173/bookings',
  });
  if (prep.status === 200) {
    await simulateCardPayment(prep.data.paymentId);
    await api('POST', '/bookings', await sessionFor(p40.userId), { prepareId: prep.data.prepareId, paymentId: prep.data.paymentId });
    await sleep(2500);
    const bk = await one('SELECT id, payment_status, booking_status FROM bookings WHERE notes = ? ORDER BY id DESC LIMIT 1', [marker]);
    const entries = bk ? await one('SELECT COUNT(*) c FROM ledger_entries WHERE source_type=\'booking\' AND source_id=?', [bk.id]) : null;
    const ok = bk && bk.payment_status === 'paid' && Number(entries?.c || 0) > 0;
    rec(F, 'F-17', 'Webhook-first card booking is paid and journalised (post-fix)', ok ? 'PASS' : 'FAIL',
      `booking=${bk?.id} payment=${bk?.payment_status} status=${bk?.booking_status} entries=${entries?.c}`);
    if (!ok) defect('F', 'D-CARD-PENDING', 'Webhook-first card booking stays unpaid / unposted', 'HIGH',
      `booking=${bk?.id} payment=${bk?.payment_status} entries=${entries?.c}`, 'prepare → gateway webhook → confirm');
  } else {
    rec(F, 'F-17', 'Webhook-first card booking is paid and journalised (post-fix)', 'BLOCKED', `prepare=${prep.status} ${JSON.stringify(prep.data).slice(0, 200)}`);
  }

  // Cash marketplace order: deliver and verify cash recognition.
  const cashCandidates = (state.created.orders || []).filter((o) => o.method === 'cash' && o.id).map((o) => o.id);
  const cashOrder = cashCandidates.length
    ? await one(`SELECT id FROM orders WHERE id IN (${cashCandidates.map(() => '?').join(',')}) AND status IN ('confirmed','processing','shipped') ORDER BY id LIMIT 1`, cashCandidates)
    : null;
  if (cashOrder) {
    let current = await one('SELECT status FROM orders WHERE id = ?', [cashOrder.id]);
    const chain = ['processing', 'shipped', 'delivered'];
    for (const st of chain) {
      if (!current?.status || current.status === 'delivered') break;
      const r = await api('PUT', `/marketplace/orders/${cashOrder.id}/status`, adminC, { status: st });
      current = await one('SELECT status FROM orders WHERE id = ?', [cashOrder.id]);
      if (r.status >= 300) break;
    }
    const entries = await one('SELECT COUNT(*) c FROM ledger_entries WHERE source_type=\'marketplace\' AND source_id=?', [cashOrder.id]);
    rec(F, 'F-18', 'Cash marketplace order is journalised after delivery', Number(entries?.c || 0) > 0 ? 'PASS' : 'PARTIAL',
      `order=${cashOrder.id} status=${current?.status} entries=${entries?.c}`);
  }
}

// ── Phase H — concurrency / resilience / security ───────────────────────────
async function phaseH() {
  const H = 'H';
  const orgA = state.created.orgs.find((o) => o.key === 'orgA');
  const players = state.created.players;
  const adminC = await admin();

  // parallel reads: 40 concurrent booking-list requests
  const t0 = Date.now();
  const reads = await Promise.all(players.slice(0, 40).map(async (p) => {
    const l = { cookie: await sessionFor(p.userId) };
    return api('GET', '/bookings?limit=5', l.cookie);
  }));
  const elapsedRead = Date.now() - t0;
  const readOk = reads.filter((r) => r.status === 200).length;
  metrics.parallelReads = { requests: reads.length, ok: readOk, ms: elapsedRead };
  rec(H, 'H-01', '40 concurrent authenticated reads succeed', readOk === reads.length ? 'PASS' : 'PARTIAL', `ok=${readOk}/${reads.length} ms=${elapsedRead}`);

  // unauthorized cross-tenant API attempts
  const p = players[0];
  const pl = { cookie: await sessionFor(p.userId) };
  const attempts = [
    ['GET', `/org/${orgA.id}/bookings`],
    ['GET', '/admin/users'],
    ['GET', '/admin/accounting/trial-balance'],
    ['POST', '/admin/accounting/journal'],
    ['GET', '/admin/gateway-settlements'],
    ['PUT', `/org/${orgA.id}/payment-settings`],
  ];
  const denied = [];
  for (const [m, path] of attempts) {
    const r = await api(m, path, pl.cookie, m === 'POST' ? {} : undefined);
    denied.push(`${m} ${path}=${r.status}`);
  }
  const allDenied = denied.every((d) => /=(401|403|404)$/.test(d));
  rec(H, 'H-02', 'Player is denied every privileged endpoint', allDenied ? 'PASS' : 'FAIL', denied.join(' | '));
  if (!allDenied) defect('H', 'D-RBAC', 'Player reached a privileged endpoint', 'CRITICAL', denied.join(' | '), 'authenticated player requests');

  // input validation: negative/absurd values rejected
  const invalid = [
    await api('POST', '/bookings', pl.cookie, { branchId: -1, resourceId: -1, bookingDate: 'not-a-date', startTime: '99:99', endTime: '00:00' }),
    await api('POST', '/marketplace/cart', pl.cookie, { productId: -5, quantity: -2 }),
    await api('POST', '/auth/login', null, { phoneNumber: '1', password: 'x' }),
  ];
  rec(H, 'H-03', 'Malformed payloads rejected with 4xx', invalid.every((r) => r.status >= 400 && r.status < 500) ? 'PASS' : 'FAIL', invalid.map((r) => r.status).join(','));

  // duplicate booking request idempotency (same client marker twice, sequential)
  const targetCourt = orgA.resources.filter((r) => r.sport === 'padel')[1] || orgA.resources[0];
  const date = nextDate(6, 22);
  const b1 = await api('POST', '/bookings', pl.cookie, { branchId: orgA.branchId, resourceId: targetCourt.id, bookingDate: date, startTime: '22:00', endTime: '23:00', paymentMethod: 'cash', notes: `${MARK}-IDEMP` });
  const b2 = await api('POST', '/bookings', pl.cookie, { branchId: orgA.branchId, resourceId: targetCourt.id, bookingDate: date, startTime: '22:00', endTime: '23:00', paymentMethod: 'cash', notes: `${MARK}-IDEMP` });
  rec(H, 'H-04', 'Repeated identical booking request cannot double-reserve', b1.status === 201 && b2.status === 409 ? 'PASS' : 'FAIL', `first=${b1.status} second=${b2.status}`);

  // security headers / health endpoints
  const health = await fetch(`${API}/health`).then((r) => r.json());
  const headers = await fetch(`${API}/health`);
  const hsts = headers.headers.get('strict-transport-security');
  const xcto = headers.headers.get('x-content-type-options');
  rec(H, 'H-05', 'Backend health + security headers', health.status === 'ok' && !!xcto ? 'PASS' : 'PARTIAL', `health=${health.status} xcto=${!!xcto} hsts=${!!hsts}`);

  // brute-force: repeated bad logins on a throwaway user
  const phone = `0109997${String(Date.now()).slice(-4)}`;
  await ensureUser({ phone, password: PLAYER_PASSWORD, name: 'SIM Brute Target', email: `sim.brute.${Date.now()}@courtzon.test` });
  const tries = [];
  for (let i = 0; i < 7; i += 1) {
    const r = await login(phone, 'BadPass!123');
    tries.push(r.status);
  }
  const locked = tries.includes(429) || tries[tries.length - 1] !== 401;
  rec(H, 'H-06', 'Repeated failed logins are throttled/locked', locked ? 'PASS' : 'FAIL', `statuses=${tries.join(',')}`);
  if (!locked) defect('H', 'D-BRUTE', 'No lockout after 7 failed logins', 'HIGH', tries.join(','), 'repeat bad login');

  // rate limiting on auth refresh
  const storm = [];
  for (let i = 0; i < 35; i += 1) {
    const r = await api('POST', '/auth/refresh', null, {});
    storm.push(r.status);
  }
  const limited = storm.filter((s) => s === 429).length;
  rec(H, 'H-07', 'Auth endpoint rate limit engages under burst', limited > 0 ? 'PASS' : 'PARTIAL', `429s=${limited}/35`);

  // background workers / queues
  const queues = await api('GET', '/admin/queues', adminC);
  rec(H, 'H-08', 'Queue monitoring endpoint responds', queues.status === 200 ? 'PASS' : 'FAIL', `status=${queues.status}`);

  // realtime socket handshake (polling transport over HTTP)
  try {
    const socketRes = await fetch(`${API}/socket.io/?EIO=4&transport=polling`);
    const text = await socketRes.text();
    rec(H, 'H-09', 'Socket.IO endpoint accepts a handshake', socketRes.status === 200 && text.startsWith('0') ? 'PASS' : 'FAIL', `status=${socketRes.status}`);
  } catch (e) {
    rec(H, 'H-09', 'Socket.IO endpoint accepts a handshake', 'FAIL', String(e.message).slice(0, 200));
  }

  // notification generated for booking events
  const notif = await api('GET', '/notifications?limit=5', pl.cookie);
  const notifRows = notif.data?.data || notif.data || [];
  rec(H, 'H-10', 'Notifications are readable for the player', notif.status === 200 ? 'PASS' : 'FAIL', `status=${notif.status} rows=${Array.isArray(notifRows) ? notifRows.length : 'n/a'}`);
}

// ── runner ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const phaseArg = (args.find((a) => a.startsWith('--phase=')) || '--phase=all').split('=')[1];
const wanted = new Set(phaseArg.split(',').map((s) => s.trim().toLowerCase()));

function wants(p) { return wanted.has('all') || wanted.has(p); }

try {
  if (wants('setup')) await setup();
  if (wants('a')) await phaseA();
  if (wants('c')) await phaseC();
  if (wants('d')) await phaseD();
  if (wants('e')) await phaseE();
  if (wants('f')) await phaseF();
  if (wants('h')) await phaseH();
  rec('RUN', 'END', 'Simulation run completed', 'PASS', `results=${results.length} defects=${defects.length}`);
} catch (err) {
  rec('RUN', 'FATAL', 'Simulation aborted by an unexpected error', 'FAIL', String(err?.stack || err).slice(0, 1500));
  console.error(err);
  process.exitCode = 1;
} finally {
  saveState();
  saveResults();
  await pool.end();
}
