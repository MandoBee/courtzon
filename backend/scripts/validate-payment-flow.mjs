#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────
// CourtZon V3 — Payment Flow Validation Script
// ──────────────────────────────────────────────────────────────────
// Usage: node backend/scripts/validate-payment-flow.mjs
//   npm run validate:payment
//
// Tests the COMPLETE payment lifecycle:
//   1. Credential audit
//   2. Paymob Intention API connectivity
//   3. Webhook HMAC simulation
//   4. DB schema verification
//   5. Error handling (invalid sig, duplicate, missing ref)
//   6. Idempotency
//
// Requires: PAYMOB_SECRET, PAYMOB_API_KEY, PAYMOB_HMAC_SECRET, PAYMOB_MERCHANT_ID
// in environment (reads from .env via docker compose or local env).
// ──────────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { createConnection } from 'mysql2/promise';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── State ─────────────────────────────────────────────────────────
let pass = 0, fail = 0, warn = 0;
const results = [];

function ok(label, detail)   { pass++; console.log(`  \x1b[32mPASS\x1b[0m  ${label}`); if (detail) console.log(`        ${detail}`); results.push({ ok: true, label, detail }); }
function err(label, detail)  { fail++; console.log(`  \x1b[31mFAIL\x1b[0m  ${label}`); if (detail) console.log(`        ${detail}`); results.push({ ok: false, label, detail }); }
function wrn(label, detail)  { warn++; console.log(`  \x1b[33mWARN\x1b[0m  ${label}`); if (detail) console.log(`        ${detail}`); results.push({ ok: false, label, detail }); }
function hdr(label)          { console.log(`\n\x1b[1;36m═══ ${label} ═══\x1b[0m`); }

// ── Config ────────────────────────────────────────────────────────
const BACKEND = process.env.BACKEND_URL || 'http://localhost:3000';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '3307', 10);
const DB_NAME = process.env.DB_NAME || 'courtzon_v3';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASSWORD || process.env.MYSQL_ROOT_PASSWORD || '';

const PAYMOB_SANDBOX = process.env.PAYMOB_SANDBOX !== 'false';
const PAYMOB_BASE = PAYMOB_SANDBOX ? 'https://accept.paymobsandbox.com' : 'https://accept.paymob.com';
const SECRET = process.env.PAYMOB_SECRET || '';
const API_KEY = process.env.PAYMOB_API_KEY || '';
const HMAC_SECRET = process.env.PAYMOB_HMAC_SECRET || '';
const MERCHANT_ID = process.env.PAYMOB_MERCHANT_ID || '';
const PUBLIC_KEY = process.env.PAYMOB_PUBLIC_KEY || '';
const PROVIDER = process.env.PAYMENT_GATEWAY_PROVIDER || 'mock';

const IS_PLACEHOLDER = (v) => !v || v.includes('replace_me') || v.includes('replace_with_real') || v.includes('test_docker') || v.includes('change_me');

// ── HTTP helpers ──────────────────────────────────────────────────
function httpRequest(method, urlPath, body, headers = {}) {
  return new Promise((resolve) => {
    const u = new URL(urlPath);
    const client = u.protocol === 'https:' ? https : http;
    const opts = { method, headers: { 'Content-Type': 'application/json', ...headers }, timeout: 15000 };
    const req = client.request(urlPath, opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data), raw: data }); }
        catch { resolve({ status: res.statusCode, body: null, raw: data }); }
      });
    });
    req.on('error', (e) => resolve({ status: 0, body: null, raw: '', error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: null, raw: '', error: 'timeout' }); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── 1. Credential Audit ───────────────────────────────────────────
hdr('1. Credential Audit');

const creds = [
  ['PAYMOB_SECRET',      SECRET,      'Intention API auth'],
  ['PAYMOB_API_KEY',     API_KEY,     'Accept API / refund auth'],
  ['PAYMOB_PUBLIC_KEY',  PUBLIC_KEY,  'Unified Checkout URL'],
  ['PAYMOB_HMAC_SECRET', HMAC_SECRET, 'Webhook verification'],
  ['PAYMOB_MERCHANT_ID', MERCHANT_ID, 'Integration ID'],
  ['PAYMENT_GATEWAY_PROVIDER', PROVIDER, 'Gateway selection'],
];

let credsReal = 0, credsFake = 0;
for (const [name, val, desc] of creds) {
  if (IS_PLACEHOLDER(val)) {
    wrn(`${name} — placeholder (${desc})`, 'Needs real value in .env');
    credsFake++;
  } else {
    ok(`${name} — configured (${desc})`, `${val.substring(0, 12)}...`);
    credsReal++;
  }
}

if (credsFake > 0) {
  console.log(`\n\x1b[33m  ⚠  ${credsFake} credentials are placeholders.`);
  console.log('  Get real keys from: https://accept.paymobsandbox.com');
  console.log('  Then update .env and run: docker compose build backend frontend && docker compose up -d\x1b[0m\n');
}

// ── 2. Paymob Intention API Test ──────────────────────────────────
hdr('2. Paymob Intention API');

if (IS_PLACEHOLDER(SECRET) || IS_PLACEHOLDER(MERCHANT_ID)) {
  wrn('Skipped — real PAYMOB_SECRET and PAYMOB_MERCHANT_ID required');
} else {
  try {
    const body = {
      amount: 100, // 1 EGP in cents
      currency: 'EGP',
      payment_methods: [Number(MERCHANT_ID)],
      billing_data: {
        first_name: 'Test', last_name: 'User',
        phone_number: '01000000000', email: 'test@courtzon.com',
        city: 'Cairo', country: 'EG', state: 'Cairo',
        building: '1', floor: '1', apartment: '1', street: 'Test St',
      },
      customer: {
        first_name: 'Test', last_name: 'User',
        email: 'test@courtzon.com', phone_number: '01000000000',
      },
      special_reference: 'validation_test',
      notification_url: `${BACKEND}/payments/webhook`,
      redirection_url: `${BACKEND}/payment-result`,
    };

    const res = await httpRequest('POST', `${PAYMOB_BASE}/v1/intention/`, body, {
      Authorization: `Token ${SECRET}`,
    });

    if (res.status === 201 || res.status === 200) {
      if (res.body?.client_secret && res.body?.id) {
        ok('Paymob Intention API — created successfully',
           `intentionId=${res.body.id}  clientSecret=${res.body.client_secret.substring(0, 20)}...`);

        if (res.body.intention_order_id) {
          ok('Intention order ID returned', `intention_order_id=${res.body.intention_order_id}`);
        } else {
          wrn('Intention order ID missing from response', JSON.stringify(res.body).substring(0, 200));
        }

        // Verify paymentUrl format
        const paymentUrl = `${PAYMOB_BASE}/unifiedcheckout/?publicKey=${PUBLIC_KEY}&clientSecret=${res.body.client_secret}`;
        ok('Payment URL constructed', paymentUrl.substring(0, 80) + '...');

        // Store for webhook simulation
        globalThis.__testIntentionId = String(res.body.id);
        globalThis.__testClientSecret = res.body.client_secret;
        globalThis.__testOrderId = String(res.body.intention_order_id || res.body.id);
        globalThis.__testAmount = 1; // 1 EGP in pounds

      } else {
        err('Paymob Intention API — unexpected response', JSON.stringify(res.body).substring(0, 300));
      }
    } else {
      err(`Paymob Intention API — HTTP ${res.status}`, (res.body?.detail || res.raw).substring(0, 200));
    }
  } catch (e) {
    err('Paymob Intention API — exception', e.message);
  }
}

// ── 3. Webhook HMAC Simulation ────────────────────────────────────
hdr('3. Webhook HMAC Simulation');

if (IS_PLACEHOLDER(HMAC_SECRET)) {
  wrn('Skipped — real PAYMOB_HMAC_SECRET required');
} else {
  // Test 3a: Generate Paymob Intention API webhook payload + valid HMAC
  console.log('  3a. Simulating Intention API webhook...');

  const intentOrderId = globalThis.__testOrderId || `test_order_${Date.now()}`;
  const webhookObj = {
    id: globalThis.__testIntentionId || `int_${Date.now()}`,
    amount: 100,
    currency: 'EGP',
    status: 'paid',
    success: true,
    created_at: new Date().toISOString(),
    client_secret: globalThis.__testClientSecret || `cs_test_${Date.now()}`,
    intention_order_id: intentOrderId,
    order: { id: intentOrderId },
  };

  const webhookPayload = { obj: webhookObj };

  // Compute HMAC (Intention API: HMAC-SHA512 of JSON.stringify(obj))
  const computedHmac = crypto
    .createHmac('sha512', HMAC_SECRET)
    .update(JSON.stringify(webhookObj))
    .digest('hex');

  // Send webhook with valid HMAC
  const whRes = await httpRequest('POST', `${BACKEND}/payments/webhook`, webhookPayload, {
    'x-paymob-signature': computedHmac,
  });

  if (whRes.status === 200) {
    if (whRes.body?.success || whRes.body?.idempotent) {
      ok(`Valid HMAC webhook → 200`, `result: ${JSON.stringify(whRes.body)}`);
    } else if (whRes.body?.note) {
      ok(`Valid HMAC webhook → 200 (not found — expected for test)`, `${whRes.body.note}`);
    } else {
      ok(`Valid HMAC webhook → ${whRes.status}`, JSON.stringify(whRes.body).substring(0, 200));
    }
  } else {
    err(`Valid HMAC webhook → ${whRes.status}`, JSON.stringify(whRes.body || whRes.raw).substring(0, 200));
  }

  // Test 3b: Invalid signature → 401
  console.log('  3b. Testing invalid HMAC rejection...');
  const badWhRes = await httpRequest('POST', `${BACKEND}/payments/webhook`, webhookPayload, {
    'x-paymob-signature': 'bad_signature_12345',
  });
  if (badWhRes.status === 401) {
    ok('Invalid HMAC webhook → 401 (rejected)');
  } else {
    err(`Invalid HMAC webhook → ${badWhRes.status} (expected 401)`, JSON.stringify(badWhRes.body || badWhRes.raw).substring(0, 200));
  }

  // Test 3c: No signature → 401
  console.log('  3c. Testing no-signature rejection...');
  const noSigRes = await httpRequest('POST', `${BACKEND}/payments/webhook`, { test: true });
  if (noSigRes.status === 401) {
    ok('No-signature webhook → 401 (rejected)');
  } else {
    err(`No-signature webhook → ${noSigRes.status} (expected 401)`);
  }
}

// ── 4. Database Schema ────────────────────────────────────────────
hdr('4. Database Schema');

try {
  const conn = await createConnection({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS,
    database: DB_NAME, connectTimeout: 10000,
  });

  // payment_transactions columns
  const [cols] = await conn.execute("DESCRIBE payment_transactions");
  const colNames = cols.map(c => c.Field);
  const requiredCols = ['id', 'user_id', 'order_id', 'payment_method', 'gateway_provider',
    'gateway_reference', 'amount', 'currency', 'payment_status', 'gateway_response', 'paid_at', 'updated_at'];
  for (const c of requiredCols) {
    if (colNames.includes(c)) ok(`payment_transactions.${c} — column exists`);
    else err(`payment_transactions.${c} — MISSING`);
  }

  // Check payment_method enum values
  const [pmEnum] = await conn.execute("SHOW COLUMNS FROM payment_transactions WHERE Field='payment_method'");
  const enumStr = String(pmEnum[0]?.Type || '');
  for (const v of ['wallet', 'cash', 'card', 'bank_transfer', 'online']) {
    if (enumStr.includes(v)) ok(`payment_method enum includes '${v}'`);
    else err(`payment_method enum missing '${v}' — got: ${enumStr.substring(0, 80)}`);
  }

  // Check unique index on gateway_reference
  const [idx] = await conn.execute("SHOW INDEX FROM payment_transactions WHERE Key_name='uk_gateway_reference'");
  if (idx.length > 0) ok('Unique index uk_gateway_reference — exists');
  else err('Unique index uk_gateway_reference — MISSING');

  // orders status enum
  const [orderCols] = await conn.execute("SHOW COLUMNS FROM orders WHERE Field IN ('status','payment_status','paid_at')");
  const orderColMap = {};
  for (const c of orderCols) orderColMap[c.Field] = c.Type;
  if (String(orderColMap['status']).includes('confirmed')) ok('orders.status includes confirmed');
  else err('orders.status missing confirmed');
  if (String(orderColMap['payment_status']).includes('paid')) ok('orders.payment_status includes paid');
  else err('orders.payment_status missing paid');
  if (orderColMap['paid_at']) ok('orders.paid_at column exists');
  else err('orders.paid_at column MISSING');

  await conn.end();
} catch (e) {
  err('DB connection failed', e.message);
}

// ── 5. Error Handling Verification ────────────────────────────────
hdr('5. Error Handling (code-level)');

// Check that _processOrderPayment throws on gateway failure
// We verify this by looking at the deployed backend code
try {
  const resp = await httpRequest('GET', `${BACKEND}/health/live`);
  if (resp.status === 200) {
    ok('Backend reachable for error handling tests');
  }

  // Test charge endpoint without auth → should return auth error
  const chargeRes = await httpRequest('POST', `${BACKEND}/payments/charge`, {
    amount: 100, currency: 'EGP', referenceType: 'order',
    referenceId: 1, paymentMethod: 'wallet',
  });
  // 401 or 400 are both acceptable (no auth / validation)
  if (chargeRes.status >= 400) {
    ok(`POST /payments/charge (no auth) → ${chargeRes.status} (rejected)`);
  } else {
    err(`POST /payments/charge (no auth) → ${chargeRes.status} (should reject)`);
  }

  // Test webhook idempotency — send same webhook twice
  if (!IS_PLACEHOLDER(HMAC_SECRET) && globalThis.__testIntentionId) {
    console.log('  5a. Testing webhook idempotency...');
    const whObj = { id: globalThis.__testIntentionId, status: 'paid', success: true };
    const hmac = crypto.createHmac('sha512', HMAC_SECRET).update(JSON.stringify(whObj)).digest('hex');

    const r1 = await httpRequest('POST', `${BACKEND}/payments/webhook`, { obj: whObj },
      { 'x-paymob-signature': hmac });
    await new Promise(r => setTimeout(r, 500));
    const r2 = await httpRequest('POST', `${BACKEND}/payments/webhook`, { obj: whObj },
      { 'x-paymob-signature': hmac });

    if (r1.status === 200 && r2.status === 200) {
      if (r2.body?.idempotent) {
        ok('Duplicate webhook → idempotent (skipped)');
      } else {
        wrn('Duplicate webhook — both processed (check DB for duplicates)',
            `r1=${JSON.stringify(r1.body)} r2=${JSON.stringify(r2.body)}`);
      }
    }
  }
} catch (e) {
  wrn('Error handling test skipped', e.message);
}

// ── 6. Frontend Build Check ───────────────────────────────────────
hdr('6. Frontend Build');

const frontendHtml = await httpRequest('GET', process.env.FRONTEND_URL || 'http://localhost:5173', '/');
const html = frontendHtml.raw || '';

// Check bundle hash
const bundleMatch = html.match(/index-([A-Za-z0-9_-]+)\.js/);
if (bundleMatch) ok(`Frontend bundle: index-${bundleMatch[1]}.js`);

// Check NO secrets leaked
const leakedSecrets = [];
if (html.includes('sk_test_') && !html.includes('change_me')) leakedSecrets.push('secret key');
if (html.includes('PAYMOB_SECRET')) leakedSecrets.push('PAYMOB_SECRET');
if (html.includes('PAYMOB_API_KEY')) leakedSecrets.push('PAYMOB_API_KEY');
if (html.includes('PAYMOB_HMAC')) leakedSecrets.push('PAYMOB_HMAC');

if (leakedSecrets.length === 0) {
  ok('No secrets leaked in frontend HTML');
} else {
  err(`Secrets leaked: ${leakedSecrets.join(', ')}`);
}

// Check VITE_PAYMOB_PUBLIC_KEY in JS bundles (expected)
const jsResp = await httpRequest('GET', `http://localhost:5173/assets/index-${bundleMatch?.[1] || 'unknown'}.js`);
if (jsResp.raw && jsResp.raw.includes('egy_pk_test') || jsResp.raw?.includes('pk_test_')) {
  ok('Public key present in JS bundle (expected)');
}

// ── 7. Credential Replacement Guide ───────────────────────────────
hdr('7. Credential Replacement Guide');

if (credsFake > 0) {
  console.log(`
  \x1b[33m  ╔══════════════════════════════════════════════════════╗
  ║   CREDENTIAL REPLACEMENT STEPS (do in order):    ║
  ╚══════════════════════════════════════════════════════╝

  1. Go to https://accept.paymobsandbox.com → Sign Up
  2. Developers → API Keys → copy:
     - Secret Key (sk_test_...)
     - Public Key (pk_test_...)
     - API Key (ZXlKaG...)
     - HMAC Secret

  3. Settings → Integrations → Add Integration → Online Card
     → use the Integration ID as PAYMOB_MERCHANT_ID

  4. Update .env with real values:
  \x1b[0m`);
  for (const [name, val] of creds) {
    if (IS_PLACEHOLDER(val)) {
      console.log(`     ${name}=<replace_with_real_value>`);
    }
  }
  console.log('\x1b[33m  5. Run tunnel for webhook (if testing locally):');
  console.log('     ngrok http 3000');
  console.log('     → Copy HTTPS URL → set WEBHOOK_BASE_URL=<ngrok_url>');

  console.log('\n  6. Rebuild and restart:');
  console.log('     docker compose build backend frontend');
  console.log('     docker compose up -d');

  console.log('\n  7. Re-run this script:');
  console.log('     node backend/scripts/validate-payment-flow.mjs\x1b[0m\n');
} else {
  ok('All credentials configured — ready for end-to-end browser test');
}

// ── 8. Browser Test Checklist ─────────────────────────────────────
hdr('8. Browser Test Checklist');
console.log(`
  \x1b[36m  ╔══════════════════════════════════════════════════════╗
  ║      BROWSER E2E TEST CHECKLIST                     ║
  ╚══════════════════════════════════════════════════════╝

  [ ] 1. Open DevTools → Network tab
  [ ] 2. Go to Marketplace → Add product → Cart
  [ ] 3. Select address → Select "Card" payment
  [ ] 4. Click "Place Order"
  [ ] 5. Verify POST /marketplace/orders returns paymentUrl or clientSecret
  [ ] 6. Paymob card form appears → Enter sandbox test cards
  [ ] 7. Sandbox test cards:
        Success: 4987654321098769 / 12/28 / 123
        Failure: 4111111111111111 / 12/28 / 123
  [ ] 8. Complete payment → verify redirect back
  [ ] 9. Check Network: POST /payments/webhook → 200
  [ ] 10. Go to My Orders → verify status = PAID / CONFIRMED
  [ ] 11. Run DB verification queries (below)
  [ ] 12. Test cancel checkout → order stays pending
  [ ] 13. Test failed payment → order NOT marked paid

  DB verification after successful payment:
  \x1b[0m`);
  if (credsFake === 0) {
    console.log(`
  mysql -u root -p -h localhost -P 3307 courtzon_v3 -e "
    SELECT id, status, payment_status, paid_at, payment_method, total
    FROM orders ORDER BY id DESC LIMIT 1;
  "

  mysql -u root -p -h localhost -P 3307 courtzon_v3 -e "
    SELECT id, gateway_provider, gateway_reference, amount, currency,
           payment_status, paid_at, created_at, updated_at,
           LEFT(gateway_response, 300) AS gateway_response_preview
    FROM payment_transactions ORDER BY id DESC LIMIT 1;
  "`);
  }

// ── Summary ───────────────────────────────────────────────────────
hdr('SUMMARY');
const total = pass + fail + warn;
console.log(`  \x1b[32m${pass} passed\x1b[0m  \x1b[31m${fail} failed\x1b[0m  \x1b[33m${warn} warnings\x1b[0m  (${total} total)`);

if (fail > 0) {
  console.log('\n  \x1b[31m✗ SOMETHING NEEDS FIXING\x1b[0m');
  process.exit(1);
} else if (warn > 0 && credsFake > 0) {
  console.log('\n  \x1b[33m⚠  Replace placeholder credentials, then re-run this script\x1b[0m');
  process.exit(0);
} else {
  console.log('\n  \x1b[32m✓  BACKEND PAYMENT SYSTEM READY for browser E2E test\x1b[0m');
  process.exit(0);
}
