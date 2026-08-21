import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  startContainers,
  runSchema,
  stopContainers,
  applyTestProcessEnv,
  type TestContext,
} from '../../../tests/helpers/integration-setup.js';
import { createPool, getPool } from '../../../database/mysql.js';
import { randomUUID } from 'node:crypto';

let ctx: TestContext;
let app: FastifyInstance;

function sessionCookie(res: { cookies: { name: string; value: string }[] }): string {
  const c = res.cookies.find((x) => x.name === 'session_token');
  if (!c) throw new Error('session_token cookie missing');
  return c.value;
}

async function registerPlayer(phone: string, email: string, name: string): Promise<string> {
  const reg = await app.inject({
    method: 'POST',
    url: '/auth/register-player',
    payload: {
      countryId: 1,
      phoneNumber: phone,
      password: 'test123456',
      fullName: name,
      email,
      gender: 'male',
      timezone: 'UTC',
      darkMode: 'system',
    },
  });
  expect([200, 201]).toContain(reg.statusCode);
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { phoneNumber: phone, countryCode: '+971', password: 'test123456' },
  });
  expect(login.statusCode).toBe(200);
  return sessionCookie(login);
}

async function userIdFor(phone: string): Promise<number> {
  const [rows] = await getPool().execute(
    `SELECT u.id FROM users u WHERE u.phone_number = ? ORDER BY u.id DESC LIMIT 1`,
    [phone],
  );
  return (rows as { id: number }[])[0].id;
}

async function createOrg(ownerId: number, name: string): Promise<number> {
  const [r] = await getPool().execute(
    `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active)
     VALUES (?, 1, ?, ?, ?, TRUE)`,
    [randomUUID(), ownerId, name, name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + randomUUID().slice(0, 4)],
  );
  return (r as { insertId: number }).insertId;
}

async function createBranch(orgId: number, name: string): Promise<number> {
  const [r] = await getPool().execute(
    `INSERT INTO branches (public_id, organisation_id, name, slug)
     VALUES (?, ?, ?, ?)`,
    [randomUUID(), orgId, name, name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + randomUUID().slice(0, 4)],
  );
  return (r as { insertId: number }).insertId;
}

async function createResource(branchId: number, name: string): Promise<number> {
  const [r] = await getPool().execute(
    `INSERT INTO resources (public_id, branch_id, resource_type_id, name, capacity, pricing_type)
     VALUES (?, ?, 1, ?, 1, 'per_hour')`,
    [randomUUID(), branchId, name],
  );
  return (r as { insertId: number }).insertId;
}

beforeAll(async () => {
  ctx = await startContainers();
  await runSchema(ctx.mysqlPort);
  applyTestProcessEnv(ctx);
  vi.resetModules();

  createPool({
    host: '127.0.0.1',
    port: ctx.mysqlPort,
    user: 'root',
    password: 'test',
    database: 'courtzon_test',
  });

  const mod = await import('../../../app.js');
  app = mod.app;
  await app.ready();
}, 120000);

afterAll(async () => {
  if (app) await app.close();
  const { closeRedisClient } = await import('../../../infrastructure/redis/redis.client.js');
  await closeRedisClient();
  await stopContainers();
}, 30000);

describe('A1 — temporary password reset is secured by default', () => {
  it('denies the unauthenticated temporary reset routes when env opt-in is off (default)', async () => {
    expect(process.env.AUTH_TEMPORARY_RESET_ENABLED).not.toBe('true');
    const verify = await app.inject({
      method: 'POST',
      url: '/auth/temporary-reset/verify',
      payload: { email: 'anyone@example.com' },
    });
    expect(verify.statusCode).toBe(403);
    const reset = await app.inject({
      method: 'POST',
      url: '/auth/temporary-reset',
      payload: { email: 'anyone@example.com', newPassword: 'newpass123456' },
    });
    expect(reset.statusCode).toBe(403);
  });

  it('keeps the legitimate token-based reset routes reachable (not gated by the env flag)', async () => {
    const forgot = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: 'nobody-exists@example.com' },
    });
    expect(forgot.statusCode).toBe(200);
  });
});

describe('A2 — marketplace order status IDOR', () => {
  let ownerToken: string;
  let strangerToken: string;
  let buyerToken: string;
  let ownerId: number;
  let strangerId: number;
  let orgId: number;
  let orderId: number;

  beforeAll(async () => {
    ownerToken = await registerPlayer('05111111101', 'order-owner@example.com', 'Order Owner');
    strangerToken = await registerPlayer('05111111102', 'order-stranger@example.com', 'Order Stranger');
    buyerToken = await registerPlayer('05111111103', 'order-buyer@example.com', 'Order Buyer');
    ownerId = await userIdFor('05111111101');
    strangerId = await userIdFor('05111111102');
    orgId = await createOrg(ownerId, 'Order Seller Org');
    const buyerId = await userIdFor('05111111103');
    const [r] = await getPool().execute(
      `INSERT INTO orders (public_id, buyer_id, status, payment_status, subtotal, total, currency_code)
       VALUES (?, ?, 'pending', 'unpaid', 100, 100, 'EGP')`,
      [randomUUID(), buyerId],
    );
    orderId = (r as { insertId: number }).insertId;
    await getPool().execute(
      `INSERT INTO order_items (order_id, product_id, seller_id, quantity, unit_price, total_price)
       VALUES (?, 1, ?, 1, 100, 100)`,
      [orderId, orgId],
    );
  });

  it('denies an unrelated user (stranger) even with marketplace.order.view', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/marketplace/orders/${orderId}/status`,
      cookies: { session_token: strangerToken },
      payload: { status: 'confirmed' },
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it('allows the seller/owner org to manage its own order', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/marketplace/orders/${orderId}/status`,
      cookies: { session_token: ownerToken },
      payload: { status: 'processing' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('allows the buyer to cancel their own order', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/marketplace/orders/${orderId}/cancel`,
      cookies: { session_token: buyerToken },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('A3 — cross-organisation booking mutation', () => {
  let ownerToken: string;
  let strangerToken: string;
  let ownerId: number;
  let strangerId: number;
  let orgId: number;
  let branchId: number;
  let resourceId: number;
  let bookingId: number;

  beforeAll(async () => {
    ownerToken = await registerPlayer('05111111111', 'booking-owner@example.com', 'Booking Owner');
    strangerToken = await registerPlayer('05111111112', 'booking-stranger@example.com', 'Booking Stranger');
    ownerId = await userIdFor('05111111111');
    strangerId = await userIdFor('05111111112');
    orgId = await createOrg(ownerId, 'Booking Org');
    branchId = await createBranch(orgId, 'Booking Branch');
    resourceId = await createResource(branchId, 'Court 1');
    const [r] = await getPool().execute(
      `INSERT INTO bookings (public_id, user_id, organisation_id, resource_id, branch_id, booking_type,
         booking_date, start_time, end_time, total_amount, booking_status, payment_status, payment_method)
       VALUES (?, ?, ?, ?, ?, 'public_match', '2027-01-01', '10:00:00', '11:00:00', 100, 'confirmed', 'paid', 'cash')`,
      [randomUUID(), ownerId, orgId, resourceId, branchId],
    );
    bookingId = (r as { insertId: number }).insertId;
  });

  it('denies a stranger (no org access) mutating the booking status', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/bookings/${bookingId}/status`,
      cookies: { session_token: strangerToken },
      payload: { status: 'cancelled' },
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it('denies a stranger mutating the booking payment status', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/bookings/${bookingId}/payment`,
      cookies: { session_token: strangerToken },
      payload: { paymentStatus: 'paid' },
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it('allows the org owner to mutate the booking status', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/bookings/${bookingId}/status`,
      cookies: { session_token: ownerToken },
      payload: { status: 'completed' },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('A4 — GET /admin/bookings organisation scope', () => {
  let ownerToken: string;
  let strangerToken: string;
  let ownerId: number;
  let orgId: number;

  beforeAll(async () => {
    ownerToken = await registerPlayer('05111111121', 'adminbook-owner@example.com', 'AB Owner');
    strangerToken = await registerPlayer('05111111122', 'adminbook-stranger@example.com', 'AB Stranger');
    ownerId = await userIdFor('05111111121');
    orgId = await createOrg(ownerId, 'Admin Booking Org');
    await createBranch(orgId, 'AB Branch');
  });

  it('denies a user querying an organisation they do not belong to', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/bookings?orgId=${orgId}`,
      cookies: { session_token: strangerToken },
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it('allows the org owner to query their own organisation', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/bookings?orgId=${orgId}`,
      cookies: { session_token: ownerToken },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('A5 — unified settlement preview/create organisation scope', () => {
  let ownerToken: string;
  let strangerToken: string;
  let ownerId: number;
  let orgId: number;

  beforeAll(async () => {
    ownerToken = await registerPlayer('05111111131', 'settle-owner@example.com', 'Settle Owner');
    strangerToken = await registerPlayer('05111111132', 'settle-stranger@example.com', 'Settle Stranger');
    ownerId = await userIdFor('05111111131');
    orgId = await createOrg(ownerId, 'Settle Org');
  });

  it('denies preview for an organisation the user does not belong to', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/unified-settlements/preview?orgId=${orgId}`,
      cookies: { session_token: strangerToken },
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it('denies create for an organisation the user does not belong to (no state change)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/unified-settlements',
      cookies: { session_token: strangerToken },
      payload: { orgId, excludeEntitlementIds: [], selectedEntitlementIds: [], batchCode: null, notes: null },
    });
    expect([403, 404]).toContain(res.statusCode);
  });
});

describe('A6 — branch financial details cross-organisation access', () => {
  let ownerToken: string;
  let strangerToken: string;
  let ownerId: number;
  let strangerId: number;
  let orgId: number;
  let branchId: number;

  beforeAll(async () => {
    ownerToken = await registerPlayer('05111111141', 'branchfin-owner@example.com', 'BF Owner');
    strangerToken = await registerPlayer('05111111142', 'branchfin-stranger@example.com', 'BF Stranger');
    ownerId = await userIdFor('05111111141');
    strangerId = await userIdFor('05111111142');
    orgId = await createOrg(ownerId, 'Branch Fin Org');
    branchId = await createBranch(orgId, 'BF Branch');
  });

  it('denies a stranger reading a branch financial details of another org', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/branches/${branchId}/financial-details`,
      cookies: { session_token: strangerToken },
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it('denies a stranger upserting a branch financial details of another org', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/branches/${branchId}/financial-details`,
      cookies: { session_token: strangerToken },
      payload: { accountHolderName: 'X', accountNumber: '123', bankName: 'Bank', iban: 'IBAN1' },
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it('allows the org owner to upsert their own branch financial details', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/branches/${branchId}/financial-details`,
      cookies: { session_token: ownerToken },
      payload: { accountHolderName: 'Owner', accountNumber: '999', bankName: 'Bank', iban: 'IBAN2' },
    });
    expect([200, 201]).toContain(res.statusCode);
  });
});

describe('A7 — GET /transactions/:id ownership', () => {
  let ownerToken: string;
  let strangerToken: string;
  let ownerId: number;
  let strangerId: number;
  let walletId: number;
  let txnId: number;

  beforeAll(async () => {
    ownerToken = await registerPlayer('05111111151', 'txn-owner@example.com', 'Txn Owner');
    strangerToken = await registerPlayer('05111111152', 'txn-stranger@example.com', 'Txn Stranger');
    ownerId = await userIdFor('05111111151');
    strangerId = await userIdFor('05111111152');
    const [wr] = await getPool().execute(
      `INSERT INTO user_wallets (user_id, balance) VALUES (?, 0)`,
      [ownerId],
    );
    walletId = (wr as { insertId: number }).insertId;
    const [tr] = await getPool().execute(
      `INSERT INTO transactions (type, source_type, source_id, total_amount, status)
       VALUES ('wallet_topup', 'wallet', 1, 50, 'completed')`,
    );
    txnId = (tr as { insertId: number }).insertId;
    await getPool().execute(
      `INSERT INTO transaction_entries (transaction_id, side, entity_type, entity_id, amount, currency_id)
       VALUES (?, 'credit', 'user_wallet', ?, 50, 2)`,
      [txnId, walletId],
    );
  });

  it('denies another user retrieving a wallet transaction by guessed id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/transactions/${txnId}`,
      cookies: { session_token: strangerToken },
    });
    expect(res.statusCode).toBe(404);
  });

  it('allows the wallet owner to retrieve their own transaction', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/transactions/${txnId}`,
      cookies: { session_token: ownerToken },
    });
    expect(res.statusCode).toBe(200);
  });
});
