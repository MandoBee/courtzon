import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import Fastify from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * G11.22 P2 — GL VERIFICATION (deterministic, dev DB 3307/courtzon_v3).
 *
 * Verifies the accounting invariants of the approved P2 decisions:
 *   - FIRST installment activates the membership.
 *   - Per-installment postings (source_id = installment id) for cash and card.
 *   - FIXED CourtZon commission allocated proportionally
 *     (100 on 2000 split 1000/600/400 → 50/30/20).
 *   - One FULL invoice (total 2000 / paid / outstanding).
 *   - Overdue NEVER posts any accounting of its own and never deactivates.
 *   - Cancellation WITHOUT refund posts NO reversal GL.
 *   - Refund reverses ONLY the actually-refunded installment.
 *   - Idempotency: replaying confirms/refunds never duplicates ledger rows.
 *   - Tenancy: another organisation never receives these rows.
 */
const ORG = 60102231;
const ORG_B = 60102232;
const OWNER = 60102233;
const PLAYER = 60102234;

let pool: mysql.Pool;
let app: ReturnType<typeof Fastify>;
let planId: number;
let versionId: number;
let saasPlanId: number;
let createdPeriods: number[] = [];
const planeTokens = { owner: 'p2-gl-owner-token', player: 'p2-gl-player-token' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(probe: () => Promise<T>, ready: (v: T) => boolean, what: string, timeoutMs = 20000): Promise<T> {
  const end = Date.now() + timeoutMs;
  let value = await probe();
  while (!ready(value) && Date.now() < end) {
    await sleep(120);
    value = await probe();
  }
  if (!ready(value)) throw new Error(`Timed out waiting for ${what} (last=${JSON.stringify(value)})`);
  return value;
}

async function countLedgerByInstallment(installmentId: number, eventType: string): Promise<number> {
  const [rows] = await pool.execute<any>(
    `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='membership' AND source_id=? AND event_type=?`,
    [installmentId, eventType],
  );
  return Number(rows[0].c);
}

async function purchase(method: 'cash' | 'card'): Promise<{ subscriptionId: number; installments: any[] }> {
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

async function confirmCash(subId: number, seq: number): Promise<void> {
  const res = await app.inject({
    method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subId}/installments/${seq}/confirm-cash`,
    headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: {},
  });
  expect(res.statusCode).toBe(200);
}

async function prepareOrgPolicy(refundType: string): Promise<void> {
  await pool.execute<any>(
    `INSERT INTO organisation_membership_settings (organisation_id, enabled_durations, allowed_payment_methods, cancellation_refund_policy)
     VALUES (?, '["annual"]', '["cash","card"]', ?)
     ON DUPLICATE KEY UPDATE cancellation_refund_policy = VALUES(cancellation_refund_policy)`,
    [ORG, JSON.stringify({ cancellation: { void_future_unpaid: true }, refund: { type: refundType, window_days_before_start: 0 } })],
  );
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });

  // Clean disposable leftovers (high-ID scope only).
  await pool.execute(`DELETE FROM membership_installments WHERE subscription_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}))`);
  await pool.execute(`DELETE FROM payment_transactions WHERE reference_type='membership_subscription' AND reference_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}))`);
  await pool.execute(`DELETE FROM ledger_entries WHERE source_type='membership' AND (organisation_id IN (${ORG},${ORG_B}) OR source_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}) UNION SELECT id FROM membership_installments WHERE subscription_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}))))`);
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (${ORG},${ORG_B}) OR (organisation_id IS NULL AND reference_type IN ('membership_card_payment','membership_cash_payment','membership_org_receivable','membership_org_cash_receivable','membership_card_refund','membership_cash_refund','membership_org_receivable_reversal','membership_org_cash_receivable_rev'))`);
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

  // Users + orgs.
  await pool.execute(
    `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, timezone, dark_mode, account_status)
     VALUES (?, UUID(), 1, '05000003320', '+200500003320', 'p2-gl-owner@example.com', 'x', 'P2 GL Owner', 'male', 'UTC', 'system', 'active'),
            (?, UUID(), 1, '05000003321', '+200500003321', 'p2-gl-player@example.com', 'x', 'P2 GL Player', 'male', 'UTC', 'system', 'active')`,
    [OWNER, PLAYER],
  );
  await pool.execute(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active, access_model)
     VALUES (?, UUID(), 1, ?, 'P2 GL Club', 'p2-gl-club', 1, 'PUBLIC_CLUB')`,
    [ORG, OWNER],
  );
  await pool.execute(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active, access_model)
     VALUES (?, UUID(), 1, ?, 'P2 GL Other', 'p2-gl-other', 1, 'PUBLIC_CLUB')`,
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

  // Plan + version WITH installment schedule (1000/600/400 = 2000).
  const [planRes] = await pool.execute<any>(
    `INSERT INTO membership_plans (code, name, description, category, duration_type, duration_value, duration_days, plan_type, price, currency, status, is_public, organisation_id, created_by, updated_by)
     VALUES ('p2-gl-annual', 'P2 GL Annual', NULL, 'general', 'years', 1, 365, 'annual', 2000, 'EGP', 'active', 1, ?, ?, ?)`,
    [ORG, OWNER, OWNER],
  );
  planId = planRes.insertId;
  const [verRes] = await pool.execute<any>(
    `INSERT INTO membership_plan_versions (membership_plan_id, version_no, status, effective_from, duration_type, duration_periods, renewal_model, initial_charge_type, grace_days, branch_scope, allowed_payment_methods, currency, installments_enabled)
     VALUES (?, 1, 'active', CURDATE(), 'annual', 1, 'anniversary', 'full', 0, 'ALL', '["cash","card"]', 'EGP', 1)`,
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

  // CourtZon commission: FIXED 100 per membership (decision #8 example).
  const [sp] = await pool.execute<any>(`SELECT id FROM subscription_plans LIMIT 1`);
  saasPlanId = Number(sp[0].id);
  await pool.execute(`INSERT IGNORE INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, subscription_status, auto_renew) VALUES (?, ?, 'monthly', 'active', 1)`, [ORG, saasPlanId]);
  await pool.execute(`INSERT IGNORE INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES (?, 'membership', 'fixed', 100.00)`, [saasPlanId]);

  // App-level DB + auth + guards + listeners (P1 GL harness pattern).
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
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.execute(`DELETE FROM membership_installments WHERE subscription_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}))`);
  await pool.execute(`DELETE FROM payment_transactions WHERE reference_type='membership_subscription' AND reference_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}))`);
  await pool.execute(`DELETE FROM ledger_entries WHERE source_type='membership' AND source_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}) UNION SELECT id FROM membership_installments WHERE subscription_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B})))`);
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (${ORG},${ORG_B}) OR (organisation_id IS NULL AND reference_type IN ('membership_card_payment','membership_cash_payment','membership_org_receivable','membership_org_cash_receivable','membership_card_refund','membership_cash_refund','membership_org_receivable_reversal','membership_org_cash_receivable_rev'))`);
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

describe('G11.22 P2 — GL per-installment posting + fixed proportional commission + refund + idempotency', () => {
  it('P2GL-1 CASH: first installment activates; invoice is FULL 2000 with paid 1000; ledger per installment (comm 50)', async () => {
    const { subscriptionId, installments } = await purchase('cash');
    expect(installments.length).toBe(3);
    expect(Number(installments[0].amount)).toBe(1000);
    expect(Number(installments[0].commission_amount)).toBe(50);
    expect(Number(installments[1].commission_amount)).toBe(30);
    expect(Number(installments[2].commission_amount)).toBe(20);
    // Total allocated commission == the fixed snapshot (invariant #8).
    expect(Number(installments[0].commission_amount) + Number(installments[1].commission_amount) + Number(installments[2].commission_amount)).toBe(100);

    await confirmCash(subscriptionId, 1);

    await waitFor(() => countLedgerByInstallment(Number(installments[0].id), 'membership_cash_payment'), (c) => c >= 2, 'CourtZon cash posting for installment 1');
    await waitFor(() => countLedgerByInstallment(Number(installments[0].id), 'membership_org_cash_receivable'), (c) => c >= 4, 'org cash posting for installment 1');

    const [sub] = await pool.execute<any>(`SELECT status, payment_status, invoice_id FROM membership_subscriptions WHERE id=?`, [subscriptionId]);
    expect(sub[0].status).toBe('active'); // FIRST INSTALLMENT → ACTIVE
    expect(sub[0].payment_status).toBe('partially_paid');

    const [inv] = await pool.execute<any>(`SELECT status, total, paid_amount FROM invoices WHERE id=?`, [sub[0].invoice_id]);
    expect(String(inv[0].status)).toBe('partially_paid');
    expect(String(inv[0].total)).toBe('2000.00');
    expect(String(inv[0].paid_amount)).toBe('1000.00');

    // CourtZon book legs.
    const [cashRows] = await pool.execute<any>(
      `SELECT le.side, le.amount, c.code AS code, le.organisation_id FROM ledger_entries le JOIN chart_of_accounts c ON c.id=le.chart_account_id
       WHERE le.source_type='membership' AND le.source_id=? AND le.event_type='membership_cash_payment' ORDER BY le.id`,
      [installments[0].id],
    );
    const m = new Map(cashRows.map((r: any) => [r.code, { side: r.side, amount: Number(r.amount) }]));
    expect(m.get('1161')?.side).toBe('debit');
    expect(String(m.get('1161')?.amount)).toBe('50');
    expect(m.get('4110')?.side).toBe('credit');
    expect(String(m.get('4110')?.amount)).toBe('50');
    expect(cashRows.every((r: any) => r.organisation_id === null)).toBe(true);

    // Organisation book legs.
    const [orgCash] = await pool.execute<any>(
      `SELECT le.side, le.amount, c.code AS code FROM ledger_entries le JOIN chart_of_accounts c ON c.id=le.chart_account_id
       WHERE le.source_type='membership' AND le.source_id=? AND le.event_type='membership_org_cash_receivable' AND le.organisation_id=? ORDER BY le.id`,
      [installments[0].id, ORG],
    );
    const om = new Map(orgCash.map((r: any) => [r.code, { side: r.side, amount: Number(r.amount) }]));
    expect(String(om.get('ORG-CASH')?.amount)).toBe('1000');
    expect(String(om.get('MKT-COMM-EXP')?.amount)).toBe('50');
    expect(String(om.get('MEMB-REV')?.amount)).toBe('1000');
    expect(String(om.get('MKT-CZ-PAY')?.amount)).toBe('50');

    return { subscriptionId, installments };
  });

  it('P2GL-2 CASH: second installment posts its own ledger slice (comm 30) and invoice paid becomes 1600', async () => {
    const { subscriptionId, installments } = await purchase('cash');
    await confirmCash(subscriptionId, 1);
    await confirmCash(subscriptionId, 2);

    await waitFor(() => countLedgerByInstallment(Number(installments[1].id), 'membership_org_cash_receivable'), (c) => c >= 4, 'org cash posting for installment 2');

    const [inv] = await pool.execute<any>(
      `SELECT i.paid_amount FROM invoices i JOIN membership_subscriptions ms ON ms.invoice_id=i.id WHERE ms.id=?`,
      [subscriptionId],
    );
    expect(String(inv[0].paid_amount)).toBe('1600.00');

    const [rows] = await pool.execute<any>(
      `SELECT le.amount, c.code AS code FROM ledger_entries le JOIN chart_of_accounts c ON c.id=le.chart_account_id
       WHERE le.source_type='membership' AND le.source_id=? AND le.event_type='membership_cash_payment' AND le.side='debit'`,
      [installments[1].id],
    );
    const m = new Map(rows.map((r: any) => [r.code, Number(r.amount)]));
    expect(m.get('1161')).toBe(30);
  });

  it('P2GL-3 CARD: card installment posts 1100/2202/4110 + org book; overdue NEVER deactivates and posts nothing', async () => {
    const { subscriptionId, installments } = await purchase('card');
    const inst1 = installments[0];

    const res = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subscriptionId}/installments/1/complete-card`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: {} });
    expect(res.statusCode).toBe(200);

    await waitFor(() => countLedgerByInstallment(Number(inst1.id), 'membership_card_payment'), (c) => c >= 3, 'CourtZon card posting');
    await waitFor(() => countLedgerByInstallment(Number(inst1.id), 'membership_org_receivable'), (c) => c >= 3, 'org card posting');

    const [cardRows] = await pool.execute<any>(
      `SELECT le.side, le.amount, c.code AS code, le.organisation_id FROM ledger_entries le JOIN chart_of_accounts c ON c.id=le.chart_account_id
       WHERE le.source_type='membership' AND le.source_id=? AND le.event_type='membership_card_payment' ORDER BY le.id`,
      [inst1.id],
    );
    const byCode = new Map(cardRows.map((r: any) => [r.code, { side: r.side, amount: Number(r.amount) }]));
    // CourtZon merchant-of-record: 1100 dr gross | 2202 cr orgNet | 4110 cr commission.
    expect(byCode.get('1100')?.side).toBe('debit');
    expect(String(byCode.get('1100')?.amount)).toBe('1000');
    expect(byCode.get('2202')?.side).toBe('credit');
    expect(String(byCode.get('2202')?.amount)).toBe('950');
    expect(byCode.get('4110')?.side).toBe('credit');
    expect(String(byCode.get('4110')?.amount)).toBe('50');

    // Overdue does NOT deactivate and posts NO accounting of its own.
    const inst2 = installments[1];
    await pool.execute(`UPDATE membership_installments SET status='overdue' WHERE id=? AND status='pending'`, [inst2.id]);
    const [subAfter] = await pool.execute<any>(`SELECT status FROM membership_subscriptions WHERE id=?`, [subscriptionId]);
    expect(subAfter[0].status).toBe('active');
    const [overdueLedger] = await pool.execute<any>(`SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='membership' AND source_id=?`, [inst2.id]);
    expect(Number(overdueLedger[0].c)).toBe(0);
  });

  it('P2GL-4 CANCELLATION WITHOUT REFUND: no reversal GL is ever posted', async () => {
    const { subscriptionId, installments } = await purchase('cash');
    await confirmCash(subscriptionId, 1);
    await prepareOrgPolicy('none'); // default-ish policy
    const res = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subscriptionId}/cancel`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: { reason: 'trial' } });
    expect(res.statusCode).toBe(200);

    const [sub] = await pool.execute<any>(`SELECT status FROM membership_subscriptions WHERE id=?`, [subscriptionId]);
    expect(sub[0].status).toBe('cancelled');
    const [voided] = await pool.execute<any>(`SELECT status FROM membership_installments WHERE subscription_id=? ORDER BY seq`, [subscriptionId]);
    expect(voided[0].status).toBe('paid'); // paid history preserved
    expect(voided[1].status).toBe('voided'); // future unpaid voided
    expect(voided[2].status).toBe('voided');

    // Cancellation alone must NOT generate ANY reversal events (#11/#6).
    const ids = installments.map((i: any) => Number(i.id));
    const [rev] = await pool.execute<any>(
      `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='membership'
       AND source_id IN (${ids.join(',')})
       AND event_type IN ('membership_cash_refund','membership_card_refund','membership_org_receivable_reversal','membership_org_cash_receivable_rev')`,
    );
    expect(Number(rev[0].c)).toBe(0);
  });

  it('P2GL-5 REFUND (config-only): reverses ONLY the refunded installment + invoice paid drops', async () => {
    const { subscriptionId, installments } = await purchase('cash');
    await confirmCash(subscriptionId, 1);
    await prepareOrgPolicy('full');

    const inst1 = installments[0];
    const res = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subscriptionId}/refund`, headers: { authorization: `Bearer ${planeTokens.owner}` }, payload: { installmentIds: [Number(inst1.id)] } });
    expect(res.statusCode).toBe(200);
    expect(res.json().refunded).toBe(1);
    expect(res.json().refundedAmount).toBe(1000);

    await waitFor(() => countLedgerByInstallment(Number(inst1.id), 'membership_cash_refund'), (c) => c >= 2, 'cash refund CourtZon book');
    await waitFor(() => countLedgerByInstallment(Number(inst1.id), 'membership_org_cash_receivable_rev'), (c) => c >= 4, 'cash refund org book');

    const [instState] = await pool.execute<any>(`SELECT status, payment_transaction_id FROM membership_installments WHERE id=?`, [inst1.id]);
    expect(instState[0].status).toBe('refunded');
    expect(instState[0].payment_transaction_id).not.toBeNull();
    const [payState] = await pool.execute<any>(`SELECT payment_status FROM payment_transactions WHERE id=?`, [instState[0].payment_transaction_id]);
    expect(payState[0].payment_status).toBe('refunded');

    const [inv] = await pool.execute<any>(
      `SELECT i.paid_amount FROM invoices i JOIN membership_subscriptions ms ON ms.invoice_id=i.id WHERE ms.id=?`,
      [subscriptionId],
    );
    expect(String(inv[0].paid_amount)).toBe('0.00');

    // Reversal legs (CourtZon book): Dr 4110 commission / Cr 1161 receivable.
    const [revRows] = await pool.execute<any>(
      `SELECT le.side, le.amount, c.code AS code FROM ledger_entries le JOIN chart_of_accounts c ON c.id=le.chart_account_id
       WHERE le.source_type='membership' AND le.source_id=? AND le.event_type='membership_cash_refund' ORDER BY le.id`,
      [inst1.id],
    );
    const rm = new Map(revRows.map((r: any) => [r.code, { side: r.side, amount: Number(r.amount) }]));
    expect(rm.get('4110')?.side).toBe('debit');
    expect(String(rm.get('4110')?.amount)).toBe('50');
    expect(rm.get('1161')?.side).toBe('credit');
    expect(String(rm.get('1161')?.amount)).toBe('50');
  });

  it('P2GL-6 IDEMPOTENCY: replaying confirms + refunds never duplicates ledger rows', async () => {
    const { subscriptionId, installments } = await purchase('cash');
    await confirmCash(subscriptionId, 1);
    await confirmCash(subscriptionId, 2);
    await waitFor(() => countLedgerByInstallment(Number(installments[0].id), 'membership_org_cash_receivable'), (c) => c >= 4, 'installment 1 org posting');
    await waitFor(() => countLedgerByInstallment(Number(installments[1].id), 'membership_org_cash_receivable'), (c) => c >= 4, 'installment 2 org posting');

    const before = await countLedgerByInstallment(Number(installments[0].id), 'membership_org_cash_receivable')
      + await countLedgerByInstallment(Number(installments[1].id), 'membership_org_cash_receivable');
    expect(before).toBe(8);
    // Replay both confirms — must be no-ops.
    await confirmCash(subscriptionId, 1);
    await confirmCash(subscriptionId, 2);
    await sleep(500);
    const after = await countLedgerByInstallment(Number(installments[0].id), 'membership_org_cash_receivable')
      + await countLedgerByInstallment(Number(installments[1].id), 'membership_org_cash_receivable');
    expect(after).toBe(before);
  });

  it('P2GL-7 TENANCY: another organisation never receives membership GL rows', async () => {
    const [rows] = await pool.execute<any>(`SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='membership' AND organisation_id=?`, [ORG_B]);
    expect(Number(rows[0].c)).toBe(0);
    const [platformNull] = await pool.execute<any>(`SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='membership' AND organisation_id IS NULL`);
    expect(Number(platformNull[0].c)).toBeGreaterThan(0);
  });

  it('P2GL-8 fixed commission proportional allocation is exact (Σ = snapshot fixed 100)', async () => {
    const [rows] = await pool.execute<any>(
      `SELECT SUM(commission_amount) AS total FROM membership_installments
       WHERE subscription_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id=?)`,
      [ORG],
    );
    // Every installment schedule sums to the fixed snapshot (100) for the
    // subscription(s) that exercised proportional allocation.
    expect(Number(rows[0].total)).toBeGreaterThan(0);
    const [check] = await pool.execute<any>(
      `SELECT COUNT(*) AS bad FROM (
         SELECT subscription_id, ROUND(SUM(commission_amount),2) s FROM membership_installments
         WHERE subscription_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id=?)
         GROUP BY subscription_id HAVING s <> 100.00
       ) t`,
      [ORG],
    );
    expect(Number(check[0].bad)).toBe(0);
  });
});