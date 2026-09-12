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
import {
  CONCEPT_ACCOUNT_CODE_DEFAULTS,
  ORG_BOOK_EVENTS,
  ORG_MARKETPLACE_ACCOUNT_CODES,
  accountingEngineService,
} from '../application/accounting-engine.service.js';

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

describe('G8.3A — Academy organization-book revenue classification', () => {
  // gross 200, courtRental 60, commission 20 → orgEarning 180,
  // academyRevenue 140, courtRentalRevenue 60.
  const MAPPING = {
    marketplace_receivable: 11,
    commission_expense: 12,
    academy_revenue: 13,
    court_rental_revenue: 14,
    org_cash_bank: 15,
    courtzon_payable: 16,
  };

  it('academy_org_receivable: Dr receivable + comm expense / Cr academy_revenue + court_rental_revenue', () => {
    const debit = getEventConcepts('academy_org_receivable').filter((c) => c.side === 'debit').map((c) => c.concept).sort();
    const credit = getEventConcepts('academy_org_receivable').filter((c) => c.side === 'credit').map((c) => c.concept).sort();
    expect(debit).toEqual(['commission_expense', 'marketplace_receivable']);
    expect(credit).toEqual(['academy_revenue', 'court_rental_revenue']);
  });

  it('academy_org_cash_receivable: Dr ORG-CASH + comm expense / Cr academy_revenue + court_rental_revenue + courtzon_payable', () => {
    const debit = getEventConcepts('academy_org_cash_receivable').filter((c) => c.side === 'debit').map((c) => c.concept).sort();
    const credit = getEventConcepts('academy_org_cash_receivable').filter((c) => c.side === 'credit').map((c) => c.concept).sort();
    expect(debit).toEqual(['commission_expense', 'org_cash_bank']);
    expect(credit).toEqual(['academy_revenue', 'court_rental_revenue', 'courtzon_payable']);
  });

  it('Academy Revenue + Court Rental Revenue = Gross Collections (card/wallet org book)', () => {
    const lines = accountingEngineService.buildLedgerLines(
      'academy_org_receivable',
      [
        { concept: 'marketplace_receivable', accountId: MAPPING.marketplace_receivable },
        { concept: 'commission_expense', accountId: MAPPING.commission_expense },
        { concept: 'academy_revenue', accountId: MAPPING.academy_revenue },
        { concept: 'court_rental_revenue', accountId: MAPPING.court_rental_revenue },
      ],
      { marketplace_receivable: 180, commission_expense: 20, academy_revenue: 140, court_rental_revenue: 60 },
    );
    accountingEngineService.validateBalance(lines);
    const credit = lines.filter((l) => l.side === 'credit').reduce((s, l) => s + l.amount, 0);
    const acadRev = lines.find((l) => l.side === 'credit' && l.accountId === MAPPING.academy_revenue)!.amount;
    const courtRev = lines.find((l) => l.side === 'credit' && l.accountId === MAPPING.court_rental_revenue)!.amount;
    expect(credit).toBe(200);
    expect(acadRev).toBe(140);   // gross − court rental
    expect(courtRev).toBe(60);   // court rental
  });

  it('Academy Revenue + Court Rental Revenue = Gross Collections (cash org book)', () => {
    const lines = accountingEngineService.buildLedgerLines(
      'academy_org_cash_receivable',
      [
        { concept: 'org_cash_bank', accountId: MAPPING.org_cash_bank },
        { concept: 'commission_expense', accountId: MAPPING.commission_expense },
        { concept: 'academy_revenue', accountId: MAPPING.academy_revenue },
        { concept: 'court_rental_revenue', accountId: MAPPING.court_rental_revenue },
        { concept: 'courtzon_payable', accountId: MAPPING.courtzon_payable },
      ],
      { org_cash_bank: 200, commission_expense: 20, academy_revenue: 140, court_rental_revenue: 60, courtzon_payable: 20 },
    );
    accountingEngineService.validateBalance(lines);
    const debit = lines.filter((l) => l.side === 'debit').reduce((s, l) => s + l.amount, 0);
    const credit = lines.filter((l) => l.side === 'credit').reduce((s, l) => s + l.amount, 0);
    expect(debit).toBe(220);
    expect(credit).toBe(220);
    const acadRev = lines.find((l) => l.side === 'credit' && l.accountId === MAPPING.academy_revenue)!.amount;
    const courtRev = lines.find((l) => l.side === 'credit' && l.accountId === MAPPING.court_rental_revenue)!.amount;
    expect(acadRev).toBe(140);
    expect(courtRev).toBe(60);
  });

  it('zero court rental → single revenue leg (academy_revenue = gross)', () => {
    const lines = accountingEngineService.buildLedgerLines(
      'academy_org_receivable',
      [
        { concept: 'marketplace_receivable', accountId: MAPPING.marketplace_receivable },
        { concept: 'commission_expense', accountId: MAPPING.commission_expense },
        { concept: 'academy_revenue', accountId: MAPPING.academy_revenue },
        { concept: 'court_rental_revenue', accountId: MAPPING.court_rental_revenue },
      ],
      { marketplace_receivable: 180, commission_expense: 20, academy_revenue: 200, court_rental_revenue: 0 },
    );
    accountingEngineService.validateBalance(lines);
    expect(lines.length).toBe(3); // court_rental_revenue (0) skipped
    const acadRev = lines.find((l) => l.side === 'credit' && l.accountId === MAPPING.academy_revenue)!.amount;
    expect(acadRev).toBe(200);
  });

  it('every academy org-book event has an account code for every concept (no new COA needed)', () => {
    for (const eventType of ['academy_org_receivable', 'academy_org_receivable_reversal', 'academy_org_cash_receivable', 'academy_org_cash_receivable_rev']) {
      for (const concept of ORG_BOOK_EVENTS[eventType]) {
        expect(ORG_MARKETPLACE_ACCOUNT_CODES[concept], `${eventType}.${concept}`).toBeDefined();
      }
    }
    // Court Rental Revenue reuses the booking account (MKT-COURT-REN).
    expect(ORG_MARKETPLACE_ACCOUNT_CODES.court_rental_revenue.code).toBe('MKT-COURT-REN');
    expect(ORG_MARKETPLACE_ACCOUNT_CODES.academy_revenue.code).toBe('ACAD-REV');
  });

  it('negative academy_revenue (court rental > gross) is rejected — fail closed, never clamped', () => {
    expect(() => accountingEngineService.buildLedgerLines(
      'academy_org_receivable',
      [
        { concept: 'marketplace_receivable', accountId: MAPPING.marketplace_receivable },
        { concept: 'commission_expense', accountId: MAPPING.commission_expense },
        { concept: 'academy_revenue', accountId: MAPPING.academy_revenue },
        { concept: 'court_rental_revenue', accountId: MAPPING.court_rental_revenue },
      ],
      { marketplace_receivable: 180, commission_expense: 20, academy_revenue: -40, court_rental_revenue: 240 },
    )).toThrow(/Negative amount/);
  });
});