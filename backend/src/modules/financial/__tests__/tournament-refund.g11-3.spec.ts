import { describe, it, expect, vi } from 'vitest';

// Modules under test reach `database/mysql.js` at import time — env only, no
// connection is opened here; every test is a source-contract / registry check.
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
const be = (p: string) => readFileSync(resolve(ROOT, 'backend', p), 'utf8');
const repo = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

describe('G11.3 — tournament FULL refund accounting contract', () => {
  it('EVENT_CONCEPTS defines the CARD refund reversal (CourtZon: Dr 2202+4192 / Cr 1100)', () => {
    expect(EVENT_CONCEPTS.tournament_registration_card_refund).toEqual({
      debit: ['merchant_payable', 'tournament_commission'],
      credit: ['payment_clearing'],
    });
  });

  it('EVENT_CONCEPTS defines the CARD org-book reversal (Dr 4140 / Cr 1161 + MKT-COMM-EXP)', () => {
    expect(EVENT_CONCEPTS.tournament_org_receivable_reversal).toEqual({
      debit: ['tournament_revenue'],
      credit: ['marketplace_receivable', 'commission_expense'],
    });
  });

  it('EVENT_CONCEPTS defines the CASH refund reversal (CourtZon: Dr 4192 / Cr 2202)', () => {
    expect(EVENT_CONCEPTS.tournament_cash_commission_refund).toEqual({
      debit: ['tournament_commission'],
      credit: ['merchant_payable'],
    });
  });

  it('EVENT_CONCEPTS defines the CASH org-book reversal (Dr 4140 + MKT-CZ-PAY / Cr ORG-CASH + MKT-COMM-EXP)', () => {
    expect(EVENT_CONCEPTS.tournament_org_cash_payment_reversal).toEqual({
      debit: ['tournament_revenue', 'courtzon_payable'],
      credit: ['org_cash_bank', 'commission_expense'],
    });
  });

  it('NO reversal event carries tax (2300) or partial-refund concepts', () => {
    for (const et of ['tournament_registration_card_refund', 'tournament_org_receivable_reversal', 'tournament_cash_commission_refund', 'tournament_org_cash_payment_reversal']) {
      const concepts = getEventConcepts(et).map((c) => c.concept);
      expect(concepts).not.toContain('tax_liability');
    }
  });

  it('CourtZon reversal code defaults are complete (no DB mapping rows) and map to 2202/4192/1100', () => {
    for (const et of ['tournament_registration_card_refund', 'tournament_cash_commission_refund']) {
      const defaults = CONCEPT_ACCOUNT_CODE_DEFAULTS[et]!;
      expect(defaults).toBeTruthy();
      expect(validateCompleteMapping(et, Object.keys(defaults))).toEqual([]);
    }
    const card = CONCEPT_ACCOUNT_CODE_DEFAULTS.tournament_registration_card_refund!;
    expect(card.merchant_payable).toBe('2202');
    expect(card.tournament_commission).toBe('4192');
    expect(card.payment_clearing).toBe('1100');
    const cash = CONCEPT_ACCOUNT_CODE_DEFAULTS.tournament_cash_commission_refund!;
    expect(cash.tournament_commission).toBe('4192');
    expect(cash.merchant_payable).toBe('2202');
  });

  it('the two org-book reversal events are registered in ORG_BOOK_EVENTS', () => {
    expect(ORG_BOOK_EVENTS.tournament_org_receivable_reversal).toEqual(['tournament_revenue', 'marketplace_receivable', 'commission_expense']);
    expect(ORG_BOOK_EVENTS.tournament_org_cash_payment_reversal).toEqual(['tournament_revenue', 'courtzon_payable', 'org_cash_bank', 'commission_expense']);
  });

  it('payment:refunded tournament branch routes CARD/CASH and returns BEFORE the generic fallthrough; unsupported → fail closed', () => {
    const listener = be('src/modules/financial/application/accounting-event.listener.ts');
    expect(listener).toContain("if (referenceType === 'tournament') {");
    expect(listener).toContain("if (method === 'cash') {");
    expect(listener).toContain('await postTournamentCashRefundAccountingSerialized(amount, currency, data);');
    expect(listener).toContain("else if (method === 'card') {");
    expect(listener).toContain('await postTournamentCardRefundAccountingSerialized(amount, currency, data);');
    expect(listener).toContain('Tournament refund with unsupported payment method — no accounting posted (fail-closed)');
    expect(listener).toContain('return;');
    // The tournament branch must appear BEFORE the generic card_refund fallthrough.
    const branchIdx = listener.indexOf("if (referenceType === 'tournament') {");
    const genericIdx = listener.indexOf("const eventType = paymentMethod === 'wallet' ? 'wallet_refund' : 'card_refund';");
    expect(branchIdx).toBeGreaterThan(-1);
    expect(genericIdx).toBeGreaterThan(branchIdx);
  });

  it('reversal postings keep source_type="tournament" + source_id=paymentId; never booking/generic card_refund', () => {
    const listener = be('src/modules/financial/application/accounting-event.listener.ts');
    const reg = listener.indexOf('export function registerAccountingEventListeners');
    const card = listener.indexOf('async function postTournamentCardRefundAccounting');
    const fn = listener.slice(card, reg > -1 ? reg : card + 3000);
    expect(fn).toContain("'tournament_registration_card_refund', 'tournament', paymentId, null,");
    expect(fn).toContain("'tournament_org_receivable_reversal', 'tournament', paymentId, econ.orgId,");
    const cash = listener.slice(listener.indexOf('async function postTournamentCashRefundAccounting'), reg > -1 ? reg : card + 3000);
    expect(cash).toContain("'tournament_cash_commission_refund', 'tournament', paymentId, null,");
    expect(cash).toContain("'tournament_org_cash_payment_reversal', 'tournament', paymentId, econ.orgId,");
    expect(fn + cash).not.toContain("'booking', paymentId");
    expect(fn + cash).not.toContain("'booking_series', 'booking'");
    expect(fn + cash).not.toContain("'card_refund', 'tournament'");
  });

  it('platform/community (org NULL) refund accounting is fail-closed (OUT of G11.3 scope)', () => {
    const listener = be('src/modules/financial/application/accounting-event.listener.ts');
    expect(listener).toContain('Platform/community tournament card refund — OUT of G11.3 scope');
    expect(listener).toContain('Platform/community tournament cash refund — OUT of G11.3 scope');
  });
});

describe('G11.3 — refund service contract (guard order, no partial refunds, no re-pricing)', () => {
  const svc = be('src/modules/tournaments/application/tournament-refund.service.ts');

  it('execution performs the AUTHORITATIVE draw-lock check under a row lock', () => {
    expect(svc).toContain('FROM tournament_draws WHERE tournament_id = ? AND is_current = 1 FOR UPDATE');
    expect(svc).toContain('assertDrawNotLockedAtExecution(req.tournamentId, conn)');
    expect(svc).toContain('The tournament draw is LOCKED');
  });

  it('payment-scoped settlement detach is used, never batch reversal', () => {
    expect(svc).toContain('detachPaymentSettlement(paymentId, conn)');
    const repo = be('src/modules/tournaments/infrastructure/repositories/tournament.repository.ts');
    expect(repo).toContain('gateway_settlement_id IS NOT NULL');
    expect(svc).not.toContain('gatewaySettlementService.reverse');
  });

  it('CARD goes through PaymentService.refund; CASH is gateway-free (markPaymentRefundedIfPaid + canonical event)', () => {
    expect(svc).toContain("import('../../payment/application/payment.service.js')");
    expect(svc).toContain('paymentService.refund(outcome.paymentId, outcome.amount');
    expect(svc).toContain('markPaymentRefundedIfPaid(paymentId, conn)');
    expect(svc).toContain("emit('payment:refunded',");
    expect(svc).toContain("metadata: { paymentMethod: 'cash'");
  });

  it('no partial refunds — allocationId / R5-D2 semantics are absent from the tournament refund path', () => {
    const slice = svc.slice(svc.indexOf('class TournamentRefundService'));
    expect(slice).not.toContain('allocationId');
    expect(slice).not.toContain('_refundSeriesAllocation');
    expect(slice).not.toContain('refundedAmount');
  });

  it('amount authority uses payment.amount; commission uses the immutable snapshot; registration_fee / live subscription never read', () => {
    expect(svc).toContain('const amount = Math.round(Number(payment.amount ?? paymentRow.amount ?? 0) * 100) / 100;');
    expect(svc).not.toContain('registration_fee');
    expect(svc).not.toContain('getCommissionRate');
    expect(svc).not.toContain('getCurrentSubscription');
    expect(svc).toContain("hasPosting('tournament', paymentId, recognitionEvent)");
  });

  it('request lifecycle: pending → approved → executed / rejected with one-open per registration', () => {
    expect(svc).toContain("status: 'pending'");
    expect(svc).toContain("updateStatus(req.id, { status: 'approved'");
    expect(svc).toContain("status: 'executed'");
    expect(svc).toContain("status: 'rejected'");
    const repo = be('src/modules/tournaments/infrastructure/repositories/tournament-refund-request.repository.ts');
    expect(repo).toContain("status IN ('pending','approved')");
  });

  it('ownership + cross-org guards', () => {
    expect(svc).toContain('You can only request a refund for your own registration');
    expect(svc).toContain('does not belong to your organisation');
  });

  it('platform/community tournaments are fail-closed at request + execution', () => {
    expect(svc).toContain('Platform/community tournaments do not support refund requests (G11.3 out of scope)');
    expect(svc).toContain('tournament.organisation_id == null || Number(tournament.organisation_id) !== orgId');
  });
});

describe('G11.3 — request table migration + RBAC', () => {
  it('the approved migration exists, is PRODUCTION_SAFE, and enforces one-open per registration', () => {
    const mig = readFileSync(resolve(ROOT, 'database/migrations/179_tournament_registration_refund_requests.sql'), 'utf8');
    expect(mig).toContain('COURTZON_MIGRATION_ENV: PRODUCTION_SAFE');
    expect(mig).toContain('CREATE TABLE IF NOT EXISTS `tournament_registration_refund_requests`');
    expect(mig).toContain("`status` enum('pending','approved','rejected','executed')");
    expect(mig).toContain('uk_open_request_registration');
    expect(mig).toContain('(IF(`status` IN (\'pending\',\'approved\'), \'O\', NULL))');
  });

  it('the new table is present in the regenerated baseline', () => {
    const base = repo('database/baseline/001_courtzon_v3.sql');
    expect(base).toContain('CREATE TABLE `tournament_registration_refund_requests`');
  });

  it('RBAC: player owns the request key; org approval reuses financial.reconcile', () => {
    const registry = repo('frontend/src/permissions/registry.ts');
    expect(registry).toContain("permissionKey: 'tournaments.registration.refund-request'");
    expect(registry).toContain("permissionKey: 'financial.reconcile'");
    const templates = repo('backend/scripts/role-permission-templates.mjs');
    expect(templates).toContain('/^tournaments\\.registration\\.refund-request$/');
    const routes = be('src/modules/tournaments/presentation/org-tournament.routes.ts');
    expect(routes).toContain("requirePermission(['financial.reconcile'])");
    // Players must never hold financial.reconcile (approval authority).
    const playerBlock = templates.slice(templates.indexOf('const PLAYER_PATTERNS'), templates.indexOf('const PLAYER_EXPLICIT_KEYS'));
    expect(playerBlock).not.toContain('financial.reconcile');
  });
});