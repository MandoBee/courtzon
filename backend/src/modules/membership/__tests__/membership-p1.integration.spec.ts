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
  // Membership payment events fan out to fire-and-forget in-memory handlers
  // (accounting postings). Let them settle before the pool/containers close,
  // otherwise a late handler rejects against a closed connection and Vitest
  // reports an unhandled error after an otherwise green run.
  await new Promise((r) => setTimeout(r, 3000));
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

  // ── G11.22 P1 hardening — idempotent / concurrency-safe finalisation ──────
  it('concurrent confirm-cash creates exactly one invoice, one activation and one CONFIRM audit row', async () => {
    const pool = getPool();
    const purchase = await app.inject({
      method: 'POST',
      url: `/organisations/${orgA}/membership/subscriptions`,
      cookies: { session_token: player.token },
      payload: { planVersionId: versionId, paymentMethod: 'cash' },
    });
    expect(purchase.statusCode).toBe(201);
    const subId = purchase.json().subscriptionId;

    const [r1, r2] = await Promise.all([
      app.inject({ method: 'POST', url: `/org/${orgA}/membership/subscriptions/${subId}/confirm-cash`, cookies: { session_token: owner.token } }),
      app.inject({ method: 'POST', url: `/org/${orgA}/membership/subscriptions/${subId}/confirm-cash`, cookies: { session_token: owner.token } }),
    ]);
    for (const r of [r1, r2]) expect([200, 409]).toContain(r.statusCode);

    const [inv] = await pool.execute<any>(
      `SELECT COUNT(*) AS c FROM invoices WHERE reference_type = 'membership_subscription' AND reference_id = ?`,
      [subId],
    );
    expect(Number(inv[0].c)).toBe(1);

    const [sub] = await pool.execute<any>('SELECT status, invoice_id, aggregate_version FROM membership_subscriptions WHERE id = ?', [subId]);
    expect(sub[0].status).toBe('active');
    expect(sub[0].invoice_id).not.toBeNull();
    // createSubscriptionWithParts sets 1; exactly one activation may increment it.
    expect(Number(sub[0].aggregate_version)).toBe(2);

    const [activatedAudit] = await pool.execute<any>(
      `SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'MEMBERSHIP_SUBSCRIPTION.ACTIVATED' AND entity_id = ?`,
      [subId],
    );
    expect(Number(activatedAudit[0].c)).toBe(1);
    const [confirmAudit] = await pool.execute<any>(
      `SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'MEMBERSHIP_SUBSCRIPTION.CONFIRM_CASH' AND entity_id = ?`,
      [subId],
    );
    expect(Number(confirmAudit[0].c)).toBe(1);

    // Exactly one `payment:succeeded` outbox row for this payment: the second
    // confirmation observes `active` under the row lock and must never emit.
    const [paymentRows] = await pool.execute<any>(
      `SELECT id FROM payment_transactions
       WHERE reference_type = 'membership_subscription' AND reference_id = ? AND payment_method = 'cash'`,
      [subId],
    );
    expect(paymentRows.length).toBe(1);
    const paymentId = Number(paymentRows[0].id);
    const [paymentOutbox] = await pool.execute<any>(
      `SELECT COUNT(*) AS c FROM published_events
       WHERE event_name = 'payment:succeeded' AND aggregate_type = 'payment_transaction' AND aggregate_id = ?`,
      [String(paymentId)],
    );
    expect(Number(paymentOutbox[0].c)).toBe(1);

    const [activatedOutbox] = await pool.execute<any>(
      `SELECT COUNT(*) AS c FROM published_events
       WHERE event_name = 'membership:activated' AND aggregate_type = 'membership_subscription' AND aggregate_id = ?`,
      [String(subId)],
    );
    expect(Number(activatedOutbox[0].c)).toBe(1);
  });

  it('re-confirming an already active subscription adds no invoice, activation or audit side effects', async () => {
    const pool = getPool();
    const purchase = await app.inject({
      method: 'POST',
      url: `/organisations/${orgA}/membership/subscriptions`,
      cookies: { session_token: player.token },
      payload: { planVersionId: versionId, paymentMethod: 'cash' },
    });
    expect(purchase.statusCode).toBe(201);
    const subId = purchase.json().subscriptionId;

    const first = await app.inject({ method: 'POST', url: `/org/${orgA}/membership/subscriptions/${subId}/confirm-cash`, cookies: { session_token: owner.token } });
    expect(first.statusCode).toBe(200);

    const snapshot = async () => {
      const [inv] = await pool.execute<any>(`SELECT COUNT(*) AS c FROM invoices WHERE reference_type='membership_subscription' AND reference_id=?`, [subId]);
      const [aud] = await pool.execute<any>(`SELECT COUNT(*) AS c FROM audit_logs WHERE action='MEMBERSHIP_SUBSCRIPTION.ACTIVATED' AND entity_id=?`, [subId]);
      const [sub] = await pool.execute<any>('SELECT status, invoice_id, aggregate_version FROM membership_subscriptions WHERE id=?', [subId]);
      return { invoices: Number(inv[0].c), audits: Number(aud[0].c), status: sub[0].status, invoiceId: sub[0].invoice_id, version: Number(sub[0].aggregate_version) };
    };
    const before = await snapshot();

    const retry = await app.inject({ method: 'POST', url: `/org/${orgA}/membership/subscriptions/${subId}/confirm-cash`, cookies: { session_token: owner.token } });
    expect(retry.statusCode).toBe(409);

    expect(await snapshot()).toEqual(before);
  });

  it('an audit failure inside finalisation rolls back the invoice and the activation', async () => {
    const pool = getPool();
    const purchase = await app.inject({
      method: 'POST',
      url: `/organisations/${orgA}/membership/subscriptions`,
      cookies: { session_token: player.token },
      payload: { planVersionId: versionId, paymentMethod: 'cash' },
    });
    expect(purchase.statusCode).toBe(201);
    const subId = purchase.json().subscriptionId;

    const auditMod = await import('../../audit-log/index.js');
    const spy = vi.spyOn(auditMod.auditLogService, 'record').mockRejectedValueOnce(new Error('audit boom'));
    const res = await app.inject({ method: 'POST', url: `/org/${orgA}/membership/subscriptions/${subId}/confirm-cash`, cookies: { session_token: owner.token } });
    spy.mockRestore();
    expect(res.statusCode).toBeGreaterThanOrEqual(400);

    const [inv] = await pool.execute<any>(`SELECT COUNT(*) AS c FROM invoices WHERE reference_type='membership_subscription' AND reference_id=?`, [subId]);
    expect(Number(inv[0].c)).toBe(0);
    const [sub] = await pool.execute<any>('SELECT status, invoice_id FROM membership_subscriptions WHERE id=?', [subId]);
    expect(sub[0].status).toBe('pending');
    expect(sub[0].invoice_id).toBeNull();
  });

  it('createInvoice(conn) joins the caller transaction and never opens its own', async () => {
    const pool = getPool();
    const { withTransaction } = await import('../../../database/database.transaction.js');
    const { membershipP1Repository } = await import('../infrastructure/repositories/membership-p1.repository.js');
    const marker = `TX-ROLLBACK-${Date.now()}`;

    await expect(withTransaction(async (conn) => {
      await membershipP1Repository.createInvoice({
        organisationId: orgA,
        userId: player.userId,
        invoiceNumber: marker,
        issueDate: '2026-01-01',
        subtotal: 1,
        total: 1,
        referenceType: 'membership_subscription',
        referenceId: 999999,
        actorId: player.userId,
        items: [{ description: 'tx probe', quantity: 1, unitPrice: 1, netAmount: 1, totalAmount: 1 }],
      }, conn);
      throw new Error('force-rollback');
    })).rejects.toThrow('force-rollback');

    const [rows] = await pool.execute<any>('SELECT id FROM invoices WHERE invoice_number = ?', [marker]);
    expect(rows.length).toBe(0);
  });

  it('duplicate payment:succeeded events do not duplicate membership ledger entries', async () => {
    const pool = getPool();
    const purchase = await app.inject({
      method: 'POST',
      url: `/organisations/${orgA}/membership/subscriptions`,
      cookies: { session_token: player.token },
      payload: { planVersionId: versionId, paymentMethod: 'cash' },
    });
    expect(purchase.statusCode).toBe(201);
    const subId = purchase.json().subscriptionId;
    const confirm = await app.inject({ method: 'POST', url: `/org/${orgA}/membership/subscriptions/${subId}/confirm-cash`, cookies: { session_token: owner.token } });
    expect(confirm.statusCode).toBe(200);

    const [subRow] = await pool.execute<any>('SELECT total_amount, currency FROM membership_subscriptions WHERE id = ?', [subId]);
    const amount = Number(subRow[0].total_amount);
    const currency = String(subRow[0].currency);

    await emitMembershipPaid(subId, 'cash', amount, currency);
    const first = await waitForLedger(subId, 'membership_cash_payment', 1);
    expect(first).toBeGreaterThan(0);

    await emitMembershipPaid(subId, 'cash', amount, currency);
    await sleepMs(1000);
    expect(await countLedger(subId, 'membership_cash_payment')).toBe(first);

    const [inv] = await pool.execute<any>(`SELECT COUNT(*) AS c FROM invoices WHERE reference_type='membership_subscription' AND reference_id=?`, [subId]);
    expect(Number(inv[0].c)).toBe(1);
  });

  // ── Installment regression guards (P2 path must stay untouched) ───────────
  it('createInvoice() WITHOUT a caller connection still owns and commits its own transaction, and rolls back on failure', async () => {
    const pool = getPool();
    const { membershipP1Repository } = await import('../infrastructure/repositories/membership-p1.repository.js');
    const marker = `NO-CONN-${Date.now()}`;
    const itemDescription = `probe-${Date.now()}`;

    const id = await membershipP1Repository.createInvoice({
      organisationId: orgA,
      userId: player.userId,
      invoiceNumber: marker,
      issueDate: '2026-01-01',
      subtotal: 5,
      total: 5,
      referenceType: 'membership_subscription',
      referenceId: 999997,
      actorId: player.userId,
      items: [{ description: itemDescription, quantity: 1, unitPrice: 5, netAmount: 5, totalAmount: 5 }],
    });
    expect(id).toBeGreaterThan(0);

    const [committed] = await pool.execute<any>('SELECT id FROM invoices WHERE invoice_number = ?', [marker]);
    expect(committed.length).toBe(1);
    const [committedItems] = await pool.execute<any>('SELECT COUNT(*) AS c FROM invoice_items WHERE invoice_id = ?', [id]);
    expect(Number(committedItems[0].c)).toBe(1);

    // A duplicate invoice number fails inside the function's own transaction:
    // nothing from the failed attempt may be persisted.
    await expect(membershipP1Repository.createInvoice({
      organisationId: orgA,
      userId: player.userId,
      invoiceNumber: marker,
      issueDate: '2026-01-01',
      subtotal: 7,
      total: 7,
      referenceType: 'membership_subscription',
      referenceId: 999996,
      actorId: player.userId,
      items: [{ description: `${itemDescription}-dup`, quantity: 1, unitPrice: 7, netAmount: 7, totalAmount: 7 }],
    })).rejects.toThrow();

    const [afterFailure] = await pool.execute<any>('SELECT COUNT(*) AS c FROM invoice_items WHERE description = ?', [`${itemDescription}-dup`]);
    expect(Number(afterFailure[0].c)).toBe(0);
    const [single] = await pool.execute<any>('SELECT COUNT(*) AS c FROM invoices WHERE invoice_number = ?', [marker]);
    expect(Number(single[0].c)).toBe(1);
  });

  it('full-payment finalisation never activates an installment subscription', async () => {
    const pool = getPool();
    const purchase = await app.inject({
      method: 'POST',
      url: `/organisations/${orgA}/membership/subscriptions`,
      cookies: { session_token: player.token },
      payload: { planVersionId: versionId, paymentMethod: 'cash' },
    });
    expect(purchase.statusCode).toBe(201);
    const subId = purchase.json().subscriptionId;

    // Minimal installment footprint: the full-payment path must bail out based
    // on `subscriptionHasInstallments`, regardless of how the first payment was
    // initiated.
    await pool.execute(
      `INSERT INTO membership_installments (subscription_id, seq, amount, commission_amount, due_date, status, currency)
       VALUES (?, 1, ?, ?, '2026-01-01', 'pending', 'EGP')`,
      [subId, 2300, 115],
    );

    const { membershipSubscriptionService } = await import('../application/membership-subscription.service.js');
    const activated = await membershipSubscriptionService.finalizePaidSubscription(subId, 'cash');
    expect(activated).toBe(false);

    const [sub] = await pool.execute<any>('SELECT status, invoice_id FROM membership_subscriptions WHERE id = ?', [subId]);
    expect(sub[0].status).toBe('pending');
    expect(sub[0].invoice_id).toBeNull();
    const [inv] = await pool.execute<any>(`SELECT COUNT(*) AS c FROM invoices WHERE reference_type='membership_subscription' AND reference_id=?`, [subId]);
    expect(Number(inv[0].c)).toBe(0);

    await pool.execute('DELETE FROM membership_installments WHERE subscription_id = ?', [subId]);
  });
});
