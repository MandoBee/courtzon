#!/usr/bin/env node
/**
 * CourtZon E2E Smoke Tests — run against any environment
 *
 * Usage:
 *   E2E_BASE_URL=https://staging.courtzon.com E2E_API_URL=https://api-staging.courtzon.com node scripts/e2e-smoke.js
 *
 * Defaults to local Docker environment.
 *
 * Exits 0 if all pass, 1 if any fail.
 */

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const API = process.env.E2E_API_URL || 'http://localhost:3000';

let passed = 0;
let failed = 0;
const results = [];

async function request(method, url, opts = {}) {
  const resp = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    redirect: 'manual',
    ...opts.fetchOpts,
  });
  let body;
  try { body = await resp.json(); } catch { body = null; }
  return { status: resp.status, headers: resp.headers, body, ok: resp.ok };
}

function assert(label, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
    results.push({ label, status: 'pass' });
  } else {
    console.log(`  ❌ ${label} ${detail ? `— ${detail}` : ''}`);
    failed++;
    results.push({ label, status: 'fail', detail });
  }
}

async function step(num, name, fn) {
  console.log(`\n─── Step ${num}: ${name} ───`);
  try {
    await fn();
  } catch (err) {
    assert(`${name} threw`, false, err.message);
  }
}

async function main() {
  console.log(`CourtZon E2E Smoke Tests`);
  console.log(`Frontend: ${BASE}`);
  console.log(`API:      ${API}`);

  // ── 1. Registration & Login ──
  const ts = Date.now();
  const email = `e2e-${ts}@test.courtzon.com`;
  const password = 'TestPass123!';
  let sessionCookie = '';
  let orgId = '';
  let userId = '';
  let variantId = '';
  let orderId = '';

  await step(1, 'Health check', async () => {
    const r = await request('GET', `${API}/health`);
    assert('Health returns 200', r.status === 200);
    assert('Health has status field', r.body && r.body.status);
  });

  await step(2, 'Register new user', async () => {
    const r = await request('POST', `${API}/auth/register`, {
      body: {
        email,
        password,
        name: 'E2E Tester',
        organisationName: `E2E Org ${ts}`,
      },
    });
    assert('Register returns 201', r.status === 201);
    assert('Has session cookie', r.headers.get('set-cookie')?.length > 0);
    if (r.headers.get('set-cookie')) {
      sessionCookie = r.headers.get('set-cookie').split(';')[0];
    }
    userId = r.body?.user?.id || '';
    assert('Has user id', !!userId);
  });

  await step(3, 'Login with credentials', async () => {
    const r = await request('POST', `${API}/auth/login`, {
      body: { email, password },
    });
    assert('Login returns 200', r.status === 200);
    assert('Has session cookie on login', r.headers.get('set-cookie')?.length > 0);
    if (r.headers.get('set-cookie')) {
      sessionCookie = r.headers.get('set-cookie').split(';')[0];
    }
  });

  await step(4, 'Get current user / org', async () => {
    const r = await request('GET', `${API}/auth/me`, {
      headers: { Cookie: sessionCookie },
    });
    assert('Auth check returns 200', r.status === 200);
    orgId = r.body?.user?.organisationId || r.body?.organisation?.id || '';
    assert('Has organisation id', !!orgId);
  });

  // ── 5. Create product with variants ──
  await step(5, 'Create product with variants', async () => {
    const r = await request('POST', `${API}/marketplace/products`, {
      headers: { Cookie: sessionCookie },
      body: {
        name: `E2E Product ${ts}`,
        description: 'Created by E2E smoke test',
        price: 100,
        category: 'Rackets',
        variants: [
          { name: 'Standard', price: 100, stock: 10 },
          { name: 'Premium', price: 150, stock: 5 },
        ],
      },
    });
    assert('Product created', r.status === 201 || r.status === 200);
    const product = r.body?.product || r.body?.data || r.body || {};
    variantId = product.variants?.[0]?.id || product.id || '';
    assert('Has variant id', !!variantId);
    orgId = orgId || product.organisationId || '';
  });

  // ── 6. Place order ──
  await step(6, 'Place order', async () => {
    const r = await request('POST', `${API}/orders`, {
      headers: { Cookie: sessionCookie },
      body: {
        items: [{ variantId, quantity: 2 }],
        shippingAddress: '123 Test St, Cairo',
        paymentMethod: 'cod',
      },
    });
    assert('Order created', r.status === 201 || r.status === 200);
    orderId = r.body?.order?.id || r.body?.data?.id || '';
    assert('Has order id', !!orderId);
  });

  // ── 7. Upload file ──
  await step(7, 'Upload file', async () => {
    // Use fetch with FormData
    const formData = new FormData();
    const blob = new Blob(['test file content'], { type: 'text/plain' });
    formData.append('file', blob, 'test.txt');

    const r = await fetch(`${API}/upload`, {
      method: 'POST',
      headers: { Cookie: sessionCookie },
      body: formData,
    });
    assert('Upload returns 200/201', r.status === 200 || r.status === 201);
    const body = await r.json().catch(() => ({}));
    assert('Upload has file URL', !!body.url || !!body.fileUrl);
  });

  // ── 8. Session persistence ──
  await step(8, 'Session persists across calls', async () => {
    const r1 = await request('GET', `${API}/auth/me`, {
      headers: { Cookie: sessionCookie },
    });
    assert('First auth call succeeds', r1.status === 200);

    // Simulate page reload (new client but same cookie)
    const r2 = await request('GET', `${API}/auth/me`, {
      headers: { Cookie: sessionCookie },
    });
    assert('Second auth call also succeeds', r2.status === 200);
    assert('Same user across calls', r1.body?.user?.email === r2.body?.user?.email);
  });

  // ── 9. Multi-tenant isolation ──
  await step(9, 'Multi-tenant isolation (access control)', async () => {
    // Try to access another org's data — should 403
    const r = await request('GET', `${API}/organisations/999999`, {
      headers: { Cookie: sessionCookie },
    });
    // Should return 403 or 404, not 200 with data
    assert('Cannot access non-existent org', r.status !== 200 || r.status === 403 || r.status === 404);
  });

  // ── 10. Error handling ──
  await step(10, 'Error pages / error leakage', async () => {
    const r = await request('GET', `${API}/nonexistent-route-${ts}`);
    // Should 404, not 500
    assert('Unknown route returns 404', r.status === 404);
    // Should NOT leak stack trace
    const bodyStr = JSON.stringify(r.body || '');
    assert('No stack trace in error body', !bodyStr.includes('at ') && !bodyStr.includes('Error'));
  });

  // ── Summary ──
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`═══════════════════════════════════════════\n`);

  if (failed > 0) {
    console.log('Failed steps:');
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(`  ❌ ${r.label}${r.detail ? `: ${r.detail}` : ''}`);
    });
    process.exit(1);
  } else {
    console.log('✅ All E2E smoke tests passed!');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('E2E suite crashed:', err);
  process.exit(1);
});
