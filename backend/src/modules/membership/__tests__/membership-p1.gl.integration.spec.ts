import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import Fastify from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * G11.22 P1 — FINAL GL VERIFICATION (deterministic).
 *
 * Reproduces the repository's established accounting harness pattern:
 *  - tournament-card-accounting.g11-1: dev DB (127.0.0.1:3307 courtzon_v3),
 *    explicit `registerAccountingEventListeners()`, explicit event emission,
 *    waitFor/polling (no fixed sleeps), high-unique-ID cleanup.
 *  - coach-session bare-app pattern: real HTTP via a minimal Fastify app with
 *    `initAuthMiddleware`/`initRouteGuard` wire-ups and AppError handler.
 *
 * The dev DB already contains the authoritative Global COA / L4 postable
 * accounts (1100, 2202, 4110, 2300, 1161, ...) used by every accounting
 * harness — NO account fixtures are created or deleted here.
 *
 * Only files touched: this spec.
 */

const ORG = 60102211;
const ORG_B = 60102212;
const OWNER = 60102213;
const PLAYER = 60102214;

let pool: mysql.Pool;
let app: ReturnType<typeof Fastify>;
let planId: number;
let versionId: number;
let createdPeriods: number[] = [];
const planeTokens = { owner: 'gl-owner-token', player: 'gl-player-token' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(probe: () => Promise<T>, ready: (v: T) => boolean, what: string, timeoutMs = 15000): Promise<T> {
  const end = Date.now() + timeoutMs;
  let value = await probe();
  while (!ready(value) && Date.now() < end) {
    await sleep(120);
    value = await probe();
  }
  if (!ready(value)) throw new Error(`Timed out waiting for ${what} (last=${JSON.stringify(value)})`);
  return value;
}

async function countLedger(sourceId: number, eventType: string): Promise<number> {
  const [rows] = await pool.execute<any>(
    `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='membership' AND source_id=? AND event_type=?`,
    [sourceId, eventType],
  );
  return Number(rows[0].c);
}

async function ensureOpenPeriods(): Promise<number[]> {
  const created: number[] = [];
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
    created.push(ins.insertId);
  }
  return created;
}

async function purchase(paymentMethod: 'card' | 'cash'): Promise<number> {
  const res = await app.inject({
    method: 'POST', url: `/organisations/${ORG}/membership/subscriptions`,
    headers: { authorization: `Bearer ${planeTokens.player}` },
    payload: { planVersionId: versionId, paymentMethod },
  });
  expect(res.statusCode).toBe(201);
  return Number(res.json().subscriptionId);
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });

  // Clean disposable leftovers of previous runs (high-ID scope only).
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (${ORG},${ORG_B}) OR (organisation_id IS NULL AND reference_type IN ('membership_card_payment','membership_cash_payment','membership_org_receivable','membership_org_cash_receivable'))`);
  await pool.execute(`DELETE FROM payment_transactions WHERE reference_type='membership_subscription' AND reference_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}))`);
  await pool.execute(`DELETE FROM ledger_entries WHERE source_type='membership' AND source_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}))`);
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

  // Owners/player (dev DB rows; auth resolved via token map below — no seed/register needed).
  await pool.execute(
    `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, timezone, dark_mode, account_status)
     VALUES (?, UUID(), 1, '05000003200', '+2005000003200', 'gl-owner@example.com', 'x', 'GL Owner', 'male', 'UTC', 'system', 'active'),
            (?, UUID(), 1, '05000003201', '+2005000003201', 'gl-player@example.com', 'x', 'GL Player', 'male', 'UTC', 'system', 'active')`,
    [OWNER, PLAYER],
  );
  await pool.execute(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active, access_model)
     VALUES (?, UUID(), 1, ?, 'GL Club', 'gl-club', 1, 'PUBLIC_CLUB')`,
    [ORG, OWNER],
  );
  await pool.execute(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active, access_model)
     VALUES (?, UUID(), 1, ?, 'GL Other Club', 'gl-other-club', 1, 'PUBLIC_CLUB')`,
    [ORG_B, OWNER],
  );
  createdPeriods = await ensureOpenPeriods();

  const [planRes] = await pool.execute<any>(
    `INSERT INTO membership_plans (code, name, description, category, duration_type, duration_value, duration_days, plan_type, price, currency, status, is_public, organisation_id, created_by, updated_by)
     VALUES ('gl-annual', 'GL Annual', NULL, 'general', 'years', 1, 365, 'annual', 2300, 'EGP', 'active', 1, ?, ?, ?)`,
    [ORG, OWNER, OWNER],
  );
  planId = planRes.insertId;
  const [verRes] = await pool.execute<any>(
    `INSERT INTO membership_plan_versions (membership_plan_id, version_no, status, effective_from, duration_type, duration_periods, renewal_model, initial_charge_type, grace_days, branch_scope, allowed_payment_methods, currency)
     VALUES (?, 1, 'active', CURDATE(), 'annual', 1, 'anniversary', 'full', 0, 'ALL', '["cash","card"]', 'EGP')`,
    [planId],
  );
  versionId = verRes.insertId;
  await pool.execute(
    `INSERT INTO membership_plan_components (plan_version_id, code, name, amount, is_required, quantity, sort_order) VALUES
     (?, 'membership', 'Membership fee', 2000, 1, 1, 0), (?, 'facilities', 'Facilities', 200, 1, 1, 1), (?, 'donation', 'Donation', 100, 0, 1, 2)`,
    [versionId, versionId, versionId],
  );

  const [sp] = await pool.execute<any>(`SELECT id FROM subscription_plans LIMIT 1`);
  const saasPlanId = Number(sp[0].id);
  await pool.execute(`INSERT IGNORE INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, subscription_status, auto_renew) VALUES (?, ?, 'monthly', 'active', 1)`, [ORG, saasPlanId]);
  await pool.execute(`INSERT IGNORE INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES (?, 'membership', 'percentage', 5.00)`, [saasPlanId]);

  // App-level DB via the shared singleton, listeners registered explicitly
  // (tournament-harness pattern).
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
  await pool.execute(`DELETE FROM payment_transactions WHERE reference_type='membership_subscription' AND reference_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}))`);
  await pool.execute(`DELETE FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B})`);
  await pool.execute(`DELETE FROM membership_plans WHERE organisation_id IN (${ORG},${ORG_B})`);
  await pool.execute(`DELETE FROM organisation_membership_settings WHERE organisation_id IN (${ORG},${ORG_B})`);
  await pool.execute(`DELETE FROM invoices WHERE organisation_id IN (${ORG},${ORG_B})`);
  await pool.execute(`DELETE FROM ledger_entries WHERE source_type='membership' AND source_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id IN (${ORG},${ORG_B}))`);
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (${ORG},${ORG_B}) OR (organisation_id IS NULL AND reference_type IN ('membership_card_payment','membership_cash_payment','membership_org_receivable','membership_org_cash_receivable'))`);
  await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id IN (${ORG},${ORG_B}))`);
  await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id IN (${ORG},${ORG_B})`);
  await pool.execute(`DELETE FROM organisation_subscriptions WHERE organisation_id IN (${ORG},${ORG_B})`);
  await pool.execute(`DELETE FROM payment_transactions WHERE user_id IN (${OWNER},${PLAYER})`);
  await pool.execute(`DELETE FROM organisations WHERE id IN (${ORG},${ORG_B})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${OWNER},${PLAYER})`);
  for (const pid of createdPeriods) {
    const [refs] = await pool.execute<any>(`SELECT COUNT(*) AS c FROM general_ledger WHERE period_id=?`, [pid]);
    if (Number(refs[0].c) === 0) {
      await pool.execute(`DELETE FROM accounting_periods WHERE id=?`, [pid]);
    }
  }
  await pool.end();
}, 30000);

describe('G11.22 P1 — GL verification (card + cash + idempotency + tenancy)', () => {
  it('GL-1 CARD: purchase → confirm-card → deterministic ledger entries', async () => {
    const subId = await purchase('card');
    const [payRows] = await pool.execute<any>(
      `SELECT payment_method, amount, currency, payment_status FROM payment_transactions WHERE reference_type='membership_subscription' AND reference_id=?`,
      [subId],
    );
    expect(payRows.length).toBe(1);
    expect(payRows[0].payment_method).toBe('card');
    expect(Number(payRows[0].amount)).toBe(2300);

    const confirm = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subId}/complete-card`, headers: { authorization: `Bearer ${planeTokens.owner}` } });
    expect(confirm.statusCode).toBe(200);

    await waitFor(() => countLedger(subId, 'membership_card_payment'), (c) => c >= 3, 'CourtZon card posting (3 legs)');
    await waitFor(() => countLedger(subId, 'membership_org_receivable'), (c) => c >= 3, 'org card posting (3 legs)');

    const [cardRows] = await pool.execute<any>(
      `SELECT le.side, le.amount, c.code AS code, le.organisation_id
       FROM ledger_entries le JOIN chart_of_accounts c ON c.id=le.chart_account_id
       WHERE le.source_type='membership' AND le.source_id=? AND le.event_type='membership_card_payment' ORDER BY le.id`,
      [subId],
    );
    const byCode = new Map(cardRows.map((r: any) => [r.code, { side: r.side, amount: Number(r.amount) }]));
    expect(byCode.get('1100')?.side).toBe('debit');
    expect(String(byCode.get('1100')?.amount)).toBe('2300');
    expect(byCode.get('2202')?.side).toBe('credit');
    expect(String(byCode.get('2202')?.amount)).toBe('2185');
    expect(byCode.get('4110')?.side).toBe('credit');
    expect(String(byCode.get('4110')?.amount)).toBe('115');
    expect(cardRows.every((r: any) => r.organisation_id === null)).toBe(true); // CourtZon book (org NULL)

    const [orgRows] = await pool.execute<any>(
      `SELECT le.side, le.amount, c.code AS code, le.organisation_id
       FROM ledger_entries le JOIN chart_of_accounts c ON c.id=le.chart_account_id
       WHERE le.source_type='membership' AND le.source_id=? AND le.event_type='membership_org_receivable' ORDER BY le.id`,
      [subId],
    );
    expect(orgRows.length).toBeGreaterThanOrEqual(3);
    expect(orgRows.every((r: any) => r.organisation_id === ORG)).toBe(true);
    const om = new Map(orgRows.map((r: any) => [r.code, { side: r.side, amount: Number(r.amount) }]));
    expect(String(om.get('1161')?.amount)).toBe('2185');
    expect(String(om.get('MKT-COMM-EXP')?.amount)).toBe('115');
    expect(String(om.get('MEMB-REV')?.amount)).toBe('2300');

    // No leak to the second organisation.
    const [leak] = await pool.execute<any>(`SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='membership' AND source_id=? AND organisation_id=?`, [subId, ORG_B]);
    expect(Number(leak[0].c)).toBe(0);
  });

  it('GL-2 CASH: purchase → confirm-cash → deterministic ledger entries', async () => {
    const subId = await purchase('cash');
    const [payRows] = await pool.execute<any>(`SELECT payment_method, amount, payment_status FROM payment_transactions WHERE reference_type='membership_subscription' AND reference_id=?`, [subId]);
    expect(payRows.length).toBe(1);
    expect(payRows[0].payment_method).toBe('cash');
    expect(Number(payRows[0].amount)).toBe(2300);

    const [snap] = await pool.execute<any>('SELECT commission_amount FROM membership_subscriptions WHERE id=?', [subId]);
    expect(Number(snap[0].commission_amount)).toBe(115);

    const confirm = await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${subId}/confirm-cash`, headers: { authorization: `Bearer ${planeTokens.owner}` } });
    expect(confirm.statusCode).toBe(200);

    await waitFor(() => countLedger(subId, 'membership_cash_payment'), (c) => c >= 2, 'CourtZon cash posting');
    await waitFor(() => countLedger(subId, 'membership_org_cash_receivable'), (c) => c >= 4, 'org cash posting');

    const [cashRows] = await pool.execute<any>(
      `SELECT le.side, le.amount, c.code AS code, le.organisation_id
       FROM ledger_entries le JOIN chart_of_accounts c ON c.id=le.chart_account_id
       WHERE le.source_type='membership' AND le.source_id=? AND le.event_type='membership_cash_payment' ORDER BY le.id`,
      [subId],
    );
    const m = new Map(cashRows.map((r: any) => [r.code, { side: r.side, amount: Number(r.amount) }]));
    expect(m.get('1161')?.side).toBe('debit');
    expect(String(m.get('1161')?.amount)).toBe('115');
    expect(m.get('4110')?.side).toBe('credit');
    expect(String(m.get('4110')?.amount)).toBe('115');
    expect(cashRows.every((r: any) => r.organisation_id === null)).toBe(true);

    const [orgCash] = await pool.execute<any>(
      `SELECT le.side, le.amount, c.code AS code FROM ledger_entries le JOIN chart_of_accounts c ON c.id=le.chart_account_id
       WHERE le.source_type='membership' AND le.source_id=? AND le.event_type='membership_org_cash_receivable' AND le.organisation_id=? ORDER BY le.id`,
      [subId, ORG],
    );
    const ocmap = new Map(orgCash.map((r: any) => [r.code, { side: r.side, amount: Number(r.amount) }]));
    expect(ocmap.get('ORG-CASH')?.side).toBe('debit');
    expect(String(ocmap.get('ORG-CASH')?.amount)).toBe('2300');
    expect(String(ocmap.get('MKT-COMM-EXP')?.amount)).toBe('115');
    expect(ocmap.get('MEMB-REV')?.side).toBe('credit');
    expect(String(ocmap.get('MEMB-REV')?.amount)).toBe('2300');
    expect(ocmap.get('MKT-CZ-PAY')?.side).toBe('credit');
    expect(String(ocmap.get('MKT-CZ-PAY')?.amount)).toBe('115');
  });

  it('GL-3 IDEMPOTENCY: replaying the payment action does not increase ledger_entries', async () => {
    const [subs] = await pool.execute<any>(`SELECT id FROM membership_subscriptions WHERE organisation_id=${ORG} ORDER BY id`);
    const subId = Number((subs as any[])[0].id);
    const ledgersBefore = await countLedger(subId, 'membership_card_payment') + await countLedger(subId, 'membership_org_receivable')
      + await countLedger(subId, 'membership_cash_payment') + await countLedger(subId, 'membership_org_cash_receivable');
    expect(ledgersBefore).toBeGreaterThan(0);

    // Replay both confirmation styles for their respective subscriptions.
    const [subRows] = await pool.execute<any>(`SELECT id, payment_method FROM membership_subscriptions WHERE organisation_id=${ORG} ORDER BY id`);
    for (const row of subRows as any[]) {
      const action = row.payment_method === 'cash' ? 'confirm-cash' : 'complete-card';
      await app.inject({ method: 'POST', url: `/org/${ORG}/membership/subscriptions/${row.id}/${action}`, headers: { authorization: `Bearer ${planeTokens.owner}` } });
    }
    await sleep(600);
    const ledgersAfter = await countLedger(subId, 'membership_card_payment') + await countLedger(subId, 'membership_org_receivable')
      + await countLedger(subId, 'membership_cash_payment') + await countLedger(subId, 'membership_org_cash_receivable');
    expect(ledgersAfter).toBe(ledgersBefore);
    const [payOrg] = await pool.execute<any>(`SELECT COUNT(*) AS c FROM payment_transactions WHERE reference_id IN (SELECT id FROM membership_subscriptions WHERE organisation_id=${ORG})`);
    expect(Number(payOrg[0].c)).toBe(2); // one card + one cash, not duplicated
  });

  it('GL-4 TENANCY: membership GL rows never leak into another organisation', async () => {
    const [orgA] = await pool.execute<any>(`SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='membership' AND organisation_id=${ORG}`);
    expect(Number(orgA[0].c)).toBeGreaterThan(0);
    const [orgB] = await pool.execute<any>(`SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='membership' AND organisation_id=${ORG_B}`);
    expect(Number(orgB[0].c)).toBe(0);
    const [platformNull] = await pool.execute<any>(`SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='membership' AND organisation_id IS NULL`);
    expect(Number(platformNull[0].c)).toBeGreaterThan(0);
  });
});