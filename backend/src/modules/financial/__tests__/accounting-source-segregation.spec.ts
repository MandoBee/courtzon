import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3006';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * Accounting source segregation (economic-source rule).
 *
 * The PAYMENT METHOD must never determine the revenue/expense account — the
 * ECONOMIC SOURCE does. Each source must live in its own account:
 *   subscription → 4170
 *   booking commission → 4110
 *   marketplace commission → 4160
 *   invoice/AR sales → 4100
 *   merchant payable → 2202
 *   coach payable → 2201
 *   coaching expense → 5270
 *   referee/provider expense → 5200
 *   wallet → 2100, tax → 2300, clearing → 1100
 */
describe('Accounting source segregation — mapping resolves by economic source', () => {
  let pool: mysql.Pool;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 2, charset: 'utf8mb4' });
  });
  afterAll(async () => { await pool.end(); });

  async function resolveCode(eventType: string, concept: string): Promise<string> {
    const [rows] = await pool.execute<RowData>(
      `SELECT coa.code FROM accounting_event_mapping_lines a
       JOIN chart_of_accounts coa ON coa.id = a.account_id
       WHERE a.event_type = ? AND a.concept = ? AND a.organisation_id IS NULL AND a.is_active = 1
       ORDER BY a.id DESC LIMIT 1`,
      [eventType, concept],
    );
    return (rows as any[])[0]?.code ?? '';
  }

  it('booking commission → 4110 (never 4100/4160/4170)', async () => {
    for (const et of ['booking_card_payment', 'booking_wallet_payment', 'booking_cod_payment', 'booking_refund', 'booking_wallet_refund', 'booking_cod_reversal']) {
      expect(await resolveCode(et, 'platform_commission'), et).toBe('4110');
    }
  });

  it('marketplace commission → 4160 (never 4100/4110/4170)', async () => {
    for (const et of ['marketplace_card_payment', 'marketplace_wallet_payment', 'marketplace_merchant_refund', 'marketplace_wallet_refund', 'marketplace_delivery', 'marketplace_reversal', 'complaint_refund']) {
      expect(await resolveCode(et, 'platform_commission'), et).toBe('4160');
    }
  });

  it('subscription revenue → 4170 (never booking/marketplace accounts)', async () => {
    for (const et of ['subscription_card_payment', 'subscription_wallet_payment', 'subscription_cash_payment', 'subscription_card_refund', 'subscription_wallet_refund', 'subscription_cash_refund']) {
      expect(await resolveCode(et, 'revenue'), et).toBe('4170');
    }
  });

  it('invoice/AR sales revenue → 4100; invoice reversal → 4100', async () => {
    expect(await resolveCode('invoice_issue', 'revenue')).toBe('4100');
    expect(await resolveCode('invoice_cancel', 'revenue')).toBe('4100');
  });

  it('merchant payable → 2202 (never 2200); coach payable → 2201 (never 2200)', async () => {
    for (const et of ['marketplace_card_payment', 'marketplace_wallet_payment', 'marketplace_merchant_refund', 'marketplace_wallet_refund', 'complaint_refund']) {
      expect(await resolveCode(et, 'merchant_payable'), et).toBe('2202');
    }
    for (const et of ['booking_coach_payout', 'booking_coach_reversal', 'booking_coach_settlement', 'booking_coach_settlement_offset']) {
      expect(await resolveCode(et, 'coach_payable'), et).toBe('2201');
    }
  });

  it('booking org payable → 2200 (unchanged)', async () => {
    expect(await resolveCode('booking_card_payment', 'org_payable')).toBe('2200');
  });

  it('coaching expense → 5270; referee/provider expense → 5200', async () => {
    for (const et of ['booking_coach_payout', 'booking_coach_recovery', 'booking_coach_reversal']) {
      expect(await resolveCode(et, 'coach_expense'), et).toBe('5270');
    }
    expect(await resolveCode('referee_payout', 'referee_expense')).toBe('5200');
    expect(await resolveCode('provider_payout', 'provider_expense')).toBe('5200');
  });

  it('wallet / tax / clearing unchanged', async () => {
    expect(await resolveCode('wallet_topup', 'wallet_liability')).toBe('2100');
    expect(await resolveCode('booking_card_payment', 'tax_liability')).toBe('2300');
    expect(await resolveCode('booking_card_payment', 'payment_clearing')).toBe('1100');
  });

  it('source segregation is exclusive (booking ≠ marketplace ≠ subscription revenue accounts)', async () => {
    const bk = await resolveCode('booking_card_payment', 'platform_commission');
    const mp = await resolveCode('marketplace_card_payment', 'platform_commission');
    const sub = await resolveCode('subscription_card_payment', 'revenue');
    const set = new Set([bk, mp, sub]);
    expect(set.size).toBe(3); // 4110, 4160, 4170 all distinct
    expect(set.has('4100')).toBe(false); // none land in the generic parent
  });
});