import { describe, it, expect, vi } from 'vitest';

/**
 * G8.3 Part 13 UNIT — accounting mapping selection for academy events.
 *
 * Verifies the EVENT_CONCEPTS contract (debit/credit legs) matches the locked
 * G8 accounting model, that CONCEPT_ACCOUNT_CODE_DEFAULTS covers every concept
 * (validateCompleteMapping), and that buildLedgerLines produces balanced
 * postings with NO tax leg for a 0% tax design.
 */
vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

import { getEventConcepts, validateCompleteMapping } from '../application/accounting-concepts.js';
import { CONCEPT_ACCOUNT_CODE_DEFAULTS, accountingEngineService } from '../application/accounting-engine.service.js';

function conceptsOf(eventType: string) {
  return getEventConcepts(eventType).map((c) => c.concept).sort();
}

describe('G8.3 — academy accounting mapping selection', () => {
  it('academy_card_payment: Dr payment_clearing / Cr merchant_payable + platform_commission + tax_liability', () => {
    expect(conceptsOf('academy_card_payment')).toEqual([
      'merchant_payable', 'payment_clearing', 'platform_commission', 'tax_liability',
    ]);
  });

  it('academy_wallet_payment: Dr wallet_liability_spend / Cr merchant_payable + platform_commission + tax_liability', () => {
    expect(conceptsOf('academy_wallet_payment')).toEqual([
      'merchant_payable', 'platform_commission', 'tax_liability', 'wallet_liability_spend',
    ]);
  });

  it('academy_cash_payment: Dr marketplace_receivable / Cr platform_commission + tax_liability', () => {
    expect(conceptsOf('academy_cash_payment')).toEqual([
      'marketplace_receivable', 'platform_commission', 'tax_liability',
    ]);
  });

  it('CONCEPT_ACCOUNT_CODE_DEFAULTS is complete for every academy event (validateCompleteMapping passes)', () => {
    for (const eventType of ['academy_card_payment', 'academy_wallet_payment', 'academy_cash_payment']) {
      const concepts = getEventConcepts(eventType).map((c) => c.concept);
      const defaults = CONCEPT_ACCOUNT_CODE_DEFAULTS[eventType];
      expect(defaults, eventType).toBeDefined();
      const missing = validateCompleteMapping(eventType, concepts);
      expect(missing, eventType).toEqual([]);
    }
  });

  it('commission is always mapped to 4191 Academy Commission Revenue', () => {
    for (const eventType of ['academy_card_payment', 'academy_wallet_payment', 'academy_cash_payment']) {
      expect(CONCEPT_ACCOUNT_CODE_DEFAULTS[eventType].platform_commission).toBe('4191');
    }
  });

  it('card/wallet org share maps to merchant_payable 2202; cash to marketplace_receivable 1161', () => {
    expect(CONCEPT_ACCOUNT_CODE_DEFAULTS.academy_card_payment.merchant_payable).toBe('2202');
    expect(CONCEPT_ACCOUNT_CODE_DEFAULTS.academy_wallet_payment.merchant_payable).toBe('2202');
    expect(CONCEPT_ACCOUNT_CODE_DEFAULTS.academy_cash_payment.marketplace_receivable).toBe('1161');
  });

  it('academy_card_payment posting: balanced, and zero tax produces NO tax leg', () => {
    const mapping = [
      { concept: 'payment_clearing', accountId: 1 },
      { concept: 'merchant_payable', accountId: 2 },
      { concept: 'platform_commission', accountId: 3 },
      { concept: 'tax_liability', accountId: 4 },
    ];
    const lines = accountingEngineService.buildLedgerLines(
      'academy_card_payment', mapping,
      { payment_clearing: 200, merchant_payable: 180, platform_commission: 20, tax_liability: 0 },
    );
    expect(lines.length).toBe(3); // tax (0) skipped
    accountingEngineService.validateBalance(lines);
    const debit = lines.filter((l) => l.side === 'debit').reduce((s, l) => s + l.amount, 0);
    const credit = lines.filter((l) => l.side === 'credit').reduce((s, l) => s + l.amount, 0);
    expect(debit).toBe(200);
    expect(credit).toBe(200);
  });

  it('academy_cash_payment posting: Dr receivable(commission) = Cr commission, no tax leg', () => {
    const mapping = [
      { concept: 'marketplace_receivable', accountId: 5 },
      { concept: 'platform_commission', accountId: 3 },
      { concept: 'tax_liability', accountId: 4 },
    ];
    const lines = accountingEngineService.buildLedgerLines(
      'academy_cash_payment', mapping,
      { marketplace_receivable: 20, platform_commission: 20, tax_liability: 0 },
    );
    expect(lines.length).toBe(2);
    accountingEngineService.validateBalance(lines);
  });

  it('academy_wallet_payment posting: Dr wallet spend = Cr org share + commission', () => {
    const mapping = [
      { concept: 'wallet_liability_spend', accountId: 6 },
      { concept: 'merchant_payable', accountId: 2 },
      { concept: 'platform_commission', accountId: 3 },
      { concept: 'tax_liability', accountId: 4 },
    ];
    const lines = accountingEngineService.buildLedgerLines(
      'academy_wallet_payment', mapping,
      { wallet_liability_spend: 200, merchant_payable: 180, platform_commission: 20, tax_liability: 0 },
    );
    expect(lines.length).toBe(3);
    accountingEngineService.validateBalance(lines);
  });
});