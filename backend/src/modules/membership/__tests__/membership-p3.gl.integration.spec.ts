import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import Fastify from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * G11.22 P3 — GL VERIFICATION for Membership refunds (settled vs non-settled,
 * G11.4 reuse). dev DB 3307/courtzon_v3.
 *
 * Approved rules:
 *   - Non-settled CARD refund → existing `membership_card_refund` (Cr 1100).
 *   - Settled CARD refund (durable gateway history) → NEW
 *     `membership_card_refund_settled` (Cr 1120 — refund paid out of the bank),
 *     exact G11.4 mirror; refund_expense (5220) reserved for an unrecoverable
 *     excess (0 in these flows — the leg is omitted, posting stays balanced).
 *   - org book reversal always posted; SETTLED entitlements immutable (P3L).
 *   - idempotency: replay never duplicates ledger rows.
 *   - cash refund behaviour (P2) unchanged.
 */
const ORG = 60102261;
const ORG_B = 60102262;
const OWNER = 60102263;
const PLAYER = 60102264;

let pool: mysql.Pool;
let app: ReturnType<typeof Fastify>;
let versionId: number;
let saasPlanId: number;
let createdPeriods: number[] = [];
const planeTokens = { owner: 'p3-gl-owner-token', player: 'p3-gl-player-token' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(probe: () => Promise<T>, ready: (v: T) => boolean, what: string, timeoutMs = 20000): Promise<T> {
  const end = Date.now() + timeoutMs;
  let value = await probe();
  while (!ready(value) && Date.now() < end) { await sleep(120); value = await probe(); }
  if (!ready(value)) throw new Error(`Timed out waiting for ${what} (last=${JSON.stringify(value)})`);
  return value;
}

async function countBy(sourceId: number, eventType: string): Promise<number> {
  const [rows] = await pool.execute<any>(
    `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='membership' AND source_id=? AND event_type=?`,
    [sourceId, eventType],
  );
  return Number(rows[0].c);
}

async function withDraw(eventType: string, sourceId: number): Promise<{ legs: any[]; fnDebit: any; fnCredit: any }> {
  const [rows] = await pool.execute<any>(
    `SELECT le.side, le.amount, c.code AS code, le.organisation_id FROM ledger_entries le JOIN chart_of_accounts c ON c.id=le.chart_account_id
     WHERE le.source_type='membership' AND le.source_id=? AND le.event_type=? ORDER BY le.id`,
    [sourceId, eventType],
  );
  const legs = rows as any[];
  const debit = legs.filter((l) => l.side === 'debit').reduce((s, l) => s + Number(l.amount), 0);
  const credit = legs.filter((l) => l.side === 'credit').reduce((s, l) => s + Number(l.amount), 0);
  return { legs, fnDebit: () => debit, fnCredit: () => credit };
}

async function purchase(method: 'cash' | 'card'): Promise<{ subscriptionId: number; installments: any[] }> {
  const res = await app.inject({ method: 'POST', url: `/organisations/${ORG}/membership/subscriptions`, headers: { authorization: `Bearer ${planeTokens.player}` }, payload: { planVersionId: versionId, paymentMethod: method } });
  expect(res.statusCode).toBe(201);
  const subscriptionId = Number(res.json().subscriptionId);
  const [rows] = await pool.execute<any>(`SELECT * FROM membership_installments WHERE subscription_id=? ORDER BY seq`, [subscriptionId]);
  return { subscriptionId, installments: rows as any[] };
}

async function confirmCard(subId: number, seq: number): Promise<number> {
  const res = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subId}/installments/${seq}/complete-card`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: {} });
  return res.statusCode;
}

/** Simulate a completed gateway settlement batch containing `paymentId`. */
async function insertCompletedSettlement(paymentId: number, amount: number): Promise<void> {
  const [ins] = await pool.execute<any>(
    `INSERT INTO gateway_settlements (batch_code, settlement_status, gross_amount, gateway_fee_amount, net_amount, currency, transaction_count, settled_by, notes)
     VALUES (UUID(), 'completed', ?, 0, ?, 'EGP', 1, ?, 'P3 test batch')`,
    [amount, amount, OWNER],
  );
  const batchId = ins.insertId;
  await pool.execute(
    `INSERT INTO gateway_settlement_transactions (gateway_settlement_id, payment_transaction_id, gross_amount, gateway_fee_pct, gateway_fee_fixed, gateway_fee_amount, net_amount, currency, created_at)
     VALUES (?, ?, ?, 0, 0, 0, ?, 'EGP', NOW())`,
    [batchId, paymentId, amount, amount],
  );
}

async function emitCardRefund(subscriptionId: number, paymentId: number, amount: number): Promise<void> {
  const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
  eventBusV2.emit('payment:refunded', {
    paymentId, userId: PLAYER, amount, reason: 'p3 test', referenceType: 'membership_subscription', referenceId: subscriptionId,
    metadata: { paymentMethod: 'card', currency: 'EGP' },
  } as Record<string, unknown>, { aggregateType: 'payment_transaction', aggregateId: String(paymentId), aggregateVersion: 1 });
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });

  await pool.execute(`DELETE FROM membership_installments WHERE subscription_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}))`);
  await pool.execute(`DELETE FROM payment_transactions WHERE reference_type='membership_subscription' AND reference_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}))`);
  await pool.execute(`DELETE FROM ledger_entries WHERE source_type='membership' AND source_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}) UNION SELECT id FROM membership_installments WHERE subscription_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B})))`);
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (${ORG},${ORG_B}) OR (organisation_id IS NULL AND reference_type LIKE 'membership%')`);
  await pool.execute(`DELETE FROM gateway_settlement_transactions WHERE gateway_settlement_id IN (SELECT id FROM gateway_settlements WHERE notes='P3 test batch')`);
  await pool.execute(`DELETE FROM gateway_settlements WHERE notes='P3 test batch'`);
  await pool.execute(`DELETE FROM financial_entitlements WHERE source_type='membership' OR organisation_id IN (${ORG},${ORG_B})`);
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
     VALUES (?, UUID(), 1, '05000003610', '+200500003610', 'p3-gl-owner@example.com', 'x', 'P3GL Owner', 'male', 'UTC', 'system', 'active'),
            (?, UUID(), 1, '05000003611', '+200500003611', 'p3-gl-player@example.com', 'x', 'P3GL Player', 'male', 'UTC', 'system', 'active')`,
    [OWNER, PLAYER],
  );
  await pool.execute(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active, access_model)
     VALUES (?, UUID(), 1, ?, 'P3GL Club', 'p3gl-club', 1, 'PUBLIC_CLUB')`,
    [ORG, OWNER],
  );
  await pool.execute(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active, access_model)
     VALUES (?, UUID(), 1, ?, 'P3GL Other', 'p3gl-other', 1, 'PUBLIC_CLUB')`,
    [ORG_B, OWNER],
  );

  // Open accounting periods.
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
    const [ins] = await pool.execute<any>(
      `INSERT INTO accounting_periods (organisation_id, fiscal_year, period_number, start_date, end_date, status)
       VALUES (?, ?, ?, ?, ?, 'open')`,
      [orgScope, y, m, start, end],
    );
    createdPeriods.push(ins.insertId);
  }

  const [planRes] = await pool.execute<any>(
    `INSERT INTO membership_plans (code, name, description, category, duration_type, duration_value, duration_days, plan_type, price, currency, status, is_public, organisation_id, created_by, updated_by)
     VALUES ('p3-gl-inst', 'P3GL Inst', NULL, 'general', 'years', 1, 365, 'annual', 2000, 'EGP', 'active', 1, ?, ?, ?)`,
    [ORG, OWNER, OWNER],
  );
  const [verRes] = await pool.execute<any>(
    `INSERT INTO membership_plan_versions (membership_plan_id, version_no, status, effective_from, duration_type, duration_periods, renewal_model, initial_charge_type, grace_days, branch_scope, allowed_payment_methods, currency, installments_enabled)
     VALUES (?, 1, 'active', CURDATE(), 'annual', 1, 'anniversary', 'full', 0, 'ALL', '["cash","card"]', 'EGP', 1)`,
    [planRes.insertId],
  );
  versionId = verRes.insertId;
  await pool.execute(
    `INSERT INTO membership_plan_components (plan_version_id, code, name, amount, is_required, quantity, sort_order) VALUES
     (?, 'membership', 'Membership fee', 2000, 1, 1, 0)`,
    [versionId],
  );
  await pool.execute(
    `INSERT INTO membership_plan_installment_templates (plan_version_id, seq, amount, due_offset_days) VALUES
     (?, 1, 1000, 0), (?, 2, 600, 30), (?, 3, 400, 60)`,
    [versionId, versionId, versionId],
  );

  const [sp] = await pool.execute<any>(`SELECT id FROM subscription_plans LIMIT 1`);
  saasPlanId = Number(sp[0].id);
  await pool.execute(`INSERT IGNORE INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, subscription_status, auto_renew) VALUES (?, ?, 'monthly', 'active', 1)`, [ORG, saasPlanId]);
  await pool.execute(
    `INSERT INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES (?, 'membership', 'fixed', 100.00)
     ON DUPLICATE KEY UPDATE rate_type='fixed', amount=100.00`,
    [saasPlanId],
  );
  await pool.execute(
    `INSERT INTO organisation_membership_settings (organisation_id, enabled_durations, allowed_payment_methods, cancellation_refund_policy)
     VALUES (?, '["annual"]', '["cash","card"]', ?)
     ON DUPLICATE KEY UPDATE cancellation_refund_policy = VALUES(cancellation_refund_policy)`,
    [ORG, JSON.stringify({ cancellation: { void_future_unpaid: true }, refund: { type: 'full', window_days_before_start: 0 } })],
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
  await sleep(1500);
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.execute(`DELETE FROM membership_installments WHERE subscription_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}))`);
  await pool.execute(`DELETE FROM payment_transactions WHERE reference_type='membership_subscription' AND reference_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}))`);
  await pool.execute(`DELETE FROM ledger_entries WHERE source_type='membership' AND source_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}) UNION SELECT id FROM membership_installments WHERE subscription_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B})))`);
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (${ORG},${ORG_B}) OR (organisation_id IS NULL AND reference_type LIKE 'membership%')`);
  await pool.execute(`DELETE FROM gateway_settlement_transactions WHERE gateway_settlement_id IN (SELECT id FROM gateway_settlements WHERE notes='P3 test batch')`);
  await pool.execute(`DELETE FROM gateway_settlements WHERE notes='P3 test batch'`);
  await pool.execute(`DELETE FROM financial_entitlements WHERE source_type='membership' OR organisation_id IN (${ORG},${ORG_B})`);
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
  for (const pid of createdPeriods) {
    const [refs] = await pool.execute<any>(`SELECT COUNT(*) AS c FROM general_ledger WHERE period_id=?`, [pid]);
    if (Number(refs[0].c) === 0) await pool.execute(`DELETE FROM accounting_periods WHERE id=?`, [pid]);
  }
  await pool.end();
}, 30000);

describe('G11.22 P3 — Membership settled / non-settled refund GL', () => {
  it('P3GL-1 NON-SETTLED card refund → existing Cr 1100 (G11.4 unsettled leg), balanced', async () => {
    const { subscriptionId, installments } = await purchase('card');
    expect(await confirmCard(subscriptionId, 1)).toBe(200);
    const inst = installments[0];
    const pay = await pool.execute<any>(`SELECT payment_transaction_id AS pid FROM membership_installments WHERE id=?`, [inst.id]);
    const paymentId = Number(pay[0][0].pid);

    await emitCardRefund(subscriptionId, paymentId, 1000);
    await waitFor(() => countBy(Number(inst.id), 'membership_card_refund'), (c) => c >= 3, 'unsettled CourtZon refund posting');

    const { legs, fnDebit, fnCredit } = await withDraw('membership_card_refund', Number(inst.id));
    const byCode = new Map(legs.map((l) => [l.code, { side: l.side, amount: Number(l.amount) }]));
    expect(byCode.get('2202')).toMatchObject({ side: 'debit', amount: 950 });
    expect(byCode.get('4110')).toMatchObject({ side: 'debit', amount: 50 });
    expect(byCode.get('1100')).toMatchObject({ side: 'credit', amount: 1000 });
    expect(legs.every((l) => l.organisation_id === null)).toBe(true);
    expect(fnDebit()).toBe(fnCredit()); // balanced

    await waitFor(() => countBy(Number(inst.id), 'membership_org_receivable_reversal'), (c) => c >= 3, 'org book reversal');
    const [orgRows] = await pool.execute<any>(
      `SELECT le.side, le.amount, c.code AS code FROM ledger_entries le JOIN chart_of_accounts c ON c.id=le.chart_account_id
       WHERE le.source_type='membership' AND le.source_id=? AND le.event_type='membership_org_receivable_reversal' AND le.organisation_id=? ORDER BY le.id`,
      [inst.id, ORG],
    );
    const oMap = new Map(orgRows.map((r: any) => [r.code, { side: r.side, amount: Number(r.amount) }]));
    expect(oMap.get('MEMB-REV')).toMatchObject({ side: 'debit', amount: 1000 });
    expect(oMap.get('1161')).toMatchObject({ side: 'credit', amount: 950 });
    expect(oMap.get('MKT-COMM-EXP')).toMatchObject({ side: 'credit', amount: 50 });
  });

  it('P3GL-2 SETTLED card refund → NEW settled event Cr 1120 (G11.4 settled leg), balanced', async () => {
    const { subscriptionId, installments } = await purchase('card');
    expect(await confirmCard(subscriptionId, 1)).toBe(200);
    const inst = installments[0];
    const pay = await pool.execute<any>(`SELECT payment_transaction_id AS pid FROM membership_installments WHERE id=?`, [inst.id]);
    const paymentId = Number(pay[0][0].pid);
    await insertCompletedSettlement(paymentId, 1000);

    await emitCardRefund(subscriptionId, paymentId, 1000);
    await waitFor(() => countBy(Number(inst.id), 'membership_card_refund_settled'), (c) => c >= 3, 'settled CourtZon refund posting');

    const { legs, fnDebit, fnCredit } = await withDraw('membership_card_refund_settled', Number(inst.id));
    const byCode = new Map(legs.map((l) => [l.code, { side: l.side, amount: Number(l.amount) }]));
    expect(byCode.get('2202')).toMatchObject({ side: 'debit', amount: 950 });
    expect(byCode.get('4110')).toMatchObject({ side: 'debit', amount: 50 });
    expect(byCode.get('1120')).toMatchObject({ side: 'credit', amount: 1000 });
    // refund_expense is 0 in this flow → the leg is omitted; no 5220 line.
    expect(legs.some((l) => l.code === '5220')).toBe(false);
    expect(legs.every((l) => l.organisation_id === null)).toBe(true);
    expect(fnDebit()).toBe(fnCredit()); // balanced
    expect(fnDebit()).toBe(1000);
    expect(fnCredit()).toBe(1000);

    await waitFor(() => countBy(Number(inst.id), 'membership_org_receivable_reversal'), (c) => c >= 3, 'org book reversal');
  });

  it('P3GL-3 CASH refund (P2 path) is unchanged — Cr 1161 commission', async () => {
    const { subscriptionId, installments } = await purchase('cash');
    const res = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subscriptionId}/installments/1/confirm-cash`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: {} });
    expect(res.statusCode).toBe(200);
    const inst = installments[0];
    const refund = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subscriptionId}/refund`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: { installmentIds: [Number(inst.id)] } });
    expect(refund.statusCode).toBe(200);

    await waitFor(() => countBy(Number(inst.id), 'membership_cash_refund'), (c) => c >= 2, 'cash refund posting');
    const { legs, fnDebit, fnCredit } = await withDraw('membership_cash_refund', Number(inst.id));
    const byCode = new Map(legs.map((l) => [l.code, { side: l.side, amount: Number(l.amount) }]));
    expect(byCode.get('4110')).toMatchObject({ side: 'debit', amount: 50 });
    expect(byCode.get('1161')).toMatchObject({ side: 'credit', amount: 50 });
    expect(fnDebit()).toBe(fnCredit());
    await waitFor(() => countBy(Number(inst.id), 'membership_org_cash_receivable_rev'), (c) => c >= 4, 'org cash refund reversal');
  });

  it('P3GL-4 IDEMPOTENCY: re-emitting a refund does not duplicate ledger rows', async () => {
    const { subscriptionId, installments } = await purchase('card');
    expect(await confirmCard(subscriptionId, 1)).toBe(200);
    const inst = installments[0];
    const pay = await pool.execute<any>(`SELECT payment_transaction_id AS pid FROM membership_installments WHERE id=?`, [inst.id]);
    const paymentId = Number(pay[0][0].pid);
    await insertCompletedSettlement(paymentId, 1000);

    await emitCardRefund(subscriptionId, paymentId, 1000);
    await waitFor(() => countBy(Number(inst.id), 'membership_card_refund_settled'), (c) => c >= 3, 'settled refund posting');
    const before = await countBy(Number(inst.id), 'membership_card_refund_settled');
    await emitCardRefund(subscriptionId, paymentId, 1000); // replay
    await sleep(600);
    const after = await countBy(Number(inst.id), 'membership_card_refund_settled');
    expect(after).toBe(before);
  });

  it('P3GL-5 TENANCY: refunds never leak to another organisation', async () => {
    const [rows] = await pool.execute<any>(`SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='membership' AND organisation_id=?`, [ORG_B]);
    expect(Number(rows[0].c)).toBe(0);
    const [platform] = await pool.execute<any>(`SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='membership' AND event_type IN ('membership_card_refund','membership_card_refund_settled') AND organisation_id IS NULL`);
    expect(Number(platform[0].c)).toBeGreaterThan(0);
  });
});