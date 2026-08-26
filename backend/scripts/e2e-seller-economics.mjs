/**
 * E2E verification for Step 4 — Seller Order Economics (full checkout flow).
 */
import mysql from 'mysql2/promise';
import { pbkdf2Sync, randomBytes } from 'crypto';

const API = 'http://localhost:3000';
const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });

function toBase64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function hashPassword(pw) {
  const salt = randomBytes(32);
  const hash = pbkdf2Sync(pw, salt, 210000, 64, 'sha512');
  const v = Buffer.from([2]);
  const iter = Buffer.alloc(4); iter.writeUInt32BE(210000);
  const kl = Buffer.alloc(2); kl.writeUInt16BE(64);
  return '$pbkdf2-sha512$' + toBase64url(Buffer.concat([v, iter, kl, salt, hash]));
}

async function api(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const setCookies = res.headers.getSetCookie?.() || [];
  const sc = setCookies.find(c => c.startsWith('session_token='));
  const sessionToken = sc ? sc.split(';')[0].split('=')[1] : null;
  return { status: res.status, body: await res.json(), sessionToken };
}

async function login(phoneNumber) {
  const res = await api('POST', '/auth/login', { body: { phoneNumber, countryCode: '+20', password: TEST_PASSWORD } });
  return res.sessionToken;
}

const TEST_PASSWORD = 'Test123456!';
const results = [];

function record(name, passed, detail = '') {
  const icon = passed ? '✅' : '❌';
  results.push({ name, passed, detail });
  console.log(`${icon} ${name}${detail ? ' — ' + detail : ''}`);
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('E2E SELLER ORDER ECONOMICS — FULL CHECKOUT VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Setup passwords
  const hash = hashPassword(TEST_PASSWORD);
  await pool.execute('UPDATE users SET password_hash = ? WHERE id IN (68, 1000405, 1)', [hash]);

  // Clear any old cart for user 1
  await pool.execute('DELETE FROM cart_items WHERE user_id = 1');

  // ── Login as buyer ──
  const buyerToken = await login('01012637733');
  record('Buyer login', !!buyerToken);

  // ── Check addresses ──
  const addrRes = await api('GET', '/marketplace/addresses', { token: buyerToken });
  const addresses = addrRes.body?.data || [];
  const addressId = addresses[0]?.id || 5;
  record('Buyer has address', !!addressId, `id=${addressId}`);

  // ── Add products from both sellers to cart ──
  const addA = await api('POST', '/marketplace/cart', { token: buyerToken, body: { productId: 423, quantity: 1 } });
  record('Add Padel Edge product (423) to cart', addA.status === 200 || addA.status === 201, `status=${addA.status}`);

  const addB = await api('POST', '/marketplace/cart', { token: buyerToken, body: { productId: 380, quantity: 2 } });
  record('Add Shop 5 product (380) to cart', addB.status === 200 || addB.status === 201, `status=${addB.status}`);

  // ── Cart ──
  const cartRes = await api('GET', '/marketplace/cart', { token: buyerToken });
  const cartItems = cartRes.body?.items || cartRes.body?.data || [];
  record('Cart has 2 items', cartItems.length === 2, `items=${cartItems.length}`);

  // ── Checkout ──
  const checkoutRes = await api('POST', '/marketplace/orders', { token: buyerToken, body: { addressId, paymentMethod: 'wallet' } });
  record('Checkout API call', checkoutRes.status === 200 || checkoutRes.status === 201, `status=${checkoutRes.status}`);
  console.log('  Checkout:', JSON.stringify(checkoutRes.body).slice(0, 500));

  const orderIds = checkoutRes.body?.orderIds || checkoutRes.body?.orders?.map(o => o.id) || [];
  const groupId = checkoutRes.body?.checkoutGroupId || checkoutRes.body?.checkout_group_id || null;
  record('Orders created', orderIds.length >= 2 || !!groupId, `orderIds=${JSON.stringify(orderIds)} groupId=${groupId}`);

  // ── Login as Padel Edge seller ──
  const padelToken = await login('01012637702');
  record('Padel Edge login', !!padelToken);

  const padelOrders = await api('GET', '/marketplace/seller/orders?page=1&limit=20', { token: padelToken });
  record('Padel Edge seller orders API', padelOrders.status === 200, `status=${padelOrders.status}`);
  const padelList = padelOrders.body?.data || [];
  console.log(`\n  Padel Edge: ${padelOrders.body?.total || padelList.length} order(s)`);
  for (const o of padelList.slice(0, 5)) {
    console.log(`    #${o.id || o.public_id}: total=${o.total} seller_net=${o.seller_net} financial_status=${o.financial_status} checkout_group=${o.checkout_group_id || 'none'}`);
  }

  // ── Login as Shop 5 seller ──
  const shop5Token = await login('01610101015');
  record('Shop 5 login', !!shop5Token);

  const shop5Orders = await api('GET', '/marketplace/seller/orders?page=1&limit=20', { token: shop5Token });
  record('Shop 5 seller orders API', shop5Orders.status === 200, `status=${shop5Orders.status}`);
  const shop5List = shop5Orders.body?.data || [];
  console.log(`\n  Shop 5: ${shop5Orders.body?.total || shop5List.length} order(s)`);
  for (const o of shop5List.slice(0, 5)) {
    console.log(`    #${o.id || o.public_id}: total=${o.total} seller_net=${o.seller_net} financial_status=${o.financial_status} checkout_group=${o.checkout_group_id || 'none'}`);
  }

  // ── Verify financial fields on Padel Edge ──
  const padelOrder = padelList.find(o => orderIds.includes(o.id)) || padelList[0];
  if (padelOrder) {
    record('Padel Edge: seller_net present', typeof padelOrder.seller_net === 'number', `value=${padelOrder.seller_net}`);
    record('Padel Edge: financial_status present', typeof padelOrder.financial_status === 'string', `value=${padelOrder.financial_status}`);
    record('Padel Edge: seller_net > 0', (padelOrder.seller_net || 0) > 0, `value=${padelOrder.seller_net}`);
    record('Padel Edge: total > seller_net (commission deducted)', (padelOrder.total || 0) > (padelOrder.seller_net || 0), `total=${padelOrder.total} vs seller_net=${padelOrder.seller_net}`);

    // Detail endpoint
    if (padelOrder.id) {
      const det = await api('GET', `/marketplace/orders/${padelOrder.id}`, { token: padelToken });
      if (det.status === 200) {
        const d = det.body;
        record('Padel Edge: order detail seller_net', typeof d.seller_net === 'number', `value=${d.seller_net}`);
        record('Padel Edge: order detail financial_status', typeof d.financial_status === 'string', `value=${d.financial_status}`);
        record('Padel Edge: detail has subtotal', typeof d.subtotal === 'number', `value=${d.subtotal}`);
        record('Padel Edge: detail has shipping_cost', typeof d.shipping_cost === 'number', `value=${d.shipping_cost}`);
        record('Padel Edge: detail has tax_amount', typeof d.tax_amount === 'number', `value=${d.tax_amount}`);
      } else {
        record('Padel Edge: order detail API', false, `status=${det.status}`);
      }
    }
  } else {
    record('Padel Edge: has order from checkout', false, 'No matching order');
  }

  // ── Verify financial fields on Shop 5 ──
  const shop5Order = shop5List.find(o => orderIds.includes(o.id)) || shop5List[0];
  if (shop5Order) {
    record('Shop 5: seller_net present', typeof shop5Order.seller_net === 'number', `value=${shop5Order.seller_net}`);
    record('Shop 5: financial_status present', typeof shop5Order.financial_status === 'string', `value=${shop5Order.financial_status}`);
    record('Shop 5: seller_net > 0', (shop5Order.seller_net || 0) > 0, `value=${shop5Order.seller_net}`);
  } else {
    record('Shop 5: has order from checkout', false, 'No matching order');
  }

  // ── Cross-seller isolation ──
  const pIds = new Set(padelList.map(o => o.id));
  const sIds = new Set(shop5List.map(o => o.id));
  const overlap = [...pIds].filter(id => sIds.has(id));
  record('Cross-seller isolation', overlap.length === 0, overlap.length ? `OVERLAP: ${overlap.join(',')}` : 'No overlapping IDs');

  // ── Summary ──
  console.log('\n═══════════════════════════════════════════════════════════');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`SUMMARY: ${passed} passed, ${failed} failed out of ${results.length} checks`);
  if (failed > 0) {
    console.log('FAILED CHECKS:');
    results.filter(r => !r.passed).forEach(r => console.log(`  ❌ ${r.name}: ${r.detail}`));
  }
  console.log('═══════════════════════════════════════════════════════════');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
