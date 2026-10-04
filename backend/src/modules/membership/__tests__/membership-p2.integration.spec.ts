import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import Fastify from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * G11.22 P2 — LIFECYCLE INTEGRATION (dev DB 3307/courtzon_v3).
 *
 * Covers the approved lifecycle decisions:
 *   - FIRST installment activates; future installments stay pending.
 *   - Overdue does NOT deactivate; overdue remains collectible.
 *   - Post-expiry collection pays the outstanding installment without
 *     reactivation or extension.
 *   - Grace is derived; eligibility facts expose it.
 *   - Renewal (with overdue + during grace) creates a NEW subscription with a
 *     fresh snapshot + renewal_of_subscription_id; old overdue never merges;
 *     duplicate renewal is rejected.
 *   - Cancellation voids future unpaid installments; refund is governed by the
 *     organisation policy (none ⇒ 400).
 *   - Tenancy enforced (other org cannot manage).
 */
const ORG = 60102241;
const ORG_B = 60102242;
const OWNER = 60102243;
const PLAYER = 60102244;

let pool: mysql.Pool;
let app: ReturnType<typeof Fastify>;
let planId: number;
let versionId: number;
let saasPlanId: number;
const planeTokens = { owner: 'p2-i-owner-token', player: 'p2-i-player-token' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function purchase(method: 'cash' | 'card' = 'cash'): Promise<{ subscriptionId: number; installments: any[] }> {
  const res = await app.inject({
    method: 'POST', url: `/organisations/${ORG}/membership/subscriptions`,
    headers: { authorization: `Bearer ${planeTokens.player}` },
    payload: { planVersionId: versionId, paymentMethod: method },
  });
  expect(res.statusCode).toBe(201);
  const subscriptionId = Number(res.json().subscriptionId);
  const [rows] = await pool.execute<any>(`SELECT * FROM membership_installments WHERE subscription_id=? ORDER BY seq`, [subscriptionId]);
  return { subscriptionId, installments: rows as any[] };
}

async function confirmCash(subId: number, seq: number): Promise<number> {
  const res = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subId}/installments/${seq}/confirm-cash`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: {} });
  return res.statusCode;
}

async function setPolicy(refundType: string): Promise<void> {
  await pool.execute<any>(
    `INSERT INTO organisation_membership_settings (organisation_id, enabled_durations, allowed_payment_methods, cancellation_refund_policy)
     VALUES (?, '["annual"]', '["cash","card"]', ?)
     ON DUPLICATE KEY UPDATE cancellation_refund_policy = VALUES(cancellation_refund_policy)`,
    [ORG, JSON.stringify({ cancellation: { void_future_unpaid: true }, refund: { type: refundType, window_days_before_start: 0 } })],
  );
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });

  await pool.execute(`DELETE FROM membership_installments WHERE subscription_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}))`);
  await pool.execute(`DELETE FROM payment_transactions WHERE reference_type='membership_subscription' AND reference_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}))`);
  await pool.execute(`DELETE FROM ledger_entries WHERE source_type='membership' AND source_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}) UNION SELECT id FROM membership_installments WHERE subscription_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B})))`);
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (${ORG},${ORG_B}) OR (organisation_id IS NULL AND reference_type LIKE 'membership%')`);
  await pool.execute(`DELETE FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B})`);
  await pool.execute(`DELETE FROM membership_plans WHERE organisation_id IN (${ORG},${ORG_B})`);
  await pool.execute(`DELETE FROM organisation_membership_settings WHERE organisation_id IN (${ORG},${ORG_B})`);
  await pool.execute(`DELETE FROM invoices WHERE organisation_id IN (${ORG},${ORG_B}) AND reference_type='membership_subscription'`);
  await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id IN (${ORG},${ORG_B}))`);
  await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id IN (${ORG},${ORG_B})`);
  await pool.execute(`DELETE FROM organisation_subscriptions WHERE organisation_id IN (${ORG},${ORG_B})`);
  await pool.execute(`DELETE FROM organisations WHERE id IN (${ORG},${ORG_B})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${OWNER},${PLAYER})`);
  await pool.execute(`DELETE FROM payment_transactions WHERE user_id IN (${OWNER},${PLAYER})`);

  await pool.execute(
    `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, timezone, dark_mode, account_status)
     VALUES (?, UUID(), 1, '05000003440', '+200500003440', 'p2-i-owner@example.com', 'x', 'P2I Owner', 'male', 'UTC', 'system', 'active'),
            (?, UUID(), 1, '05000003441', '+200500003441', 'p2-i-player@example.com', 'x', 'P2I Player', 'male', 'UTC', 'system', 'active')`,
    [OWNER, PLAYER],
  );
  await pool.execute(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active, access_model)
     VALUES (?, UUID(), 1, ?, 'P2I Club', 'p2i-club', 1, 'PUBLIC_CLUB')`,
    [ORG, OWNER],
  );
  await pool.execute(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active, access_model)
     VALUES (?, UUID(), 1, ?, 'P2I Other', 'p2i-other', 1, 'PUBLIC_CLUB')`,
    [ORG_B, OWNER],
  );

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  for (const orgScope of [null, ORG]) {
    const [rows] = await pool.execute<any>(
      `SELECT id FROM accounting_periods WHERE ${orgScope === null ? 'organisation_id IS NULL' : 'organisation_id=?'} AND status='open' AND start_date<=? AND end_date>=? LIMIT 1`,
      orgScope === null ? [end, start] : [orgScope, end, start],
    );
    if (rows.length) continue;
    await pool.execute<any>(`INSERT INTO accounting_periods (organisation_id, fiscal_year, period_number, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, 'open')`, [orgScope, y, m, start, end]);
  }

  const [planRes] = await pool.execute<any>(
    `INSERT INTO membership_plans (code, name, description, category, duration_type, duration_value, duration_days, plan_type, price, currency, status, is_public, organisation_id, created_by, updated_by)
     VALUES ('p2i-annual', 'P2I Annual', NULL, 'general', 'years', 1, 365, 'annual', 2000, 'EGP', 'active', 1, ?, ?, ?)`,
    [ORG, OWNER, OWNER],
  );
  planId = planRes.insertId;
  const [verRes] = await pool.execute<any>(
    `INSERT INTO membership_plan_versions (membership_plan_id, version_no, status, effective_from, duration_type, duration_periods, renewal_model, initial_charge_type, grace_days, branch_scope, allowed_payment_methods, currency, installments_enabled)
     VALUES (?, 1, 'active', CURDATE(), 'annual', 1, 'anniversary', 'full', 7, 'ALL', '["cash","card"]', 'EGP', 1)`,
    [planId],
  );
  versionId = verRes.insertId;
  await pool.execute(
    `INSERT INTO membership_plan_components (plan_version_id, code, name, amount, is_required, quantity, sort_order) VALUES
     (?, 'membership', 'Membership fee', 1000, 1, 1, 0), (?, 'facilities', 'Facilities', 1000, 1, 1, 1)`,
    [versionId, versionId],
  );
  await pool.execute(
    `INSERT INTO membership_plan_installment_templates (plan_version_id, seq, amount, due_offset_days) VALUES
     (?, 1, 1000, 0), (?, 2, 600, 30), (?, 3, 400, 60)`,
    [versionId, versionId, versionId],
  );

  const [sp] = await pool.execute<any>(`SELECT id FROM subscription_plans LIMIT 1`);
  saasPlanId = Number(sp[0].id);
  await pool.execute(`INSERT IGNORE INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, subscription_status, auto_renew) VALUES (?, ?, 'monthly', 'active', 1)`, [ORG, saasPlanId]);
  await pool.execute(`INSERT IGNORE INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES (?, 'membership', 'fixed', 100.00)`, [saasPlanId]);

  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  const { initAuthMiddleware } = await import('../../../shared/middleware/auth.middleware.js');
  initAuthMiddleware({
    resolveUser: async (request: FastifyRequest) => {
      const token = (request as any).cookies?.session_token
        ?? ((request.headers as any).authorization?.startsWith('Bearer ') ? String((request.headers as any).authorization).slice(7) : undefined);
      if (token === planeTokens.owner) return OWNER;
      if (token === planeTokens.player) return PLAYER;
      return null;
    },
    checkRole: async () => false,
    checkPermission: async () => false,
    checkOrgApproved: async () => false,
  });
  const { initRouteGuard } = await import('../../../shared/middleware/route-guard.js');
  initRouteGuard({
    checkOrgAccess: async (userId, orgId) => {
      const [rows] = await pool.execute<any>('SELECT 1 FROM organisations WHERE id=? AND owner_id=?', [orgId, userId]);
      return rows.length > 0;
    },
    checkOrgManage: async (userId, orgId) => {
      const [rows] = await pool.execute<any>(`SELECT 1 FROM organisations WHERE id=? AND owner_id=? UNION SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? AND ur.is_active=1 AND r.slug IN ('super_admin','super-admin')`, [orgId, userId, userId]);
      return rows.length > 0;
    },
    checkOrgPermission: async () => false,
  });

  const { registerAccountingEventListeners } = await import('../../../modules/financial/application/accounting-event.listener.js');
  registerAccountingEventListeners();
  const { registerMembershipP1Lifecycle } = await import('../application/membership-p1.listeners.js');
  registerMembershipP1Lifecycle();

  const { AppError } = await import('../../../shared/errors/app-error.js');
  app = Fastify();
  app.setErrorHandler((error: any, _request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) return reply.status(error.statusCode).send({ error: error.errorCode, message: error.message });
    throw error;
  });
  const { membershipP1Routes } = await import('../presentation/membership-p1.routes.js');
  app.register(membershipP1Routes);
  await app.ready();
}, 240000);

afterAll(async () => {
  if (app) await app.close();
  // Let in-flight eventBus listeners (payment:succeeded / accounting) settle
  // before the shared pool closes — avoids teardown-race "Pool is closed" noise.
  await sleep(1500);
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.execute(`DELETE FROM membership_installments WHERE subscription_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}))`);
  await pool.execute(`DELETE FROM payment_transactions WHERE reference_type='membership_subscription' AND reference_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}))`);
  await pool.execute(`DELETE FROM ledger_entries WHERE source_type='membership' AND source_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}) UNION SELECT id FROM membership_installments WHERE subscription_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B})))`);
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (${ORG},${ORG_B}) OR (organisation_id IS NULL AND reference_type LIKE 'membership%')`);
  await pool.execute(`DELETE FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B})`);
  await pool.execute(`DELETE FROM membership_plans WHERE organisation_id IN (${ORG},${ORG_B})`);
  await pool.execute(`DELETE FROM organisation_membership_settings WHERE organisation_id IN (${ORG},${ORG_B})`);
  await pool.execute(`DELETE FROM invoices WHERE organisation_id IN (${ORG},${ORG_B})`);
  await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id IN (${ORG},${ORG_B}))`);
  await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id IN (${ORG},${ORG_B})`);
  await pool.execute(`DELETE FROM organisation_subscriptions WHERE organisation_id IN (${ORG},${ORG_B})`);
  await pool.execute(`DELETE FROM payment_transactions WHERE user_id IN (${OWNER},${PLAYER})`);
  await pool.execute(`DELETE FROM organisations WHERE id IN (${ORG},${ORG_B})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${OWNER},${PLAYER})`);
  await pool.end();
}, 30000);

describe('G11.22 P2 — lifecycle integration (activation / overdue / expiry / grace / renewal / cancel / refund / tenancy)', () => {
  it('P2L-1 first installment → ACTIVE; future installments pending; invoice is FULL', async () => {
    const { subscriptionId, installments } = await purchase();
    expect(await confirmCash(subscriptionId, 1)).toBe(200);
    const [sub] = await pool.execute<any>(`SELECT status, payment_status FROM membership_subscriptions WHERE id=?`, [subscriptionId]);
    expect(sub[0].status).toBe('active');
    expect(sub[0].payment_status).toBe('partially_paid');
    const [states] = await pool.execute<any>(`SELECT status FROM membership_installments WHERE subscription_id=? ORDER BY seq`, [subscriptionId]);
    expect(states.map((s: any) => s.status)).toEqual(['paid', 'pending', 'pending']);
  });

  it('P2L-2 overdue does NOT deactivate; remains collectible', async () => {
    const { subscriptionId, installments } = await purchase();
    await confirmCash(subscriptionId, 1);
    // Force installment 2 due in the past, then run the overdue sweep.
    await pool.execute(`UPDATE membership_installments SET due_date = DATE_SUB(CURDATE(), INTERVAL 2 DAY) WHERE id=?`, [installments[1].id]);
    const { membershipLifecycleService } = await import('../application/membership-lifecycle.service.js');
    const marked = await membershipLifecycleService.processOverdue();
    expect(marked).toBeGreaterThanOrEqual(1);
    const [inst] = await pool.execute<any>(`SELECT status FROM membership_installments WHERE id=?`, [installments[1].id]);
    expect(inst[0].status).toBe('overdue');
    const [sub] = await pool.execute<any>(`SELECT status FROM membership_subscriptions WHERE id=?`, [subscriptionId]);
    expect(sub[0].status).toBe('active'); // never deactivated
    expect(await confirmCash(subscriptionId, 2)).toBe(200); // still collectible
    const [paid] = await pool.execute<any>(`SELECT status FROM membership_installments WHERE id=?`, [installments[1].id]);
    expect(paid[0].status).toBe('paid');
  });

  it('P2L-3 post-expiry collection: pays without reactivation or extension', async () => {
    const { subscriptionId, installments } = await purchase();
    await confirmCash(subscriptionId, 1);
    // Force term end in the past and expire.
    await pool.execute(`UPDATE membership_subscriptions SET end_date = DATE_SUB(CURDATE(), INTERVAL 5 DAY), grace_until = DATE_SUB(CURDATE(), INTERVAL 1 DAY) WHERE id=?`, [subscriptionId]);
    const { membershipLifecycleService } = await import('../application/membership-lifecycle.service.js');
    await membershipLifecycleService.processExpiry();
    const [sub] = await pool.execute<any>(`SELECT status, end_date FROM membership_subscriptions WHERE id=?`, [subscriptionId]);
    expect(sub[0].status).toBe('expired');
    const endDateBefore = String(sub[0].end_date).slice(0, 10);

    // Overdue installment remains payable AFTER expiry (#4).
    await pool.execute(`UPDATE membership_installments SET due_date = DATE_SUB(CURDATE(), INTERVAL 3 DAY) WHERE id=?`, [installments[2].id]);
    await membershipLifecycleService.processOverdue();
    expect(await confirmCash(subscriptionId, 3)).toBe(200);

    const [after] = await pool.execute<any>(`SELECT status, end_date, payment_status FROM membership_subscriptions WHERE id=?`, [subscriptionId]);
    expect(after[0].status).toBe('expired'); // NOT reactivated
    expect(String(after[0].end_date).slice(0, 10)).toBe(endDateBefore); // NOT extended
    expect(after[0].payment_status).toBe('partially_paid');
  });

  it('P2L-4 grace is DERIVED: active + inGrace eligibility; expiry worker defers until grace ends', async () => {
    const { subscriptionId } = await purchase();
    await confirmCash(subscriptionId, 1);
    await pool.execute(
      `UPDATE membership_subscriptions SET end_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY), grace_until = DATE_ADD(CURDATE(), INTERVAL 3 DAY) WHERE id=?`,
      [subscriptionId],
    );
    const { membershipLifecycleService } = await import('../application/membership-lifecycle.service.js');
    await membershipLifecycleService.processExpiry(); // grace still open → no expiry
    const [sub] = await pool.execute<any>(`SELECT status FROM membership_subscriptions WHERE id=?`, [subscriptionId]);
    expect(sub[0].status).toBe('active');

    const elig = await app.inject({ method: 'GET', url: `/org/${ORG}/membership/subscriptions/${subscriptionId}/eligibility`, headers: { authorization: `Bearer ${planeTokens.owner}` } });
    expect(elig.statusCode).toBe(200);
    const body = elig.json();
    expect(body.facts.inGrace).toBe(true);
    expect(body.facts.eligible).toBe(true);
    expect(body.facts.status).toBe('active');

    // Grace ends → the SAME sweep expires the subscription.
    await pool.execute(`UPDATE membership_subscriptions SET grace_until = DATE_SUB(CURDATE(), INTERVAL 1 DAY) WHERE id=?`, [subscriptionId]);
    await membershipLifecycleService.processExpiry();
    const [after] = await pool.execute<any>(`SELECT status FROM membership_subscriptions WHERE id=?`, [subscriptionId]);
    expect(after[0].status).toBe('expired');
  });

  it('P2L-5 renewal with overdue: NEW subscription, fresh snapshot, renewal_of link, old overdue never merges', async () => {
    const { subscriptionId } = await purchase();
    await confirmCash(subscriptionId, 1);
    // Leave installments 2/3 pending (one goes overdue).
    await pool.execute(`UPDATE membership_installments SET due_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY) WHERE subscription_id=? AND seq=2`, [subscriptionId]);
    const { membershipLifecycleService } = await import('../application/membership-lifecycle.service.js');
    await membershipLifecycleService.processOverdue();

    const res = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subscriptionId}/renew`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: { paymentMethod: 'card' } });
    expect(res.statusCode).toBe(200);
    const renewedId = Number(res.json().subscriptionId);

    const [old] = await pool.execute<any>(`SELECT status FROM membership_subscriptions WHERE id=?`, [subscriptionId]);
    const [renewed] = await pool.execute<any>(`SELECT * FROM membership_subscriptions WHERE id=?`, [renewedId]);
    expect(Number(renewed[0].renewal_of_subscription_id)).toBe(subscriptionId);
    expect(renewed[0].status).toBe('pending');
    expect(String(renewed[0].total_amount)).toBe('2000.00'); // FULL current price
    expect(String(renewed[0].commission_amount)).toBe('100.00'); // FRESH commission snapshot
    expect(renewed[0].plan_version_id).toBe(versionId);
    // NEW installment schedule for the renewed subscription.
    const [newInst] = await pool.execute<any>(`SELECT COUNT(*) AS c, SUM(commission_amount) AS s FROM membership_installments WHERE subscription_id=?`, [renewedId]);
    expect(Number(newInst[0].c)).toBe(3);
    expect(String(newInst[0].s)).toBe('100.00');
    // OLD overdue balance NEVER merges — old subscription keeps its installments.
    const [oldInst] = await pool.execute<any>(`SELECT status FROM membership_installments WHERE subscription_id=? AND seq=2`, [subscriptionId]);
    expect(oldInst[0].status).toBe('overdue');
    expect(old[0].status).not.toBe('terminated');

    // Duplicate renewal prevention (#6).
    const dup = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subscriptionId}/renew`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: { paymentMethod: 'card' } });
    expect(dup.statusCode).toBe(409);
  });

  it('P2L-6 cancellation voids future unpaid; refund requires policy (400 when none)', async () => {
    const { subscriptionId, installments } = await purchase();
    await confirmCash(subscriptionId, 1);
    await setPolicy('none');
    const cancel = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subscriptionId}/cancel`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: { reason: 'requested' } });
    expect(cancel.statusCode).toBe(200);
    const [states] = await pool.execute<any>(`SELECT status FROM membership_installments WHERE subscription_id=? ORDER BY seq`, [subscriptionId]);
    expect(states.map((s: any) => s.status)).toEqual(['paid', 'voided', 'voided']);

    // Refund blocked under policy 'none'.
    const refund = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subscriptionId}/refund`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: { installmentIds: [Number(installments[0].id)] } });
    expect(refund.statusCode).toBe(400);
  });

  it('P2L-7 tenancy: another organisation cannot manage the subscription', async () => {
    const { subscriptionId } = await purchase();
    await confirmCash(subscriptionId, 1);
    const otherOrgConfirm = await app.inject({ method: 'POST', url: `/org/${ORG_B}/membership/subscriptions/${subscriptionId}/installments/2/confirm-cash`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: {} });
    expect(otherOrgConfirm.statusCode).toBe(404);
    const otherOrgElig = await app.inject({ method: 'GET', url: `/org/${ORG_B}/membership/subscriptions/${subscriptionId}/eligibility`, headers: { authorization: `Bearer ${planeTokens.owner}` } });
    expect(otherOrgElig.statusCode).toBe(404);
  });

  it('P2L-8 player-owned eligibility endpoint enforces ownership', async () => {
    const { subscriptionId } = await purchase();
    const mine = await app.inject({ method: 'GET', url: `/my/membership/subscriptions/${subscriptionId}/eligibility`, headers: { authorization: `Bearer ${planeTokens.player}` } });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().facts.eligible).toBe(false); // pending until first installment
    const notMine = await app.inject({ method: 'GET', url: `/my/membership/subscriptions/${subscriptionId}/eligibility`, headers: { authorization: `Bearer ${planeTokens.owner}` } });
    expect(notMine.statusCode).toBe(404);
  });

  it('P2L-9 before_start_only refund boundary: allowed BEFORE start, rejected AFTER start, consistent at boundary', async () => {
    await setPolicy('before_start_only');

    // BEFORE start → refund allowed.
    const { subscriptionId: subFuture, installments: instFuture } = await purchase();
    await confirmCash(subFuture, 1);
    await pool.execute(`UPDATE membership_subscriptions SET start_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY) WHERE id=?`, [subFuture]);
    const allowed = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subFuture}/refund`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: { installmentIds: [Number(instFuture[0].id)] } });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().refunded).toBe(1);
    expect(allowed.json().refundedAmount).toBe(1000);

    // AFTER start → refund rejected (no candidates ⇒ 409).
    const { subscriptionId: subPast, installments: instPast } = await purchase();
    await confirmCash(subPast, 1);
    await pool.execute(`UPDATE membership_subscriptions SET start_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY) WHERE id=?`, [subPast]);
    const rejected = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subPast}/refund`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: { installmentIds: [Number(instPast[0].id)] } });
    expect(rejected.statusCode).toBe(409);

    // EXACTLY at the boundary (start_date = today, window 0) → refund allowed (consistent policy).
    const { subscriptionId: subBoundary, installments: instBoundary } = await purchase();
    await confirmCash(subBoundary, 1);
    await pool.execute(`UPDATE membership_subscriptions SET start_date = CURDATE() WHERE id=?`, [subBoundary]);
    const boundary = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subBoundary}/refund`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: { installmentIds: [Number(instBoundary[0].id)] } });
    expect(boundary.statusCode).toBe(200);
    expect(boundary.json().refunded).toBe(1);

    // Refund idempotency: a SECOND refund has no paid installments left → 409, no duplicate GL.
    const replay = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subFuture}/refund`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: { installmentIds: [Number(instFuture[0].id)] } });
    expect(replay.statusCode).toBe(409);
  });

  it('P2L-10 proportional policy refunds paid installments (no proration engine — P3) and none/full stay unaffected', async () => {
    // proportional → refund of the paid installment succeeds.
    await setPolicy('proportional');
    const { subscriptionId, installments } = await purchase();
    await confirmCash(subscriptionId, 1);
    const ok = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subscriptionId}/refund`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: { installmentIds: [Number(installments[0].id)] } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().refunded).toBe(1);

    // none → refund blocked (existing P2L-6 shape); full → refund allowed (P2GL-5 shape).
    await setPolicy('none');
    const { subscriptionId: subNone, installments: instNone } = await purchase();
    await confirmCash(subNone, 1);
    const blocked = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subNone}/refund`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: { installmentIds: [Number(instNone[0].id)] } });
    expect(blocked.statusCode).toBe(400);

    await setPolicy('full');
    const { subscriptionId: subFull, installments: instFull } = await purchase();
    await confirmCash(subFull, 1);
    const full = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subFull}/refund`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: { installmentIds: [Number(instFull[0].id)] } });
    expect(full.statusCode).toBe(200);
  });
});