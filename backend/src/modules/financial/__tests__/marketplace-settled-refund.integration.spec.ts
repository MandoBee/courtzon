/**
 * Marketplace SETTLED card-refund invariant — approved-policy regression tests.
 *
 * Approved target policy (2026-10-11):
 *   - UNSETTLED marketplace CARD refund keeps the clearing leg
 *     (`marketplace_merchant_refund`: Dr 2202 + Dr 4160 (+ Dr 2300) / Cr 1100 gross).
 *   - SETTLED marketplace CARD refund (payment inside a COMPLETED gateway batch):
 *       • account 1100 is left UNCHANGED (no clearing leg);
 *       • the refund is recorded against 1120
 *         (`marketplace_merchant_refund_settled`: Dr 2202 + Dr 4160 (+ Dr 2300) /
 *          Cr 1120 gross);
 *       • ONLY the refunded payment is detached from the ACTIVE batch
 *         (`active_payment_transaction_id` released, batch header decremented,
 *          `payment_transactions.gateway_settlement_id` cleared);
 *       • settlement HISTORY (the batch + line rows) is preserved;
 *       • the refunded payment can never re-enter a new batch and can never be
 *         reversed AGAIN through its original batch;
 *   - Partial gateway refunds of settled payments remain UNSUPPORTED (P4) — this
 *     suite neither extends the payment-layer guard nor tests a settled partial.
 *
 * Status (updated once the implementation ships):
 *   a.  unsettled GL        — PASSES (clearing leg, 1100 nets to zero);
 *   c.  re-settle rejection — PASSES (create() rejects refunded payments);
 *   d1. duplicate event     — PASSES (hasPosting/uk_dedup);
 *   d2. service retry       — PASSES (paid→refunded idempotency);
 *   b.  settled GL + detach — PASSES after the fix: the refund is posted to the
 *       SETTLED variant (Cr 1120), 1100 is unchanged, and the refunded payment is
 *       detached from its batch via `gatewaySettlementService.detachPaymentTransaction`;
 *   b2. batch reverse       — PASSES after the fix: reverse() operates only on the
 *       ACTIVE remainder, so the refunded line is never reversed again;
 *   d3. reconciliation      — PASSES after the fix for the CORRECT flow (no anomaly)
 *       AND flags a deliberately seeded legacy anomaly (`marketplace_merchant_refund`
 *       on a settled payment, i.e. the pre-fix behaviour).
 */
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import {
  createProductFixture, cleanupProductFixture, type ProductFixture,
} from '../../../tests/helpers/product-fixture.js';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3011';
  process.env.PAYMENT_GATEWAY_PROVIDER = 'mock';
});

type RowData = RowDataPacket[];

const SLEEP = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate: () => Promise<boolean>, what: string, timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await SLEEP(120);
  }
  throw new Error(`Timed out waiting for: ${what}`);
}

describe('Marketplace settled card-refund invariant (approved policy)', () => {
  let pool: mysql.Pool;
  let orgA: number;
  let productA: ProductFixture;
  const orderIds: number[] = [];
  const paymentIds: number[] = [];
  const settlementIds: number[] = [];
  const ORG_SLUG = 'mp-settled-refund-org';

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });

    // Wipe any leftovers from a previously aborted run of this spec.
    await pool.execute(`DELETE FROM order_items WHERE seller_id IN (SELECT id FROM organisations WHERE slug = ?)`, [ORG_SLUG]);
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = ?)`, [ORG_SLUG]);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = ?)`, [ORG_SLUG]);
    await pool.execute(`DELETE FROM orders WHERE buyer_id = 1 AND notes = 'mp-settled-refund-test-order'`);
    await pool.execute(`DELETE FROM organisations WHERE slug = ?`, [ORG_SLUG]);

    const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
    const otId = (ot as any[])[0].id;
    const [a] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active)
       VALUES (UUID(), ?, 1, 'MP Settled Refund Org', ?, 1)`, [otId, ORG_SLUG],
    );
    orgA = (a as any).insertId;

    // Gateway settlement requires a resolvable card fee configuration.
    await pool.execute(
      `INSERT IGNORE INTO payment_methods (id, slug, name, description, processing_fee_pct, processing_fee_fixed, requires_approval, is_active, sort_order)
       SELECT 3, 'card', 'Credit/Debit Card', 'Pay securely', 2.50, 1.00, 0, 1, 3
       FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE slug = 'card')`,
    );

    productA = await createProductFixture(pool, orgA);

    const { accountingEngineService } = await import('../application/accounting-engine.service.js');
    await accountingEngineService.provisionOrganisationMarketplaceAccounts(orgA);

    // Wire the canonical payment:refunded consumer so real refund events post.
    const { registerAccountingEventListeners } = await import('../application/accounting-event.listener.js');
    registerAccountingEventListeners();
  });

  afterAll(async () => {
    // Clear the settlement linkage before dropping batches/payments (FK-safe).
    for (const pid of paymentIds) {
      await pool.execute(`UPDATE payment_transactions SET gateway_settlement_id = NULL, gateway_settled_at = NULL WHERE id = ?`, [pid]);
    }
    for (const sid of settlementIds) {
      await pool.execute(`DELETE FROM gateway_settlement_transactions WHERE gateway_settlement_id = ?`, [sid]);
      await pool.execute(`DELETE FROM gateway_settlements WHERE id = ?`, [sid]);
    }
    for (const pid of paymentIds) {
      await pool.execute(`DELETE FROM payment_transactions WHERE id = ?`, [pid]);
    }
    for (const oid of orderIds) {
      await pool.execute(`DELETE FROM ledger_entries WHERE (source_type = 'marketplace' AND source_id = ?)
                          OR (source_type = 'settlement' AND source_id IN (${settlementIds.length ? settlementIds.join(',') : 0}))`, [oid]);
      await pool.execute(`DELETE FROM general_ledger WHERE reference_type LIKE 'marketplace_%' AND reference_id = ?`, [oid]);
      await pool.execute(`DELETE FROM order_items WHERE order_id = ?`, [oid]);
      await pool.execute(`DELETE FROM orders WHERE id = ?`, [oid]);
    }
    for (const sid of settlementIds) {
      await pool.execute(`DELETE FROM general_ledger WHERE reference_type LIKE 'settlement_%' AND reference_id = ?`, [sid]);
    }
    if (productA) await cleanupProductFixture(pool, productA);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgA]);
    await pool.end();
  });

  // ── Fixture helpers ───────────────────────────────────────────────────────
  async function accountId(code: string): Promise<number> {
    const [rows] = await pool.execute<RowData>(
      `SELECT id FROM chart_of_accounts WHERE organisation_id IS NULL AND code = ? LIMIT 1`, [code],
    );
    return Number((rows as any[])[0].id);
  }

  /** Net debit−credit on one account across a marketplace order + its settlement batch(es). */
  async function combinedNet(accountIdNum: number, orderId: number, settlementIdList: number[]): Promise<number> {
    const clauses = [`(source_type = 'marketplace' AND source_id = ?)`];
    const params: any[] = [accountIdNum, orderId];
    if (settlementIdList.length) {
      clauses.push(`(source_type = 'settlement' AND source_id IN (${settlementIdList.map(() => '?').join(',')}))`);
      params.push(...settlementIdList);
    }
    const [rows] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(CASE WHEN side = 'debit' THEN amount ELSE -amount END), 0) AS net
       FROM ledger_entries
       WHERE chart_account_id = ? AND (${clauses.join(' OR ')})`,
      params,
    );
    return Number((rows as any[])[0].net);
  }

  async function insertOrder(): Promise<number> {
    const subtotal = 850, shipping = 50, commission = 42.50, tax = 0;
    const total = Math.round((subtotal + shipping + tax) * 100) / 100; // 900
    const [o] = await pool.execute<RowData>(
      `INSERT INTO orders (public_id, buyer_id, status, payment_status, subtotal, discount_amount, shipping_cost, commission_amount, courtzon_commission, courtzon_fee, org_product_share, org_shipping_share, tax_amount, total, currency_code, payment_method, cash_holder, notes)
       VALUES (UUID(), 1, 'confirmed', 'paid', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 'EGP', 'card', 'courtzon', 'mp-settled-refund-test-order')`,
      [subtotal, shipping, commission, commission, commission, subtotal - commission, shipping, tax, total],
    );
    const orderId = (o as any).insertId;
    orderIds.push(orderId);
    await pool.execute(
      `INSERT INTO order_items (order_id, product_id, seller_id, quantity, unit_price, total_price, commission_rate, commission_amount)
       VALUES (?, ?, ?, 1, ?, ?, 5, ?)`,
      [orderId, productA.productId, orgA, subtotal, subtotal, commission],
    );
    return orderId;
  }

  async function insertCardPayment(orderId: number, amount: number): Promise<number> {
    const [r] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO payment_transactions
         (user_id, order_id, reference_type, reference_id, payment_method, gateway_provider, gateway_reference, amount, currency, payment_status, paid_at, trace_id)
       VALUES (1, ?, 'order', ?, 'card', 'mock', ?, ?, 'EGP', 'paid', NOW(), UUID())`,
      [orderId, orderId, `mp_settled_${orderId}_${Date.now()}`, amount],
    );
    const pid = Number((r as any).insertId);
    paymentIds.push(pid);
    return pid;
  }

  async function settlePayment(pid: number): Promise<number> {
    const { gatewaySettlementService } = await import('../../settlement/application/gateway-settlement.service.js');
    const created = await gatewaySettlementService.create({ paymentTransactionIds: [pid], settledBy: 1, notes: 'mp-settled-refund-test' });
    const settlementId = Number(created?.settlement?.id);
    expect(settlementId).toBeGreaterThan(0);
    settlementIds.push(settlementId);
    return settlementId;
  }

  async function refundCardPayment(pid: number, amount: number): Promise<any> {
    const { paymentService } = await import('../../payment/application/payment.service.js');
    return paymentService.refund(pid, amount, 'marketplace settled refund test');
  }

  /**
   * Real Marketplace refund path: `marketplaceService._processOrderRefund` (what
   * `updateOrderStatus` runs) — exercises the payment-scoped settlement detach +
   * Gateway refund + the canonical `payment:refunded` accounting chain.
   */
  async function marketplaceRefund(orderId: number, reason = 'marketplace settled refund test'): Promise<void> {
    const { marketplaceService } = await import('../../marketplace/application/marketplace.service.js');
    const order = await marketplaceService.getOrder(orderId);
    await (marketplaceService as any)._processOrderRefund(order, orderId, reason);
  }

  async function refundPostingCount(orderId: number): Promise<number> {
    const [rows] = await pool.execute<RowData>(
      `SELECT COUNT(DISTINCT event_type) AS c FROM ledger_entries
       WHERE source_type = 'marketplace' AND source_id = ?
         AND event_type IN ('marketplace_merchant_refund', 'marketplace_merchant_refund_settled')`,
      [orderId],
    );
    return Number((rows as any[])[0].c);
  }

  async function activeLineCount(pid: number): Promise<number> {
    const [rows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM gateway_settlement_transactions WHERE active_payment_transaction_id = ?`, [pid],
    );
    return Number((rows as any[])[0].c);
  }

  // ── (a) UNSETTLED card refund — clearing leg; 1100 nets to zero, 1120 untouched ──
  it('a. unsettled card refund repeats the clearing leg — 1100 net zero, 1120 untouched (PASS today)', async () => {
    const { postMarketplacePaymentAccounting, postMarketplaceRefundAccounting } = await import('../application/accounting-event.listener.js') as any;
    const clearingId = await accountId('1100');
    const bankId = await accountId('1120');
    const payableId = await accountId('2202');
    const revenueId = await accountId('4160');

    const orderId = await insertOrder();                    // total 900, orgNet 857.50, commission 42.50
    const pid = await insertCardPayment(orderId, 900);
    await postMarketplacePaymentAccounting(orderId, 'card', 'EGP');
    await postMarketplaceRefundAccounting(orderId, 'EGP');  // unsettled → Cr 1100

    await waitFor(async () => (await refundPostingCount(orderId)) === 1, 'unsettled refund posting');

    // 1100: payment Dr 900 − refund Cr 900 = 0 (no settlement involved).
    expect(await combinedNet(clearingId, orderId, [])).toBe(0);
    // 1120 never touched (no settlement, no bank leg).
    expect(await combinedNet(bankId, orderId, [])).toBe(0);
    // Merchant payable + commission fully reversed.
    expect(await combinedNet(payableId, orderId, [])).toBe(0);
    expect(await combinedNet(revenueId, orderId, [])).toBe(0);
  });

  // ── (b) SETTLED card refund — 1100 unchanged, 1120 debited by gross, payment detached ──
  it('b. settled card refund — 1100 unchanged, 1120 debited by gross, payment detached', async () => {
    const clearingId = await accountId('1100');
    const bankId = await accountId('1120');

    const orderId = await insertOrder();                    // total 900
    const pid = await insertCardPayment(orderId, 900);
    const { postMarketplacePaymentAccounting } = await import('../application/accounting-event.listener.js') as any;
    await postMarketplacePaymentAccounting(orderId, 'card', 'EGP');   // Dr 1100 900 / Cr 2202+4160
    const fee = Math.round((900 * 0.025 + 1.0) * 100) / 100; // 23.50 (seeded card config)
    const net = 900 - fee;                                   // 876.50

    const settlementId = await settlePayment(pid);           // real completed batch via public API
    await marketplaceRefund(orderId);                       // real refund path (payment:refunded)

    await waitFor(async () => (await refundPostingCount(orderId)) === 1, 'settled refund posting');

    // ── GL invariant (asserted first — the headline divergence) ─────────────
    // Approved policy: 1100 left UNCHANGED by the refund (total = Dr payment − Cr
    // settlement = 0) and the refund recorded against 1120. The current
    // implementation credits 1100 and never touches 1120, so these fail first.
    expect(await combinedNet(clearingId, orderId, [settlementId])).toBe(0);
    // bank = settlement net − refunded gross = −fee (fee retained, non-refundable).
    expect(await combinedNet(bankId, orderId, [settlementId])).toBeCloseTo(-fee, 2);

    // ── Detach invariant (also fails today — the payment is never detached) ──
    expect(await activeLineCount(pid)).toBe(0);              // active line released
    const [header] = await pool.execute<RowData>(
      `SELECT gross_amount, transaction_count FROM gateway_settlements WHERE id = ?`, [settlementId],
    );
    expect(Number((header as any[])[0]?.gross_amount ?? -1)).toBe(0);          // decremented by gross
    expect(Number((header as any[])[0]?.transaction_count ?? -1)).toBe(0);     // decremented by 1
    const [pt] = await pool.execute<RowData>(
      `SELECT gateway_settlement_id FROM payment_transactions WHERE id = ?`, [pid],
    );
    expect((pt as any[])[0]?.gateway_settlement_id).toBe(null);               // linkage cleared
    const [history] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM gateway_settlement_transactions WHERE payment_transaction_id = ? AND gateway_settlement_id = ?`,
      [pid, settlementId],
    );
    expect(Number((history as any[])[0].c)).toBe(1);                           // history preserved
  });

  // ── (b2) Settled refund — original batch reversal must EXCLUDE the refunded payment ──
  it('b2. settled refund — batch reverse() excludes the refunded payment', async () => {
    const clearingId = await accountId('1100');

    const orderId = await insertOrder();
    const pid = await insertCardPayment(orderId, 900);
    const { postMarketplacePaymentAccounting } = await import('../application/accounting-event.listener.js') as any;
    await postMarketplacePaymentAccounting(orderId, 'card', 'EGP');
    const settlementId = await settlePayment(pid);
    await marketplaceRefund(orderId);
    await waitFor(async () => (await refundPostingCount(orderId)) === 1, 'settled refund posting (b2)');

    const { gatewaySettlementService } = await import('../../settlement/application/gateway-settlement.service.js');
    await gatewaySettlementService.reverse({ settlementId, reversedBy: 1, reason: 'mp-settled-refund test reverse' });

    // The refunded payment was detached pre-reverse, so reverse() must NOT re-post a
    // clearing reversal for it. Assert zero `payment_gateway_settlement_reversal`
    // entries touching 1100 for this batch. (Today the line is still active, so the
    // full-batch reversal posts one such entry → this assertion fails as expected.)
    const [rows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c
       FROM ledger_entries le JOIN chart_of_accounts c ON c.id = le.chart_account_id
       WHERE le.source_type = 'settlement' AND le.source_id = ?
         AND le.event_type = 'payment_gateway_settlement_reversal'
         AND c.code = '1100'`,
      [settlementId],
    );
    expect(Number((rows as any[])[0].c)).toBe(0);
  });

  // ── (c) Settled refund — payment cannot re-enter a new batch (PASS today) ──
  it('c. settled refund — the refunded payment cannot re-enter a new settlement batch (PASS today)', async () => {
    const orderId = await insertOrder();
    const pid = await insertCardPayment(orderId, 900);
    const { postMarketplacePaymentAccounting } = await import('../application/accounting-event.listener.js') as any;
    await postMarketplacePaymentAccounting(orderId, 'card', 'EGP');
    const settlementId = await settlePayment(pid);
    await marketplaceRefund(orderId);
    await waitFor(async () => (await refundPostingCount(orderId)) === 1, 'settled refund posting (c)');

    const { gatewaySettlementService } = await import('../../settlement/application/gateway-settlement.service.js');
    await expect(gatewaySettlementService.create({ paymentTransactionIds: [pid], settledBy: 1, notes: 'mp-settled-refund re-settle' }))
      .rejects.toThrow(/not paid|already/);
    // History of the ORIGINAL batch is intact.
    const [history] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM gateway_settlement_transactions WHERE payment_transaction_id = ?`, [pid],
    );
    expect(Number((history as any[])[0].c)).toBe(1);
  });

  // ── (d1) Idempotent replay — one post for a duplicated payment:refunded (PASS today) ──
  it('d1. duplicate payment:refunded produces exactly ONE marketplace refund posting (PASS today)', async () => {
    const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
    const orderId = await insertOrder();
    const pid = await insertCardPayment(orderId, 900);
    const { postMarketplacePaymentAccounting } = await import('../application/accounting-event.listener.js') as any;
    await postMarketplacePaymentAccounting(orderId, 'card', 'EGP');

    const payload: any = {
      paymentId: pid, userId: 1, amount: 900, reason: 'replay test',
      traceId: `mp_replay_${Date.now().toString(36)}`, referenceType: 'order', referenceId: orderId,
      metadata: { paymentMethod: 'card', currency: 'EGP' },
    };
    await eventBusV2.emit('payment:refunded', payload);
    await eventBusV2.emit('payment:refunded', payload); // duplicate

    await waitFor(async () => (await refundPostingCount(orderId)) === 1, 'exactly one refund posting');
    expect(await refundPostingCount(orderId)).toBe(1);
  });

  // ── (d2) Idempotent service retry — second refund is a no-op (PASS today) ──
  it('d2. paymentService.refund retry is idempotent — second call refunds nothing (PASS today)', async () => {
    const orderId = await insertOrder();
    const pid = await insertCardPayment(orderId, 900);
    const { postMarketplacePaymentAccounting } = await import('../application/accounting-event.listener.js') as any;
    await postMarketplacePaymentAccounting(orderId, 'card', 'EGP');

    const first = await refundCardPayment(pid, 900);
    await waitFor(async () => (await refundPostingCount(orderId)) === 1, 'first refund posting');
    const second = await refundCardPayment(pid, 900);

    expect(first?.success).toBe(true);
    expect(second?.idempotent).toBe(true);
    expect(await refundPostingCount(orderId)).toBe(1);
  });

  // ── (d3) Reconciliation — settled marketplace refund detection ──
  it('d3. reconciliation flags settled marketplace refund anomalies (negative + seeded legacy anomaly)', async () => {
    const { reconciliationService } = await import('../../payment/application/reconciliation.service.js');
    const fromIso = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const toIso = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const marketplaceFlags = (run: any, pid: number) => run.issues.filter((i: any) =>
      typeof i.type === 'string' && /^marketplace_settled_refund_/.test(i.type)
      && String(i.entityId) === String(pid));

    // NEGATIVE — a correctly-executed settled refund is NOT an anomaly.
    {
      const orderId = await insertOrder();
      const pid = await insertCardPayment(orderId, 900);
      const { postMarketplacePaymentAccounting } = await import('../application/accounting-event.listener.js') as any;
      await postMarketplacePaymentAccounting(orderId, 'card', 'EGP');
      const settlementId = await settlePayment(pid);
      await marketplaceRefund(orderId);
      await waitFor(async () => (await refundPostingCount(orderId)) === 1, 'settled refund posting (d3-negative)');
      const run = await reconciliationService.run({ dateFrom: fromIso, dateTo: toIso, limit: 500 });
      expect(marketplaceFlags(run, pid).length).toBe(0);
    }

    // POSITIVE — seed the pre-fix legacy state: a settled payment whose refund was
    // booked against clearing (marketplace_merchant_refund / Cr 1100) with no
    // settled variant → reconciliation MUST flag `marketplace_settled_refund_missing_variant`.
    {
      const orderId = await insertOrder();
      const pid = await insertCardPayment(orderId, 900);
      const { postMarketplacePaymentAccounting } = await import('../application/accounting-event.listener.js') as any;
      await postMarketplacePaymentAccounting(orderId, 'card', 'EGP');
      const settlementId = await settlePayment(pid);
      await marketplaceRefund(orderId);
      await waitFor(async () => (await refundPostingCount(orderId)) === 1, 'settled refund posting (d3-positive)');

      // Overwrite the settled posting with the legacy clearing posting (the
      // pre-fix bookkeeping the reconciliation rule must detect).
      await pool.execute(`DELETE FROM ledger_entries WHERE source_type='marketplace' AND source_id = ? AND event_type = 'marketplace_merchant_refund_settled'`, [orderId]);
      const { postAccountingEvent } = await import('../application/accounting-event.listener.js') as any;
      await postAccountingEvent(
        'marketplace_merchant_refund', 'marketplace', orderId, null,
        { merchant_payable: 857.50, platform_commission: 42.50, tax_liability: 0, payment_clearing: 900 },
        'EGP', `Order #${orderId} refunded (legacy clearing leg)`,
        undefined,
        { merchant_payable: null, platform_commission: null, tax_liability: null, payment_clearing: null },
      );

      const run = await reconciliationService.run({ dateFrom: fromIso, dateTo: toIso, limit: 500 });
      const flagged = marketplaceFlags(run, pid);
      expect(flagged.some((i: any) => i.type === 'marketplace_settled_refund_missing_variant')).toBe(true);
    }
  });
});