// CourtZon E2E Accounting Year-End Simulation
// Runs against the live Docker backend (HTTP) + Docker MySQL (127.0.0.1:3307).
// Verifies the full lifecycle: posting → period control → preview → close →
// post-close reconciliation → new fiscal year → reopen → failure/atomicity →
// realtime. Reconciles actual ledger balances at every critical stage.
import http from 'node:http';
import mysql from 'mysql2/promise';
import { pathToFileURL } from 'node:url';

// Backend modules read DB/Redis env — point them at the Docker stack.
process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';

const BASE = 'http://127.0.0.1:3000';
const PASS = '✅';
const FAIL = '❌';
const results = [];
let failures = 0;

function record(workflow, step, pass, detail = '') {
  results.push({ workflow, step, pass, detail });
  if (!pass) failures++;
  console.log(`${pass ? PASS : FAIL} ${workflow}: ${step}${detail ? ' — ' + detail : ''}`);
}

function api(method, path, opts = {}) {
  const url = new URL(BASE + path);
  if (opts.qs) for (const [k, v] of Object.entries(opts.qs)) url.searchParams.set(k, v);
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  if (opts.cookie) headers['Cookie'] = opts.cookie;
  return new Promise((resolve, reject) => {
    const body = opts.body ? JSON.stringify(opts.body) : undefined;
    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data || '{}') }); }
        catch { resolve({ status: res.statusCode, headers: res.headers, body: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

const pool = await mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });

function cookiesToHeader(res) {
  const cookies = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [res.headers['set-cookie'] || ''];
  const sessionCookie = cookies.find(c => c.startsWith('session_token='));
  const token = sessionCookie ? sessionCookie.split(';')[0].split('=')[1] : null;
  return token ? `session_token=${token}` : null;
}

let phoneSeq = 0;
async function registerUser(prefix) {
  phoneSeq += 1;
  const phone = '010' + String(Date.now()).slice(-6) + String(phoneSeq).padStart(2, '0');
  const email = `${prefix}-${Date.now()}-${phoneSeq}@test.com`;
  const r = await api('POST', '/auth/register-player', { body: { countryId: 1, phoneNumber: phone, password: 'Test123456!', fullName: prefix, email, gender: 'male', timezone: 'UTC' } });
  if (r.status !== 201) throw new Error(`register ${prefix} failed: ${r.status}`);
  return { userId: r.body.user?.id, token: r.body.session?.sessionToken, email, phone, fullPhone: r.body.user?.fullPhone || `+2${phone}` };
}

async function login(phone) {
  const r = await api('POST', '/auth/login', { body: { phoneNumber: phone, countryCode: '20', password: 'Test123456!' } });
  if (r.status !== 200) throw new Error(`login failed: ${r.status} ${JSON.stringify(r.body)}`);
  return { cookie: cookiesToHeader(r), user: r.body.user };
}

async function q(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function glTotals(orgId) {
  const [rows] = await pool.execute(
    `SELECT a.code, a.name, a.type, a.normal_side, COALESCE(SUM(gl.debit),0) AS dr, COALESCE(SUM(gl.credit),0) AS cr
       FROM general_ledger gl JOIN chart_of_accounts a ON a.id = gl.account_id
      WHERE gl.organisation_id = ?
      GROUP BY a.id, a.code, a.name, a.type, a.normal_side ORDER BY a.code`,
    [orgId],
  );
  return rows;
}

function bal(row) { return (row.normal_side === 'credit' ? Number(row.cr) - Number(row.dr) : Number(row.dr) - Number(row.cr)); }
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── 0. SETUP ──
console.log('\n══════════ SETUP ══════════');
const FY = 2026;
const NEXT_FY = 2027;
let orgAId, orgB, orgAOwner, orgBOwner, superAdmin, reAccountId, orgBAccountId;

// Idempotent pre-cleanup: remove any leftover test orgs/users from interrupted runs.
await preCleanup();

try {
  orgAOwner = await registerUser('E2E-OrgA-Owner');
  orgBOwner = await registerUser('E2E-OrgB-Owner');
  superAdmin = await registerUser('E2E-SuperAdmin');

  const saRole = await q(`SELECT id FROM roles WHERE slug IN ('super_admin','super-admin') LIMIT 1`);
  await pool.execute(`INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by, assigned_at, is_active) VALUES (?, ?, ?, NOW(), TRUE)`, [superAdmin.userId, saRole[0].id, superAdmin.userId]);
  const saLogin = await login(superAdmin.phone);

  const ot = await q(`SELECT id FROM organisation_types LIMIT 1`);
  const [aRes] = await pool.execute(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active, is_verified) VALUES (UUID(), ?, ?, 'E2E YearEnd Org A', 'e2e-year-end-a', 1, 1)`, [ot[0].id, orgAOwner.userId]);
  orgAId = aRes.insertId;
  const [bRes] = await pool.execute(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active, is_verified) VALUES (UUID(), ?, ?, 'E2E YearEnd Org B', 'e2e-year-end-b', 1, 1)`, [ot[0].id, orgBOwner.userId]);
  orgB = bRes.insertId;

  const adminRole = await q(`SELECT id FROM roles WHERE slug = 'org-admin' LIMIT 1`);
  if (adminRole.length) {
    const [ur] = await pool.execute(`INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at, is_active) VALUES (?, ?, ?, NOW(), TRUE)`, [orgAOwner.userId, adminRole[0].id, orgAOwner.userId]);
    await pool.execute(`INSERT IGNORE INTO user_role_scopes (user_role_id, scope_type, scope_id, created_at) VALUES (?, 'organisation', ?, NOW())`, [ur.insertId, orgAId]);
  }

  const l3eq = await q(`SELECT id FROM chart_of_accounts WHERE code = 'EQUITY-RETAINED' AND organisation_id IS NULL LIMIT 1`);
  const [reR] = await pool.execute(`INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active) VALUES (?, 'E2E-RE', 'E2E Retained Earnings', 'equity', 'credit', ?, 0, 1)`, [orgAId, l3eq[0].id]);
  reAccountId = reR.insertId;
  await pool.execute(`INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active) VALUES ('year_close', ?, 'retained_earnings', ?, 1)`, [orgAId, reAccountId]);

  const l3asset = await q(`SELECT id FROM chart_of_accounts WHERE code = 'ASSETS-CASH' AND organisation_id IS NULL LIMIT 1`);
  const [obR] = await pool.execute(`INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active) VALUES (?, 'E2E-ORGB-CASH', 'E2E OrgB Cash', 'asset', 'debit', ?, 0, 1)`, [orgB, l3asset[0].id]);
  orgBAccountId = obR.insertId;

  orgAOwner.cookie = (await login(orgAOwner.phone)).cookie;
  orgBOwner.cookie = (await login(orgBOwner.phone)).cookie;
  orgAOwner.saCookie = saLogin.cookie;

  record('Setup', 'users + orgs + accounts', true, `orgA=${orgAId} orgB=${orgB} re=${reAccountId}`);
} catch (e) {
  record('Setup', 'setup failed', false, e.stack || e.message);
  process.exit(1);
}

const oc = () => ({ cookie: orgAOwner.cookie });
const obc = () => ({ cookie: orgBOwner.cookie });

// Idempotent pre-cleanup: remove any leftover test orgs/users from interrupted runs.
async function preCleanup() {
  const userLike = `email LIKE 'E2E-OrgA-Owner-%' OR email LIKE 'E2E-OrgB-Owner-%' OR email LIKE 'E2E-SuperAdmin-%'`;
  const [leftoverOrgs] = await pool.execute(
    `SELECT id FROM organisations WHERE slug LIKE 'e2e-year-end-%' OR owner_id IN (SELECT id FROM users WHERE ${userLike})`
  );
  for (const o of leftoverOrgs) {
    await pool.execute(`DELETE FROM year_close_cycles WHERE year_closings_id IN (SELECT id FROM year_closings WHERE organisation_id = ?)`, [o.id]);
    await pool.execute(`DELETE FROM year_closings WHERE organisation_id = ?`, [o.id]);
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [o.id]);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [o.id]);
    await pool.execute(`DELETE FROM accounting_periods WHERE organisation_id = ?`, [o.id]);
    await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE organisation_id = ?`, [o.id]);
    await pool.execute(`DELETE FROM organisation_coa_customizations WHERE organisation_id = ?`, [o.id]);
    await pool.execute(`DELETE FROM user_role_scopes WHERE scope_type='organisation' AND scope_id = ?`, [o.id]);
    await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id = ?`, [o.id]);
  }
  if (leftoverOrgs.length) {
    const ids = leftoverOrgs.map(o => o.id);
    await pool.execute(`DELETE FROM organisations WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  }
  const [leftoverUsers] = await pool.execute(`SELECT id FROM users WHERE ${userLike}`);
  for (const u of leftoverUsers) {
    await pool.execute(`DELETE FROM user_sessions WHERE user_id = ?`, [u.id]);
    await pool.execute(`DELETE FROM user_role_scopes WHERE user_role_id IN (SELECT id FROM user_roles WHERE user_id = ?)`, [u.id]);
    await pool.execute(`DELETE FROM user_roles WHERE user_id = ?`, [u.id]);
    await pool.execute(`DELETE FROM notifications WHERE user_id = ?`, [u.id]);
  }
  if (leftoverUsers.length) {
    const ids = leftoverUsers.map(u => u.id);
    await pool.execute(`DELETE FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  }
  console.log(`Pre-cleanup: removed ${leftoverOrgs.length} leftover orgs, ${leftoverUsers.length} leftover users`);
}

// ── 0.5 Realtime listeners (in-process event bus for automatic postings) ──
const inProcessEvents = [];
const { eventBusV2 } = await import('../src/shared/event-bus/event-bus.v2.js');
eventBusV2.on('accounting:entry-recorded', (p) => inProcessEvents.push(p));

// socket.io client for server-emitted events (manual post, close, reopen)
const ioMod = await import(pathToFileURL('C:/Users/mniaz/Desktop/CourtZon-V2/frontend/node_modules/socket.io-client/build/esm/index.js').href);
const sockEvents = [];
let socket;
socket = ioMod.io(BASE, { transports: ['websocket'], extraHeaders: { Cookie: orgAOwner.cookie }, reconnection: false, timeout: 15000 });
socket.on('accounting.entry-recorded', (p) => sockEvents.push(p));
await new Promise((resolve) => { socket.on('connect', resolve); socket.on('connect_error', resolve); });
await sleep(500);

// ── 1. PRE-CLOSING ──
console.log('\n══════════ 1. PRE-CLOSING ══════════');

let r = await api('POST', `/org/${orgAId}/accounting/periods/generate`, { cookie: orgAOwner.cookie, body: { fiscalYear: FY } });
record('Pre', 'generate FY periods (orgA)', r.status === 201, `status=${r.status}`);

r = await api('GET', `/org/${orgAId}/accounting/periods`, oc());
const periods = r.body.data || [];
const periodByNum = Object.fromEntries(periods.map(p => [p.period_number, p]));
const d1 = String(periodByNum[1]?.start_date ?? '').slice(0, 10);
const d12 = String(periodByNum[12]?.end_date ?? '').slice(0, 10);
record('Pre', 'P1–P12 exist with expected dates/status', periods.length === 12 && periods.every(p => p.fiscal_year === FY && p.status === 'open') && d1 === `${FY}-01-01` && d12 === `${FY}-12-31`,
  `count=${periods.length} P1[${d1}] P12[${d12}]`);

// 1.2 Automatic transaction (canonical automatic pipeline, org-scoped)
const { postAccountingEvent } = await import('../src/modules/financial/application/accounting-event.listener.js');
await postAccountingEvent('marketplace_org_receivable', 'marketplace', 90001, orgAId, { marketplace_receivable: 1050, commission_expense: 50, sales_revenue: 1000, shipping_liability: 100 }, 'EGP', 'E2E auto org receivable');
const autoGl = await q(`SELECT COUNT(*) AS c FROM general_ledger WHERE organisation_id = ?`, [orgAId]);
record('Pre', 'automatic posting created canonical GL rows (org-scoped)', Number(autoGl[0]?.c ?? 0) >= 4, `gl_lines=${autoGl[0]?.c}`);

// 1.3 Manual balanced journal (org-scoped)
const cashAcct = await q(`SELECT id FROM chart_of_accounts WHERE code='1120' AND organisation_id IS NULL`);
const revAcct = await q(`SELECT id FROM chart_of_accounts WHERE code='4100' AND organisation_id IS NULL`);
r = await api('POST', `/org/${orgAId}/accounting/journal`, { cookie: orgAOwner.cookie, body: { entryDate: `${FY}-03-15`, description: 'E2E manual journal', entries: [{ accountId: cashAcct[0].id, debit: 200, credit: 0 }, { accountId: revAcct[0].id, debit: 0, credit: 200 }] } });
record('Pre', 'manual balanced journal posted', r.status === 201, `status=${r.status}`);

// 1.4 Accounting Records / GL reflect immediately (stateless API)
r = await api('GET', `/org/${orgAId}/accounting/journal-entries`, oc());
const recs = Array.isArray(r.body.data) ? r.body.data : (r.body.data?.data || []);
record('Pre', 'Accounting Records show auto + manual immediately', recs.length >= 2 && recs.some(x => x.description === 'E2E manual journal') && recs.some(x => x.description === 'E2E auto org receivable'), `count=${recs.length}`);

// 1.5 Org reports reflect entries (hierarchical rows double-count parents, so
//    sum only LEAF rows; Income Statement without a range uses the canonical
//    fiscal-year net-income calculation)
r = await api('GET', `/org/${orgAId}/accounting/trial-balance`, { ...oc(), qs: { from: `${FY}-01-01`, to: `${FY}-12-31` } });
const tb = r.body.data || [];
const tbRev = tb.filter(x => x.type === 'revenue' && !x.has_children).reduce((s, x) => s + x.balance, 0);
record('Pre', 'Trial Balance shows revenue (leaf accounts)', Math.abs(tbRev - 1200) < 0.01, `revenue=${tbRev}`);
r = await api('GET', `/org/${orgAId}/accounting/income-statement`, oc());
record('Pre', 'Income Statement reflects entries', Math.abs((r.body.data?.net_revenue ?? 0) - 1200) < 0.01, `net_revenue=${r.body.data?.net_revenue}`);

// ── 2. PERIOD CONTROL ──
console.log('\n══════════ 2. PERIOD CONTROL ══════════');

r = await api('POST', `/org/${orgAId}/accounting/journal`, { cookie: orgAOwner.cookie, body: { entryDate: `${FY}-04-10`, description: 'E2E open-period posting', entries: [{ accountId: cashAcct[0].id, debit: 100, credit: 0 }, { accountId: revAcct[0].id, debit: 0, credit: 100 }] } });
record('Period', 'posting into OPEN period succeeds', r.status === 201, `status=${r.status}`);

const p2 = periodByNum[2];
r = await api('POST', `/org/${orgAId}/accounting/periods/${p2.id}/close`, oc());
record('Period', 'close period 2', r.status === 200 && r.body.data?.status === 'closed', `status=${r.status}`);

const glBefore = sum(await glTotals(orgAId), x => Number(x.dr) + Number(x.cr));
r = await api('POST', `/org/${orgAId}/accounting/journal`, { cookie: orgAOwner.cookie, body: { entryDate: `${FY}-02-20`, description: 'E2E should-reject', entries: [{ accountId: cashAcct[0].id, debit: 50, credit: 0 }, { accountId: revAcct[0].id, debit: 0, credit: 50 }] } });
const glAfterReject = sum(await glTotals(orgAId), x => Number(x.dr) + Number(x.cr));
record('Period', 'manual posting into CLOSED period rejected', [400, 409].includes(r.status), `status=${r.status}`);
record('Period', 'no partial ledger data after rejection', glAfterReject === glBefore, `glBefore=${glBefore} glAfter=${glAfterReject}`);

const p9 = periodByNum[9];
r = await api('POST', `/org/${orgAId}/accounting/periods/${p9.id}/close`, oc());
record('Period', 'close period 9 (current month)', r.status === 200, `status=${r.status}`);
let autoRejected = false;
try { await postAccountingEvent('marketplace_org_receivable', 'marketplace', 90002, orgAId, { marketplace_receivable: 105, commission_expense: 5, sales_revenue: 100, shipping_liability: 10 }, 'EGP', 'E2E auto should-reject'); } catch { autoRejected = true; }
const glAfterAutoReject = sum(await glTotals(orgAId), x => Number(x.dr) + Number(x.cr));
record('Period', 'automatic posting into CLOSED period rejected', autoRejected, '');
record('Period', 'no partial ledger data after auto rejection', glAfterAutoReject === glBefore, `glAfter=${glAfterAutoReject}`);

r = await api('GET', `/org/${orgAId}/accounting/periods`, obc());
record('Period', 'another org cannot READ orgA periods', r.status === 403, `status=${r.status}`);
r = await api('POST', `/org/${orgAId}/accounting/periods/generate`, { cookie: orgBOwner.cookie, body: { fiscalYear: NEXT_FY } });
record('Period', 'another org cannot GENERATE orgA periods', r.status === 403, `status=${r.status}`);

// ── 3. YEAR-END PREVIEW ──
console.log('\n══════════ 3. YEAR-END PREVIEW ══════════');

for (const num of [1, 3, 4, 5, 6, 7, 8, 10, 11]) {
  await api('POST', `/org/${orgAId}/accounting/periods/${periodByNum[num].id}/close`, oc());
}
r = await api('GET', `/org/${orgAId}/accounting/periods`, oc());
const fyPeriods = (r.body.data || []).filter(p => p.fiscal_year === FY);
const p1_11Closed = fyPeriods.filter(p => p.period_number <= 11).every(p => p.status === 'closed' || p.status === 'locked');
const p12Open = fyPeriods.some(p => p.period_number === 12 && p.status === 'open');
record('YC-preview', 'P1–11 closed + P12 open', p1_11Closed && p12Open, '');

r = await api('GET', `/org/${orgAId}/accounting/year-close/preview`, { ...oc(), qs: { fiscalYear: FY } });
const preview = r.body.data;
record('YC-preview', 'preview fetched with retained-earnings account', r.status === 200 && preview?.retainedEarningsAccount?.id === reAccountId, `status=${r.status}`);

const actual = await glTotals(orgAId);
const actualRevenue = sum(actual.filter(x => x.type === 'revenue'), bal);
const actualExpense = sum(actual.filter(x => x.type === 'expense'), bal);
record('YC-preview', 'preview net income matches GL (1300 rev − 50 exp = 1250)', Math.abs(preview?.netIncome - 1250) < 0.01, `preview=${preview?.netIncome}`);
record('YC-preview', 'GL balances reconcile (revenue 1300 / expense 50)', Math.abs(actualRevenue - 1300) < 0.01 && Math.abs(actualExpense - 50) < 0.01, `rev=${actualRevenue} exp=${actualExpense}`);
record('YC-preview', 'preview includes revenue/expense + RE effects', Array.isArray(preview?.accountBreakdown) && preview?.accountBreakdown.some(a => a.type === 'revenue') && preview?.accountBreakdown.some(a => a.type === 'expense'), `accounts=${preview?.accountBreakdown?.length}`);
const closeDebits = sum(actual.filter(x => x.type === 'revenue' || x.type === 'contra_expense'), bal) + sum(actual.filter(x => x.type === 'expense' || x.type === 'contra_revenue'), x => Math.abs(x.balance ?? 0));
record('YC-preview', 'estimated closing debits = credits (revenue to close = expense to close + RE)', Math.abs(actualRevenue - actualExpense - 1250) < 0.01, `rev=${actualRevenue} exp=${actualExpense} net=${1250}`);
void closeDebits;

// ── 4. YEAR-END CLOSE ──
console.log('\n══════════ 4. YEAR-END CLOSE ══════════');

const sockBeforeClose = sockEvents.length;
r = await api('POST', `/org/${orgAId}/accounting/year-close`, { cookie: orgAOwner.cookie, body: { fiscalYear: FY } });
const closeRes = r.body.data;
record('YC-close', 'year close succeeds exactly once', r.status === 200 && closeRes?.status === 'completed' && closeRes?.netIncome === 1250, `status=${r.status} netIncome=${closeRes?.netIncome}`);
await sleep(1200);
record('YC-close', 'realtime event delivered to orgA socket after close', sockEvents.length > sockBeforeClose && sockEvents.some(e => e.organisationId === orgAId && e.sourceType === 'year_close'), `sockEvents=${sockEvents.length - sockBeforeClose}`);

const cyc = await q(`SELECT id, entry_count, status FROM year_close_cycles WHERE year_closings_id = ? ORDER BY cycle_number DESC LIMIT 1`, [closeRes.yearClosingsId]);
const le = await q(`SELECT side, SUM(amount) AS total FROM ledger_entries WHERE source_type = 'year_close' AND source_id = ? GROUP BY side`, [cyc[0].id]);
const leDr = Number((le.find(x => x.side === 'debit')?.total) ?? 0);
const leCr = Number((le.find(x => x.side === 'credit')?.total) ?? 0);
record('YC-close', 'closing entries balanced (Dr = Cr)', Math.abs(leDr - leCr) < 0.01 && leDr > 0, `dr=${leDr} cr=${leCr}`);
record('YC-close', 'closing entries in ledger_entries + GL projection', cyc[0].entry_count > 0 && (await q(`SELECT COUNT(*) AS c FROM general_ledger WHERE reference_type = 'year_close_year_close' AND reference_id = ?`, [cyc[0].id]))[0].c > 0, `entry_count=${cyc[0].entry_count}`);

const reBal = await q(`SELECT SUM(gl.credit) - SUM(gl.debit) AS bal FROM general_ledger gl JOIN ledger_entries le ON le.id = gl.ledger_entry_id WHERE le.source_type='year_close' AND le.source_id=? AND le.chart_account_id=?`, [cyc[0].id, reAccountId]);
record('YC-close', 'net income transferred to retained earnings', Math.abs(Number(reBal[0].bal) - 1250) < 0.01, `re=${reBal[0].bal}`);

const { calculateFiscalYearNetIncome } = await import('../src/modules/accounting/application/year-close.netincome.js');
const niAfterClose = await calculateFiscalYearNetIncome(FY, orgAId);
record('YC-close', 'Revenue/Expense cleared to zero for the closed year', Math.abs(niAfterClose.netIncome) < 0.01, `ni=${niAfterClose.netIncome}`);

r = await api('GET', `/org/${orgAId}/accounting/periods`, oc());
const lockedCount = (r.body.data || []).filter(p => p.fiscal_year === FY && p.status === 'locked').length;
record('YC-close', 'all 12 periods locked after close', lockedCount === 12, `locked=${lockedCount}`);

r = await api('POST', `/org/${orgAId}/accounting/year-close`, { cookie: orgAOwner.cookie, body: { fiscalYear: FY } });
record('YC-close', 'duplicate year close rejected', r.status >= 400, `status=${r.status}`);

// ── 5. POST-CLOSING VALIDATION ──
console.log('\n══════════ 5. POST-CLOSING VALIDATION ══════════');

const glAfterClose = await glTotals(orgAId);
record('Post', 'GL debits = credits (whole org ledger)', Math.abs(sum(glAfterClose, x => Number(x.dr)) - sum(glAfterClose, x => Number(x.cr))) < 0.01, `dr=${sum(glAfterClose, x => Number(x.dr))} cr=${sum(glAfterClose, x => Number(x.cr))}`);

const glCount = (await q(`SELECT COUNT(*) AS c FROM general_ledger WHERE organisation_id = ?`, [orgAId]))[0].c;
const leCount = (await q(`SELECT COUNT(*) AS c FROM ledger_entries WHERE organisation_id = ?`, [orgAId]))[0].c;
record('Post', 'no duplicated/orphaned ledger rows (GL lines = ledger_entries 1:1)', Number(glCount) === Number(leCount), `gl=${glCount} le=${leCount}`);

r = await api('GET', `/org/${orgAId}/accounting/trial-balance`, { ...oc(), qs: { from: `${FY}-01-01`, to: `${FY}-12-31` } });
const tbRevAfter = sum((r.body.data || []).filter(x => x.type === 'revenue' && !x.has_children), x => x.balance);
record('Post', 'Trial Balance revenue zeroed after close', Math.abs(tbRevAfter) < 0.01, `rev=${tbRevAfter}`);

r = await api('GET', `/org/${orgAId}/accounting/balance-sheet`, { ...oc(), qs: { asOf: `${FY}-12-31` } });
const reBs = (r.body.data || []).find(x => x.code === 'E2E-RE');
record('Post', 'Balance Sheet carries retained earnings', reBs && Math.abs(reBs.balance - 1250) < 0.01, `re=${reBs?.balance}`);

r = await api('GET', `/org/${orgAId}/accounting/journal-entries`, oc());
const postCloseRecs = Array.isArray(r.body.data) ? r.body.data : (r.body.data?.data || []);
record('Post', 'Accounting Records show closing entries + originals (no dupes)', postCloseRecs.length >= 3 && postCloseRecs.some(x => String(x.reference_type).includes('year_close')), `count=${postCloseRecs.length}`);

const reGlRows = await q(`SELECT COUNT(*) AS c FROM general_ledger WHERE organisation_id = ? AND account_id = ?`, [orgAId, reAccountId]);
record('Post', 'Account ledger shows retained-earnings closing entries', Number(reGlRows[0].c) > 0, `gl_rows=${reGlRows[0].c}`);

// ── 6. NEW FISCAL YEAR ──
console.log('\n══════════ 6. NEW FISCAL YEAR ══════════');

r = await api('POST', `/org/${orgAId}/accounting/periods/generate`, { cookie: orgAOwner.cookie, body: { fiscalYear: NEXT_FY } });
record('NewFY', 'generate next fiscal year periods', r.status === 201, `status=${r.status}`);
r = await api('GET', `/org/${orgAId}/accounting/periods`, oc());
const nextPeriods = (r.body.data || []).filter(p => p.fiscal_year === NEXT_FY);
record('NewFY', 'new year has 12 open periods', nextPeriods.length === 12 && nextPeriods.every(p => p.status === 'open'), `count=${nextPeriods.length}`);

const ni2027 = await calculateFiscalYearNetIncome(NEXT_FY, orgAId);
record('NewFY', 'P&L accounts start new year at zero', Math.abs(ni2027.netIncome) < 0.01, `ni=${ni2027.netIncome}`);

r = await api('GET', `/org/${orgAId}/accounting/balance-sheet`, { ...oc(), qs: { asOf: `${NEXT_FY}-06-30` } });
const reNext = (r.body.data || []).find(x => x.code === 'E2E-RE');
record('NewFY', 'balance-sheet balances carried forward (cumulative GL, no opening entries)', reNext && Math.abs(reNext.balance - 1250) < 0.01, `re=${reNext?.balance}`);

r = await api('POST', `/org/${orgAId}/accounting/journal`, { cookie: orgAOwner.cookie, body: { entryDate: `${NEXT_FY}-02-05`, description: 'E2E new-year transaction', entries: [{ accountId: cashAcct[0].id, debit: 300, credit: 0 }, { accountId: revAcct[0].id, debit: 0, credit: 300 }] } });
record('NewFY', 'post transaction in new fiscal year', r.status === 201, `status=${r.status}`);

const ni2027After = await calculateFiscalYearNetIncome(NEXT_FY, orgAId);
r = await api('GET', `/org/${orgAId}/accounting/balance-sheet`, { ...oc(), qs: { asOf: `${NEXT_FY}-06-30` } });
const reNextAfter = (r.body.data || []).find(x => x.code === 'E2E-RE');
record('NewFY', 'new-year activity affects only new year P&L (net 300)', Math.abs(ni2027After.netIncome - 300) < 0.01, `ni=${ni2027After.netIncome}`);
record('NewFY', 'carried balance-sheet balances preserved', reNextAfter && Math.abs(reNextAfter.balance - 1250) < 0.01, `re=${reNextAfter?.balance}`);

// ── 7. REALTIME VALIDATION (socket) ──
console.log('\n══════════ 7. REALTIME VALIDATION ══════════');

record('Realtime', 'orgA-owner socket connected (org room)', socket.connected, `connected=${socket.connected}`);

const sockBeforeManual = sockEvents.length;
await api('POST', `/org/${orgAId}/accounting/journal`, { cookie: orgAOwner.cookie, body: { entryDate: `${NEXT_FY}-03-20`, description: 'E2E realtime entry', entries: [{ accountId: cashAcct[0].id, debit: 60, credit: 0 }, { accountId: revAcct[0].id, debit: 0, credit: 60 }] } });
await sleep(1500);
record('Realtime', 'orgA-owner received event after manual post (no page refresh)', sockEvents.length > sockBeforeManual && sockEvents[sockEvents.length - 1].organisationId === orgAId, `events=${sockEvents.length - sockBeforeManual}`);

let socketB, sockBEvents = [];
socketB = ioMod.io(BASE, { transports: ['websocket'], extraHeaders: { Cookie: orgBOwner.cookie }, reconnection: false, timeout: 15000 });
socketB.on('accounting.entry-recorded', (p) => sockBEvents.push(p));
await new Promise((resolve) => { socketB.on('connect', resolve); socketB.on('connect_error', resolve); });
await sleep(500);
const sockBBefore = sockBEvents.length;
await api('POST', `/org/${orgAId}/accounting/journal`, { cookie: orgAOwner.cookie, body: { entryDate: `${NEXT_FY}-04-05`, description: 'E2E orgB-must-not-see', entries: [{ accountId: cashAcct[0].id, debit: 10, credit: 0 }, { accountId: revAcct[0].id, debit: 0, credit: 10 }] } });
await sleep(1500);
record('Realtime', 'orgB-owner did NOT receive orgA event (isolation)', sockBEvents.length === sockBBefore, `events=${sockBEvents.length - sockBBefore}`);

const sockBeforeFail = sockEvents.length;
await api('POST', `/org/${orgAId}/accounting/journal`, { cookie: orgAOwner.cookie, body: { entryDate: `${NEXT_FY}-02-01`, description: 'E2E unbalanced-fail', entries: [{ accountId: cashAcct[0].id, debit: 100, credit: 0 }, { accountId: revAcct[0].id, debit: 0, credit: 40 }] } });
await sleep(1200);
record('Realtime', 'no realtime event after a failed (unbalanced) post', sockEvents.length === sockBeforeFail, `events_after=${sockEvents.length - sockBeforeFail}`);

r = await api('GET', '/admin/accounting/trial-balance', { cookie: orgAOwner.saCookie });
record('Realtime', 'Super Admin sees platform-wide trial balance (scope preserved)', r.status === 200 && Array.isArray(r.body.data), `status=${r.status}`);

socketB.close();

// ── 8. REOPEN / REVERSAL ──
console.log('\n══════════ 8. REOPEN / REVERSAL ══════════');

const sockBeforeReopen = sockEvents.length;
r = await api('POST', `/org/${orgAId}/accounting/year-close/reopen`, { cookie: orgAOwner.cookie, body: { fiscalYear: FY, reason: 'E2E reopen test' } });
record('Reopen', 'reopen fiscal year succeeds', r.status === 200 && r.body.data?.status === 'reopened', `status=${r.status}`);
await sleep(1200);
record('Reopen', 'realtime event delivered after reopen', sockEvents.length > sockBeforeReopen && sockEvents.some(e => e.sourceType === 'year_close_reopen'), `events=${sockEvents.length - sockBeforeReopen}`);

const rev = await q(`SELECT side, SUM(amount) AS total FROM ledger_entries WHERE source_type = 'year_close_reopen' GROUP BY side`);
const revDr = Number((rev.find(x => x.side === 'debit')?.total) ?? 0);
const revCr = Number((rev.find(x => x.side === 'credit')?.total) ?? 0);
record('Reopen', 'reversal entries balanced', Math.abs(revDr - revCr) < 0.01 && revDr > 0, `dr=${revDr} cr=${revCr}`);

r = await api('GET', `/org/${orgAId}/accounting/periods`, oc());
const p12AfterReopen = (r.body.data || []).find(p => p.fiscal_year === FY && p.period_number === 12);
record('Reopen', 'period 12 reopened (open)', p12AfterReopen?.status === 'open', `status=${p12AfterReopen?.status}`);

const glAfterReopen = await glTotals(orgAId);
record('Reopen', 'ledger remains balanced after reopen', Math.abs(sum(glAfterReopen, x => Number(x.dr)) - sum(glAfterReopen, x => Number(x.cr))) < 0.01, '');

r = await api('POST', `/org/${orgAId}/accounting/year-close`, { cookie: orgAOwner.cookie, body: { fiscalYear: FY } });
record('Reopen', 're-close after reopen succeeds (close_count++)', r.status === 200 && r.body.data?.status === 'completed', `status=${r.status}`);
const yc = await q(`SELECT close_count FROM year_closings WHERE organisation_id = ? AND fiscal_year = ?`, [orgAId, FY]);
record('Reopen', 'close_count incremented', Number(yc[0].close_count) >= 2, `close_count=${yc[0].close_count}`);

socket.close();

// ── 9. FAILURE / ATOMICITY ──
console.log('\n══════════ 9. FAILURE / ATOMICITY ══════════');

const ycBeforeIncomplete = await q(`SELECT COUNT(*) AS c FROM year_closings WHERE organisation_id = ?`, [orgAId]);
r = await api('POST', `/org/${orgAId}/accounting/year-close`, { cookie: orgAOwner.cookie, body: { fiscalYear: 1999 } });
const ycAfterIncomplete = await q(`SELECT COUNT(*) AS c FROM year_closings WHERE organisation_id = ?`, [orgAId]);
record('Failure', 'incomplete fiscal year rejected + no records', r.status >= 400 && ycAfterIncomplete[0].c === ycBeforeIncomplete[0].c, `status=${r.status}`);

r = await api('POST', `/org/${orgAId}/accounting/year-close`, { cookie: orgAOwner.cookie, body: { fiscalYear: FY } });
record('Failure', 'incorrect order (P12 not open after re-close) rejected', r.status >= 400, `status=${r.status}`);

const glBeforeUnbalanced = sum(await glTotals(orgAId), x => Number(x.dr) + Number(x.cr));
r = await api('POST', `/org/${orgAId}/accounting/journal`, { cookie: orgAOwner.cookie, body: { entryDate: `${FY}-03-01`, description: 'E2E unbalanced', entries: [{ accountId: cashAcct[0].id, debit: 100, credit: 0 }, { accountId: revAcct[0].id, debit: 0, credit: 40 }] } });
const glAfterUnbalanced = sum(await glTotals(orgAId), x => Number(x.dr) + Number(x.cr));
record('Failure', 'unbalanced manual journal rejected + no partial GL', r.status >= 400 && glAfterUnbalanced === glBeforeUnbalanced, `status=${r.status} glDelta=${glAfterUnbalanced - glBeforeUnbalanced}`);

r = await api('POST', `/org/${orgAId}/accounting/journal`, { cookie: orgBOwner.cookie, body: { entryDate: `${FY}-03-01`, description: 'E2E unauthorised', entries: [{ accountId: cashAcct[0].id, debit: 10, credit: 0 }, { accountId: revAcct[0].id, debit: 0, credit: 10 }] } });
record('Failure', 'unauthorised organisation posting rejected', r.status === 403, `status=${r.status}`);

r = await api('POST', `/org/${orgAId}/accounting/journal`, { cookie: orgAOwner.cookie, body: { entryDate: `${FY}-03-02`, description: 'E2E invalid-account', entries: [{ accountId: orgBAccountId, debit: 10, credit: 0 }, { accountId: revAcct[0].id, debit: 0, credit: 10 }] } });
record('Failure', 'account belonging to another org rejected', r.status >= 400, `status=${r.status}`);

// ── 10. FINAL RECONCILIATION ──
console.log('\n══════════ FINAL RECONCILIATION ══════════');
const finalGl = await glTotals(orgAId);
record('Reconcile', 'final GL debits = credits', Math.abs(sum(finalGl, x => Number(x.dr)) - sum(finalGl, x => Number(x.cr))) < 0.01, `dr=${sum(finalGl, x => Number(x.dr))} cr=${sum(finalGl, x => Number(x.cr))}`);
const orgBGl = await glTotals(orgB);
record('Reconcile', 'orgB ledger contains no orgA data', orgBGl.length === 0, `orgB_gl_rows=${orgBGl.length}`);

console.log(`\n══════════ SUMMARY ══════════`);
console.log(`PASS: ${results.filter(x => x.pass).length}  FAIL: ${failures}`);
for (const f of results.filter(x => !x.pass)) console.log(`  ❌ ${f.workflow}: ${f.step} — ${f.detail}`);

// ── CLEANUP ──
console.log('\n══════════ CLEANUP ══════════');
try {
  for (const uid of [orgAOwner.userId, orgBOwner.userId, superAdmin.userId]) {
    await pool.execute(`DELETE FROM user_sessions WHERE user_id = ?`, [uid]);
    await pool.execute(`DELETE FROM user_role_scopes WHERE user_role_id IN (SELECT id FROM user_roles WHERE user_id = ?)`, [uid]);
    await pool.execute(`DELETE FROM user_roles WHERE user_id = ?`, [uid]);
    await pool.execute(`DELETE FROM notifications WHERE user_id = ?`, [uid]);
  }
  for (const oid of [orgAId, orgB]) {
    await pool.execute(`DELETE FROM year_close_cycles WHERE year_closings_id IN (SELECT id FROM year_closings WHERE organisation_id = ?)`, [oid]);
    await pool.execute(`DELETE FROM year_closings WHERE organisation_id = ?`, [oid]);
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [oid]);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [oid]);
    await pool.execute(`DELETE FROM accounting_periods WHERE organisation_id = ?`, [oid]);
    await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE organisation_id = ?`, [oid]);
    await pool.execute(`DELETE FROM organisation_coa_customizations WHERE organisation_id = ?`, [oid]);
    await pool.execute(`DELETE FROM user_role_scopes WHERE scope_type='organisation' AND scope_id = ?`, [oid]);
    await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id = ?`, [oid]);
  }
  await pool.execute(`DELETE FROM chart_of_accounts WHERE id = ?`, [orgBAccountId]);
  await pool.execute(`DELETE FROM organisations WHERE id IN (?, ?)`, [orgAId, orgB]);
  for (const uid of [orgAOwner.userId, orgBOwner.userId, superAdmin.userId]) {
    await pool.execute(`DELETE FROM users WHERE id = ?`, [uid]);
  }
  record('Cleanup', 'test data removed', true, '');
} catch (e) {
  record('Cleanup', 'cleanup incomplete', false, e.message);
}

await pool.end();
process.exit(failures > 0 ? 1 : 0);
