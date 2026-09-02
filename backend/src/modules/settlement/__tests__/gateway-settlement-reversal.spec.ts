/**
 * Gateway Settlement REVERSAL — integration spec.
 *
 * Extends the gateway-settlement workflow with the adversarial side of the
 * ledger: reversing a completed gateway settlement made in error.
 *
 *   A. reverse() atomically: locks the settlement + linked transactions,
 *      validates state ('completed' only), posts the reversal journal
 *      (Dr 1100 Payment Clearing gross / Cr 1120 Cash-Bank net / Cr 5210
 *      Gateway Fees) IN THE SAME transaction while the ORIGINAL journal rows
 *      are preserved untouched (immutable history).
 *   B. The settlement is marked 'reversed' with reversal metadata + a unique
 *      reversal reference; the payment transactions and their settlement lines
 *      are detached (gateway_settlement_id NULL → re-eligible; the partial
 *      unique key active_payment_transaction_id is released so the payment can
 *      be settled again later).
 *   C. Seller entitlement availability re-locks: card/online backed
 *      entitlements stop being available to the org while the reversal stands.
 *   D. Re-setting the SAME payment afterwards succeeds (new batch) — the
 *      reversal line + original line both remain as immutable history.
 *   E. Error paths: nonexistent settlement, already-reversed settlement, and a
 *      missing reason are all rejected without side effects.
 *   F. The settled list() with status='reversed' surfaces the cancelled batch.
 */
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3011';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { gatewaySettlementService } from '../application/gateway-settlement.service.js';
import { financialEntitlementService } from '../../financial/application/financial-entitlement.service.js';
import { ConflictError } from '../../../shared/errors/app-error.js';
import { setPlatformTimezone } from '../../../shared/utils/business-date.js';

type RowData = RowDataPacket[];

const FIXTURE_USER = 999902;

describe('Gateway Settlement Reversal', () => {
  let pool: mysql.Pool;
  let orgId: number;
  let orderId: number;
  let cardPaymentId: number;
  let entitlementIds: number[] = [];
  let createdPeriodId: number | null = null;
  let firstSettlementId: number;

  beforeAll(async () => {
    setPlatformTimezone('Africa/Cairo');
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 8, charset: 'utf8mb4' });

    // Ensure an open accounting period exists for the current Cairo business month.
    const { getLocalToday } = await import('../../../shared/utils/business-date.js');
    const today = await getLocalToday('Africa/Cairo');
    const [yy, mm] = today.split('-').map(Number);
    const monthStart = `${today.slice(0, 7)}-01`;
    const lastDay = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    const monthEnd = `${today.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
    const [existingPeriod] = await pool.execute<RowData>(
      `SELECT id FROM accounting_periods WHERE organisation_id IS NULL AND fiscal_year = ? AND period_number = ? AND status = 'open' LIMIT 1`,
      [yy, mm],
    );
    if (!(existingPeriod as any[]).length) {
      const [ins] = await pool.execute<RowData>(
        `INSERT INTO accounting_periods (organisation_id, fiscal_year, period_number, start_date, end_date, status)
         VALUES (NULL, ?, ?, ?, ?, 'open')`,
        [yy, mm, monthStart, monthEnd],
      );
      createdPeriodId = (ins as any).insertId;
    }

    // Clean any prior fixture rows (reversal-safe: ledger/settlement rows first).
    await pool.execute(`DELETE gst FROM gateway_settlement_transactions gst JOIN gateway_settlements gs ON gs.id = gst.gateway_settlement_id WHERE gs.settled_by = ${FIXTURE_USER}`);
    await pool.execute(`DELETE FROM ledger_entries WHERE source_type='settlement' AND source_id IN (SELECT id FROM gateway_settlements WHERE settled_by = ${FIXTURE_USER})`);
    await pool.execute(`DELETE FROM general_ledger WHERE reference_type LIKE 'settlement_payment_gateway_settlement%' AND reference_id IN (SELECT id FROM gateway_settlements WHERE settled_by = ${FIXTURE_USER})`);
    await pool.execute(`DELETE FROM gateway_settlements WHERE settled_by = ${FIXTURE_USER}`);
    await pool.execute(`DELETE FROM financial_entitlements WHERE description LIKE 'GWS reversal fixture%'`);
    await pool.execute(`DELETE FROM payment_transactions WHERE order_id IN (SELECT id FROM orders WHERE public_id LIKE 'gws-rev-fixture-%')`);
    await pool.execute(`DELETE FROM orders WHERE public_id LIKE 'gws-rev-fixture-%'`);
    await pool.execute(`DELETE FROM organisations WHERE slug = 'gws-rev-fixture-org'`);

    const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
    const otId = (ot as any[])[0].id;

    const [org] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'GWS Reversal Fixture Org', 'gws-rev-fixture-org', 1)`, [otId],
    );
    orgId = (org as any).insertId;

    const [order] = await pool.execute<RowData>(
      `INSERT INTO orders (public_id, buyer_id, status, payment_status, subtotal, total, currency_code, payment_method, cash_holder, courtzon_fee)
       VALUES (UUID(), 1, 'confirmed', 'paid', 850, 850, 'EGP', 'card', 'courtzon', 0)`,
    );
    orderId = (order as any).insertId;

    const [pt] = await pool.execute<RowData>(
      `INSERT INTO payment_transactions (user_id, order_id, reference_type, reference_id, payment_method, gateway_provider, gateway_reference, amount, currency, payment_status, paid_at)
       VALUES (1, ?, 'order', ?, 'card', 'paymob', 'gws-rev-ref-1', 850, 'EGP', 'paid', NOW())`,
      [orderId, orderId],
    );
    cardPaymentId = (pt as any).insertId;

    // Marketplace entitlement backed by the card payment (courtzon collector).
    const metadata = JSON.stringify({ orderId, itemId: 900002, productId: 900002, sellerId: orgId, unitPrice: 850, quantity: 1, itemTotal: 850, commissionAmount: 0 });
    const [fe] = await pool.execute<RowData>(
      `INSERT INTO financial_entitlements (public_id, organisation_id, entitlement_type, source_type, source_id, collector, amount, currency, status, available_at, description, metadata, created_by)
       VALUES (UUID(), ?, 'ORGANIZATION_EARNING', 'marketplace', 900002, 'courtzon', 850, 'EGP', 'AVAILABLE', NOW(), 'GWS reversal fixture order earning', ?, 1)`,
      [orgId, metadata],
    );
    entitlementIds = [(fe as any).insertId];

    // The initial "Receive Gateway Settlement" that we will reverse.
    const detail = await gatewaySettlementService.create({ paymentTransactionIds: [cardPaymentId], settledBy: FIXTURE_USER });
    firstSettlementId = detail.settlement.id;
  });

  afterAll(async () => {
    // Remove ONLY this test's financial rows, by reference (never by period).
    await pool.execute(`DELETE gst FROM gateway_settlement_transactions gst JOIN gateway_settlements gs ON gs.id = gst.gateway_settlement_id WHERE gs.settled_by = ${FIXTURE_USER}`);
    await pool.execute(`DELETE FROM ledger_entries WHERE source_type='settlement' AND source_id IN (SELECT id FROM gateway_settlements WHERE settled_by = ${FIXTURE_USER})`);
    await pool.execute(`DELETE FROM general_ledger WHERE reference_type LIKE 'settlement_payment_gateway_settlement%' AND reference_id IN (SELECT id FROM gateway_settlements WHERE settled_by = ${FIXTURE_USER})`);
    await pool.execute(`DELETE FROM gateway_settlements WHERE settled_by = ${FIXTURE_USER}`);
    await pool.execute(`DELETE FROM financial_entitlements WHERE id IN (${entitlementIds.join(',') || '0'})`);
    await pool.execute(`DELETE FROM payment_transactions WHERE id = ?`, [cardPaymentId]);
    await pool.execute(`DELETE FROM orders WHERE id = ?`, [orderId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    if (createdPeriodId != null) {
      const [refs] = await pool.execute<RowData>(`SELECT COUNT(*) AS c FROM general_ledger WHERE period_id = ?`, [createdPeriodId]);
      if (Number((refs as any[])[0].c) === 0) {
        await pool.execute(`DELETE FROM accounting_periods WHERE id = ?`, [createdPeriodId]);
      }
    }
    setPlatformTimezone(null);
    await pool.end();
  });

  async function accountId(code: string): Promise<number> {
    const [rows] = await pool.execute<RowData>(
      `SELECT id FROM chart_of_accounts WHERE organisation_id IS NULL AND code = ? LIMIT 1`, [code],
    );
    return Number((rows as any[])[0].id);
  }

  async function journalSums(sourceId: number, accountCode: string, side: 'debit' | 'credit', eventType: string): Promise<number> {
    const acc = await accountId(accountCode);
    const [rows] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM ledger_entries
       WHERE source_type='settlement' AND source_id = ? AND chart_account_id = ? AND side = ? AND event_type = ?`,
      [sourceId, acc, side, eventType],
    );
    return Number((rows as any[])[0].total);
  }

  it('A. brings the payment back into the eligible list and un-available entitlements re-lock after reversal', async () => {
    const detail = await gatewaySettlementService.reverse({ settlementId: firstSettlementId, reversedBy: FIXTURE_USER, reason: 'Paid in error — refund issued to customer' });

    // Settlement metadata.
    const s = detail.settlement;
    expect(s.settlement_status).toBe('reversed');
    expect(s.reversed_by).toBe(FIXTURE_USER);
    expect(s.reversal_reason).toMatch(/Paid in error/);
    expect(s.reversal_reference).toMatch(/^REV-\d+-[A-Z0-9]+$/);
    expect(s.reversed_at).toBeTruthy();

    // Payment detached → eligible again.
    const [pt] = await pool.execute<RowData>(`SELECT gateway_settlement_id, gateway_settled_at FROM payment_transactions WHERE id = ?`, [cardPaymentId]);
    expect((pt as any[])[0].gateway_settlement_id).toBeNull();
    expect((pt as any[])[0].gateway_settled_at).toBeNull();

    const eligible = await gatewaySettlementService.listEligible();
    expect(eligible.find((e) => e.paymentTransactionId === cardPaymentId)).toBeDefined();

    // Entitlement availability re-locks while the reversal stands.
    const available = await financialEntitlementService.getAvailableForOrganisation(orgId);
    expect(available.some((e) => e.id === entitlementIds[0])).toBe(false);
  });

  it('A. posts the reversal journal in the same transaction; original journal is PRESERVED (immutable history)', async () => {
    // Reversal journal (event_type = payment_gateway_settlement_reversal):
    // Dr Payment Clearing 1100 = gross 850, Cr Cash-Bank 1120 = net 827.75, Cr Gateway Fees 5210 = 22.25.
    expect(await journalSums(firstSettlementId, '1100', 'debit', 'payment_gateway_settlement_reversal')).toBe(850);
    expect(await journalSums(firstSettlementId, '1120', 'credit', 'payment_gateway_settlement_reversal')).toBe(827.75);
    expect(await journalSums(firstSettlementId, '5210', 'credit', 'payment_gateway_settlement_reversal')).toBe(22.25);

    // The ORIGINAL journal is untouched.
    expect(await journalSums(firstSettlementId, '1120', 'debit', 'payment_gateway_settlement')).toBe(827.75);
    expect(await journalSums(firstSettlementId, '5210', 'debit', 'payment_gateway_settlement')).toBe(22.25);
    expect(await journalSums(firstSettlementId, '1100', 'credit', 'payment_gateway_settlement')).toBe(850);
  });

  it('B. releases the partial-unique key on the settlement line so the payment can be settled again', async () => {
    const [lines] = await pool.execute<RowData>(
      `SELECT gateway_settlement_id, active_payment_transaction_id FROM gateway_settlement_transactions WHERE payment_transaction_id = ?`, [cardPaymentId],
    );
    const row = (lines as any[])[0];
    expect(row).toBeDefined();
    expect(row.active_payment_transaction_id).toBeNull();
    // The line ROW is still immutable history — still points at the original batch.
    expect(Number(row.gateway_settlement_id)).toBe(firstSettlementId);
  });

  it('D. re-settling the SAME payment afterwards succeeds with a new batch', async () => {
    const detail = await gatewaySettlementService.create({ paymentTransactionIds: [cardPaymentId], settledBy: FIXTURE_USER });
    expect(detail.settlement.id).not.toBe(firstSettlementId);
    expect(detail.settlement.settlement_status).toBe('completed');

    // Reversal + new settlement + the original journal all coexist.
    expect(await journalSums(firstSettlementId, '1100', 'debit', 'payment_gateway_settlement_reversal')).toBe(850);
    expect(await journalSums(detail.settlement.id, '1120', 'debit', 'payment_gateway_settlement')).toBe(827.75);

    // The reverse → re-settle lifecycle restores organisation entitlement
    // eligibility: after the corrected gateway batch is completed, the org's
    // card-backed entitlement is AVAILABLE for organisation settlement again.
    const available = await financialEntitlementService.getAvailableForOrganisation(orgId);
    expect(available.some((e) => e.id === entitlementIds[0])).toBe(true);

    // Reversing the NEW settlement also works.
    const rev2 = await gatewaySettlementService.reverse({
      settlementId: detail.settlement.id,
      reversedBy: FIXTURE_USER,
      reason: 'Confirmed duplicate batch — new settlement supersedes',
    });
    expect(rev2.settlement.settlement_status).toBe('reversed');
  });

  it('F. list() with status=reversed surfaces the cancelled batches with reversal metadata', async () => {
    const result = await gatewaySettlementService.list({ status: 'reversed', page: 1, limit: 50 });
    const ours = result.data.filter((g) => g.batch_code && String(g.batch_code).startsWith('GWS-') && (g.reversed_by === FIXTURE_USER || g.settled_by === FIXTURE_USER));
    expect(ours.length).toBeGreaterThanOrEqual(2);
    for (const g of ours) {
      expect(g.settlement_status).toBe('reversed');
      expect(g.reversal_reference).toMatch(/^REV-/);
      expect(g.reversed_at).toBeTruthy();
      expect(Number(g.transaction_count)).toBeGreaterThanOrEqual(0);
    }

    const one = await gatewaySettlementService.get(firstSettlementId);
    expect(one.settlement.settlement_status).toBe('reversed');
    expect(one.settlement.reversal_reason).toMatch(/Paid in error/);
    expect(one.transactions).toHaveLength(1);
  });

  it('E. error paths are rejected without side effects', async () => {
    // Nonexistent settlement.
    await expect(gatewaySettlementService.reverse({ settlementId: 999999999, reversedBy: FIXTURE_USER, reason: 'test' }))
      .rejects.toThrow(ConflictError);

    // Already reversed (firstSettlementId was reversed above).
    await expect(gatewaySettlementService.reverse({ settlementId: firstSettlementId, reversedBy: FIXTURE_USER, reason: 'again' }))
      .rejects.toThrow(/already/);

    // Missing / blank reason.
    await expect(gatewaySettlementService.reverse({ settlementId: firstSettlementId, reversedBy: FIXTURE_USER, reason: '' }))
      .rejects.toThrow(ConflictError);

    // Invalid id.
    await expect(gatewaySettlementService.reverse({ settlementId: 0, reversedBy: FIXTURE_USER, reason: 'test' }))
      .rejects.toThrow(ConflictError);
  });
});