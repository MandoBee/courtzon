// ============================================================================
// Academy G8.3 — Payment → entitlement → accounting → settlement (integration)
//
// Runs against the shared LOCAL Docker MySQL (courtzon_v3, migration 162
// applied). Exercises the REAL academy payment service, the REAL in-memory
// payment/acccounting listeners, and the REAL entitlement listener handler
// against a seeded academy programme/enrollment + org commission rate.
//
// Covers the G8.3 Part 13 integration matrix:
//   1. successful card          6. missing academy commission rate
//   2. successful wallet        7. duplicate payment
//   3. successful offline cash  8. duplicate academy:enrollment-paid
//   4. failed card              9. concurrent payment attempts
//   5. insufficient wallet     10. entitlement retry
//  11. accounting retry        12. outbox replay (re-emission)
//  13. settlement              14. ledger deduplication
//  15. debit/credit balance
//
// No external Paymob calls — the gateway is never invoked (wallet path is
// fully local; card path drives the same in-memory payment:succeeded handler
// the gateway callback would fire).
// ============================================================================
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3033';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

type RowData = RowDataPacket[];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(probe: () => Promise<T | null | undefined>, label: string, timeoutMs = 5000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await probe();
    if (v != null && (Array.isArray(v) ? (v as unknown[]).length > 0 : true)) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await sleep(100);
  }
}

describe('G8.3 — Academy payment → entitlement → accounting → settlement', () => {
  let pool: mysql.Pool;
  let orgId: number; let org2Id: number; let branchId: number; let userId: number; let coachId: number;
  let programId: number; let groupId: number; let planId: number;
  const SLUG = 'g8flow-org';
  const SLUG2 = 'g8flow-org-norate';
  const PHONE = '+2010111223199';
  const EMAIL = 'g8flow@courtzon.test';
  const enrSeq = { n: 90000000 };

  let handleAcademyEnrollmentPaid: (envelope: any) => Promise<void>;
  let paymentService: any;
  let financialEntitlementService: any;
  let unifiedSettlementService: any;
  let accountingEngineService: any;
  let eventBusV2: any;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });

    const imported = await Promise.all([
      import('../../../shared/event-bus/event-bus.v2.js'),
      import('../../academy/application/academy-payment.service.js'),
      import('../../financial/application/financial-entitlement.service.js'),
      import('../../settlement/application/unified-settlement.service.js'),
      import('../../financial/application/accounting-engine.service.js'),
      import('../../financial/application/entitlement-academy.listener.js'),
      import('../../payment/application/payment.service.js'),
    ]);
    eventBusV2 = imported[0].eventBusV2;
    financialEntitlementService = imported[2].financialEntitlementService;
    unifiedSettlementService = imported[3].unifiedSettlementService;
    accountingEngineService = imported[4].accountingEngineService;
    handleAcademyEnrollmentPaid = imported[5].handleAcademyEnrollmentPaid;
    paymentService = imported[6].paymentService;

    await cleanupOrg(SLUG);
    await cleanupOrg(SLUG2);
    await pool.execute(`DELETE FROM users WHERE full_phone = ? OR email = ?`, [PHONE, EMAIL]);

    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active)
       VALUES (UUID(), ?, 1, 'G8 Flow Org', ?, 1)`,
      [(ot as any[])[0].id, SLUG],
    );
    orgId = (o as any).insertId;
    const [b] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'G8 Branch', 'g8-branch', 'Africa/Cairo')`,
      [orgId],
    );
    branchId = (b as any).insertId;

    const [u] = await pool.execute<RowData>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
       VALUES (UUID(), (SELECT id FROM countries LIMIT 1), '0111223199', ?, ?, 'x', 'G8 Player', 'male')`,
      [PHONE, EMAIL],
    );
    userId = (u as any).insertId;
    const [c] = await pool.execute<RowData>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
       VALUES (UUID(), (SELECT id FROM countries LIMIT 1), '0111223198', '+2010111223198', 'g8-coach@courtzon.test', 'x', 'G8 Coach', 'male')`,
      [],
    );
    coachId = (c as any).insertId;

    const [p] = await pool.execute<RowData>(
      `INSERT INTO subscription_plans (plan_name, price_monthly, price_yearly, is_active, is_unlimited, is_internal)
       VALUES ('G8 Academy Plan', 500.00, 5000.00, TRUE, FALSE, FALSE)`,
      [],
    );
    planId = (p as any).insertId;
    await pool.execute(
      `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, subscription_status, auto_renew, start_date, end_date)
       VALUES (?, ?, 'monthly', 'active', TRUE, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 YEAR))`,
      [orgId, planId],
    );
    await pool.execute(
      `INSERT INTO subscription_plan_rates (plan_id, applicable_entity, amount, rate_type)
       VALUES (?, 'academy', 10.0000, 'percentage')`,
      [planId],
    );

    // Org 2 — active plan WITHOUT an academy rate (fail-closed scenario).
    const [o2] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active)
       VALUES (UUID(), ?, 1, 'G8 Flow NoRate Org', ?, 1)`,
      [(ot as any[])[0].id, SLUG2],
    );
    org2Id = (o2 as any).insertId;
    const [p2] = await pool.execute<RowData>(
      `INSERT INTO subscription_plans (plan_name, price_monthly, price_yearly, is_active, is_unlimited, is_internal)
       VALUES ('G8 NoRate Plan', 500.00, 5000.00, TRUE, FALSE, FALSE)`,
      [],
    );
    await pool.execute(
      `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, subscription_status, auto_renew, start_date, end_date)
       VALUES (?, ?, 'monthly', 'active', TRUE, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 YEAR))`,
      [org2Id, (p2 as any).insertId],
    );

    const [pr] = await pool.execute<RowData>(
      `INSERT INTO academy_programs (code, name, category, price, currency, price_type, status, is_public, organisation_id, branch_id, sport_id, lifecycle_state)
       VALUES ('G8-FLOW', 'G8 Flow Tennis', 'tennis', 200.00, 'EGP', 'FIXED', 'open', 1, ?, ?, (SELECT id FROM sports LIMIT 1), 'confirmed')`,
      [orgId, branchId],
    );
    programId = (pr as any).insertId;
    const [g] = await pool.execute<RowData>(
      `INSERT INTO academy_groups (program_id, name, coach_id, capacity, status, comp_type, comp_value, comp_currency)
       VALUES (?, 'G8 Group', ?, 10, 'active', 'percent_gross', 5.00, 'EGP')`,
      [programId, coachId],
    );
    groupId = (g as any).insertId;
    await pool.execute(
      `INSERT INTO academy_group_sessions (group_id, session_date, start_time, end_time, status, court_price_amount, court_price_currency)
       VALUES (?, '2026-12-01', '10:00:00', '11:00:00', 'scheduled', 30.00, 'EGP'), (?, '2026-12-03', '10:00:00', '11:00:00', 'scheduled', 30.00, 'EGP')`,
      [groupId, groupId],
    );

    const { registerAccountingEventListeners } = await import('../../financial/application/accounting-event.listener.js');
    registerAccountingEventListeners();
    const { registerAcademyPaymentListeners } = await import('../../academy/application/academy-payment.listener.js');
    registerAcademyPaymentListeners();

    await accountingEngineService.provisionOrganisationMarketplaceAccounts(orgId);

    await pool.execute(
      `INSERT INTO user_wallets (user_id, balance, currency_code, version) VALUES (?, 500, 'EGP', 1)`,
      [userId],
    );
  });

  async function cleanupOrg(slug: string): Promise<void> {
    const [rows] = await pool.execute<RowData>(`SELECT id FROM organisations WHERE slug = ?`, [slug]);
    for (const row of rows as any[]) {
      const oid = Number(row.id);
      // Capture the org's academy enrollment ids so CourtZon-book (org NULL)
      // ledger rows can be purged too (they key on source_type/source_id).
      const [enrRows] = await pool.execute<RowData>(
        `SELECT id FROM academy_enrollments WHERE program_id IN (SELECT id FROM academy_programs WHERE organisation_id = ?)`,
        [oid],
      );
      const enrIds = (enrRows as any[]).map((r) => Number(r.id));
      if (enrIds.length) {
        const ph = enrIds.map(() => '?').join(',');
        await pool.execute(`DELETE FROM ledger_entries WHERE source_type = 'academy' AND source_id IN (${ph})`, enrIds);
        await pool.execute(`DELETE FROM academy_enrollment_payments WHERE enrollment_id IN (${ph})`, enrIds);
      }
      await pool.execute(`DELETE FROM financial_entitlements WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM transaction_entries WHERE transaction_id IN (SELECT id FROM transactions WHERE source_type = 'academy' AND source_id IN (SELECT id FROM academy_enrollments WHERE program_id IN (SELECT id FROM academy_programs WHERE organisation_id = ?)))`, [oid]);
      await pool.execute(`DELETE FROM transactions WHERE source_type = 'academy' AND source_id IN (SELECT id FROM academy_enrollments WHERE program_id IN (SELECT id FROM academy_programs WHERE organisation_id = ?))`, [oid]);
      await pool.execute(`DELETE FROM payment_transactions WHERE reference_type = 'academy' AND reference_id IN (SELECT id FROM academy_enrollments WHERE program_id IN (SELECT id FROM academy_programs WHERE organisation_id = ?))`, [oid]);
      await pool.execute(`DELETE FROM academy_group_sessions WHERE group_id IN (SELECT id FROM academy_groups WHERE program_id IN (SELECT id FROM academy_programs WHERE organisation_id = ?))`, [oid]);
      await pool.execute(`DELETE FROM academy_enrollments WHERE program_id IN (SELECT id FROM academy_programs WHERE organisation_id = ?)`, [oid]);
      await pool.execute(`DELETE FROM academy_groups WHERE program_id IN (SELECT id FROM academy_programs WHERE organisation_id = ?)`, [oid]);
      await pool.execute(`DELETE FROM academy_programs WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM user_wallets WHERE user_id IN (SELECT id FROM users WHERE full_name LIKE 'G8 Player%')`, []);
      await pool.execute(`DELETE FROM organisation_subscriptions WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM subscription_plan_rates WHERE plan_id IN (SELECT id FROM subscription_plans WHERE plan_name LIKE 'G8 %Plan')`, []);
      await pool.execute(`DELETE FROM subscription_plans WHERE plan_name LIKE 'G8 %Plan'`, []);
      await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id = ?)`, [oid]);
      await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM branches WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM organisations WHERE id = ?`, [oid]);
    }
    await pool.execute(`DELETE FROM users WHERE full_name LIKE 'G8 Player%' OR full_name LIKE 'G8 Coach%'`, []);
  }

  async function seedEnrollment(): Promise<number> {
    enrSeq.n += 1;
    const [e] = await pool.execute<RowData>(
      `INSERT INTO academy_enrollments (player_id, program_id, group_id, status)
       VALUES (?, ?, ?, 'confirmed')`,
      [userId, programId, groupId],
    );
    return (e as any).insertId;
  }

  async function seedOrg2Enrollment(): Promise<number> {
    const [pr] = await pool.execute<RowData>(
      `INSERT INTO academy_programs (code, name, category, price, currency, price_type, status, is_public, organisation_id, branch_id, sport_id, lifecycle_state)
       VALUES (CONCAT('G8-NR-', FLOOR(RAND()*100000)), 'G8 NoRate Tennis', 'tennis', 200.00, 'EGP', 'FIXED', 'open', 1, ?, NULL, (SELECT id FROM sports LIMIT 1), 'confirmed')`,
      [org2Id],
    );
    const pid = (pr as any).insertId;
    const [g] = await pool.execute<RowData>(
      `INSERT INTO academy_groups (program_id, name, capacity, status, comp_type, comp_value, comp_currency)
       VALUES (?, 'G8 NR Group', 10, 'active', 'percent_gross', 5.00, 'EGP')`,
      [pid],
    );
    const gid = (g as any).insertId;
    await pool.execute(
      `INSERT INTO academy_group_sessions (group_id, session_date, start_time, end_time, status, court_price_amount, court_price_currency)
       VALUES (?, '2026-12-05', '10:00:00', '11:00:00', 'scheduled', 30.00, 'EGP')`,
      [gid],
    );
    const [e] = await pool.execute<RowData>(
      `INSERT INTO academy_enrollments (player_id, program_id, group_id, status)
       VALUES (?, ?, ?, 'confirmed')`,
      [userId, pid, gid],
    );
    return (e as any).insertId;
  }

  function paidEvent(enrollmentId: number, paymentId: number, paymentMethod = 'card') {
    return {
      paymentId,
      referenceType: 'academy',
      referenceId: enrollmentId,
      amount: 200,
      metadata: { paymentMethod, currency: 'EGP', gateway: 'test' },
    };
  }

  /**
   * Seeds a real payment_transactions row (paid) for the given payment id so the
   * academy snapshot's fk_sep_payment_txn is satisfied — in production this row
   * is always created by the payment module before payment:succeeded fires.
   */
  async function seedPaymentTxn(enrollmentId: number, paymentId: number, method = 'card'): Promise<void> {
    await pool.execute(
      `INSERT INTO payment_transactions (id, user_id, reference_type, reference_id, payment_method, amount, currency, payment_status, paid_at, trace_id, aggregate_version)
       VALUES (?, ?, 'academy', ?, ?, 200, 'EGP', 'paid', NOW(), UUID(), 1)
       ON DUPLICATE KEY UPDATE payment_status = 'paid'`,
      [paymentId, userId, enrollmentId, method],
    );
  }

  async function emitPaid(enrollmentId: number, paymentId: number, method = 'card'): Promise<void> {
    await seedPaymentTxn(enrollmentId, paymentId, method);
    await eventBusV2.emit('payment:succeeded', paidEvent(enrollmentId, paymentId, method));
  }

  async function snapshotFor(enrollmentId: number) {
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM academy_enrollment_payments WHERE enrollment_id = ?`,
      [enrollmentId],
    );
    return (rows as any[])[0] ?? null;
  }

  async function entitlementsFor(enrollmentId: number) {
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM financial_entitlements WHERE source_type = 'academy' AND source_id = ? ORDER BY id`,
      [enrollmentId],
    );
    return rows as any[];
  }

  async function ledgerFor(enrollmentId: number, eventType: string) {
    const [rows] = await pool.execute<RowData>(
      `SELECT transaction_id, side, amount, chart_account_id, account_type, organisation_id
       FROM ledger_entries WHERE source_type = 'academy' AND source_id = ? AND event_type = ?`,
      [enrollmentId, eventType],
    );
    return rows as any[];
  }

  function sumBySide(rows: any[]) {
    let debit = 0, credit = 0;
    for (const r of rows) {
      const amt = Number(r.amount);
      if (r.side === 'debit') debit += amt; else credit += amt;
    }
    return { debit, credit };
  }

  afterAll(async () => {
    await cleanupOrg(SLUG);
    await cleanupOrg(SLUG2);
    await pool.execute(`DELETE FROM users WHERE full_phone = ? OR email = ?`, [PHONE, EMAIL]);
    await pool.end();
  });

  it('1. successful card → snapshot + academy:enrollment-paid + entitlements + balanced accounting', async () => {
    const enrId = await seedEnrollment();
    const emitSpy = vi.spyOn(eventBusV2, 'emit');
    await emitPaid(enrId, 9500001);
    const snap = await waitFor(() => snapshotFor(enrId), 'card snapshot');
    expect(Number(snap.gross_amount)).toBe(200);
    expect(Number(snap.commission_amount)).toBe(20);
    expect(Number(snap.organization_earning_amount)).toBe(180);
    expect(Number(snap.court_rental_amount)).toBe(60);
    expect(Number(snap.coach_comp_amount)).toBe(10);
    expect(snap.collector).toBe('courtzon');
    expect(snap.payment_method).toBe('card');

    const paidCalls = emitSpy.mock.calls.filter((c: any) => c[0] === 'academy:enrollment-paid');
    expect(paidCalls.length).toBeGreaterThanOrEqual(1);
    const payload = paidCalls[0][1] as any;
    expect(Number(payload.enrollmentId)).toBe(enrId);
    expect(Number(payload.paymentTransactionId)).toBe(9500001);
    expect(payload.collector).toBe('courtzon');
    emitSpy.mockRestore();

    await handleAcademyEnrollmentPaid({ payload: { enrollmentId: enrId } });
    const ents = await entitlementsFor(enrId);
    expect(ents.length).toBe(2);
    expect(ents.find((e) => e.entitlement_type === 'ORGANIZATION_EARNING').amount).toBe('180.00');
    expect(ents.find((e) => e.entitlement_type === 'COURTZON_COMMISSION').amount).toBe('20.00');
    expect(ents.every((e) => e.status === 'PENDING' && e.collector === 'courtzon' && e.source_type === 'academy')).toBe(true);

    const rows = await waitFor(() => ledgerFor(enrId, 'academy_card_payment'), 'card ledger');
    const { debit, credit } = sumBySide(rows);
    expect(debit).toBe(200);
    expect(credit).toBe(200);
    expect(rows.every((r) => r.organisation_id === null)).toBe(true);
    expect(rows.some((r) => r.account_type === 'liability' && Number(r.amount) === 0)).toBe(false);

    const orgRows = await waitFor(() => ledgerFor(enrId, 'academy_org_receivable'), 'card org ledger');
    const ob = sumBySide(orgRows);
    expect(ob.debit).toBe(200);
    expect(ob.credit).toBe(200);
    expect(orgRows.every((r) => Number(r.organisation_id) === orgId)).toBe(true);
  });

  it('2. successful wallet → atomic wallet charge + 2100/2202/4191 accounting', async () => {
    const enrId = await seedEnrollment();
    const [balBefore] = await pool.execute<RowData>(`SELECT balance FROM user_wallets WHERE user_id = ?`, [userId]);
    const before = Number((balBefore as any[])[0].balance);

    const res = await paymentService.charge(userId, {
      referenceType: 'academy', referenceId: enrId, amount: 200, currency: 'EGP', paymentMethod: 'wallet',
    });
    expect(res.success).toBe(true);
    expect(res.status).toBe('paid');

    const snap = await waitFor(() => snapshotFor(enrId), 'wallet snapshot');
    expect(Number(snap.gross_amount)).toBe(200);
    expect(snap.collector).toBe('courtzon');
    expect(snap.payment_method).toBe('wallet');

    const [balAfter] = await pool.execute<RowData>(`SELECT balance, reserved_balance FROM user_wallets WHERE user_id = ?`, [userId]);
    expect(Number((balAfter as any[])[0].balance)).toBe(before - 200);
    expect(Number((balAfter as any[])[0].reserved_balance)).toBe(0);

    const [pt] = await pool.execute<RowData>(
      `SELECT reference_type, reference_id, payment_status, payment_method FROM payment_transactions WHERE reference_type='academy' AND reference_id=?`,
      [enrId],
    );
    expect((pt as any[]).length).toBeGreaterThanOrEqual(1);
    expect((pt as any[])[0].reference_type).toBe('academy');
    expect(Number((pt as any[])[0].reference_id)).toBe(enrId);
    expect((pt as any[])[0].payment_status).toBe('paid');

    await handleAcademyEnrollmentPaid({ payload: { enrollmentId: enrId } });
    expect((await entitlementsFor(enrId)).length).toBe(2);

    const rows = await waitFor(() => ledgerFor(enrId, 'academy_wallet_payment'), 'wallet ledger');
    const { debit, credit } = sumBySide(rows);
    expect(debit).toBe(200);
    expect(credit).toBe(200);
    expect(rows.every((r) => r.organisation_id === null)).toBe(true);

    const orgRows = await waitFor(() => ledgerFor(enrId, 'academy_org_receivable'), 'wallet org ledger');
    expect(sumBySide(orgRows).debit).toBe(200);
  });

  it('3. successful offline cash → real payment record + 1161 receivable + org cash book', async () => {
    const { academyPaymentService } = await import('../../academy/application/academy-payment.service.js');
    const enrId = await seedEnrollment();

    const result = await academyPaymentService.recordOfflineCashPayment(enrId, 1);
    expect(result.created).toBe(true);

    const [pt] = await pool.execute<RowData>(
      `SELECT reference_type, reference_id, payment_method, payment_status, amount FROM payment_transactions WHERE id = ?`,
      [result.paymentTransactionId],
    );
    expect((pt as any[])[0].reference_type).toBe('academy');
    expect(Number((pt as any[])[0].reference_id)).toBe(enrId);
    expect((pt as any[])[0].payment_method).toBe('cash');
    expect((pt as any[])[0].payment_status).toBe('paid');
    expect(Number((pt as any[])[0].amount)).toBe(200);

    const snap = await snapshotFor(enrId);
    expect(Number(snap.payment_transaction_id)).toBe(result.paymentTransactionId);
    expect(snap.collector).toBe('org');

    await eventBusV2.emit('payment:succeeded', paidEvent(enrId, result.paymentTransactionId, 'cash'));

    const rows = await waitFor(() => ledgerFor(enrId, 'academy_cash_payment'), 'cash ledger');
    const { debit, credit } = sumBySide(rows);
    expect(debit).toBe(20);
    expect(credit).toBe(20);
    expect(rows.every((r) => r.organisation_id === null)).toBe(true);

    const orgRows = await waitFor(() => ledgerFor(enrId, 'academy_org_cash_receivable'), 'cash org ledger');
    const ob = sumBySide(orgRows);
    expect(ob.debit).toBe(220);
    expect(ob.credit).toBe(220);
    expect(orgRows.every((r) => Number(r.organisation_id) === orgId)).toBe(true);

    await handleAcademyEnrollmentPaid({ payload: { enrollmentId: enrId } });
    const ents = await entitlementsFor(enrId);
    expect(ents.length).toBe(2);
    expect(ents.every((e) => e.collector === 'org')).toBe(true);
  });

  it('4. failed card → no snapshot, no entitlements, no academy accounting', async () => {
    const enrId = await seedEnrollment();
    await eventBusV2.emit('payment:failed-event', {
      paymentId: 9500009, referenceType: 'academy', referenceId: enrId, amount: 200,
      reason: 'declined', metadata: { paymentMethod: 'card', currency: 'EGP' },
    });
    await sleep(400);
    expect(await snapshotFor(enrId)).toBeNull();
    expect((await entitlementsFor(enrId)).length).toBe(0);
    expect((await ledgerFor(enrId, 'academy_card_payment')).length).toBe(0);
    const [e] = await pool.execute<RowData>(`SELECT payment_confirmed_at FROM academy_enrollments WHERE id = ?`, [enrId]);
    expect((e as any[])[0].payment_confirmed_at).toBeNull();
  });

  it('5. insufficient wallet balance → rejected, no payment success state', async () => {
    const enrId = await seedEnrollment();
    const [bal] = await pool.execute<RowData>(`SELECT balance FROM user_wallets WHERE user_id = ?`, [userId]);
    const balance = Number((bal as any[])[0].balance);

    await expect(paymentService.charge(userId, {
      referenceType: 'academy', referenceId: enrId, amount: balance + 1000, currency: 'EGP', paymentMethod: 'wallet',
    })).rejects.toThrow(/Insufficient available wallet balance/);

    await sleep(300);
    expect(await snapshotFor(enrId)).toBeNull();
    expect((await entitlementsFor(enrId)).length).toBe(0);
    const [pt] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM payment_transactions WHERE reference_type='academy' AND reference_id=? AND payment_status='paid'`,
      [enrId],
    );
    expect(Number((pt as any[])[0].c)).toBe(0);
  });

  it('6. missing academy commission rate → FAIL CLOSED, payment rejected, no economics', async () => {
    const { academyPaymentService } = await import('../../academy/application/academy-payment.service.js');
    const enrId = await seedOrg2Enrollment();

    await expect(academyPaymentService.ensureSnapshotForPayment(enrId, 9500010, 'card')).rejects.toThrow(/commission rate/i);
    expect(await snapshotFor(enrId)).toBeNull();
    expect((await entitlementsFor(enrId)).length).toBe(0);
  });

  it('7. duplicate payment → one snapshot, one entitlement pair, one ledger posting', async () => {
    const enrId = await seedEnrollment();
    await emitPaid(enrId, 9500020);
    const snap = await waitFor(() => snapshotFor(enrId), 'dup snapshot');
    expect(Number(snap.payment_transaction_id)).toBe(9500020);

    await emitPaid(enrId, 9500020);
    await sleep(500);

    const snaps = await pool.execute<RowData>(`SELECT COUNT(*) AS c FROM academy_enrollment_payments WHERE enrollment_id = ?`, [enrId]);
    expect(Number((snaps[0] as any[])[0].c)).toBe(1);

    await handleAcademyEnrollmentPaid({ payload: { enrollmentId: enrId } });
    await handleAcademyEnrollmentPaid({ payload: { enrollmentId: enrId } });
    expect((await entitlementsFor(enrId)).length).toBe(2);

    const rows = await ledgerFor(enrId, 'academy_card_payment');
    const txIds = new Set(rows.map((r) => r.transaction_id));
    expect(txIds.size).toBe(1);
    expect(sumBySide(rows).debit).toBe(200);
  });

  it('8. duplicate academy:enrollment-paid → no duplicate entitlements', async () => {
    const enrId = await seedEnrollment();
    await emitPaid(enrId, 9500030);
    await waitFor(() => snapshotFor(enrId), 'snapshot');

    await handleAcademyEnrollmentPaid({ payload: { enrollmentId: enrId } });
    await handleAcademyEnrollmentPaid({ payload: { enrollmentId: enrId } });
    await handleAcademyEnrollmentPaid({ payload: { enrollmentId: enrId } });
    const ents = await entitlementsFor(enrId);
    expect(ents.length).toBe(2);
    expect(new Set(ents.map((e) => e.entitlement_type)).size).toBe(2);
  });

  it('9. concurrent payment attempts → exactly one snapshot', async () => {
    const enrId = await seedEnrollment();
    const { academyPaymentService } = await import('../../academy/application/academy-payment.service.js');
    await seedPaymentTxn(enrId, 9500040, 'card');
    await Promise.all([
      academyPaymentService.ensureSnapshotForPayment(enrId, 9500040, 'card'),
      academyPaymentService.ensureSnapshotForPayment(enrId, 9500040, 'card'),
    ]);
    const snaps = await pool.execute<RowData>(`SELECT COUNT(*) AS c FROM academy_enrollment_payments WHERE enrollment_id = ?`, [enrId]);
    expect(Number((snaps[0] as any[])[0].c)).toBe(1);
    await handleAcademyEnrollmentPaid({ payload: { enrollmentId: enrId } });
    expect((await entitlementsFor(enrId)).length).toBe(2);
  });

  it('10. entitlement worker retry → idempotent (one pair, no duplicates)', async () => {
    const enrId = await seedEnrollment();
    await emitPaid(enrId, 9500050);
    await waitFor(() => snapshotFor(enrId), 'snapshot');

    await handleAcademyEnrollmentPaid({ payload: { enrollmentId: enrId } });
    await handleAcademyEnrollmentPaid({ payload: { enrollmentId: enrId } });
    expect((await entitlementsFor(enrId)).length).toBe(2);
  });

  it('11. accounting retry → single posting via hasPosting + ledger dedup', async () => {
    const enrId = await seedEnrollment();
    for (let i = 0; i < 3; i++) {
      await emitPaid(enrId, 9500060);
      await sleep(300);
    }
    const rows = await ledgerFor(enrId, 'academy_card_payment');
    const txIds = new Set(rows.map((r) => r.transaction_id));
    expect(txIds.size).toBe(1);
    expect(sumBySide(rows).debit).toBe(200);
  });

  it('12. outbox replay (re-emission of same event) → eventual single financial result', async () => {
    const enrId = await seedEnrollment();
    await emitPaid(enrId, 9500070);
    await sleep(300);
    await emitPaid(enrId, 9500070);
    await sleep(300);
    await emitPaid(enrId, 9500070);
    await sleep(300);

    const snaps = await pool.execute<RowData>(`SELECT COUNT(*) AS c FROM academy_enrollment_payments WHERE enrollment_id = ?`, [enrId]);
    expect(Number((snaps[0] as any[])[0].c)).toBe(1);
    await handleAcademyEnrollmentPaid({ payload: { enrollmentId: enrId } });
    await handleAcademyEnrollmentPaid({ payload: { enrollmentId: enrId } });
    expect((await entitlementsFor(enrId)).length).toBe(2);
    const rows = await ledgerFor(enrId, 'academy_card_payment');
    expect(new Set(rows.map((r) => r.transaction_id)).size).toBe(1);
  });

  it('13. settlement → PENDING → AVAILABLE → reserved → SETTLED for academy entitlements', async () => {
    const enrId = await seedEnrollment();
    await emitPaid(enrId, 9500080);
    await waitFor(() => snapshotFor(enrId), 'snapshot');
    await handleAcademyEnrollmentPaid({ payload: { enrollmentId: enrId } });

    let ents = await entitlementsFor(enrId);
    expect(ents.length).toBe(2);
    expect(ents.every((e) => e.status === 'PENDING')).toBe(true);

    const activated = await financialEntitlementService.activateEntitlements(100);
    expect(activated).toBeGreaterThanOrEqual(2);

    ents = await entitlementsFor(enrId);
    expect(ents.every((e) => e.status === 'AVAILABLE')).toBe(true);

    const preview = await unifiedSettlementService.preview(orgId);
    const academyIds = new Set(ents.map((e) => e.id));
    expect(preview.entitlements.some((e: any) => academyIds.has(e.id))).toBe(true);

    const detail = await unifiedSettlementService.create({ orgId, requestedBy: userId, requestedByRole: 'admin' });
    expect(Number(detail.settlement.final_amount)).toBeGreaterThanOrEqual(200);

    ents = await entitlementsFor(enrId);
    expect(ents.every((e) => e.status === 'ON_HOLD')).toBe(true);

    await unifiedSettlementService.recordPayment(detail.settlement.id, { paymentMethod: 'bank_transfer', paymentReference: 'G8-SET-1', paidBy: userId });
    ents = await entitlementsFor(enrId);
    expect(ents.every((e) => e.status === 'SETTLED')).toBe(true);
    expect(ents.every((e) => Number(e.settlement_id) === Number(detail.settlement.id))).toBe(true);
  });

  it('14. ledger deduplication → no duplicate rows for repeated postings', async () => {
    const enrId = await seedEnrollment();
    await emitPaid(enrId, 9500090);
    await waitFor(() => ledgerFor(enrId, 'academy_card_payment'), 'ledger');
    const rows = await ledgerFor(enrId, 'academy_card_payment');
    const keyCount = new Map<string, number>();
    for (const r of rows) {
      const k = `${r.chart_account_id}:${r.side}:${r.organisation_id}`;
      keyCount.set(k, (keyCount.get(k) || 0) + 1);
    }
    for (const [k, c] of keyCount) expect(c, `duplicate line for ${k}`).toBe(1);
  });

  it('15. debit/credit balance across all three methods', async () => {
    const cardEnr = await seedEnrollment();
    await emitPaid(cardEnr, 9500101);
    const cardLedger = await waitFor(() => ledgerFor(cardEnr, 'academy_card_payment'), 'card');
    expect(sumBySide(cardLedger).debit).toBe(sumBySide(cardLedger).credit);

    const wEnr = await seedEnrollment();
    await paymentService.charge(userId, { referenceType: 'academy', referenceId: wEnr, amount: 200, currency: 'EGP', paymentMethod: 'wallet' });
    const wLedger = await waitFor(() => ledgerFor(wEnr, 'academy_wallet_payment'), 'wallet');
    expect(sumBySide(wLedger).debit).toBe(sumBySide(wLedger).credit);

    const { academyPaymentService } = await import('../../academy/application/academy-payment.service.js');
    const cashEnr = await seedEnrollment();
    const r = await academyPaymentService.recordOfflineCashPayment(cashEnr, 1);
    await eventBusV2.emit('payment:succeeded', paidEvent(cashEnr, r.paymentTransactionId, 'cash'));
    const cashLedger = await waitFor(() => ledgerFor(cashEnr, 'academy_cash_payment'), 'cash');
    expect(sumBySide(cashLedger).debit).toBe(sumBySide(cashLedger).credit);
  });
});