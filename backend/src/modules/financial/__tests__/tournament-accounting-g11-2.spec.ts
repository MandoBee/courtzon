import { describe, it, expect, vi } from 'vitest';

// The modules under test reach `database/mysql.js`, which validates the env at
// import time and calls process.exit(1) when it is missing. No connection is
// ever opened here — every test below is a source contract or pure logic check.
vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379';
  process.env.PAYMENT_GATEWAY_PROVIDER = 'mock';
});

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EVENT_CONCEPTS, getEventConcepts, validateCompleteMapping } from '../application/accounting-concepts.js';
import { CONCEPT_ACCOUNT_CODE_DEFAULTS, ORG_BOOK_EVENTS } from '../application/accounting-engine.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..', '..', '..');
/** Read a file under backend/. */
const be = (p: string) => readFileSync(resolve(ROOT, 'backend', p), 'utf8');

// G11.2 approved model (entry_fee 1000, commission_rate 10 → commission 100):
//   CourtZon: Dr 2202 100 · Cr 4192 100
//   Org book: Dr ORG-CASH 1000 · Dr MKT-COMM-EXP 100 · Cr 4140 1000 ·
//             Cr MKT-CZ-PAY (CourtZon Payable) 100
//   Platform/community CASH → fail-closed, NO posting · No 1100 · No tax.

describe('G11.2 — tournament CASH registration accounting contract', () => {
  it('EVENT_CONCEPTS defines the CourtZon cash event (Dr merchant payable / Cr tournament commission)', () => {
    expect(EVENT_CONCEPTS.tournament_cash_commission_receivable).toEqual({
      debit: ['merchant_payable'],
      credit: ['tournament_commission'],
    });
  });

  it('the CourtZon cash event NEVER touches payment_clearing (1100) or tax (2300)', () => {
    const concepts = getEventConcepts('tournament_cash_commission_receivable').map((c) => c.concept);
    expect(concepts).not.toContain('payment_clearing');
    expect(concepts).not.toContain('tax_liability');
  });

  it('EVENT_CONCEPTS defines the org cash event (Dr org cash + commission expense / Cr tournament revenue + CourtZon payable)', () => {
    expect(EVENT_CONCEPTS.tournament_org_cash_payment).toEqual({
      debit: ['org_cash_bank', 'commission_expense'],
      credit: ['tournament_revenue', 'courtzon_payable'],
    });
  });

  it('the CourtZon cash event resolves FULLY from code defaults (no DB mapping rows) to 2202 / 4192', () => {
    const required = getEventConcepts('tournament_cash_commission_receivable').map((c) => c.concept);
    const defaults = CONCEPT_ACCOUNT_CODE_DEFAULTS.tournament_cash_commission_receivable!;
    expect(defaults).toBeTruthy();
    expect(validateCompleteMapping('tournament_cash_commission_receivable', Object.keys(defaults))).toEqual([]);
    expect(defaults.merchant_payable).toBe('2202');
    expect(defaults.tournament_commission).toBe('4192');
  });

  it('the org cash event is in ORG_BOOK_EVENTS (idempotent per-org provisioning) with the four org-book concepts', () => {
    expect(ORG_BOOK_EVENTS.tournament_org_cash_payment).toEqual([
      'org_cash_bank', 'commission_expense', 'tournament_revenue', 'courtzon_payable',
    ]);
  });

  it('the listener routes tournament CASH to the dedicated G11.2 cash function (card still goes to the G11.1 helper)', () => {
    const listener = be('src/modules/financial/application/accounting-event.listener.ts');
    expect(listener).toContain("if (paymentMethod === 'cash') {");
    expect(listener).toContain('await postTournamentCashAccounting(amount, currency, data);');
    expect(listener).toContain('await postTournamentCardPaymentAccounting(paymentMethod, amount, currency, data);');
  });

  it('the cash postings use source_type="tournament" with source_id=paymentId and dedicated event types', () => {
    const listener = be('src/modules/financial/application/accounting-event.listener.ts');
    const fn = listener.slice(listener.indexOf('async function postTournamentCashAccounting'));
    expect(fn).toContain("'tournament_cash_commission_receivable', 'tournament', paymentId, null,");
    expect(fn).toContain("'tournament_org_cash_payment', 'tournament', paymentId, orgId,");
    expect(fn).not.toContain("'booking', paymentId");
  });

  it('an org-less (LEGACY, pre-Phase-3) tournament CASH payment is FAIL-CLOSED (no owning org → no posting)', () => {
    const listener = be('src/modules/financial/application/accounting-event.listener.ts');
    const fn = listener.slice(listener.indexOf('async function postTournamentCashAccounting'));
    expect(fn).toContain('if (orgId == null) {');
    expect(fn).toContain('Org-less tournament CASH');
    expect(fn).toContain('no custody model; no accounting posted (fail-closed)');
    // The guard must short-circuit BEFORE any posting is made.
    const guardIdx = fn.indexOf('if (orgId == null) {');
    expect(guardIdx).toBeLessThan(fn.indexOf('await postAccountingEvent('));
  });

  it('commission uses the IMMUTABLE tournament.commission_rate snapshot; payment amount is authoritative; registration_fee never used', () => {
    const listener = be('src/modules/financial/application/accounting-event.listener.ts');
    const start = listener.indexOf('async function postTournamentCashAccounting');
    // Bound the slice to the G11.2 cash function only (stops at the G11.3 section banner).
    const g113 = listener.indexOf('// G11.3 — TOURNAMENT FULL-REFUND');
    const fn = listener.slice(start, g113 > -1 ? g113 : start + 4000);
    expect(fn).toContain('tournament.commission_rate');
    expect(fn).toContain('const commission = Math.round(((gross * commissionRate) / 100) * 100) / 100;');
    expect(fn).toContain('const gross = Math.round(Number(amount) * 100) / 100;');
    expect(fn).toContain('is NEVER silently altered or re-priced');
    expect(fn).toContain('cash amount differs from entry_fee');
    expect(fn).not.toContain('registration_fee');
    // The live subscription rate is never re-read at payment time.
    expect(fn).not.toContain('getCommissionRate');
    expect(fn).not.toContain('getCurrentSubscription');
  });

  it('FREE (payment amount <= 0) CASH posts nothing', () => {
    const listener = be('src/modules/financial/application/accounting-event.listener.ts');
    const fn = listener.slice(listener.indexOf('async function postTournamentCashAccounting'));
    expect(fn).toContain("if (gross <= 0) {");
    expect(fn).toContain('Tournament zero-fee registration — no cash accounting posted');
  });

  it('G11.1 CARD events are unchanged (card regression guard)', () => {
    expect(EVENT_CONCEPTS.tournament_registration_card_payment).toEqual({
      debit: ['payment_clearing'],
      credit: ['merchant_payable', 'tournament_commission'],
    });
    expect(EVENT_CONCEPTS.tournament_org_registration_receivable).toEqual({
      debit: ['marketplace_receivable', 'commission_expense'],
      credit: ['tournament_revenue'],
    });
  });
});