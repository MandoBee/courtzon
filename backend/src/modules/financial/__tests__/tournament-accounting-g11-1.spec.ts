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
import { CONCEPT_ACCOUNT_CODE_DEFAULTS, ORG_BOOK_EVENTS, ORG_MARKETPLACE_ACCOUNT_CODES } from '../application/accounting-engine.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..', '..', '..');
/** Read a file under backend/. */
const be = (p: string) => readFileSync(resolve(ROOT, 'backend', p), 'utf8');

// G11.1 approved model (entry_fee 1000, commission_rate 10):
//   CourtZon: Dr 1100 1000 · Cr 2202 900 · Cr 4192 100
//   Org book: Dr 1161 900 · Dr MKT-COMM-EXP 100 · Cr 4140 1000
//   No tax (2300).
//
// G11 Phase 3 — the CourtZon PLATFORM never owns or recognises a tournament, so
// the former "platform" topology (Dr 1100 1000 · Cr 4140 1000, no payable, no
// commission, no org journal) is REMOVED. The `tournament_platform_card_payment`
// concept no longer exists.

describe('G11.1 — tournament card registration accounting contract', () => {
  it('EVENT_CONCEPTS defines the org-owned CourtZon custody event (Dr clearing / Cr payable + tournament commission)', () => {
    expect(EVENT_CONCEPTS.tournament_registration_card_payment).toEqual({
      debit: ['payment_clearing'],
      credit: ['merchant_payable', 'tournament_commission'],
    });
  });

  it('G11 Phase 3 — the platform tournament event concept is GONE (the platform never recognises a tournament fee)', () => {
    // LOCKED PRODUCT RULE: the CourtZon platform must not create, own, fund, or
    // financially recognise a tournament. The org-less custody topology is
    // therefore not merely unused — it is deleted, so nothing can post against it.
    expect(EVENT_CONCEPTS).not.toHaveProperty('tournament_platform_card_payment');
    expect(CONCEPT_ACCOUNT_CODE_DEFAULTS).not.toHaveProperty('tournament_platform_card_payment');
    // The concept resolver is fail-closed: an unknown event_type throws, so a
    // stale caller cannot silently resolve to an empty (unbalanced) posting.
    expect(() => getEventConcepts('tournament_platform_card_payment' as never)).toThrow(/Unknown event_type/);
  });

  it('EVENT_CONCEPTS defines the org book event (Dr receivable + commission expense / Cr tournament revenue)', () => {
    expect(EVENT_CONCEPTS.tournament_org_registration_receivable).toEqual({
      debit: ['marketplace_receivable', 'commission_expense'],
      credit: ['tournament_revenue'],
    });
  });

  it('the tournament event concept sets are complete under the code defaults (no DB mapping rows needed)', () => {
    for (const eventType of ['tournament_registration_card_payment', 'tournament_cash_commission_receivable']) {
      const required = getEventConcepts(eventType).map((c) => c.concept);
      expect(required.length, eventType).toBeGreaterThan(0);
      const defaults = CONCEPT_ACCOUNT_CODE_DEFAULTS[eventType];
      expect(defaults, eventType).toBeTruthy();
      expect(validateCompleteMapping(eventType, Object.keys(defaults!)), eventType).toEqual([]);
    }
  });

  it('the org-owned CourtZon event resolves to 1100 / 2202 / 4192 (existing global accounts)', () => {
    const d = CONCEPT_ACCOUNT_CODE_DEFAULTS.tournament_registration_card_payment!;
    expect(d.payment_clearing).toBe('1100');
    expect(d.merchant_payable).toBe('2202');
    expect(d.tournament_commission).toBe('4192');
  });

  it('the CARD cash/commission sibling event (G11.2) still resolves to 2202 / 4192', () => {
    const d = CONCEPT_ACCOUNT_CODE_DEFAULTS.tournament_cash_commission_receivable!;
    expect(d.merchant_payable).toBe('2202');
    expect(d.tournament_commission).toBe('4192');
  });

  it('the org book event is in ORG_BOOK_EVENTS (idempotent per-org provisioning, like booking/academy)', () => {
    expect(ORG_BOOK_EVENTS.tournament_org_registration_receivable).toEqual([
      'marketplace_receivable', 'commission_expense', 'tournament_revenue',
    ]);
  });

  it('the org-book account map provisions the DEDICATED org 4140 Tournament / Event Revenue account', () => {
    expect(ORG_MARKETPLACE_ACCOUNT_CODES.tournament_revenue).toMatchObject({
      code: '4140', name: 'Tournament / Event Revenue', type: 'revenue', normalSide: 'credit', parentCode: 'REVENUE-COURT',
    });
  });

  it('NO tournament event carries a tax concept (G11.1 tax = 0 → no 2300 leg)', () => {
    for (const eventType of ['tournament_registration_card_payment', 'tournament_cash_commission_receivable', 'tournament_org_registration_receivable']) {
      const concepts = getEventConcepts(eventType).map((c) => c.concept);
      expect(concepts, eventType).not.toContain('tax_liability');
    }
  });

  it('the accounting listener routes tournament to the dedicated branch and NEVER the generic card_payment fallthrough', () => {
    const listener = be('src/modules/financial/application/accounting-event.listener.ts');
    expect(listener).toContain("if (referenceType === 'tournament') {");
    expect(listener).toContain('await postTournamentCardPaymentAccounting(paymentMethod, amount, currency, data);');
    // The tournament branch must not fall through to the generic card_payment.
    expect(listener).toContain("'tournament_registration_card_payment', 'tournament', paymentId, null,");
    expect(listener).toContain("'tournament_org_registration_receivable', 'tournament', paymentId, orgId,");
    // G11 Phase 3 — the platform custody posting is gone, and an org-less
    // (LEGACY) tournament fails closed instead of being recognised as revenue.
    expect(listener).not.toContain("'tournament_platform_card_payment'");
  });

  it('G11 Phase 3 — the CARD branch fails closed for an org-less (LEGACY) tournament instead of recognising platform revenue', () => {
    const listener = be('src/modules/financial/application/accounting-event.listener.ts');
    const helper = listener.slice(listener.indexOf('async function postTournamentCardPaymentAccounting'));
    // The org-less guard must run BEFORE any posting is made.
    const guardIdx = helper.indexOf('if (orgId == null) {');
    expect(guardIdx).toBeGreaterThan(-1);
    const firstPost = helper.indexOf('await postAccountingEvent(');
    expect(guardIdx, 'org-less guard must precede the first posting').toBeLessThan(firstPost);
    expect(helper.slice(guardIdx, guardIdx + 700)).toContain('return;');
  });

  it('source segregation — tournament postings use source_type="tournament", source_id=paymentId, never "booking"', () => {
    const listener = be('src/modules/financial/application/accounting-event.listener.ts');
    const helper = listener.slice(listener.indexOf('async function postTournamentCardPaymentAccounting'));
    expect(helper).toContain("'tournament', paymentId, null,");
    expect(helper).not.toContain("'booking', paymentId");
  });

  it('commission is taken from the persisted tournament.commission_rate snapshot — the live subscription rate is never re-read', () => {
    const listener = be('src/modules/financial/application/accounting-event.listener.ts');
    const helper = listener.slice(listener.indexOf('async function postTournamentCardPaymentAccounting'));
    expect(helper).toContain('tournament.commission_rate');
    // No live rate resolution API is ever called in the tournament branch.
    expect(helper).not.toContain('getCommissionRate');
    expect(helper).not.toContain('getCurrentSubscription');
    // The canonical model formula: commission = round2(gross × commission_rate / 100).
    expect(helper).toContain('const commission = Math.round(((gross * commissionRate) / 100) * 100) / 100;');
    expect(helper).toContain('const orgNet = Math.round((gross - commission) * 100) / 100;');
  });

  it('the authoritative charged amount is the PAYMENT amount; entry_fee is only verified defensively', () => {
    const listener = be('src/modules/financial/application/accounting-event.listener.ts');
    const start = listener.indexOf('async function postTournamentCardPaymentAccounting');
    // Bound the slice to the CARD function only (stops at the G11.2 cash section).
    const g112 = listener.indexOf('// G11.2 — TOURNAMENT CASH registration recognition');
    const helper = listener.slice(start, g112 > -1 ? g112 : start + 4000);
    expect(helper).toContain('const gross = Math.round(Number(amount) * 100) / 100;');
    expect(helper).toContain('payment amount differs from entry_fee');
    // registration_fee is NEVER consulted.
    expect(helper).not.toContain('registration_fee');
  });

  it('the CARD helper keeps its non-card guard, and CASH is routed to the dedicated G11.2 cash function (org cash posts; org-less cash fail-closed)', () => {
    const listener = be('src/modules/financial/application/accounting-event.listener.ts');
    const card = listener.slice(listener.indexOf('async function postTournamentCardPaymentAccounting'));
    // The card helper itself still post nothing for anything but card.
    expect(card).toContain("if (paymentMethod && paymentMethod !== 'card') return;");
    expect(card).toContain('gross <= 0');
    // The tournament branch routes CASH to the dedicated G11.2 cash function.
    expect(listener).toContain("if (paymentMethod === 'cash') {");
    expect(listener).toContain('await postTournamentCashAccounting(amount, currency, data);');
    expect(listener).toContain('async function postTournamentCashAccounting(');
    // G11 Phase 3 — an org-less (LEGACY) tournament has no custody model →
    // fail closed, no posting. Organisation-owned cash still posts.
    expect(listener).toContain('Org-less tournament CASH');
    expect(listener).toContain('no custody model; no accounting posted (fail-closed)');
    expect(listener).toContain("'tournament_org_cash_payment', 'tournament', paymentId, orgId,");
  });
});