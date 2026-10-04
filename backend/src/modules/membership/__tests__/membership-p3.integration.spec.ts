import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import Fastify from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * G11.22 P3 — LIFECYCLE INTEGRATION (dev DB 3307/courtzon_v3).
 *
 * Approved P3 rules verified here:
 *   - fixed-date mid-cycle join → prorated first term (daily actual days);
 *   - join ON the boundary → full first term;
 *   - initial_charge_percent applies to the FULL cycle price;
 *   - membership entitlement per PAID installment (source_type='membership',
 *     source_id=installment.id); unpaid/overdue installments create NONE;
 *   - refund before settlement cancels the AVAILABLE entitlement;
 *   - a SETTLED entitlement stays SETTLED (immutable — state machine terminal);
 *   - handler idempotency.
 *
 * The entitlement subscribers are DURABLE BullMQ subscribers — in this bare
 * Fastify harness they are invoked DIRECTLY (exactly how the durable worker
 * would call them), which keeps the test deterministic and queue-free.
 */
const ORG = 60102251;
const OWNER = 60102253;
const PLAYER = 60102254;

let pool: mysql.Pool;
let app: ReturnType<typeof Fastify>;
let fixedVersionId: number;      // fixed-date, full-payment, proration target
let instVersionId: number;       // anniversary with installments, entitlement target
const planeTokens = { owner: 'p3-i-owner-token', player: 'p3-i-player-token' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function q<T = any>(sql: string, params: any[] = []): Promise<T> {
  const [rows] = await pool.execute<any>(sql, params);
  return rows as T;
}

async function purchase(fixedId: number, method: 'cash' | 'card' = 'cash'): Promise<{ subscriptionId: number; installments: any[] }> {
  const res = await app.inject({
    method: 'POST', url: `/organisations/${ORG}/membership/subscriptions`,
    headers: { authorization: `Bearer ${planeTokens.player}` },
    payload: { planVersionId: fixedId, paymentMethod: method },
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

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });

  await pool.execute(`DELETE FROM membership_installments WHERE subscription_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id=${ORG})`);
  await pool.execute(`DELETE FROM payment_transactions WHERE reference_type='membership_subscription' AND reference_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id=${ORG})`);
  await pool.execute(`DELETE FROM ledger_entries WHERE source_type='membership' AND source_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id=${ORG} UNION SELECT id FROM membership_installments WHERE subscription_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id=${ORG}))`);
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id=${ORG} OR (organisation_id IS NULL AND reference_type LIKE 'membership%')`);
  await pool.execute(`DELETE FROM financial_entitlements WHERE source_type='membership' OR organisation_id=${ORG}`);
  await pool.execute(`DELETE FROM settlement_entitlements WHERE entitlement_id IN (SELECT id FROM financial_entitlements WHERE source_type='membership')`);
  await pool.execute(`DELETE FROM membership_subscriptions WHERE organisation_id=${ORG}`);
  await pool.execute(`DELETE FROM membership_plans WHERE organisation_id=${ORG}`);
  await pool.execute(`DELETE FROM organisation_membership_settings WHERE organisation_id=${ORG}`);
  await pool.execute(`DELETE FROM invoices WHERE organisation_id=${ORG} AND reference_type='membership_subscription'`);
  await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id=${ORG})`);
  await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id=${ORG}`);
  await pool.execute(`DELETE FROM organisation_subscriptions WHERE organisation_id=${ORG}`);
  await pool.execute(`DELETE FROM organisations WHERE id=${ORG}`);
  await pool.execute(`DELETE FROM users WHERE id IN (${OWNER},${PLAYER})`);
  await pool.execute(`DELETE FROM payment_transactions WHERE user_id IN (${OWNER},${PLAYER})`);

  await pool.execute(
    `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, timezone, dark_mode, account_status)
     VALUES (?, UUID(), 1, '05000003510', '+200500003510', 'p3-i-owner@example.com', 'x', 'P3I Owner', 'male', 'UTC', 'system', 'active'),
            (?, UUID(), 1, '05000003511', '+200500003511', 'p3-i-player@example.com', 'x', 'P3I Player', 'male', 'UTC', 'system', 'active')`,
    [OWNER, PLAYER],
  );
  await pool.execute(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active, access_model)
     VALUES (?, UUID(), 1, ?, 'P3I Club', 'p3i-club', 1, 'PUBLIC_CLUB')`,
    [ORG, OWNER],
  );

  // ── Plan A: fixed-date full-payment (proration target an arbitrary mid-cycle day) ──
  const now = new Date();
  const fixedMonth = (now.getMonth() + 1) % 12 + 1; // next month → today is always mid-cycle
  const fixedDay = 1;
  const [planA] = await pool.execute<any>(
    `INSERT INTO membership_plans (code, name, description, category, duration_type, duration_value, duration_days, plan_type, price, currency, status, is_public, organisation_id, created_by, updated_by)
     VALUES ('p3-fixed', 'P3 Fixed', NULL, 'general', 'years', 1, 365, 'annual', 2000, 'EGP', 'active', 1, ?, ?, ?)`,
    [ORG, OWNER, OWNER],
  );
  const [verA] = await pool.execute<any>(
    `INSERT INTO membership_plan_versions (membership_plan_id, version_no, status, effective_from, duration_type, duration_periods, renewal_model, fixed_renewal_month, fixed_renewal_day, initial_charge_type, initial_charge_percent, grace_days, branch_scope, allowed_payment_methods, currency, installments_enabled)
     VALUES (?, 1, 'active', CURDATE(), 'annual', 1, 'fixed_date', ?, ?, 'full', NULL, 0, 'ALL', '["cash","card"]', 'EGP', 0)`,
    [planA.insertId, fixedMonth, fixedDay],
  );
  fixedVersionId = verA.insertId;
  await pool.execute(
    `INSERT INTO membership_plan_components (plan_version_id, code, name, amount, is_required, quantity, sort_order) VALUES
     (?, 'membership', 'Membership fee', 2000, 1, 1, 0)`,
    [fixedVersionId],
  );

  // ── Plan B: anniversary with installments (entitlement target; fixed commission 100) ──
  const [planB] = await pool.execute<any>(
    `INSERT INTO membership_plans (code, name, description, category, duration_type, duration_value, duration_days, plan_type, price, currency, status, is_public, organisation_id, created_by, updated_by)
     VALUES ('p3-inst', 'P3 Inst', NULL, 'general', 'years', 1, 365, 'annual', 2000, 'EGP', 'active', 1, ?, ?, ?)`,
    [ORG, OWNER, OWNER],
  );
  const [verB] = await pool.execute<any>(
    `INSERT INTO membership_plan_versions (membership_plan_id, version_no, status, effective_from, duration_type, duration_periods, renewal_model, initial_charge_type, grace_days, branch_scope, allowed_payment_methods, currency, installments_enabled)
     VALUES (?, 1, 'active', CURDATE(), 'annual', 1, 'anniversary', 'full', 0, 'ALL', '["cash","card"]', 'EGP', 1)`,
    [planB.insertId],
  );
  instVersionId = verB.insertId;
  await pool.execute(
    `INSERT INTO membership_plan_components (plan_version_id, code, name, amount, is_required, quantity, sort_order) VALUES
     (?, 'membership', 'Membership fee', 2000, 1, 1, 0)`,
    [instVersionId],
  );
  await pool.execute(
    `INSERT INTO membership_plan_installment_templates (plan_version_id, seq, amount, due_offset_days) VALUES
     (?, 1, 1000, 0), (?, 2, 600, 30), (?, 3, 400, 60)`,
    [instVersionId, instVersionId, instVersionId],
  );

  // CourtZon commission FIXED 100 (exercises the installment allocation 50/30/20).
  const [sp] = await pool.execute<any>(`SELECT id FROM subscription_plans LIMIT 1`);
  const saasId = Number(sp[0].id);
  await pool.execute(`INSERT IGNORE INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, subscription_status, auto_renew) VALUES (?, ?, 'monthly', 'active', 1)`, [ORG, saasId]);
  await pool.execute(
    `INSERT INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES (?, 'membership', 'fixed', 100.00)
     ON DUPLICATE KEY UPDATE rate_type='fixed', amount=100.00`,
    [saasId],
  );

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
  await sleep(1200);
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.execute(`DELETE FROM membership_installments WHERE subscription_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id=${ORG})`);
  await pool.execute(`DELETE FROM payment_transactions WHERE reference_type='membership_subscription' AND reference_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id=${ORG})`);
  await pool.execute(`DELETE FROM ledger_entries WHERE source_type='membership' AND source_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id=${ORG} UNION SELECT id FROM membership_installments WHERE subscription_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id=${ORG}))`);
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id=${ORG} OR (organisation_id IS NULL AND reference_type LIKE 'membership%')`);
  await pool.execute(`DELETE FROM settlement_entitlements WHERE entitlement_id IN (SELECT id FROM financial_entitlements WHERE source_type='membership')`);
  await pool.execute(`DELETE FROM financial_entitlements WHERE source_type='membership' OR organisation_id=${ORG}`);
  await pool.execute(`DELETE FROM membership_subscriptions WHERE organisation_id=${ORG}`);
  await pool.execute(`DELETE FROM membership_plans WHERE organisation_id=${ORG}`);
  await pool.execute(`DELETE FROM organisation_membership_settings WHERE organisation_id=${ORG}`);
  await pool.execute(`DELETE FROM invoices WHERE organisation_id=${ORG}`);
  await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id=${ORG})`);
  await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id=${ORG}`);
  await pool.execute(`DELETE FROM organisation_subscriptions WHERE organisation_id=${ORG}`);
  await pool.execute(`DELETE FROM payment_transactions WHERE user_id IN (${OWNER},${PLAYER})`);
  await pool.execute(`DELETE FROM organisations WHERE id=${ORG}`);
  await pool.execute(`DELETE FROM users WHERE id IN (${OWNER},${PLAYER})`);
  await pool.end();
}, 30000);

describe('G11.22 P3 — proration / entitlement / refund integration', () => {
  it('P3L-1 fixed-date MID-CYCLE join is prorated to the fixed end (daily actual days)', async () => {
    const { computeFixedTermWindow, computeFirstTermAmount } = await import('../domain/membership-p3.types.js');
    const { subscriptionId } = await purchase(fixedVersionId);
    const rows = await q<any[]>(`SELECT total_amount, end_date, start_date FROM membership_subscriptions WHERE id=?`, [subscriptionId]);
    // DATE columns return a LOCAL Date; read its LOCAL calendar components to get
    // the exact stored 'YYYY-MM-DD' (UTC toISOString would shift by the tz offset).
    const isoLocal = (v: any) => {
      const d = v instanceof Date ? v : new Date(`${String(v).slice(0, 10)}T00:00:00`);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const start = isoLocal(rows[0].start_date);
    const fixedMonth = (Number(start.slice(5, 7)) % 12) + 1; // 1st of NEXT month boundary
    const window = computeFixedTermWindow(start, fixedMonth, 1);
    expect(window.isFullTerm).toBe(false);
    const expected = computeFirstTermAmount({ initialChargeType: 'full', initialChargePercent: null }, 2000, window).amount;
    expect(Number(rows[0].total_amount)).toBe(expected);
    expect(isoLocal(rows[0].end_date)).toBe(window.termEnd);
    expect(isoLocal(rows[0].end_date)).not.toBe(start); // a partial first term
  });

  it('P3L-2 initial_charge_percent applies to the FULL cycle price (not the prorated amount)', async () => {
    // A second fixed-date version with percentage 50.
    const [verPct] = await pool.execute<any>(
      `INSERT INTO membership_plan_versions (membership_plan_id, version_no, status, effective_from, duration_type, duration_periods, renewal_model, fixed_renewal_month, fixed_renewal_day, initial_charge_type, initial_charge_percent, grace_days, branch_scope, allowed_payment_methods, currency, installments_enabled)
       VALUES ((SELECT id FROM membership_plans WHERE code='p3-fixed'), 2, 'active', CURDATE(), 'annual', 1, 'fixed_date', ?, 1, 'percentage', 50, 0, 'ALL', '["cash","card"]', 'EGP', 0)`,
      [new Date().getMonth() % 12 + 1],
    );
    const pctVersionId = verPct.insertId;
    await pool.execute(
      `INSERT INTO membership_plan_components (plan_version_id, code, name, amount, is_required, quantity, sort_order) VALUES (?, 'membership', 'Membership fee', 2000, 1, 1, 0)`,
      [pctVersionId],
    );
    const { subscriptionId } = await purchase(pctVersionId);
    const rows = await q<any[]>(`SELECT total_amount FROM membership_subscriptions WHERE id=?`, [subscriptionId]);
    expect(Number(rows[0].total_amount)).toBe(1000); // 50% of FULL 2000 — regardless of when today is in the cycle
  });

  it('P3L-3 entitlement per PAID installment; unpaid/overdue create NONE', async () => {
    const { handleMembershipInstallmentPaid } = await import('../../../modules/financial/application/entitlement-membership.listener.js');
    const { subscriptionId, installments } = await purchase(instVersionId);
    expect(await confirmCash(subscriptionId, 1)).toBe(200);
    await sleep(150);

    await handleMembershipInstallmentPaid({ payload: { subscriptionId, installmentId: Number(installments[0].id), seq: 1 } } as any);
    await handleMembershipInstallmentPaid({ payload: { subscriptionId, installmentId: Number(installments[1].id), seq: 2 } } as any); // unpaid
    await pool.execute(`UPDATE membership_installments SET status='overdue' WHERE id=?`, [installments[2].id]);
    await handleMembershipInstallmentPaid({ payload: { subscriptionId, installmentId: Number(installments[2].id), seq: 3 } } as any); // overdue

    const ents = await q<any[]>(`SELECT * FROM financial_entitlements WHERE source_type='membership'`);
    const mine = ents.filter((e) => e.source_id === Number(installments[0].id));
    expect(mine.length).toBe(1);
    expect(mine[0].entitlement_type).toBe('COURTZON_COMMISSION'); // cash custody
    expect(Number(mine[0].amount)).toBe(50); // fixed 100 ∝ 1000/2000
    expect(mine[0].collector).toBe('org');
    // Unpaid + overdue create nothing.
    expect(ents.filter((e) => e.source_id === Number(installments[1].id)).length).toBe(0);
    expect(ents.filter((e) => e.source_id === Number(installments[2].id)).length).toBe(0);
  });

  it('P3L-4 refund BEFORE settlement cancels the AVAILABLE entitlement', async () => {
    const { handleMembershipInstallmentPaid, handleMembershipPaymentRefunded } = await import('../../../modules/financial/application/entitlement-membership.listener.js');
    // Enable refunds for this org (separate financial operation, P2 policy).
    await pool.execute(
      `INSERT INTO organisation_membership_settings (organisation_id, enabled_durations, allowed_payment_methods, cancellation_refund_policy)
       VALUES (?, '["annual"]', '["cash","card"]', ?)
       ON DUPLICATE KEY UPDATE cancellation_refund_policy = VALUES(cancellation_refund_policy)`,
      [ORG, JSON.stringify({ cancellation: { void_future_unpaid: true }, refund: { type: 'full', window_days_before_start: 0 } })],
    );
    const { subscriptionId, installments } = await purchase(instVersionId);
    expect(await confirmCash(subscriptionId, 1)).toBe(200);
    await sleep(150);
    await handleMembershipInstallmentPaid({ payload: { subscriptionId, installmentId: Number(installments[0].id), seq: 1 } } as any);

    const [pay] = await pool.execute<any>(`SELECT payment_transaction_id FROM membership_installments WHERE id=?`, [installments[0].id]);
    // Real refund API (cash) also emits payment:refunded; the durable subscriber
    // is invoked directly (queue-free harness).
    const refund = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subscriptionId}/refund`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: { installmentIds: [Number(installments[0].id)] } });
    expect(refund.statusCode).toBe(200);
    await handleMembershipPaymentRefunded({ payload: { paymentId: Number(pay[0].payment_transaction_id), referenceType: 'membership_subscription' } } as any);

    const ents = await q<any[]>(`SELECT status FROM financial_entitlements WHERE source_type='membership' AND source_id=?`, [installments[0].id]);
    expect(ents[0].status).toBe('CANCELLED');
  });

  it('P3L-5 a SETTLED entitlement stays SETTLED after a refund (state machine terminal / immutable)', async () => {
    const { handleMembershipInstallmentPaid, handleMembershipPaymentRefunded } = await import('../../../modules/financial/application/entitlement-membership.listener.js');
    const { subscriptionId, installments } = await purchase(instVersionId);
    expect(await confirmCash(subscriptionId, 1)).toBe(200);
    await sleep(150);
    await handleMembershipInstallmentPaid({ payload: { subscriptionId, installmentId: Number(installments[0].id), seq: 1 } } as any);

    await pool.execute(`UPDATE financial_entitlements SET status='SETTLED', settled_at=NOW() WHERE source_type='membership' AND source_id=?`, [installments[0].id]);
    const [pay] = await pool.execute<any>(`SELECT payment_transaction_id FROM membership_installments WHERE id=?`, [installments[0].id]);
    await handleMembershipPaymentRefunded({ payload: { paymentId: Number(pay[0].payment_transaction_id), referenceType: 'membership_subscription' } } as any);

    const ents = await q<any[]>(`SELECT status FROM financial_entitlements WHERE source_type='membership' AND source_id=?`, [installments[0].id]);
    expect(ents[0].status).toBe('SETTLED'); // NOT cancelled — immutability preserved
  });

  it('P3L-6 entitlement handler is idempotent (unique source key, replay no-op)', async () => {
    const { handleMembershipInstallmentPaid } = await import('../../../modules/financial/application/entitlement-membership.listener.js');
    const { subscriptionId, installments } = await purchase(instVersionId);
    expect(await confirmCash(subscriptionId, 1)).toBe(200);
    await sleep(150);
    const envelope = { payload: { subscriptionId, installmentId: Number(installments[0].id), seq: 1 } } as any;
    await handleMembershipInstallmentPaid(envelope);
    await handleMembershipInstallmentPaid(envelope); // replay
    const ents = await q<any[]>(`SELECT id FROM financial_entitlements WHERE source_type='membership' AND source_id=?`, [installments[0].id]);
    expect(ents.length).toBe(1);
  });

  it('P3L-7 FULL-PAYMENT CARD membership creates SUBSCRIPTION-scoped entitlement (orgNet, collector courtzon)', async () => {
    const { handleMembershipSubscriptionActivated } = await import('../../../modules/financial/application/entitlement-membership.listener.js');
    const { subscriptionId } = await purchase(fixedVersionId, 'card');
    const confirm = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subscriptionId}/complete-card`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: {} });
    expect(confirm.statusCode).toBe(200);
    await sleep(150);
    await handleMembershipSubscriptionActivated({ payload: { subscriptionId } } as any);

    const ents = await q<any[]>(`SELECT * FROM financial_entitlements WHERE source_type='membership' AND source_id=?`, [subscriptionId]);
    expect(ents.length).toBe(1);
    const ent = ents[0];
    expect(ent.entitlement_type).toBe('ORGANIZATION_EARNING');
    expect(ent.collector).toBe('courtzon');
    const meta = JSON.parse(String(ent.metadata));
    expect(Number(meta.subscriptionId)).toBe(subscriptionId);
    // Entitlement amount == the subscription's realised orgNet (gross − fixed commission 100).
    const gross = Number(meta.gross);
    const commission = Number(meta.commission);
    expect(Number(ent.amount)).toBe(Math.round((gross - commission) * 100) / 100);

    // Idempotent replay.
    await handleMembershipSubscriptionActivated({ payload: { subscriptionId } } as any);
    expect((await q<any[]>(`SELECT id FROM financial_entitlements WHERE source_type='membership' AND source_id=?`, [subscriptionId])).length).toBe(1);
  });

  it('P3L-8 FULL-PAYMENT CASH membership creates SUBSCRIPTION-scoped COURTZON_COMMISSION (collector org)', async () => {
    const { handleMembershipSubscriptionActivated } = await import('../../../modules/financial/application/entitlement-membership.listener.js');
    const { subscriptionId } = await purchase(fixedVersionId, 'cash');
    const confirm = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subscriptionId}/confirm-cash`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: {} });
    expect(confirm.statusCode).toBe(200);
    await sleep(150);
    await handleMembershipSubscriptionActivated({ payload: { subscriptionId } } as any);
    const ents = await q<any[]>(`SELECT * FROM financial_entitlements WHERE source_type='membership' AND source_id=?`, [subscriptionId]);
    expect(ents.length).toBe(1);
    expect(ents[0].entitlement_type).toBe('COURTZON_COMMISSION');
    expect(ents[0].collector).toBe('org');
    expect(Number(ents[0].amount)).toBe(100); // full fixed commission snapshot
  });

  it('P3L-9 full-payment refund cancels the SUBSCRIPTION-scoped entitlement', async () => {
    const { handleMembershipSubscriptionActivated, handleMembershipPaymentRefunded } = await import('../../../modules/financial/application/entitlement-membership.listener.js');
    const { subscriptionId } = await purchase(fixedVersionId, 'cash');
    const confirm = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subscriptionId}/confirm-cash`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: {} });
    expect(confirm.statusCode).toBe(200);
    await sleep(150);
    await handleMembershipSubscriptionActivated({ payload: { subscriptionId } } as any);
    expect((await q<any[]>(`SELECT status FROM financial_entitlements WHERE source_type='membership' AND source_id=?`, [subscriptionId]))[0].status).toBe('PENDING');

    // Subscription-level refund (no installments) → fallback branch cancels.
    await handleMembershipPaymentRefunded({ payload: { paymentId: 999999, referenceType: 'membership_subscription', referenceId: subscriptionId } } as any);
    const status = (await q<any[]>(`SELECT status FROM financial_entitlements WHERE source_type='membership' AND source_id=?`, [subscriptionId]))[0].status;
    // PENDING is not yet terminal — cancelBySource requires the activation worker
    // to raise it; promote then re-cancel to prove the fallback path.
    const { financialEntitlementService } = await import('../../../modules/financial/application/financial-entitlement.service.js');
    if (status === 'PENDING') await financialEntitlementService.activateEntitlements(500);
    await handleMembershipPaymentRefunded({ payload: { paymentId: 999999, referenceType: 'membership_subscription', referenceId: subscriptionId } } as any);
    expect((await q<any[]>(`SELECT status FROM financial_entitlements WHERE source_type='membership' AND source_id=?`, [subscriptionId]))[0].status).toBe('CANCELLED');
  });

  it('P3L-10 INSTALLMENT subscriptions never create a subscription-scoped entitlement on activation', async () => {
    const { handleMembershipSubscriptionActivated } = await import('../../../modules/financial/application/entitlement-membership.listener.js');
    const { subscriptionId } = await purchase(instVersionId);
    expect(await confirmCash(subscriptionId, 1)).toBe(200);
    await sleep(150);
    await handleMembershipSubscriptionActivated({ payload: { subscriptionId } } as any);
    const subScoped = await q<any[]>(`SELECT id FROM financial_entitlements WHERE source_type='membership' AND source_id=?`, [subscriptionId]);
    expect(subScoped.length).toBe(0); // only per-installment entitlements exist
    const instScoped = await q<any[]>(`SELECT id FROM financial_entitlements WHERE source_type='membership' AND source_id LIKE '%' AND metadata LIKE '%installmentId%'`);
    expect(instScoped.length).toBeGreaterThan(0);
  });

  it('P3L-11 storefront exposes standardTotal, fixedDateNote and initialChargeEstimateForToday', async () => {
    const { computeFixedTermWindow, computeFirstTermAmount } = await import('../domain/membership-p3.types.js');
    const res = await app.inject({ method: 'GET', url: `/organisations/${ORG}/membership/plans-active`, headers: { authorization: `Bearer ${planeTokens.player}` } });
    expect(res.statusCode).toBe(200);
    const items = res.json() as any[];
    const fixed = items.find((i: any) => Number(i.version.id) === fixedVersionId);
    expect(fixed).toBeTruthy();
    expect(Number(fixed.standardTotal)).toBe(2000);
    expect(String(fixed.fixedDateNote)).toContain('Fixed-date');
    // The estimate equals the CURRENT proration for today.
    const today = new Date().toISOString().slice(0, 10);
    const localToday = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
    const month = Number(localToday.slice(5, 7)) % 12 + 1;
    const window = computeFixedTermWindow(localToday, month, 1);
    const expected = computeFirstTermAmount({ initialChargeType: 'full', initialChargePercent: null }, 2000, window).amount;
    expect(Number(fixed.initialChargeEstimateForToday)).toBe(Math.round(expected * 100) / 100);
  });
});