import { describe, it, expect } from 'vitest';

/**
 * P4-07 — DB-authoritative account-mapping integrity (read-only).
 *
 * The database is the source of truth for concept → chart_of_accounts mapping.
 * These checks resolve the REAL mapping through the SAME code path every posting
 * uses (`accountingEngineService.resolveMapping` → `buildLedgerLines`) and assert:
 *
 *   1. every payment and its refund/reversal resolve to the SAME chart accounts
 *      with EXACTLY inverted sides (no dropped tax/commission/payable leg);
 *   2. every resolved account exists, is active, and is a real COA row (never a
 *      null chart_account_id / invented account);
 *   3. events that have no DB mapping rows resolve completely from the documented
 *      code-level code fallback (`CONCEPT_ACCOUNT_CODE_DEFAULTS`) to accounts that
 *      already exist in the COA;
 *   4. ledger_entries.uk_dedup is a DB-enforced UNIQUE key over
 *      (source_type, source_id, event_type, chart_account_id, side) — the durable
 *      idempotency guarantee that complements the application-level hasPosting
 *      pre-check;
 *   5. settled-funds refunds pay out of Cash/Bank (1120), never back through
 *      Payment Clearing (1100), and gateway settlement moves 1100 → 1120 + fee.
 *
 * Read-only: nothing in this spec writes to the database.
 */

import { accountingEngineService, CONCEPT_ACCOUNT_CODE_DEFAULTS } from '../application/accounting-engine.service.js';
import { getEventConcepts } from '../application/accounting-concepts.js';
import { getPool } from '../../../database/mysql.js';

interface CodeSides {
  debit: string[];
  credit: string[];
}

const codeCache = new Map<number, string>();

async function codeOf(accountId: number): Promise<string> {
  if (codeCache.has(accountId)) return codeCache.get(accountId)!;
  const [rows] = await getPool().execute<any[]>(
    `SELECT id, code, is_active FROM chart_of_accounts WHERE id = ?`,
    [accountId],
  );
  const row = rows[0];
  expect(row, `chart account ${accountId} must exist`).toBeTruthy();
  expect(Number(row.is_active), `chart account ${accountId} (${row.code}) must be active`).toBe(1);
  codeCache.set(accountId, String(row.code));
  return String(row.code);
}

async function resolveSides(eventType: string, amounts: Record<string, number>): Promise<CodeSides> {
  const mapping = await accountingEngineService.resolveMapping(eventType, null);
  const lines = accountingEngineService.buildLedgerLines(eventType, mapping, amounts);

  // Every posting must be balanced at the engine boundary.
  expect(() => accountingEngineService.validateBalance(lines), `${eventType} must balance`).not.toThrow();
  expect(lines.length, `${eventType} must produce at least two legs`).toBeGreaterThanOrEqual(2);

  const out: CodeSides = { debit: [], credit: [] };
  for (const line of lines) {
    const code = await codeOf(line.accountId);
    out[line.side].push(code);
  }
  out.debit.sort();
  out.credit.sort();
  return out;
}

const CARD = { payment_clearing: 115, merchant_payable: 100, platform_commission: 10, tax_liability: 5 };
const WALLET_PAY = { wallet_liability_spend: 115, merchant_payable: 100, platform_commission: 10, tax_liability: 5 };
const WALLET_REFUND = { wallet_liability: 115, merchant_payable: 100, platform_commission: 10, tax_liability: 5 };
const CASH = { marketplace_receivable: 15, platform_commission: 10, tax_liability: 5 };
const TOURNAMENT_CARD = { payment_clearing: 110, merchant_payable: 100, tournament_commission: 10 };

const pairs: Array<{
  label: string;
  payment: string;
  refund: string;
  paymentAmounts: Record<string, number>;
  refundAmounts: Record<string, number>;
}> = [
  { label: 'booking card', payment: 'booking_card_payment', refund: 'booking_refund', paymentAmounts: CARD, refundAmounts: CARD },
  { label: 'booking wallet', payment: 'booking_wallet_payment', refund: 'booking_wallet_refund', paymentAmounts: WALLET_PAY, refundAmounts: WALLET_REFUND },
  { label: 'booking COD', payment: 'booking_cod_payment', refund: 'booking_cod_reversal', paymentAmounts: CASH, refundAmounts: CASH },
  { label: 'marketplace card', payment: 'marketplace_card_payment', refund: 'marketplace_merchant_refund', paymentAmounts: CARD, refundAmounts: CARD },
  { label: 'marketplace wallet', payment: 'marketplace_wallet_payment', refund: 'marketplace_wallet_refund', paymentAmounts: WALLET_PAY, refundAmounts: WALLET_REFUND },
  { label: 'academy card', payment: 'academy_card_payment', refund: 'academy_card_refund', paymentAmounts: CARD, refundAmounts: CARD },
  { label: 'academy wallet', payment: 'academy_wallet_payment', refund: 'academy_wallet_refund', paymentAmounts: WALLET_PAY, refundAmounts: WALLET_PAY },
  { label: 'academy cash', payment: 'academy_cash_payment', refund: 'academy_cash_refund', paymentAmounts: CASH, refundAmounts: CASH },
  { label: 'membership card', payment: 'membership_card_payment', refund: 'membership_card_refund', paymentAmounts: CARD, refundAmounts: CARD },
  { label: 'membership cash', payment: 'membership_cash_payment', refund: 'membership_cash_refund', paymentAmounts: CASH, refundAmounts: CASH },
  {
    label: 'tournament card',
    payment: 'tournament_registration_card_payment',
    refund: 'tournament_registration_card_refund',
    paymentAmounts: TOURNAMENT_CARD,
    refundAmounts: TOURNAMENT_CARD,
  },
  {
    label: 'tournament cash commission',
    payment: 'tournament_cash_commission_receivable',
    refund: 'tournament_cash_commission_refund',
    paymentAmounts: { merchant_payable: 10, tournament_commission: 10 },
    refundAmounts: { merchant_payable: 10, tournament_commission: 10 },
  },
  {
    label: 'payment gateway settlement',
    payment: 'payment_gateway_settlement',
    refund: 'payment_gateway_settlement_reversal',
    paymentAmounts: { cash_bank: 100, payment_gateway_fee: 3, payment_clearing: 103 },
    refundAmounts: { cash_bank: 100, payment_gateway_fee: 3, payment_clearing: 103 },
  },
];

describe('P4-07 account mapping integrity (DB-authoritative)', () => {
  it.each(pairs)('$label: refund/reversal is an exact chart-account inversion of the payment', async (pair) => {
    const payment = await resolveSides(pair.payment, pair.paymentAmounts);
    const refund = await resolveSides(pair.refund, pair.refundAmounts);

    // Same accounts, opposite sides, leg for leg.
    expect(refund.credit, `${pair.refund} must credit exactly what ${pair.payment} debited`).toEqual(payment.debit);
    expect(refund.debit, `${pair.refund} must debit exactly what ${pair.payment} credited`).toEqual(payment.credit);
  });

  it('settled-funds marketplace refund pays out of Cash/Bank, never Payment Clearing', async () => {
    const sides = await resolveSides('marketplace_merchant_refund_settled', {
      merchant_payable: 100,
      platform_commission: 10,
      tax_liability: 5,
      cash_bank: 115,
    });
    expect(sides.credit).toContain('1120');
    expect(sides.credit).not.toContain('1100');
  });

  it('gateway settlement clears Payment Clearing into Cash/Bank and expenses the gateway fee', async () => {
    const sides = await resolveSides('payment_gateway_settlement', {
      cash_bank: 100,
      payment_gateway_fee: 3,
      payment_clearing: 103,
    });
    expect(sides.debit).toEqual(['1120', '5210']);
    expect(sides.credit).toEqual(['1100']);
  });

  it('settlement payout clears the merchant payable control against Cash/Bank', async () => {
    const paid = await resolveSides('settlement_paid', { merchant_payable: 100, cash_bank: 100 });
    expect(paid.debit).toEqual(['2202']);
    expect(paid.credit).toEqual(['1120']);
  });

  it('the historical settlement correction targets the legacy org payable, not the current control', async () => {
    const reversal = await resolveSides('settlement_paid_reversal', { cash_bank: 100, org_payable: 100 });
    expect(reversal.debit).toEqual(['1120']);
    expect(reversal.credit).toEqual(['2200']);
  });

  describe('code-level mapping fallback', () => {
    const codeOnlyEvents = [
      'academy_card_refund',
      'academy_wallet_refund',
      'academy_cash_refund',
      'membership_card_payment',
      'membership_card_refund',
      'membership_cash_payment',
      'membership_cash_refund',
      'tournament_registration_card_payment',
      'tournament_registration_card_refund',
      'payment_gateway_settlement',
      'payment_gateway_settlement_reversal',
      'settlement_paid_reversal',
    ];

    it.each(codeOnlyEvents)('%s has code defaults covering every required concept', async (eventType) => {
      const defaults = CONCEPT_ACCOUNT_CODE_DEFAULTS[eventType];
      expect(defaults, `${eventType} must declare code-level defaults`).toBeTruthy();
      const required = getEventConcepts(eventType).map((c) => c.concept);
      const missing = required.filter((c) => !defaults[c]);
      expect(missing, `${eventType} code defaults must cover all concepts`).toEqual([]);
    });

    it('resolves entirely from code to active COA accounts when no DB mapping rows exist', async () => {
      // Sanity: these event types are documented as having no DB mapping rows.
      const [rows] = await getPool().execute<any[]>(
        `SELECT event_type FROM accounting_event_mapping_lines
         WHERE organisation_id IS NULL AND is_active = 1
           AND event_type IN (${codeOnlyEvents.map(() => '?').join(',')})`,
        codeOnlyEvents,
      );
      const withRows = new Set((rows as any[]).map((r) => r.event_type));
      // If a future seed adds rows, the code fallback coverage assertion above
      // still guarantees completeness; this branch only documents today's state.
      const fullyCodeOnly = codeOnlyEvents.filter((e) => !withRows.has(e));
      for (const eventType of fullyCodeOnly) {
        const mapping = await accountingEngineService.resolveMapping(eventType, null);
        const required = getEventConcepts(eventType).map((c) => c.concept);
        expect(mapping.map((m) => m.concept).sort(), `${eventType} resolves all required concepts`).toEqual(
          expect.arrayContaining(required.sort()),
        );
        for (const line of mapping) {
          await codeOf(line.accountId); // must be an existing, active COA row
        }
      }
    });
  });
});

describe('P4-07 ledger idempotency is DB-enforced', () => {
  it('ledger_entries.uk_dedup is a UNIQUE key over the posting identity', async () => {
    const [rows] = await getPool().execute<any[]>(
      `SELECT INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique,
              GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columnsList
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ledger_entries' AND INDEX_NAME = 'uk_dedup'
       GROUP BY INDEX_NAME, NON_UNIQUE`,
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].nonUnique)).toBe(0); // UNIQUE, not a plain index
    expect(String(rows[0].columnsList)).toBe('source_type,source_id,event_type,chart_account_id,side');
  });
});
