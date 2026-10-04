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

let ctx: TestContext;
let app: FastifyInstance;

function sessionCookie(res: { cookies: { name: string; value: string }[] }): string {
  const c = res.cookies.find((x) => x.name === 'session_token');
  if (!c) throw new Error('session_token cookie missing');
  return c.value;
}

async function registerAndLogin(phone: string, fullName: string) {
  const reg = await app.inject({
    method: 'POST',
    url: '/auth/register-player',
    payload: { countryId: 1, countryCode: '+20', phoneNumber: phone, password: 'test123456', fullName, email: `${phone.replace(/\D/g, '')}@example.com`, gender: 'male', timezone: 'UTC', darkMode: 'system' },
  });
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { phoneNumber: phone, countryCode: '+20', password: 'test123456' },
  });
  if (login.statusCode !== 200 || reg.statusCode >= 300) throw new Error(`register/login failed: reg=${reg.statusCode} login=${login.statusCode}`);
  const body = login.json() as { user?: { id?: number } };
  return { token: sessionCookie(login), userId: Number(body.user?.id) };
}

async function createOrg(ownerId: number, name: string, slug: string): Promise<number> {
  const pool = getPool();
  const [res] = await pool.execute<any>(
    `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), 1, ?, ?, ?, 1)`,
    [ownerId, name, slug],
  );
  return res.insertId;
}

async function pollSubscriptionStatus(subscriptionId: number, expected: string, attempts = 60): Promise<string> {
  const pool = getPool();
  for (let i = 0; i < attempts; i++) {
    const [rows] = await pool.execute<any>('SELECT status FROM membership_subscriptions WHERE id = ?', [subscriptionId]);
    if ((rows[0]?.status) === expected) return rows[0].status;
    await new Promise((r) => setTimeout(r, 250));
  }
  const [rows] = await pool.execute<any>('SELECT status FROM membership_subscriptions WHERE id = ?', [subscriptionId]);
  return rows[0]?.status;
}

async function countLedger(sourceId: number, eventTypeLike: string): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.execute<any>(
    `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type = 'membership' AND source_id = ? AND event_type LIKE ?`,
    [sourceId, `${eventTypeLike}%`],
  );
  return Number(rows[0].c);
}

async function waitForLedger(sourceId: number, eventTypeLike: string, min = 1, attempts = 60): Promise<number> {
  for (let i = 0; i < attempts; i++) {
    const c = await countLedger(sourceId, eventTypeLike);
    if (c >= min) return c;
    await new Promise((r) => setTimeout(r, 250));
  }
  return countLedger(sourceId, eventTypeLike);
}

const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Deterministic wait (tournament/booking accounting harness pattern). */
async function waitFor<T>(probe: () => Promise<T>, isReady: (value: T) => boolean, what: string, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await probe();
  while (!isReady(value) && Date.now() < deadline) {
    await sleepMs(100);
    value = await probe();
  }
  if (!isReady(value)) throw new Error(`Timed out waiting for ${what} (last=${JSON.stringify(value)})`);
  return value;
}

async function emitMembershipPaid(subscriptionId: number, paymentMethod: string, amount: number, currency: string): Promise<void> {
  const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
  await eventBusV2.emit('payment:succeeded', {
    referenceType: 'membership_subscription',
    referenceId: subscriptionId,
    paymentId: 0,
    amount,
    metadata: { paymentMethod, currency },
  } as Record<string, unknown>, {
    aggregateType: 'payment_transaction', aggregateId: String(subscriptionId), aggregateVersion: 1,
  });
}

beforeAll(async () => {
  ctx = await startContainers();
  await runSchema(ctx.mysqlPort);
  applyTestProcessEnv(ctx);
  vi.resetModules();
  createPool({ host: '127.0.0.1', port: ctx.mysqlPort, user: 'root', password: 'test', database: 'courtzon_test' });
  const mod = await import('../../../app.js');
  app = mod.app;
  await app.ready();
  // Deterministic accounting harness (same explicit registration used by the
  // tournament/booking accounting integrations). Idempotent guards make these
  // no-ops when the full app already registered them at boot.
  const { registerAccountingEventListeners } = await import('../../../modules/financial/application/accounting-event.listener.js');
  registerAccountingEventListeners();
  const { registerMembershipP1Lifecycle } = await import('../application/membership-p1.listeners.js');
  registerMembershipP1Lifecycle();
}, 240000);

afterAll(async () => {
  if (app) await app.close();
  const { closeRedisClient } = await import('../../../infrastructure/redis/redis.client.js');
  await closeRedisClient();
  await stopContainers();
}, 30000);

describe('G11.22 P1 — membership plans + subscriptions (full payment)', () => {
  let owner: { token: string; userId: number };
  let other: { token: string; userId: number };
  let player: { token: string; userId: number };
  let orgA: number;
  let orgB: number;
  let planId: number;
  let versionId: number;

  const versionPayload = (overrides: any = {}) => ({
    status: 'active',
    durationType: 'annual',
    durationPeriods: 1,
    renewalModel: 'anniversary',
    initialChargeType: 'full',
    graceDays: 0,
    branchScope: 'ALL',
    allowedPaymentMethods: ['cash', 'card'],
    currency: 'EGP',
    components: [
      { code: 'membership', name: 'Membership fee', amount: 2000, quantity: 1, isRequired: true, sortOrder: 0 },
      { code: 'facilities', name: 'Facilities', amount: 200, quantity: 1, isRequired: true, sortOrder: 1 },
      { code: 'donation', name: 'Donation', amount: 100, quantity: 1, isRequired: false, sortOrder: 2 },
    ],
    ...overrides,
  });

  beforeAll(async () => {
    owner = await registerAndLogin('05000001001', 'Org A Owner');
    other = await registerAndLogin('05000001002', 'Org B Owner');
    player = await registerAndLogin('05000001003', 'Membership Player');
    orgA = await createOrg(owner.userId, 'Club A', `club-a-${Date.now()}`);
    orgB = await createOrg(other.userId, 'Club B', `club-b-${Date.now()}`);

    // CourtZon-controlled membership commission for organisation A (5%) —
    // configured inside the organisation's CourtZon SaaS settings, snapshotted
    // at purchase. This makes the CARD and CASH subscriptions both commission=115.
    const pool = getPool();
    const [planRows] = await pool.execute<any>(`SELECT id FROM subscription_plans LIMIT 1`);
    const planIdS = Number(planRows[0].id);
    await pool.execute(
      `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, subscription_status, auto_renew) VALUES (?, ?, 'monthly', 'active', 1)`,
      [orgA, planIdS],
    );
    await pool.execute(
      `INSERT IGNORE INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES (?, 'membership', 'percentage', 5.00)`,
      [planIdS],
    );
  });

  it('owner can save organisation membership settings', async () => {
    const res = await app.inject({ method: 'PUT', url: `/org/${orgA}/membership/settings`, cookies: { session_token: owner.token }, payload: { enabledDurations: ['monthly', 'annual'], allowedPaymentMethods: ['cash', 'card'] } });
    expect(res.statusCode).toBe(200);
  });

  it('creates an active plan + version and lists it', async () => {
    const res = await app.inject({ method: 'POST', url: `/org/${orgA}/membership/plans`, cookies: { session_token: owner.token }, payload: { name: 'Annual Basic', description: 'P1 test', category: 'general', isPublic: true, version: versionPayload() } });
    expect(res.statusCode).toBe(201);
    planId = res.json().planId;
    versionId = res.json().versionId;

    const list = await app.inject({ method: 'GET', url: `/org/${orgA}/membership/plans`, cookies: { session_token: owner.token } });
    expect(list.statusCode).toBe(200);
    const plans = list.json() as any[];
    expect(plans.some((p) => Number(p.id) === planId && p.versions.some((v: any) => v.status === 'active'))).toBe(true);
  });

  it('rejects a duplicate component code (total integrity across parts)', async () => {
    const res = await app.inject({ method: 'POST', url: `/org/${orgA}/membership/plans`, cookies: { session_token: owner.token }, payload: { name: 'Broken Plan', version: versionPayload({ components: [versionPayload().components[0], { ...versionPayload().components[0], name: 'dup' }] }) } });
    expect(res.statusCode).toBe(400);
  });

  it('enforces tenant isolation on management endpoints (403)', async () => {
    const list = await app.inject({ method: 'GET', url: `/org/${orgA}/membership/plans`, cookies: { session_token: other.token } });
    expect(list.statusCode).toBe(403);
    const create = await app.inject({ method: 'POST', url: `/org/${orgA}/membership/plans`, cookies: { session_token: other.token }, payload: { name: 'Intruder', version: versionPayload() } });
    expect(create.statusCode).toBe(403);
  });

  it('CARD: purchase → confirm → active + invoice + commission (container harness, no global COA GL)', async () => {
    const purchase = await app.inject({ method: 'POST', url: `/organisations/${orgA}/membership/subscriptions`, cookies: { session_token: player.token }, payload: { planVersionId: versionId, paymentMethod: 'card' } });
    expect(purchase.statusCode).toBe(201);
    const subId = purchase.json().subscriptionId;
    expect(purchase.json().totalAmount).toBe(2300);

    const complete = await app.inject({ method: 'POST', url: `/org/${orgA}/membership/subscriptions/${subId}/complete-card`, cookies: { session_token: owner.token } });
    expect(complete.statusCode).toBe(200);
    expect(await pollSubscriptionStatus(subId, 'active')).toBe('active');

    const pool = getPool();
    const [subRows] = await pool.execute<any>('SELECT * FROM membership_subscriptions WHERE id = ?', [subId]);
    expect(subRows[0].invoice_id).not.toBeNull();
    expect(subRows[0].payment_status).toBe('paid');
    expect(Number(subRows[0].commission_amount)).toBe(115);

    const [invRows] = await pool.execute<any>(`SELECT id FROM invoices WHERE reference_type = 'membership_subscription' AND reference_id = ?`, [subId]);
    expect(invRows.length).toBe(1);
    const payCount = (await pool.execute<any>(`SELECT COUNT(*) AS c FROM payment_transactions WHERE reference_type = 'membership_subscription' AND reference_id = ?`, [subId]))[0][0].c;
    expect(Number(payCount)).toBe(1);
    // Idempotency — replay cannot create a second payment or re-activate.
    await app.inject({ method: 'POST', url: `/org/${orgA}/membership/subscriptions/${subId}/complete-card`, cookies: { session_token: owner.token } });
    const payAfter = (await pool.execute<any>(`SELECT COUNT(*) AS c FROM payment_transactions WHERE reference_type = 'membership_subscription' AND reference_id = ?`, [subId]))[0][0].c;
    expect(Number(payAfter)).toBe(1);
    expect((await pool.execute<any>('SELECT status FROM membership_subscriptions WHERE id = ?', [subId]))[0][0].status).toBe('active');
  });

  it('CASH: purchase → confirm → active + invoice + commission snapshot', async () => {
    const pool = getPool();
    const purchase = await app.inject({ method: 'POST', url: `/organisations/${orgA}/membership/subscriptions`, cookies: { session_token: player.token }, payload: { planVersionId: versionId, paymentMethod: 'cash' } });
    expect(purchase.statusCode).toBe(201);
    const subId = purchase.json().subscriptionId;

    const [rows] = await pool.execute<any>('SELECT commission_amount, commission_rate_type_snapshot, commission_rate_value_snapshot FROM membership_subscriptions WHERE id = ?', [subId]);
    expect(Number(rows[0].commission_amount)).toBe(115);
    expect(rows[0].commission_rate_type_snapshot).toBe('percentage');
    expect(Number(rows[0].commission_rate_value_snapshot)).toBe(5);

    const confirm = await app.inject({ method: 'POST', url: `/org/${orgA}/membership/subscriptions/${subId}/confirm-cash`, cookies: { session_token: owner.token } });
    expect(confirm.statusCode).toBe(200);
    expect(await pollSubscriptionStatus(subId, 'active')).toBe('active');
    const [s2] = await pool.execute<any>('SELECT invoice_id, payment_status FROM membership_subscriptions WHERE id = ?', [subId]);
    expect(s2[0].invoice_id).not.toBeNull();
    expect(s2[0].payment_status).toBe('paid');
  });

  it('historical pricing: an old subscription is untouched by a new version price change', async () => {
    // Edit is only allowed on drafts → a new version with a different price.
    const create = await app.inject({ method: 'POST', url: `/org/${orgA}/membership/plans/${planId}/versions`, cookies: { session_token: owner.token }, payload: versionPayload({ status: 'draft', components: [versionPayload().components[0], { code: 'facilities', name: 'Facilities', amount: 999, quantity: 1, isRequired: true, sortOrder: 1 }, versionPayload().components[2]] }) });
    expect(create.statusCode).toBe(201);

    const pool = getPool();
    const [subRows] = await pool.execute<any>(
      `SELECT total_amount FROM membership_subscriptions WHERE plan_id = ? ORDER BY id LIMIT 1`,
      [planId],
    );
    expect(Number(subRows[0].total_amount)).toBe(2300);

    const [compRows] = await pool.execute<any>(
      `SELECT c.unit_amount FROM membership_subscription_components c JOIN membership_subscriptions s ON s.id = c.subscription_id
       WHERE s.plan_id = ? AND c.component_code = 'facilities' ORDER BY c.id LIMIT 1`,
      [planId],
    );
    expect(Number(compRows[0].unit_amount)).toBe(200);
  });
});