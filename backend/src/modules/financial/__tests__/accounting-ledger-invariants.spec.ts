import { describe, it, expect, vi } from 'vitest';

/**
 * P4-07 — accounting integrity invariants that hold WITHOUT a database.
 *
 * These tests pin the pure accounting primitives every posting path depends on:
 *   - domain line construction (createLedgerLines / createLedgerPair)
 *   - the double-entry balance predicate (validateLedgerBalance)
 *   - the Accounting Engine's line builder (buildLedgerLines) and its
 *     balance validator (validateBalance), including merge/split/org-attribution
 *     and the rejections that keep an unbalanced or mis-mapped journal from
 *     ever reaching ledger_entries
 *   - the payment ↔ refund/reversal concept symmetry declared by EVENT_CONCEPTS,
 *     so a refund can never silently drop (or double-reverse) a debit/credit leg.
 *
 * The DB-authoritative half of the mapping check (concept → chart account code,
 * ledger_entries.uk_dedup, real mapped accounts) lives in
 * `accounting-mapping-integrity.integration.spec.ts`.
 */

vi.mock('../../../database/mysql.js', () => ({
  // The engine only reaches the pool for DB-backed mapping resolution, which
  // these tests never call.
  getPool: () => ({ execute: async () => [[], []], query: async () => [[], []] }),
}));

import { createLedgerLines, createLedgerPair, validateLedgerBalance } from '../domain/ledger-aggregate.js';
import type { LedgerEntry } from '../domain/ledger-aggregate.js';
import { accountingEngineService } from '../application/accounting-engine.service.js';
import { getEventConcepts } from '../application/accounting-concepts.js';

const ACC_CLEARING = 101;
const ACC_PAYABLE = 202;
const ACC_COMMISSION = 303;
const ACC_TAX = 404;

/** Four-line card payment shape used across the engine tests. */
function cardMapping() {
  return [
    { concept: 'payment_clearing', accountId: ACC_CLEARING },
    { concept: 'merchant_payable', accountId: ACC_PAYABLE },
    { concept: 'platform_commission', accountId: ACC_COMMISSION },
    { concept: 'tax_liability', accountId: ACC_TAX },
  ];
}

function totals(lines: Array<{ side: 'debit' | 'credit'; amount: number }>) {
  return {
    debit: Math.round(lines.filter((l) => l.side === 'debit').reduce((s, l) => s + l.amount, 0) * 100) / 100,
    credit: Math.round(lines.filter((l) => l.side === 'credit').reduce((s, l) => s + l.amount, 0) * 100) / 100,
  };
}

describe('P4-07 domain ledger invariants', () => {
  it('createLedgerLines carries chart account, event identity, org scope and period onto every line', () => {
    const lines = createLedgerLines([
      {
        transactionId: 'txn-1',
        sourceType: 'booking',
        sourceId: 55,
        side: 'debit',
        amount: 115,
        currency: 'EGP',
        description: 'card payment',
        chartAccountId: ACC_CLEARING,
        eventType: 'booking_card_payment',
        organisationId: 9,
        periodId: 12,
      },
      {
        transactionId: 'txn-1',
        sourceType: 'booking',
        sourceId: 55,
        side: 'credit',
        amount: 115,
        currency: 'EGP',
        description: 'card payment',
        chartAccountId: ACC_PAYABLE,
        eventType: 'booking_card_payment',
        organisationId: 9,
        periodId: 12,
      },
    ]);

    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line.chartAccountId).toBeGreaterThan(0);
      expect(line.eventType).toBe('booking_card_payment');
      expect(line.organisationId).toBe(9);
      expect(line.periodId).toBe(12);
      expect(line.sourceType).toBe('booking');
      expect(line.sourceId).toBe(55);
    }
    expect(validateLedgerBalance(lines)).toBe(true);
  });

  it('createLedgerLines rejects an empty journal and non-positive amounts (no silent zero/negative lines)', () => {
    expect(() => createLedgerLines([])).toThrow(/at least one ledger line/i);
    expect(() =>
      createLedgerLines([
        {
          transactionId: 't',
          sourceType: 'booking',
          sourceId: 1,
          side: 'debit',
          amount: 0,
          currency: 'EGP',
          description: 'x',
          chartAccountId: ACC_CLEARING,
        },
      ]),
    ).toThrow(/positive/i);
    expect(() =>
      createLedgerLines([
        {
          transactionId: 't',
          sourceType: 'booking',
          sourceId: 1,
          side: 'credit',
          amount: -5,
          currency: 'EGP',
          description: 'x',
          chartAccountId: ACC_CLEARING,
        },
      ]),
    ).toThrow(/positive/i);
  });

  it('createLedgerPair is balanced and refuses non-positive amounts', () => {
    const [debit, credit] = createLedgerPair('txn-2', 'wallet', 3, 'wallet_liability', 'customer_balance', 40, 'EGP', 'pair');
    expect(debit.side).toBe('debit');
    expect(credit.side).toBe('credit');
    expect(validateLedgerBalance([debit, credit])).toBe(true);
    expect(() => createLedgerPair('txn-3', 'wallet', 3, 'wallet_liability', 'customer_balance', 0, 'EGP', 'pair')).toThrow(/positive/i);
  });

  it('validateLedgerBalance detects a missing or duplicated leg (1-cent tolerance)', () => {
    const base: LedgerEntry[] = [
      {
        transactionId: 't',
        sourceType: 'booking',
        sourceId: 1,
        accountType: 'receivable',
        side: 'debit',
        amount: 100,
        currency: 'EGP',
        description: 'd',
        recordedAt: '2026-01-01 00:00:00',
      },
      {
        transactionId: 't',
        sourceType: 'booking',
        sourceId: 1,
        accountType: 'payable',
        side: 'credit',
        amount: 100,
        currency: 'EGP',
        description: 'c',
        recordedAt: '2026-01-01 00:00:00',
      },
    ];
    expect(validateLedgerBalance(base)).toBe(true);
    expect(validateLedgerBalance([base[0]])).toBe(false); // missing credit leg
    expect(validateLedgerBalance([...base, base[0]])).toBe(false); // duplicated debit leg
    expect(validateLedgerBalance([{ ...base[0], amount: 100.0005 }, base[1]])).toBe(true); // sub-mill tolerance
    expect(validateLedgerBalance([{ ...base[0], amount: 100.02 }, base[1]])).toBe(false);
  });
});

describe('P4-07 Accounting Engine line builder', () => {
  it('builds a balanced multi-leg posting with the declared sides and no fabricated lines', () => {
    const lines = accountingEngineService.buildLedgerLines(
      'booking_card_payment',
      cardMapping(),
      { payment_clearing: 115, merchant_payable: 100, platform_commission: 10, tax_liability: 5 },
    );

    expect(lines).toHaveLength(4);
    const byAccount = new Map(lines.map((l) => [l.accountId, l]));
    expect(byAccount.get(ACC_CLEARING)!.side).toBe('debit');
    expect(byAccount.get(ACC_PAYABLE)!.side).toBe('credit');
    expect(byAccount.get(ACC_COMMISSION)!.side).toBe('credit');
    expect(byAccount.get(ACC_TAX)!.side).toBe('credit');
    expect(totals(lines)).toEqual({ debit: 115, credit: 115 });
    expect(() => accountingEngineService.validateBalance(lines)).not.toThrow();
  });

  it('omits zero-amount concepts instead of writing zero-value ledger rows', () => {
    const lines = accountingEngineService.buildLedgerLines(
      'booking_card_payment',
      cardMapping(),
      { payment_clearing: 115, merchant_payable: 100, platform_commission: 15, tax_liability: 0 },
    );
    expect(lines.some((l) => l.accountId === ACC_TAX)).toBe(false);
    expect(totals(lines)).toEqual({ debit: 115, credit: 100 + 15 });
  });

  it('rejects negative amounts (refunds must use their own event, never a negative posting)', () => {
    expect(() =>
      accountingEngineService.buildLedgerLines('booking_card_payment', cardMapping(), { payment_clearing: 100, merchant_payable: -100 }),
    ).toThrow(/negative/i);
  });

  it('rejects a concept the event does not declare (no invented journal legs)', () => {
    expect(() =>
      accountingEngineService.buildLedgerLines('booking_card_payment', cardMapping(), { payment_clearing: 100, cash_bank: 100 }),
    ).toThrow(/unknown concept/i);
  });

  it('rejects a declared concept that has no resolved account (no null chart_account_id postings)', () => {
    expect(() =>
      accountingEngineService.buildLedgerLines(
        'booking_card_payment',
        [{ concept: 'payment_clearing', accountId: ACC_CLEARING }],
        { payment_clearing: 100, merchant_payable: 100 },
      ),
    ).toThrow(/not found in resolved mapping/i);
  });

  it('merges same-side lines on the same account but keeps different organisation attribution separate', () => {
    const mapping = [
      { concept: 'merchant_payable', accountId: ACC_PAYABLE },
      { concept: 'platform_commission', accountId: ACC_PAYABLE },
      { concept: 'payment_clearing', accountId: ACC_CLEARING },
    ];
    // Same account, same org → merged into one credit line.
    const merged = accountingEngineService.buildLedgerLines(
      'booking_card_payment',
      mapping,
      { merchant_payable: 90, platform_commission: 10, payment_clearing: 100 },
      { merchant_payable: 7, platform_commission: 7, payment_clearing: null },
    );
    expect(merged).toHaveLength(2);
    const credit = merged.find((l) => l.side === 'credit')!;
    expect(credit.amount).toBe(100);
    expect(credit.organisationId).toBe(7);

    // Same account, different org attribution → NOT merged (platform vs seller books).
    const split = accountingEngineService.buildLedgerLines(
      'booking_card_payment',
      mapping,
      { merchant_payable: 90, platform_commission: 10, payment_clearing: 100 },
      { merchant_payable: 7, platform_commission: null, payment_clearing: null },
    );
    const credits = split.filter((l) => l.side === 'credit');
    expect(credits).toHaveLength(2);
    expect(credits.map((l) => l.organisationId).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([null, 7]);
    expect(totals(split)).toEqual({ debit: 100, credit: 100 });
  });

  it('validateBalance throws on an unbalanced journal (engine-level guard before persistence)', () => {
    expect(() =>
      accountingEngineService.validateBalance([
        { concept: '', side: 'debit', accountId: ACC_CLEARING, amount: 115 },
        { concept: '', side: 'credit', accountId: ACC_PAYABLE, amount: 100 },
      ]),
    ).toThrow(/not balanced/i);
  });
});

describe('P4-07 payment ↔ refund/reversal concept symmetry', () => {
  /** wallet_liability_spend (spend) and wallet_liability (credit back) are the same liability account. */
  const normalize = (c: string) => (c === 'wallet_liability_spend' ? 'wallet_liability' : c);

  const sides = (eventType: string) => {
    const concepts = getEventConcepts(eventType);
    return {
      debit: new Set(concepts.filter((c) => c.side === 'debit').map((c) => normalize(c.concept))),
      credit: new Set(concepts.filter((c) => c.side === 'credit').map((c) => normalize(c.concept))),
    };
  };

  const symmetricPairs: Array<[string, string]> = [
    ['booking_card_payment', 'booking_refund'],
    ['booking_wallet_payment', 'booking_wallet_refund'],
    ['booking_cod_payment', 'booking_cod_reversal'],
    ['marketplace_card_payment', 'marketplace_merchant_refund'],
    ['marketplace_wallet_payment', 'marketplace_wallet_refund'],
    ['academy_card_payment', 'academy_card_refund'],
    ['academy_wallet_payment', 'academy_wallet_refund'],
    ['academy_cash_payment', 'academy_cash_refund'],
    ['membership_card_payment', 'membership_card_refund'],
    ['membership_cash_payment', 'membership_cash_refund'],
    ['tournament_registration_card_payment', 'tournament_registration_card_refund'],
    ['tournament_cash_commission_receivable', 'tournament_cash_commission_refund'],
    ['payment_gateway_settlement', 'payment_gateway_settlement_reversal'],
  ];

  it.each(symmetricPairs)('%s and %s are exact side inversions over the same concepts', (payment, refund) => {
    const pay = sides(payment);
    const rev = sides(refund);

    expect(pay.debit.size).toBeGreaterThan(0);
    // Every debit of the payment is a credit of the reversal …
    expect([...pay.debit].sort()).toEqual([...rev.credit].sort());
    // … and every credit is a debit. No leg is dropped or re-sided.
    expect([...pay.credit].sort()).toEqual([...rev.debit].sort());
  });

  it('settlement_paid_reversal is a documented historical correction, not a merchant-payable inverse', () => {
    const paid = sides('settlement_paid');
    const reversal = sides('settlement_paid_reversal');
    // settlement_paid clears the merchant payable control (Dr payable / Cr bank).
    expect([...paid.debit]).toEqual(['merchant_payable']);
    expect([...paid.credit]).toEqual(['cash_bank']);
    // The pre-ec2a5ab correction deliberately debits bank and credits the LEGACY
    // org payable, matching the entries it corrects — never the current control.
    expect([...reversal.debit]).toEqual(['cash_bank']);
    expect([...reversal.credit]).toEqual(['org_payable']);
  });
});
