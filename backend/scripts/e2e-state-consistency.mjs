import { pbkdf2Sync, randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';

const API = 'http://localhost:3000';
const results = [];
function record(step, ok, detail = '') {
  results.push({ step, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? ' — ' + detail : ''}`);
}

// ── password hash (same format as backend/src/shared/utils/password.ts) ──
function toB64url(b) { return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_'); }
function hashPassword(password) {
  const salt = randomBytes(32);
  const hash = pbkdf2Sync(password, salt, 210000, 64, 'sha512');
  const v = Buffer.from([2]);
  const it = Buffer.alloc(4); it.writeUInt32BE(210000);
  const kl = Buffer.alloc(2); kl.writeUInt16BE(64);
  return `$pbkdf2-sha512$${toB64url(Buffer.concat([v, it, kl, salt, hash]))}`;
}

const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });

async function api(method, path, { token, body, cookies } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cookies ? { cookie: cookies } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

/** Login and return the session cookie string for subsequent calls. */
async function login(phoneNumber, password = 'Test123456!') {
  const res = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phoneNumber, countryCode: '+20', password }),
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  const jar = setCookie.map((c) => c.split(';')[0]).join('; ');
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, cookies: jar, body: json };
}

// ═════════ setup: admin session ═════════
const stamp = Date.now();
const diagPhone = '01511111101';
await pool.execute(`UPDATE users SET password_hash = ? WHERE phone_number = ?`, [hashPassword('Test123456!'), diagPhone]);

let r = await login(diagPhone);
record('admin login', r.status === 200, `status=${r.status}`);
const adminCookies = r.cookies;

// ═════════ ISSUE 1 — canonical subscription resolution (DIAG Guard Club org 1000866) ═════════
// DB state: row 63 active Aug24→Sep3 + row 68 pending(future) Sep4→Oct4.
const [orgSubs] = await pool.execute(
  `SELECT id, subscription_status, start_date, end_date FROM organisation_subscriptions WHERE organisation_id = 1000866 ORDER BY id`);
record('I1 setup: overlap window exists (active current + future pending renewal)',
  orgSubs.some(s => s.subscription_status === 'active') && orgSubs.some(s => s.subscription_status === 'pending'),
  JSON.stringify(orgSubs.map(s => `${s.id}:${s.subscription_status}`)));

r = await api('GET', '/organisations?limit=200', { cookies: adminCookies });
const guardClub = (r.body?.data || []).find(o => Number(o.id) === 1000866);
record('I1-a admin list resolves EFFECTIVE sub (active), not the newer pending renewal',
  guardClub?.subscription_status === 'active',
  `subscription_status=${guardClub?.subscription_status} (pre-fix would be "pending")`);

r = await api('GET', '/organisations/1000866/subscription', { cookies: adminCookies });
record('I1-b admin current-subscription card returns the ACTIVE period, not the renewal',
  r.body?.id === 63 && r.body?.effectiveStatus === 'active',
  `id=${r.body?.id} effectiveStatus=${r.body?.effectiveStatus} end=${r.body?.endDate}`);

r = await api('GET', '/admin/organisation-subscriptions', { cookies: adminCookies });
const rows = (r.body?.data || []).filter(x => Number(x.org_id) === 1000866);
record('I1-c View Assignments still lists FULL history (both periods visible)',
  rows.length === 2,
  rows.map(x => `${x.subscription_id}:${x.subscription_status}/exp=${x.is_expired}`).join(', '));

r = await api('GET', '/org/1000866/subscription', { cookies: adminCookies });
record('I1-d org-portal resolver agrees (active period id 63)', r.body?.id === 63,
  `id=${r.body?.id} plan=${r.body?.planName} end=${r.body?.endDate}`);

const [dupes] = await pool.execute(
  `SELECT COUNT(*) AS n FROM organisation_subscriptions WHERE organisation_id = 1000866 AND subscription_status = 'active'
     AND (start_date IS NULL OR start_date <= CURDATE()) AND (end_date IS NULL OR end_date >= CURDATE())`);
record('I1-e exactly ONE effective active entitlement (no duplicate/overlap)', dupes[0].n === 1, `actives_now=${dupes[0].n}`);

// Padel Edge sanity: single active period everywhere
r = await api('GET', '/organisations?limit=200', { cookies: adminCookies });
const padel = (r.body?.data || []).find(o => o.name?.includes('Padel Edge'));
record('I1-f Padel Edge list column = active', padel?.subscription_status === 'active', `status=${padel?.subscription_status}`);
r = await api('GET', '/organisations/6/subscription', { cookies: adminCookies });
record('I1-g Padel Edge canonical resolver = active period', r.body?.effectiveStatus === 'active', `id=${r.body?.id} eff=${r.body?.effectiveStatus}`);

// ═════════ ISSUE 2 — approval state agreement (owner access after activation) ═════════
// 2a. seed a fresh org owner + organisation directly (born inactive+unverified)
const ownerPhone = '0153333' + String(stamp % 10000).padStart(4, '0');
await pool.execute(
  `INSERT INTO users (public_id, country_id, email, phone_number, full_phone, password_hash, full_name, gender, timezone)
   SELECT UUID(), 1, ?, ?, ?, ?, 'E2E Approval Owner', 'male', 'UTC'`,
  [`e2e-appr-${stamp}@test.com`, ownerPhone, `+20${ownerPhone}`, hashPassword('Test123456!')]);
const [[urow]] = await pool.execute(`SELECT id FROM users WHERE phone_number = ?`, [ownerPhone]);
const ownerId = urow?.id ?? null;
let orgId = null;
if (ownerId) {
  const [[trow]] = await pool.execute(`SELECT id FROM organisation_types WHERE is_active = TRUE ORDER BY sort_order LIMIT 1`);
  const slug = `approval-e2e-${stamp}`;
  await pool.execute(
    `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, country_id, is_verified, is_active)
     VALUES (UUID(), ?, ?, ?, ?, 1, 0, 0)`,
    [trow.id, ownerId, `Approval E2E Club ${stamp}`, slug]);
  const [[orow]] = await pool.execute(`SELECT id FROM organisations WHERE slug = ?`, [slug]);
  orgId = orow?.id ?? null;
}
record('I2 setup: org registered (inactive+unverified)', !!ownerId && !!orgId, `owner=${ownerId} org=${orgId}`);

if (orgId && ownerId) {
  // 2b. simulate the LEGACY stranded state (is_active=1, is_verified=0)
  await pool.execute(`UPDATE organisations SET is_active = 1, is_verified = 0 WHERE id = ?`, [orgId]);
  r = await login(ownerPhone);
  const ownerCookiesStranded = r.cookies;
  record('I2-pre owner login while stranded works (session valid)', r.status === 200);
  r = await api('GET', '/my/scopes', { cookies: ownerCookiesStranded });
  const strandedScope = (r.body?.data || []).find(s => Number(s.scope_id) === Number(orgId));
  record('I2-a stranded org (active=1, verified=0): owner scope reports unverified → guard blocks',
    strandedScope && !strandedScope.is_verified && strandedScope.is_active,
    `is_verified=${strandedScope?.is_verified} is_active=${strandedScope?.is_active}`);

  // 2c. run the repair migration statement
  await pool.execute(`UPDATE organisations SET is_verified = 1 WHERE is_active = 1 AND is_verified = 0 AND deleted_at IS NULL`);
  r = await api('GET', '/my/scopes', { cookies: ownerCookiesStranded });
  const fixedScope = (r.body?.data || []).find(s => Number(s.scope_id) === Number(orgId));
  record('I2-b after repair migration: owner scope now verified+active → guard passes',
    fixedScope && !!fixedScope.is_verified && !!fixedScope.is_active,
    `is_verified=${fixedScope?.is_verified} is_active=${fixedScope?.is_active}`);

  // 2d. fresh login must never resurrect a stale pending state
  r = await login(ownerPhone);
  r = await api('GET', '/my/scopes', { cookies: r.cookies });
  const fresh = (r.body?.data || []).find(s => Number(s.scope_id) === Number(orgId));
  record('I2-c fresh session agrees (no stale cache/JWT effect)', !!fresh?.is_verified && !!fresh?.is_active);

  // 2e. genuinely pending org remains blocked
  await pool.execute(`UPDATE organisations SET is_active = 0, is_verified = 0 WHERE id = ?`, [orgId]);
  r = await login(ownerPhone);
  r = await api('GET', '/my/scopes', { cookies: r.cookies });
  const pend = (r.body?.data || []).find(s => Number(s.scope_id) === Number(orgId));
  record('I2-d genuinely unapproved org still blocked by guard data',
    pend && (!pend.is_verified || !pend.is_active),
    `is_verified=${pend?.is_verified} is_active=${pend?.is_active}`);

  // 2f. admin activation implies approval (af71a81 path) + emits approved with userId
  r = await api('PUT', `/organisations/${orgId}`, { cookies: adminCookies, body: { isActive: true } });
  record('I2-e admin PUT isActive:true succeeds', r.status === 200, `status=${r.status}`);
  const [after] = await pool.execute(`SELECT is_active, is_verified FROM organisations WHERE id = ?`, [orgId]);
  record('I2-f activation sets BOTH flags (owner can access immediately)',
    after[0].is_active === 1 && after[0].is_verified === 1,
    `is_active=${after[0].is_active} is_verified=${after[0].is_verified}`);

  // 2g. audit trail written for the approval/activation
  await new Promise((res) => setTimeout(res, 500));
  const [auditRows] = await pool.execute(
    `SELECT action FROM audit_logs WHERE entity_type='organisation' AND entity_id=? ORDER BY id DESC LIMIT 5`, [String(orgId)]);
  record('I2-g audit trail written for activation', auditRows.length > 0, auditRows.map(a => a.action).join(','));

  // cleanup test org
  await pool.execute(`UPDATE organisations SET deleted_at = NOW() WHERE id = ?`, [orgId]);
}

await pool.end();
const failed = results.filter(x => !x.ok);
console.log(`\n==== E2E SUMMARY: ${results.length - failed.length}/${results.length} passed ====`);
process.exit(failed.length ? 1 : 0);

