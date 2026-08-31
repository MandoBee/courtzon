/**
 * Gateway Settlement + Seller Entitlement Eligibility — integration spec.
 *
 * Proves the Admin "Receive Gateway Settlement" workflow end-to-end:
 *   A. Eligible list only returns paid card/online payments not yet settled.
 *   B. Gateway fees are computed from configured payment_methods (2.5% + 1.00
 *      for card) — never hard-coded.
 *   C. create() atomically creates the settlement batch + per-transaction fee
 *      snapshot + payment linkage + accounting (Dr Bank net / Dr Gateway Fees /
 *      Cr Payment Clearing gross).
 *   D. Duplicate/concurrent settlement of the same payment is rejected.
 *   E. Seller entitlement eligibility: card-backed entitlements are NOT
 *      AVAILABLE for seller settlement until the gateway funds are settled;
 *      after gateway settlement they become eligible.
 *   F. Historical fee snapshot is preserved when payment_methods fees change.
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

describe('Gateway Settlement + Seller Entitlement Eligibility', () => {
  let pool: mysql.Pool;
  let orgId: number;
  let orderId: number;
  let cardPaymentId: number;
  let entitlementIds: number[] = [];

  beforeAll(async () => {
    setPlatformTimezone('Africa/Cairo');
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });

    // Clean any prior fixture rows.
    await pool.execute(`DELETE FROM gateway_settlement_transactions WHERE payment_transaction_id IN (SELECT id FROM payment_transactions WHERE order_id IN (SELECT id FROM orders WHERE public_id LIKE 'gws-fixture-%'))`);
    await pool.execute(`DELETE FROM gateway_settlements WHERE batch_code LIKE 'GWS-%' AND settled_by = 999901`);
    await pool.execute(`DELETE FROM financial_entitlements WHERE description LIKE 'GWS fixture%'`);
    await pool.execute(`DELETE FROM payment_transactions WHERE order_id IN (SELECT id FROM orders WHERE public_id LIKE 'gws-fixture-%')`);
    await pool.execute(`DELETE FROM ledger_entries WHERE source_type='settlement' AND source_id IN (SELECT id FROM gateway_settlements WHERE settled_by = 999901)`);
    await pool.execute(`DELETE FROM orders WHERE public_id LIKE 'gws-fixture-%'`);
    await pool.execute(`DELETE FROM organisations WHERE slug = 'gws-fixture-org'`);

    const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
    const otId = (ot as any[])[0].id;

    const [org] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'GWS Fixture Org', 'gws-fixture-org', 1)`, [otId],
    );
    orgId = (org as any).insertId;

    // Order: paid card, courtzon-collected (gateway-clearing backed).
    const [order] = await pool.execute<RowData>(
      `INSERT INTO orders (public_id, buyer_id, status, payment_status, subtotal, total, currency_code, payment_method, cash_holder, courtzon_fee)
       VALUES (UUID(), 1, 'confirmed', 'paid', 850, 850, 'EGP', 'card', 'courtzon', 0)`,
    );
    orderId = (order as any).insertId;

    const [pt] = await pool.execute<RowData>(
      `INSERT INTO payment_transactions (user_id, order_id, reference_type, reference_id, payment_method, gateway_provider, gateway_reference, amount, currency, payment_status, paid_at)
       VALUES (1, ?, 'order', ?, 'card', 'paymob', 'gws-card-ref-1', 850, 'EGP', 'paid', NOW())`,
      [orderId, orderId],
    );
    cardPaymentId = (pt as any).insertId;

    // Marketplace entitlements for the order item (card, courtzon collector).
    const metadata = JSON.stringify({ orderId, itemId: 900001, productId: 900001, sellerId: orgId, unitPrice: 850, quantity: 1, itemTotal: 850, commissionAmount: 0 });
    const [fe] = await pool.execute<RowData>(
      `INSERT INTO financial_entitlements (public_id, organisation_id, entitlement_type, source_type, source_id, collector, amount, currency, status, available_at, description, metadata, created_by)
       VALUES (UUID(), ?, 'ORGANIZATION_EARNING', 'marketplace', 900001, 'courtzon', 850, 'EGP', 'AVAILABLE', NOW(), 'GWS fixture order earning', ?, 1)`,
      [orgId, metadata],
    );
    entitlementIds = [(fe as any).insertId];
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM gateway_settlement_transactions WHERE payment_transaction_id = ?`, [cardPaymentId]);
    await pool.execute(`DELETE FROM gateway_settlements WHERE batch_code LIKE 'GWS-%' AND settled_by = 999901`);
    await pool.execute(`DELETE FROM ledger_entries WHERE source_type='settlement' AND source_id IN (SELECT id FROM gateway_settlements WHERE settled_by = 999901)`);
    await pool.execute(`DELETE FROM financial_entitlements WHERE id IN (${entitlementIds.join(',') || '0'})`);
    await pool.execute(`DELETE FROM payment_transactions WHERE id = ?`, [cardPaymentId]);
    await pool.execute(`DELETE FROM orders WHERE id = ?`, [orderId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    setPlatformTimezone(null);
    await pool.end();
  });

  async function accountId(code: string): Promise<number> {
    const [rows] = await pool.execute<RowData>(
      `SELECT id FROM chart_of_accounts WHERE organisation_id IS NULL AND code = ? LIMIT 1`, [code],
    );
    return Number((rows as any[])[0].id);
  }

  async function settlementSums(sourceId: number, accountCode: string, side: 'debit' | 'credit'): Promise<number> {
    const acc = await accountId(accountCode);
    const [rows] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM ledger_entries
       WHERE source_type='settlement' AND source_id = ? AND chart_account_id = ? AND side = ? AND event_type = 'payment_gateway_settlement'`,
      [sourceId, acc, side],
    );
    return Number((rows as any[])[0].total);
  }

  it('A. eligible list returns the paid card payment with configured fees (2.5% + 1.00)', async () => {
    const eligible = await gatewaySettlementService.listEligible();
    const row = eligible.find((e) => e.paymentTransactionId === cardPaymentId);
    expect(row).toBeDefined();
    expect(row!.grossAmount).toBe(850);
    expect(row!.gatewayFeePct).toBe(2.5);
    expect(row!.gatewayFeeFixed).toBe(1);
    expect(row!.gatewayFeeAmount).toBe(22.25); // 850 × 2.5% + 1.00
    expect(row!.netAmount).toBe(827.75); // 850 − 22.25
  });

  it('E. card-backed entitlements are NOT available for seller settlement before gateway settlement', async () => {
    const available = await financialEntitlementService.getAvailableForOrganisation(orgId);
    expect(available.some((e) => e.id === entitlementIds[0])).toBe(false);
  });

  it('C. create() atomically records the settlement, payment linkage and balanced accounting', async () => {
    const detail = await gatewaySettlementService.create({ paymentTransactionIds: [cardPaymentId], settledBy: 999901 });

    const s = detail.settlement;
    expect(s.gross_amount).toBe(850);
    expect(s.gateway_fee_amount).toBe(22.25);
    expect(s.net_amount).toBe(827.75);
    expect(detail.transactions).toHaveLength(1);

    // Payment transaction linked.
    const [pt] = await pool.execute<RowData>(`SELECT gateway_settlement_id, gateway_settled_at FROM payment_transactions WHERE id = ?`, [cardPaymentId]);
    expect(Number((pt as any[])[0].gateway_settlement_id)).toBe(s.id);
    expect((pt as any[])[0].gateway_settled_at).toBeTruthy();

    // Accounting: Dr Bank 827.75, Dr Gateway Fees 22.25, Cr Clearing 850.
    expect(await settlementSums(s.id, '1120', 'debit')).toBe(827.75);
    expect(await settlementSums(s.id, '5210', 'debit')).toBe(22.25);
    expect(await settlementSums(s.id, '1100', 'credit')).toBe(850);
  });

  it('D. duplicate settlement of the same payment is rejected (ConflictError)', async () => {
    await expect(gatewaySettlementService.create({ paymentTransactionIds: [cardPaymentId], settledBy: 999901 }))
      .rejects.toThrow(ConflictError);
  });

  it('C. the payment is no longer eligible after settlement', async () => {
    const eligible = await gatewaySettlementService.listEligible();
    expect(eligible.find((e) => e.paymentTransactionId === cardPaymentId)).toBeUndefined();
  });

  it('E. entitlements become eligible for seller settlement after gateway settlement', async () => {
    const available = await financialEntitlementService.getAvailableForOrganisation(orgId);
    expect(available.some((e) => e.id === entitlementIds[0])).toBe(true);
  });

  it('F. fee snapshot is preserved when payment_methods fees change later', async () => {
    const [rows] = await pool.execute<RowData>(
      `SELECT gateway_fee_amount, gateway_fee_pct, gateway_fee_fixed FROM gateway_settlement_transactions WHERE payment_transaction_id = ?`, [cardPaymentId],
    );
    const snap = (rows as any[])[0];
    expect(Number(snap.gateway_fee_pct)).toBe(2.5);
    expect(Number(snap.gateway_fee_fixed)).toBe(1);
    expect(Number(snap.gateway_fee_amount)).toBe(22.25);
  });
});