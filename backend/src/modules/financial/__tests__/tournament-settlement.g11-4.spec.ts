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
import { CONCEPT_ACCOUNT_CODE_DEFAULTS } from '../application/accounting-engine.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..', '..', '..');
const be = (p: string) => readFileSync(resolve(ROOT, 'backend', p), 'utf8');

/**
 * Extracts the exact source of one class method / object method so a contract
 * assertion can never accidentally read a sibling function that happens to sit
 * within a fixed character window.
 */
function method(src: string, signature: string, indent: string): string {
  const start = src.indexOf(signature);
  expect(start, `signature not found: ${signature}`).toBeGreaterThan(-1);
  const rest = src.slice(start + signature.length);
  const next = rest.search(new RegExp(`\\n${indent}(async |\\/\\*\\*|[a-zA-Z_][a-zA-Z0-9_]*[(:])`));
  return next > 0 ? src.slice(start, start + signature.length + next) : src.slice(start);
}

describe('G11.4 — settled-refund accounting concept (R-1: bank leg, non-refundable fee)', () => {
  it('EVENT_CONCEPTS defines the settled CARD refund (Dr 2202+4192 / Cr 1120)', () => {
    expect(EVENT_CONCEPTS.tournament_registration_card_refund_settled).toEqual({
      debit: ['merchant_payable', 'tournament_commission'],
      credit: ['cash_bank'],
    });
  });

  it('the settled variant is a DISTINCT event_type and never collides with the G11.3 clearing variant', () => {
    // Distinct event_type is mandatory: the idempotency key is
    // (source_type, source_id, event_type), so sharing a name would let a
    // settled and an unsettled refund of the SAME payment suppress each other.
    expect(EVENT_CONCEPTS.tournament_registration_card_refund_settled).toBeTruthy();
    expect(EVENT_CONCEPTS.tournament_registration_card_refund).toBeTruthy();
    expect(EVENT_CONCEPTS.tournament_registration_card_refund).not.toEqual(EVENT_CONCEPTS.tournament_registration_card_refund_settled);
  });

  it('the settled variant does NOT credit 1100 and does NOT touch the gateway fee', () => {
    const concepts = getEventConcepts('tournament_registration_card_refund_settled').map((c) => c.concept);
    expect(concepts).not.toContain('payment_clearing');
    expect(concepts).not.toContain('payment_gateway_fee');
    expect(concepts).toContain('cash_bank');
  });

  it('code defaults are complete (validateCompleteMapping) and pin 2202 / 4192 / 1120', () => {
    const defaults = CONCEPT_ACCOUNT_CODE_DEFAULTS.tournament_registration_card_refund_settled!;
    expect(defaults).toBeTruthy();
    expect(validateCompleteMapping('tournament_registration_card_refund_settled', Object.keys(defaults))).toEqual([]);
    expect(defaults.merchant_payable).toBe('2202');
    expect(defaults.tournament_commission).toBe('4192');
    expect(defaults.cash_bank).toBe('1120');
    // The gateway fee is deliberately NOT in the mapping — 5210 stays a permanent
    // CourtZon expense and is never credited by a refund.
    expect(defaults.payment_gateway_fee).toBeUndefined();
  });

  it('the unsettled G11.3 clearing variant is preserved unchanged (Cr 1100)', () => {
    expect(CONCEPT_ACCOUNT_CODE_DEFAULTS.tournament_registration_card_refund!.payment_clearing).toBe('1100');
    expect(EVENT_CONCEPTS.tournament_registration_card_refund.credit).toEqual(['payment_clearing']);
  });

  it('the settled variant is detected from DURABLE settlement history, never from payment.gateway_settlement_id', () => {
    const listener = be('src/modules/financial/application/accounting-event.listener.ts');
    expect(listener).toContain('async function tournamentPaymentWasGatewaySettled(paymentId: number)');
    expect(listener).toContain('FROM gateway_settlement_transactions gst');
    expect(listener).toContain('JOIN gateway_settlements gs ON gs.id = gst.gateway_settlement_id');
    // A reversed batch means the funds came BACK to 1100 → the clearing variant.
    expect(listener).toContain("gs.settlement_status = 'completed'");
    const fn = listener.slice(
      listener.indexOf('async function tournamentPaymentWasGatewaySettled'),
      listener.indexOf('async function postTournamentCardRefundAccounting'),
    );
    expect(fn).not.toContain('gateway_settlement_id');
  });

  it('the listener posts BOTH explicit variants (so the G11.3 literal is preserved) and keeps the org leg unchanged', () => {
    const listener = be('src/modules/financial/application/accounting-event.listener.ts');
    const reg = listener.indexOf('export function registerAccountingEventListeners');
    const card = listener.indexOf('async function postTournamentCardRefundAccounting');
    const fn = listener.slice(card, reg > -1 ? reg : card + 4000);
    expect(fn).toContain("'tournament_registration_card_refund_settled', 'tournament', paymentId, null,");
    expect(fn).toContain('cash_bank: econ.gross');
    expect(fn).toContain("'tournament_registration_card_refund', 'tournament', paymentId, null,");
    expect(fn).toContain('payment_clearing: econ.gross');
    // Org leg identical for both variants.
    expect(fn).toContain("'tournament_org_receivable_reversal', 'tournament', paymentId, econ.orgId,");
  });
});

describe('G11.4 — R-2 payment-scoped settlement dismantle', () => {
  const repo = be('src/modules/tournaments/infrastructure/repositories/tournament.repository.ts');

  it('the dismantle releases the active line under a row lock and keeps the history row', () => {
    const fn = method(repo, 'async detachPaymentSettlement(paymentId: number, conn?: PoolConnection)', '  ');
    // Find the ACTIVE line by the uk_gst_active_payment identity, FOR UPDATE.
    expect(fn).toContain('WHERE active_payment_transaction_id = ?');
    // Only the ACTIVE POINTER is cleared — the line row itself is never deleted.
    expect(fn).toContain('SET active_payment_transaction_id = NULL');
    expect(fn).not.toContain('DELETE FROM gateway_settlement_transactions');
    expect(fn).not.toContain('DELETE FROM gateway_settlements');
  });

  it('the dismantle reduces the header to its ACTIVE remainder with underflow guards', () => {
    const fn = method(repo, 'async detachPaymentSettlement(paymentId: number, conn?: PoolConnection)', '  ');
    expect(fn).toContain('UPDATE gateway_settlements');
    expect(fn).toContain('gross_amount = GREATEST(gross_amount - ?, 0)');
    expect(fn).toContain('gateway_fee_amount = GREATEST(gateway_fee_amount - ?, 0)');
    expect(fn).toContain('net_amount = GREATEST(net_amount - ?, 0)');
    expect(fn).toContain('transaction_count = GREATEST(transaction_count - 1, 0)');
  });

  it('the dismantle locks payment, header and line, and verifies ownership before mutating', () => {
    const fn = method(repo, 'async detachPaymentSettlement(paymentId: number, conn?: PoolConnection)', '  ');
    expect(fn).toContain('FROM payment_transactions WHERE id = ? FOR UPDATE');
    expect(fn).toContain('FROM gateway_settlements WHERE id = ? FOR UPDATE');
    expect(fn).toContain('does not belong to payment');
    expect(fn).toContain("header.settlement_status === 'reversed'");
  });

  it('the dismantle posts NO accounting journal and returns pre/post header snapshots for audit', () => {
    const fn = method(repo, 'async detachPaymentSettlement(paymentId: number, conn?: PoolConnection)', '  ');
    expect(fn).not.toContain('postAccountingEvent');
    expect(fn).not.toContain('postGatewaySettlement');
    expect(fn).toContain('result.before = {');
    expect(fn).toContain('result.after = {');
    expect(fn).toContain('transactionCount:');
  });

  it('the dismantle is idempotent: the header is only reduced when THIS call released the line', () => {
    const fn = method(repo, 'async detachPaymentSettlement(paymentId: number, conn?: PoolConnection)', '  ');
    expect(fn).toContain('WHERE id = ? AND active_payment_transaction_id = ?');
    expect(fn).toContain('if ((rel as any).affectedRows === 1) {');
    // Payment detach stays a guarded UPDATE (idempotent by construction).
    expect(fn).toContain('WHERE id = ? AND gateway_settlement_id IS NOT NULL');
  });

  it('the refund service keeps the G11.3 call site and audits the dismantle inside the transaction', () => {
    const svc = be('src/modules/tournaments/application/tournament-refund.service.ts');
    expect(svc).toContain('detachPaymentSettlement(paymentId, conn)');
    expect(svc).not.toContain('gatewaySettlementService.reverse');
    expect(svc).toContain("action: 'TOURNAMENT.SETTLEMENT_DISMANTLED'");
    expect(svc).toContain('beforeState:');
    expect(svc).toContain('releasedGross:');
    expect(svc).toContain("source: 'tournament.full_refund'");
  });

  it('reverse() reverses ONLY active lines — released lines are skipped, never an error', () => {
    const svc = be('src/modules/settlement/application/gateway-settlement.service.ts');
    const fn = method(svc, 'async reverse(', '  ');
    expect(fn).toContain('AND gst.active_payment_transaction_id IS NOT NULL');
    // The released-line skip is what prevents the "reversal failed" throw.
    expect(fn).toContain('FOR UPDATE');
    const listFn = method(svc, 'async list(', '  ');
    expect(listFn).toContain('AND gst.active_payment_transaction_id IS NOT NULL');
  });

  it('create() guards active-line ownership so a dismantled payment CAN enter a new batch', () => {
    const svc = be('src/modules/settlement/application/gateway-settlement.service.ts');
    const fn = method(svc, 'async create(', '  ');
    expect(fn).toContain('WHERE gst.active_payment_transaction_id = ?');
    expect(fn).toContain('is already an ACTIVE line of gateway settlement');
    // The pre-check must run BEFORE the header insert so a duplicate is rejected early.
    expect(fn.indexOf('active_payment_transaction_id = ?')).toBeLessThan(fn.indexOf('INSERT INTO gateway_settlements'));
  });

  it('list() reports ACTIVE line count separately from the total/released line count', () => {
    const svc = be('src/modules/settlement/application/gateway-settlement.service.ts');
    const fn = method(svc, 'async list(', '  ');
    expect(fn).toContain('gst.active_payment_transaction_id IS NOT NULL) AS transaction_count');
    expect(fn).toContain('AS total_line_count');
    expect(fn).toContain('AS released_line_count');
  });
});

describe('G11.4 — R-3 tournament entitlement creation + release conditions', () => {
  const listener = be('src/modules/financial/application/entitlement-tournament.listener.ts');
  const repo = be('src/modules/financial/infrastructure/repositories/financial-entitlement.repository.ts');
  const worker = be('src/modules/financial/infrastructure/tournament-entitlement-activation.worker.ts');
  const svc = be('src/modules/financial/application/financial-entitlement.service.ts');

  it('entitlements are created on tournament:registration-paid and cancelled on payment:refunded', () => {
    expect(listener).toContain("eventName: 'tournament:registration-paid'");
    expect(listener).toContain("eventName: 'payment:refunded'");
    expect(listener).toContain("data?.referenceType !== 'tournament'");
    expect(listener).toContain("cancelBySourceIds('tournament', [registrationId], reason)");
    // No second entitlement aggregate and no second payout ledger.
    expect(listener).toContain("sourceType: 'tournament'");
    expect(listener).toContain('getEntitlementsBySource');
  });

  it('CARD creates exactly ONE ORGANIZATION_EARNING = NET (never the gross) with collector courtzon', () => {
    const fn = method(listener, 'export async function handleTournamentRegistrationPaid(envelope: EventEnvelope)', '');
    const card = fn.slice(fn.indexOf('} else if (orgNet > 0) {'));
    expect(card).toContain("entitlementType: 'ORGANIZATION_EARNING'");
    expect(card).toContain("collector: 'courtzon'");
    expect(card).toContain('amount: orgNet');
    expect(card).not.toContain("entitlementType: 'COURTZON_COMMISSION'");
    expect(card).not.toContain('amount: gross');
    expect(card).not.toContain('availableAt: tournament');
  });

  it('CASH creates exactly ONE COURTZON_COMMISSION = commission with collector org and NO org earning', () => {
    const fn = method(listener, 'export async function handleTournamentRegistrationPaid(envelope: EventEnvelope)', '');
    const cash = fn.slice(fn.indexOf('if (isCash) {'), fn.indexOf('} else if (orgNet > 0) {'));
    expect(cash).toContain("entitlementType: 'COURTZON_COMMISSION'");
    expect(cash).toContain("collector: 'org'");
    expect(cash).toContain('amount: commission');
    // D-1: an ORGANIZATION_EARNING on CASH would double-count the G11.2 cash gross.
    expect(cash).not.toContain("entitlementType: 'ORGANIZATION_EARNING'");
    expect(cash).not.toContain('amount: orgNet');
  });

  it('amount authority is payment_transactions.amount with the immutable commission_rate snapshot', () => {
    expect(listener).toContain('SELECT id, amount, currency, payment_method, payment_status');
    expect(listener).toContain('const gross = round2(payment.amount);');
    expect(listener).toContain('tournament.commission_rate');
    expect(listener).toContain('const commission = round2((gross * round2(Number(tournament.commission_rate ?? 0))) / 100);');
    // entry_fee is verified but never used as the amount authority.
    expect(listener).toContain('using the payment amount (authoritative)');
    expect(listener).not.toContain('registration_fee');
    expect(listener).not.toContain('getCommissionRate');
  });

  it('platform/community tournaments fail closed (organisation_id IS NULL → no entitlement)', () => {
    expect(listener).toContain('const orgId = Number(tournament.organisation_id ?? 0);');
    expect(listener).toContain('no financial entitlement created (no counterparty, no commission)');
  });

  it('both variants are created PENDING with available_at NULL and a recorded release condition', () => {
    expect(listener).toContain('availableAt: null');
    expect(listener).toContain("releaseCondition: 'gateway_settlement_received'");
    expect(listener).toContain("releaseCondition: 'tournament_draw_locked'");
    expect(listener).toContain("custody: 'courtzon_collected'");
    expect(listener).toContain("custody: 'org_collected'");
  });

  it('creation is idempotent (pre-check + registration row lock + unique key)', () => {
    expect(listener).toContain('SELECT id FROM tournament_registrations WHERE id = ? FOR UPDATE');
    expect(listener).toContain("WHERE source_type = 'tournament' AND source_id = ? LIMIT 1");
    expect(listener).toContain("err as any)?.code === 'ER_DUP_ENTRY'");
    expect(listener).toContain("action: 'TOURNAMENT.ENTITLEMENT_CREATED'");
  });

  it('the GENERIC activation worker must never activate tournament entitlements', () => {
    const start = repo.indexOf('async findPendingForActivation');
    const fn = repo.slice(start, repo.indexOf('async findPendingTournamentDueForActivation'));
    expect(fn).toContain("AND source_type <> 'tournament'");
    expect(fn).toContain("AND NOT (source_type = 'marketplace' AND available_at IS NULL)");
  });

  it('CARD release requires an ACTIVE gateway settlement; CASH release requires a LOCKED current draw', () => {
    const start = repo.indexOf('async findPendingTournamentDueForActivation');
    const fn = repo.slice(start, start + 4000);
    expect(fn).toContain("AND pt.gateway_settlement_id IS NOT NULL");
    expect(fn).toContain("AND d.is_current = 1");
    expect(fn).toContain("AND d.status = 'locked'");
    expect(fn).toContain('WHERE tr.id = fe.source_id');
    // Fail closed: a tournament with no current locked draw never qualifies.
    expect(fn).toContain('AND EXISTS (');
  });

  it('the dedicated activation worker is the only tournament activation path and stays idempotent', () => {
    expect(worker).toContain("activateTournamentEligible('card', BATCH_SIZE)");
    expect(worker).toContain("activateTournamentEligible('cash', BATCH_SIZE)");
    expect(svc).toContain('async activateTournamentEligible(');
    expect(svc).toContain('activationReason:');
  });

  it('findAvailableForOrganisation gates CARD tournament entitlements on the paymentId snapshot', () => {
    const start = repo.indexOf('async findAvailableForOrganisation');
    const fn = repo.slice(start, start + 3000);
    expect(fn).toContain("fe.source_type = 'tournament'");
    expect(fn).toContain("JSON_EXTRACT(fe.metadata, '$.paymentId')");
    expect(fn).toContain("pt.gateway_settlement_id IS NULL");
    // The marketplace orderId gate is untouched.
    expect(fn).toContain("JSON_EXTRACT(fe.metadata, '$.orderId')");
  });
});

describe('G11.4 — R-4 org-scoped control accounts + reconciliation wiring', () => {
  const gl = be('src/modules/financial/infrastructure/repositories/gl-control.repository.ts');
  const rec = be('src/modules/financial/application/reconciliation.service.ts');

  it('resolveControlAccountIds stays backward compatible and resolves org-scoped accounts for ALL discovered codes', () => {
    expect(gl).toContain('async resolveControlAccountIds(orgId?: number | null)');
    // Global discovery is unchanged and remains the source of truth.
    expect(gl).toContain('WHERE m.organisation_id IS NULL AND m.concept IN (${placeholders})');
    expect(gl).toContain('if (orgId == null) return accounts;');
    // Org-scoped accounts are accepted only for globally discovered codes, de-duped by id.
    expect(gl).toContain('WHERE m.organisation_id = ?');
    expect(gl).toContain('!seenCodes.has(code)');
    expect(gl).toContain('seenIds.has(id)');
  });

  it('reconcileOrganisation passes the org so its own book is reconciled, never double counted', () => {
    expect(rec).toContain('resolveControlAccountIds(orgId)');
    // The 1161 payable-mirror rule is preserved verbatim.
    expect(rec).toContain("const isOrgBookReceivableMirror = acc.code === '1161' && classifyAccountType(acc.account_type) === 'asset';");
  });

  it('reconcileAll discovers orgs with org-scoped control activity even without open entitlements', () => {
    expect(rec).toContain('glControlRepository.orgsWithControlActivity(');
    expect(rec).toContain('controlAccounts.map((a) => a.code)');
    expect(gl).toContain('async orgsWithControlActivity(accountIds: number[], controlCodes?: string[])');
    expect(gl).toContain('SELECT c.id FROM chart_of_accounts c');
  });

  it('the control repository remains strictly read-only (SELECT only)', () => {
    const fn = gl.slice(gl.indexOf('export const glControlRepository'));
    expect(fn).not.toMatch(/INSERT|UPDATE|DELETE|REPLACE/i);
  });
});

describe('G11.4 — gateway settlement reconciliation + payment reconciliation additions', () => {
  const gsRec = be('src/modules/settlement/application/gateway-settlement.reconciliation.ts');
  const payRec = be('src/modules/payment/application/reconciliation.service.ts');

  it('the gateway settlement reconciliation implements 9 named checks with CRITICAL/WARNING severities', () => {
    expect(gsRec).toContain("'header_totals_vs_active_lines'");
    expect(gsRec).toContain("'transaction_count_vs_active_lines'");
    expect(gsRec).toContain("'active_line_ownership'");
    expect(gsRec).toContain("'payment_settlement_linkage'");
    expect(gsRec).toContain("'refunded_payment_still_active'");
    expect(gsRec).toContain("'line_payment_settlement_mismatch'");
    expect(gsRec).toContain("'refunded_tournament_still_settled'");
    expect(gsRec).toContain("'tournament_payment_unsettled_after_draw_lock'");
    expect(gsRec).toContain("'duplicate_active_settlement_ownership'");
    expect(gsRec).toContain("export type GatewaySettlementCheckSeverity = 'CRITICAL' | 'WARNING';");
  });

  it('the gateway settlement reconciliation is REPORT-ONLY: no autoFix, no writes, audits run + discrepancy', () => {
    expect(gsRec).toContain('autoFixAvailable: false');
    expect(gsRec).toContain('readOnly: true');
    expect(gsRec).not.toMatch(/\bautoFix\b\s*[:=]\s*true/);
    expect(gsRec).not.toMatch(/INSERT|UPDATE|DELETE|REPLACE/i);
    expect(gsRec).toContain("action: 'GATEWAY_SETTLEMENT.RECONCILIATION'");
    expect(gsRec).toContain("action: 'GATEWAY_SETTLEMENT.RECONCILIATION_DISCREPANCY'");
  });

  it('all 6 new payment reconciliation checks exist and are report-only (autoFixable false)', () => {
    expect(payRec).toContain("'tournament_registration_paid_without_payment'");
    expect(payRec).toContain("'tournament_payment_paid_registration_not_paid'");
    expect(payRec).toContain("'tournament_refunded_payment_registration_still_paid'");
    expect(payRec).toContain("'tournament_settled_payment_missing_lineage'");
    expect(payRec).toContain("'tournament_settled_refund_bank_clearing_inconsistent'");
    expect(payRec).toContain("'tournament_settlement_line_payment_mismatch'");
    expect(payRec).toContain('const push = (');
    expect(payRec).toContain('recommendation, autoFixable: false');
  });

  it('the existing payment autoFix block is untouched and cannot act on the new checks', () => {
    const start = payRec.indexOf('// ── 6. Auto-fix: gateway_paid_local_pending');
    const fn = payRec.slice(start, start + 900);
    expect(fn).toContain('if (!issue.autoFixable) continue;');
    expect(fn).toContain("if (gatewayRef)");
    // The tournament checks run BEFORE the auto-fix block and are never autoFixable.
    const autoFixIdx = payRec.indexOf('// ── 6. Auto-fix: gateway_paid_local_pending');
    const tournamentIdx = payRec.indexOf('const tournamentChecks = await this.runTournamentChecks');
    expect(tournamentIdx).toBeGreaterThan(-1);
    expect(tournamentIdx).toBeLessThan(autoFixIdx);
  });

  it('the new API reuses financial.gateway-settlement.view — no new permission key, no frontend change', () => {
    const routes = be('src/modules/settlement/presentation/gateway-settlement.routes.ts');
    expect(routes).toContain("app.get('/admin/gateway-settlements/reconciliation', { preHandler: [requirePermission(['financial.gateway-settlement.view'])] }");
    expect(routes).toContain('authMiddleware');
    const controller = be('src/modules/settlement/presentation/gateway-settlement.controller.ts');
    expect(controller).toContain('gatewaySettlementReconciliationService.run(');
    // The actor is never taken from the request body.
    const fn = controller.slice(controller.indexOf('export async function reconcileGatewaySettlementsHandler'));
    expect(fn.slice(0, 600)).not.toContain('request.body');
  });

  it('server.ts registers the tournament subscribers, the worker handler and the 5-minute schedule', () => {
    const server = be('src/server.ts');
    expect(server).toContain("registerEntitlementTournamentSubscribers();");
    expect(server).toContain('createEntitlementTournamentWorkers();');
    expect(server).toContain("registerHandler('tournament_entitlement_activation', handleTournamentEntitlementActivation);");
    expect(server).toContain("queueService.add('tournament_entitlement_activation'");
    const queue = be('src/infrastructure/queue/queue.service.ts');
    expect(queue).toContain("'tournament_entitlement_activation'");
  });
});
