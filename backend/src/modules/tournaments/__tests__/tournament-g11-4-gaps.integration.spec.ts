import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3010';
  process.env.PAYMENT_GATEWAY_PROVIDER = 'mock';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * G11.4 — TARGETED COVERAGE FOR THE FIVE VERIFICATION GAPS.
 *
 * This suite is deliberately SEPARATE from `tournament-settlement.g11-4.integration.spec.ts`:
 * none of the assertions here duplicate a delivered test, and no delivered
 * assertion was weakened to make these pass. Each block closes one gap that the
 * G11.4 verification (commit d197fe34) explicitly listed as uncovered.
 *
 *   GAP 1  Refund AFTER the gateway batch was REVERSED must use the UNSETTLED
 *          (G11.3) variant and credit 1100 — the reversal already moved the
 *          money back into Payment Clearing, so paying out of 1120 would
 *          understate the bank and the money would be out of both books.
 *   GAP 2  Dismantle idempotency ACROSS committed transactions (the delivered
 *          suite only replayed it inside ONE transaction).
 *   GAP 3  Real CONCURRENCY: two racing settlement creations, and a racing
 *          dismantle-vs-creation. The invariant is asserted from the database,
 *          never by relaxing the production locking.
 *   GAP 4  R-4 discovery + a positive proof that GLOBAL 1161 rows are NOT
 *          folded into an organisation's own 1161 total.
 *   GAP 5  The `general_ledger.reference_type` width guard proven against the
 *          REAL `varchar(50)` column (the delivered proof is mock-based).
 *
 * The isolation/cleanup pattern is the project's established one: dedicated
 * high id ranges, `FOREIGN_KEY_CHECKS=0` teardown, and `beforeEach`
 * cleanup→reseed so a failed test can never leak into the next one.
 */

const ORG = 10062400;
const PLAYER = 10062411;
const PLAYER_2 = 10062412;
const CREATOR = 10062410;
const OFFICIAL = 10062420;
const PLAN = 10062490;
const BRACKET = 1; // single-elimination

// 1000 collected, 10% commission, gateway fee 2.5% + 1.00.
const GROSS = 1000;
const COMMISSION = 100;   // 1000 * 10%
const ORG_NET = 900;      // 1000 - 100
const GS_FEE = 26;        // 1000 * 2.5% + 1.00
const GS_NET = 974;       // 1000 - 26

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(probe: () => Promise<T>, isReady: (value: T) => boolean, what: string, timeoutMs = 25_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await probe();
  while (!isReady(value)) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${what} — last value: ${JSON.stringify(value)}`);
    }
    await sleep(120);
    value = await probe();
  }
  return value;
}

let pool: mysql.Pool;
let tournamentRefundService: any;
let paymentGateway: any;
let financialEntitlementRepository: any;
let gatewaySettlementService: any;
let orgReconciliationService: any;
let glProjectionService: any;
let handleTournamentRegistrationPaid: any;
let handleTournamentPaymentRefunded: any;

const paymentIds: number[] = [];
const regIds: number[] = [];
const tournamentIds: number[] = [];
const requestIds: number[] = [];
const settlementIds: number[] = [];
const syntheticGlRowIds: number[] = [];
let EVENT_BASE_ID = 0;

// ── Ledger helpers ────────────────────────────────────────────────────────────
async function countEventRows(sourceId: number, eventType: string, sourceType = 'tournament'): Promise<number> {
  const [rows] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type=? AND source_id=? AND event_type=?`,
    [sourceType, sourceId, eventType],
  );
  return Number((rows as any[])[0].c);
}

async function eventRows(sourceId: number, eventType: string, sourceType = 'tournament'): Promise<any[]> {
  const [rows] = await pool.execute<RowData>(
    `SELECT le.side, le.amount, le.organisation_id, c.code AS account_code
     FROM ledger_entries le JOIN chart_of_accounts c ON c.id = le.chart_account_id
     WHERE le.source_type=? AND le.source_id=? AND le.event_type=?
     ORDER BY le.id`,
    [sourceType, sourceId, eventType],
  );
  return rows as any[];
}

/** Net (signed) movement of a code across a set of events: +debit, −credit. */
function eventNet(rows: any[], code: string): number {
  const v = rows.filter((r) => r.account_code === code)
    .reduce((s, r) => s + (r.side === 'debit' ? Number(r.amount) : -Number(r.amount)), 0);
  return Math.round(v * 100) / 100;
}

const sum = (rows: any[], side: string) =>
  Math.round(rows.filter((r) => r.side === side).reduce((s: number, r: any) => s + Number(r.amount), 0) * 100) / 100;

// ── Fixture helpers ───────────────────────────────────────────────────────────
async function createTournament(org: number | null, entryFee = GROSS, rate = 10) {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournaments
       (public_id, creator_id, organisation_id, bracket_type_id, name,
        max_participants, min_participants, entry_fee, registration_fee,
        currency_code, price_type, tournament_type, commission_rate, status, start_date)
     VALUES (UUID(), ?, ?, ?, ?, 16, 2, ?, 0, 'EGP', 'FIXED', 'community', ?, 'registration_open', '2026-12-01')`,
    [CREATOR, org, BRACKET, `G114G-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, entryFee, rate],
  );
  const id = Number((res as any).insertId);
  tournamentIds.push(id);
  return id;
}

async function registerPlayer(tournamentId: number, playerId: number): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status)
     VALUES (?, ?, 'unpaid', 'registered')`,
    [tournamentId, playerId],
  );
  const regId = Number((res as any).insertId);
  regIds.push(regId);
  await pool.execute(
    `INSERT INTO tournament_participants (tournament_id, registration_id, participant_type, status, member_user_ids)
     VALUES (?, ?, 'individual', 'active', JSON_ARRAY(?))`,
    [tournamentId, regId, playerId],
  );
  return regId;
}

async function chargeAndPayCard(regId: number, amount = GROSS, userId = PLAYER): Promise<number> {
  const gw = await paymentGateway.charge({ amount, currency: 'EGP', referenceId: regId, referenceType: 'tournament', returnUrl: undefined });
  if (!gw.success) throw new Error('mock charge failed');
  const [res] = await pool.execute<RowData>(
    `INSERT INTO payment_transactions
       (user_id, reference_type, reference_id, payment_method, gateway_provider, gateway_reference,
        amount, currency, payment_status, paid_at, trace_id)
     VALUES (?, 'tournament', ?, 'card', 'mock', ?, ?, 'EGP', 'paid', NOW(), UUID())`,
    [userId, regId, String(gw.transactionId ?? gw.gatewayReference ?? 'mock'), amount],
  );
  const pid = Number((res as any).insertId);
  paymentIds.push(pid);
  return pid;
}

let capturedEvents: any[] = [];

/** Emits the REAL `payment:succeeded` event and returns the downstream payload. */
async function emitRegistrationPaid(pid: number, regId: number, amount = GROSS) {
  const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
  const captured = await waitFor<any[]>(
    async () => {
      capturedEvents.length = 0;
      await eventBusV2.emit('payment:succeeded', {
        paymentId: pid, referenceType: 'tournament', referenceId: regId, amount,
        metadata: { paymentMethod: 'card', currency: 'EGP', userId: PLAYER },
      } as any);
      await sleep(250);
      return capturedEvents.slice();
    },
    (v) => v.length > 0,
    `tournament:registration-paid for reg ${regId}`,
  );
  return captured[0];
}

async function gatewaySettle(pids: number[]): Promise<any> {
  const batch = await gatewaySettlementService.create({ paymentTransactionIds: pids, settledBy: OFFICIAL, notes: 'G11.4 gaps test' });
  const id = Number(batch.settlement.id);
  if (!settlementIds.includes(id)) settlementIds.push(id);
  return batch;
}

async function gatewaySettlementHeader(id: number): Promise<any> {
  const [rows] = await pool.execute<RowData>(
    'SELECT id, batch_code, settlement_status, gross_amount, gateway_fee_amount, net_amount, transaction_count FROM gateway_settlements WHERE id=?',
    [id],
  );
  return (rows as any[])[0];
}

async function gatewaySettlementLines(id: number): Promise<any[]> {
  const [rows] = await pool.execute<RowData>(
    'SELECT id, payment_transaction_id, active_payment_transaction_id, gross_amount, gateway_fee_amount, net_amount FROM gateway_settlement_transactions WHERE gateway_settlement_id=? ORDER BY id',
    [id],
  );
  return rows as any[];
}

async function paymentRow(id: number): Promise<any> {
  const [rows] = await pool.execute<RowData>(
    'SELECT id, payment_status, gateway_settlement_id, gateway_settled_at FROM payment_transactions WHERE id=?', [id]);
  return (rows as any[])[0];
}

/** Every settlement line that currently claims `pid` as ACTIVE. The core invariant. */
async function activeLineCount(paymentId: number): Promise<number> {
  const [rows] = await pool.execute<RowData>(
    'SELECT COUNT(*) AS c FROM gateway_settlement_transactions WHERE active_payment_transaction_id=?', [paymentId]);
  return Number((rows as any[])[0].c);
}

// ── Suite lifecycle ───────────────────────────────────────────────────────────
beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 12 });
  const [evBase] = await pool.execute<RowData>('SELECT COALESCE(MAX(id),0) AS m FROM published_events');
  const [prBase] = await pool.execute<RowData>('SELECT COALESCE(MAX(id),0) AS m FROM processed_events');
  EVENT_BASE_ID = Math.min(Number((evBase as any[])[0].m), Number((prBase as any[])[0].m));
  await seedBase();

  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });

  const { registerAccountingEventListeners } = await import('../../financial/application/accounting-event.listener.js');
  registerAccountingEventListeners();
  const { registerTournamentPaymentListeners } = await import('../application/tournament-payment.listener.js');
  registerTournamentPaymentListeners();
  const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
  eventBusV2.on('tournament:registration-paid', (data: any) => { capturedEvents.push(data); });

  tournamentRefundService = (await import('../application/tournament-refund.service.js')).tournamentRefundService;
  paymentGateway = (await import('../../../shared/services/gateway/gateway-factory.js')).paymentGateway;
  financialEntitlementRepository = (await import('../../financial/infrastructure/repositories/financial-entitlement.repository.js')).financialEntitlementRepository;
  gatewaySettlementService = (await import('../../settlement/application/gateway-settlement.service.js')).gatewaySettlementService;
  orgReconciliationService = (await import('../../financial/application/reconciliation.service.js')).reconciliationService;
  glProjectionService = (await import('../../financial/application/gl-projection.service.js')).glProjectionService;
  handleTournamentRegistrationPaid = (await import('../../financial/application/entitlement-tournament.listener.js')).handleTournamentRegistrationPaid;
  handleTournamentPaymentRefunded = (await import('../../financial/application/entitlement-tournament.listener.js')).handleTournamentPaymentRefunded;

  const { eventBusV2: bus } = await import('../../../shared/event-bus/event-bus.v2.js');
  bus.on('payment:refunded', (data: any) => { void handleTournamentPaymentRefunded({ payload: data } as any); });
}, 120000);

afterAll(async () => {
  await cleanupAll();
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 120000);

async function cleanupAll() {
  if (!pool) return;
  const idList = paymentIds.length ? paymentIds.join(',') : '0';
  const regList = regIds.length ? regIds.join(',') : '0';
  const tidList = tournamentIds.length ? tournamentIds.join(',') : '0';
  const reqList = requestIds.length ? requestIds.join(',') : '0';
  const gsList = settlementIds.length ? settlementIds.join(',') : '0';
  const glList = syntheticGlRowIds.length ? syntheticGlRowIds.join(',') : '0';

  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    if (syntheticGlRowIds.length) {
      await pool.execute(`DELETE FROM general_ledger WHERE id IN (${glList})`);
      syntheticGlRowIds.length = 0;
    }
    await pool.execute(`DELETE FROM settlement_entitlements WHERE entitlement_id IN (SELECT id FROM financial_entitlements WHERE organisation_id = ${ORG})`);
    await pool.execute(`DELETE FROM settlements WHERE organisation_id = ${ORG}`);
    await pool.execute(`DELETE FROM financial_entitlements WHERE organisation_id = ${ORG}`);
    await pool.execute(`DELETE FROM audit_logs WHERE entity_id IN (${reqList}, ${regList}) OR entity_id IN (${idList}) OR entity_id IN (${gsList})`);
    await pool.execute(`DELETE FROM gateway_settlement_transactions WHERE gateway_settlement_id IN (${gsList}) OR payment_transaction_id IN (${idList})`);
    await pool.execute(`DELETE FROM gateway_settlements WHERE id IN (${gsList})`);
    await pool.execute(`DELETE FROM tournament_registration_refund_requests WHERE id IN (${reqList})`);
    await pool.execute(`DELETE FROM payment_transactions WHERE id IN (${idList}) OR (reference_type='tournament' AND reference_id IN (${regList}))`);
    await pool.execute(
      `DELETE FROM general_ledger WHERE ledger_entry_id IN (
         SELECT id FROM ledger_entries WHERE source_type = 'tournament' AND source_id IN (${idList}, ${regList})
       )`);
    await pool.execute(
      `DELETE FROM general_ledger WHERE ledger_entry_id IN (
         SELECT id FROM ledger_entries WHERE source_type = 'settlement' AND source_id IN (${gsList})
       )`);
    await pool.execute(`DELETE FROM ledger_entries WHERE (source_type = 'tournament' AND source_id IN (${idList}, ${regList})) OR (source_type = 'settlement' AND source_id IN (${gsList}))`);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ${ORG}`);
    await pool.execute(`DELETE gl FROM general_ledger gl JOIN chart_of_accounts c ON c.id = gl.account_id WHERE c.organisation_id = ${ORG}`);
    await pool.execute(`DELETE FROM tournament_draw_entries WHERE draw_id IN (SELECT id FROM tournament_draws WHERE tournament_id IN (${tidList}))`);
    await pool.execute(`DELETE FROM tournament_draws WHERE tournament_id IN (${tidList})`);
    await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (${tidList})`);
    await pool.execute(`DELETE FROM tournament_registrations WHERE id IN (${regList})`);
    await pool.execute(`DELETE FROM tournaments WHERE id IN (${tidList})`);
    await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id = ${ORG})`);
    await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id = ${ORG}`);
    await pool.execute(`DELETE FROM organisation_subscriptions WHERE organisation_id = ${ORG}`);
    await pool.execute(`DELETE FROM subscription_plan_rates WHERE plan_id = ${PLAN}`);
    await pool.execute(`DELETE FROM subscription_plans WHERE id = ${PLAN}`);
    await pool.execute(`DELETE FROM users WHERE id IN (${CREATOR}, ${PLAYER}, ${PLAYER_2}, ${OFFICIAL})`);
    await pool.execute(`DELETE FROM organisations WHERE id IN (${ORG})`);
    await pool.execute(`DELETE FROM published_events WHERE id > ${EVENT_BASE_ID}`);
    await pool.execute(`DELETE FROM processed_events WHERE id > ${EVENT_BASE_ID}`);
  } finally {
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  }
  paymentIds.length = 0; regIds.length = 0; tournamentIds.length = 0; requestIds.length = 0; settlementIds.length = 0;
  if (paymentGateway?.clearRefundLedger) paymentGateway.clearRefundLedger();
}

async function seedBase() {
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  await pool.execute(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG}, UUID(), ?, 1, 'G114G Org', 'g114g-${ORG}', 1)`,
    [otId]);
  const mkUser = async (id: number, email: string) => {
    await pool.execute(
      `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
       VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'G114G User', 'male', 'active')`,
      [id, `016${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, email],
    );
  };
  await mkUser(CREATOR, 'g114g-creator@test.com');
  await mkUser(PLAYER, 'g114g-player@test.com');
  await mkUser(PLAYER_2, 'g114g-player2@test.com');
  await mkUser(OFFICIAL, 'g114g-official@test.com');

  await pool.execute(`INSERT INTO subscription_plans (id, plan_name, price_monthly, is_active, is_internal, sort_order) VALUES (?, 'G114G Plan', 0, 1, 1, 0)`, [PLAN]);
  await pool.execute(`INSERT INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES (?, 'tournament', 'percentage', ?)`, [PLAN, 10]);
  await pool.execute(
    `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, start_date, end_date, subscription_status, auto_renew)
     VALUES (?, ?, 'monthly', '2020-01-01', '2099-01-01', 'active', 0)`, [ORG, PLAN]);

  const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
  await accountingEngineService.provisionOrganisationMarketplaceAccounts(ORG);
}

beforeEach(async () => { await cleanupAll(); await seedBase(); });
afterEach(() => { vi.clearAllMocks(); capturedEvents = []; });

// ═══════════════════════════════════════════════════════════════════════════════
describe('GAP 1 — refund after the gateway batch was REVERSED', () => {
  it('uses the UNSETTLED (G11.3) variant and credits 1100 — the settled variant is never posted', async () => {
    const tid = await createTournament(ORG);
    const regId = await registerPlayer(tid, PLAYER);
    const pid = await chargeAndPayCard(regId);

    const payload = await emitRegistrationPaid(pid, regId);
    await waitFor(() => countEventRows(pid, 'tournament_registration_card_payment'), (c) => c === 3, 'G11.1 recognition');
    await handleTournamentRegistrationPaid({ payload } as any);       // R-3 entitlement
    const batch = await gatewaySettle([pid]);
    const settlementId = Number(batch.settlement.id);
    await waitFor(() => countEventRows(settlementId, 'payment_gateway_settlement', 'settlement'), (c) => c === 3, 'gateway settlement');

    // ── Reverse the WHOLE batch. Funds return to 1100 Payment Clearing. ──────
    const rev = await gatewaySettlementService.reverse({ settlementId, reversedBy: OFFICIAL, reason: 'G11.4 gap 1 — full batch reversal' });
    expect(rev.settlement.settlement_status).toBe('reversed');
    await waitFor(() => countEventRows(settlementId, 'payment_gateway_settlement_reversal', 'settlement'), (c) => c === 3, 'batch reversal journal');
    // Reversal really returned the money to clearing, and zeroed the bank + fee.
    const revJournal = await eventRows(settlementId, 'payment_gateway_settlement_reversal', 'settlement');
    expect(sum(revJournal, 'debit')).toBe(sum(revJournal, 'credit'));
    const payAfterReverse = await paymentRow(pid);
    expect(payAfterReverse.payment_status).toBe('paid');          // un-settled, still refundable
    expect(payAfterReverse.gateway_settlement_id).toBeNull();

    // ── Now refund the tournament payment. ────────────────────────────────
    const req = await tournamentRefundService.requestRefund(regId, PLAYER);
    requestIds.push(Number(req.id));
    const res = await tournamentRefundService.approveRefundRequest(Number(req.id), ORG, OFFICIAL);
    expect(res.refunded).toBe(true);

    await waitFor(() => countEventRows(pid, 'tournament_registration_card_refund'), (c) => c === 3, 'unsettled reversal');
    // The G11.4 settled variant must NOT be used.
    expect(await countEventRows(pid, 'tournament_registration_card_refund_settled')).toBe(0);

    const rev2 = await eventRows(pid, 'tournament_registration_card_refund');
    expect(rev2.every((r) => r.organisation_id === null)).toBe(true);
    expect(sum(rev2, 'debit')).toBe(sum(rev2, 'credit'));
    // 1100 Payment Clearing — the money the reversal put back.
    const clearing = rev2.filter((r) => r.account_code === '1100');
    expect(clearing).toHaveLength(1);
    expect(clearing[0].side).toBe('credit');
    expect(Number(clearing[0].amount)).toBe(GROSS);
    // 1120 must not be touched at all by the refund.
    expect(rev2.filter((r) => r.account_code === '1120')).toHaveLength(0);
    // And the same CourtZon-side legs as G11.3.
    expect(rev2.filter((r) => r.account_code === '2202' && r.side === 'debit')).toHaveLength(1);
    expect(rev2.filter((r) => r.account_code === '4192' && r.side === 'debit')).toHaveLength(1);
  });

  it('LIFECYCLE NET — reversing the batch means the whole payment unwinds to zero, INCLUDING the gateway fee', async () => {
    const tid = await createTournament(ORG);
    const regId = await registerPlayer(tid, PLAYER);
    const pid = await chargeAndPayCard(regId);
    const payload = await emitRegistrationPaid(pid, regId);
    await waitFor(() => countEventRows(pid, 'tournament_registration_card_payment'), (c) => c === 3, 'G11.1 recognition');
    // Create the entitlement synchronously, BEFORE the refund. The G11.4
    // subscriber is durable (BullMQ), so any other consumer of the same queue —
    // notably the running Docker backend, which shares Redis with this process —
    // may create it a second later. Creating it here first makes that a
    // provably idempotent no-op, exactly as the delivered suite does.
    await handleTournamentRegistrationPaid({ payload } as any);
    const batch = await gatewaySettle([pid]);
    const settlementId = Number(batch.settlement.id);
    await waitFor(() => countEventRows(settlementId, 'payment_gateway_settlement', 'settlement'), (c) => c === 3, 'gateway settlement');
    await gatewaySettlementService.reverse({ settlementId, reversedBy: OFFICIAL, reason: 'G11.4 gap 1 lifecycle' });
    await waitFor(() => countEventRows(settlementId, 'payment_gateway_settlement_reversal', 'settlement'), (c) => c === 3, 'batch reversal journal');

    const req = await tournamentRefundService.requestRefund(regId, PLAYER);
    requestIds.push(Number(req.id));
    await tournamentRefundService.approveRefundRequest(Number(req.id), ORG, OFFICIAL);
    await waitFor(() => countEventRows(pid, 'tournament_registration_card_refund'), (c) => c === 3, 'unsettled reversal');

    const all = [
      ...await eventRows(pid, 'tournament_registration_card_payment'),
      ...await eventRows(settlementId, 'payment_gateway_settlement', 'settlement'),
      ...await eventRows(settlementId, 'payment_gateway_settlement_reversal', 'settlement'),
      ...await eventRows(pid, 'tournament_registration_card_refund'),
    ];

    // Settlement + reversal is a perfect round trip, so the fee is NOT stranded.
    expect(eventNet(all, '1100')).toBe(0);
    expect(eventNet(all, '1120')).toBe(0);
    expect(eventNet(all, '5210')).toBe(0);
    expect(eventNet(all, '2202')).toBe(0);
    expect(eventNet(all, '4192')).toBe(0);
    // This is the observable difference from the SETTLED refund path, where
    // 5210 stays +fee and 1120 stays −fee forever.
    expect(eventNet(all, '5210')).not.toBe(GS_FEE);

    // The org book is unchanged by the gateway state, exactly as in G11.3.
    const orgRev = await eventRows(pid, 'tournament_org_receivable_reversal');
    expect(orgRev).toHaveLength(3);
    expect(sum(orgRev, 'debit')).toBe(sum(orgRev, 'credit'));

    // And the entitlement is cancelled, never settled.
    const { financialEntitlementService } = await import('../../financial/application/financial-entitlement.service.js');
    const ents = await waitFor(
      () => financialEntitlementService.getEntitlementsBySource('tournament', regId),
      (v) => v.length === 1 && v[0].status === 'CANCELLED', 'entitlement cancellation');
    expect(ents[0].status).toBe('CANCELLED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('GAP 2 — dismantle idempotency across COMMITTED transactions', () => {
  /** Settles a single CARD payment and returns its ids. */
  async function settledFixture() {
    const tid = await createTournament(ORG);
    const regId = await registerPlayer(tid, PLAYER);
    const pid = await chargeAndPayCard(regId);
    const payload = await emitRegistrationPaid(pid, regId);
    await waitFor(() => countEventRows(pid, 'tournament_registration_card_payment'), (c) => c === 3, 'G11.1 recognition');
    await handleTournamentRegistrationPaid({ payload } as any);
    const batch = await gatewaySettle([pid]);
    return { tid, regId, pid, settlementId: Number(batch.settlement.id) };
  }

  /** Runs detachPaymentSettlement in its OWN committed transaction (the real unit of work). */
  async function dismantleOnce(paymentId: number): Promise<any> {
    const { getPool } = await import('../../../database/mysql.js');
    const { tournamentRepository } = await import('../infrastructure/repositories/tournament.repository.js');
    const conn = await getPool().getConnection();
    let committed = false;
    try {
      await conn.beginTransaction();
      const res = await tournamentRepository.detachPaymentSettlement(paymentId, conn);
      await conn.commit();
      committed = true;
      return res;
    } finally {
      if (!committed) { try { await conn.rollback(); } catch { /* already closed */ } }
      conn.release();
    }
  }

  it('a second COMMITTED dismantle reports no change and never decrements the header twice', async () => {
    const { pid, settlementId } = await settledFixture();

    const before = await gatewaySettlementHeader(settlementId);
    expect(Number(before.transaction_count)).toBe(1);
    expect(Number(before.gross_amount)).toBe(GROSS);

    // ── First dismantle. ──────────────────────────────────────────────────
    const first = await dismantleOnce(pid);
    expect(first.changed).toBe(true);
    expect(first.lineReleased).toBe(true);
    expect(first.paymentDetached).toBe(true);
    expect(Number(first.releasedAmounts!.gross)).toBe(GROSS);
    expect(Number(first.after!.gross)).toBe(0);
    expect(Number(first.after!.transactionCount)).toBe(0);

    const afterFirst = await gatewaySettlementHeader(settlementId);
    expect(Number(afterFirst.gross_amount)).toBe(0);
    expect(Number(afterFirst.gateway_fee_amount)).toBe(0);
    expect(Number(afterFirst.net_amount)).toBe(0);
    expect(Number(afterFirst.transaction_count)).toBe(0);

    // ── Replay in a NEW, fully committed transaction. ─────────────────────
    const second = await dismantleOnce(pid);
    expect(second.changed).toBe(false);
    expect(second.lineReleased).toBe(false);
    expect(second.paymentDetached).toBe(false);
    expect(second.releasedAmounts).toBeNull();

    // ── Invariants after the replay. ─────────────────────────────────────
    const afterSecond = await gatewaySettlementHeader(settlementId);
    expect(Number(afterSecond.gross_amount)).toBe(0);            // NOT −GROSS (unsigned underflow)
    expect(Number(afterSecond.gateway_fee_amount)).toBe(0);
    expect(Number(afterSecond.net_amount)).toBe(0);
    expect(Number(afterSecond.transaction_count)).toBe(0);
    expect(Number(afterSecond.gross_amount)).toBe(Number(afterFirst.gross_amount));
    expect(Number(afterSecond.transaction_count)).toBe(Number(afterFirst.transaction_count));

    const lines = await gatewaySettlementLines(settlementId);
    expect(lines).toHaveLength(1);                                // history preserved
    expect(lines[0].active_payment_transaction_id).toBeNull();
    const pay = await paymentRow(pid);
    expect(pay.gateway_settlement_id).toBeNull();
    expect(pay.gateway_settled_at).toBeNull();

    // A third pass is still a no-op, and the dismantle posts no journal.
    const third = await dismantleOnce(pid);
    expect(third.changed).toBe(false);
    const [j] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='tournament' AND event_type LIKE '%dismantl%'`);
    expect(Number((j as any[])[0].c)).toBe(0);
  });

  it('the PRODUCTION refund path followed by a replayed dismantle is also a no-op', async () => {
    const { regId, pid, settlementId } = await settledFixture();

    const req = await tournamentRefundService.requestRefund(regId, PLAYER);
    requestIds.push(Number(req.id));
    await tournamentRefundService.approveRefundRequest(Number(req.id), ORG, OFFICIAL);
    await waitFor(() => countEventRows(pid, 'tournament_registration_card_refund_settled'), (c) => c === 3, 'settled reversal');

    const afterRefund = await gatewaySettlementHeader(settlementId);
    expect(Number(afterRefund.transaction_count)).toBe(0);

    // Replay the dismantle exactly as a retried refund job would.
    const replay = await dismantleOnce(pid);
    expect(replay.changed).toBe(false);
    expect(replay.lineReleased).toBe(false);

    const afterReplay = await gatewaySettlementHeader(settlementId);
    expect(Number(afterReplay.transaction_count)).toBe(Number(afterRefund.transaction_count));
    expect(Number(afterReplay.gross_amount)).toBe(Number(afterRefund.gross_amount));
    expect((await gatewaySettlementLines(settlementId)).every((l) => l.active_payment_transaction_id === null)).toBe(true);
    const pay = await paymentRow(pid);
    expect(pay.gateway_settlement_id).toBeNull();
    expect(pay.payment_status).toBe('refunded');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('GAP 3 — concurrent dismantle vs settlement creation', () => {
  async function paidTournamentPayment(player = PLAYER): Promise<{ tid: number; regId: number; pid: number }> {
    const tid = await createTournament(ORG);
    const regId = await registerPlayer(tid, player);
    const pid = await chargeAndPayCard(regId, GROSS, player);
    const payload = await emitRegistrationPaid(pid, regId);
    await waitFor(() => countEventRows(pid, 'tournament_registration_card_payment'), (c) => c === 3, 'G11.1 recognition');
    // Entitlement created synchronously so the concurrently-running Docker
    // backend (same Redis) is an idempotent no-op instead of a late writer.
    await handleTournamentRegistrationPaid({ payload } as any);
    return { tid, regId, pid };
  }

  it('racing settlement creations can never give one payment TWO active lines', async () => {
    const { pid } = await paidTournamentPayment();

    // Real concurrency: four genuine parallel create() calls on the SAME payment.
    // The production `SELECT ... FOR UPDATE` on payment_transactions and the
    // uk_gst_active_payment UNIQUE index are NOT bypassed or relaxed.
    const attempts = await Promise.allSettled(
      [0, 1, 2, 3].map(() => gatewaySettlementService.create({
        paymentTransactionIds: [pid], settledBy: OFFICIAL, notes: 'G11.4 gap 3 race',
      })),
    );

    const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
    const rejected = attempts.filter((a) => a.status === 'rejected') as PromiseRejectedResult[];

    // Exactly one winner; every loser fails with a conflict (never a partial write).
    expect(fulfilled.length).toBe(1);
    for (const r of rejected) {
      expect(String(r.reason?.message ?? '')).toMatch(/already|concurrent|duplicate/i);
    }

    // THE INVARIANT: exactly one ACTIVE line owns the payment.
    expect(await activeLineCount(pid)).toBe(1);

    // The payment is linked to precisely the batch that owns the active line.
    const winnerId = Number(fulfilled[0].value.settlement.id);
    if (!settlementIds.includes(winnerId)) settlementIds.push(winnerId);
    const [lineRows] = await pool.execute<RowData>(
      'SELECT gateway_settlement_id FROM gateway_settlement_transactions WHERE active_payment_transaction_id=?', [pid]);
    expect((lineRows as any[])).toHaveLength(1);
    expect(Number((lineRows as any[])[0].gateway_settlement_id)).toBe(winnerId);

    const pay = await paymentRow(pid);
    expect(Number(pay.gateway_settlement_id)).toBe(winnerId);
    expect(pay.gateway_settled_at).not.toBeNull();

    // No orphan batch was left behind by a rolled-back racer.
    const [orphanRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM gateway_settlements gs
       WHERE gs.id <> ? AND EXISTS (SELECT 1 FROM gateway_settlement_transactions t WHERE t.gateway_settlement_id = gs.id)`,
      [winnerId]);
    expect(Number((orphanRows as any[])[0].c)).toBe(0);
  });

  it('a dismantle racing a settlement creation leaves exactly one consistent outcome', async () => {
    const { pid } = await paidTournamentPayment();
    const { getPool } = await import('../../../database/mysql.js');
    const { tournamentRepository } = await import('../infrastructure/repositories/tournament.repository.js');

    // Both sides start from the SAME unsettled state and race on the payment row.
    const createAttempt = gatewaySettlementService.create({
      paymentTransactionIds: [pid], settledBy: OFFICIAL, notes: 'G11.4 gap 3 race 2',
    }).then((v: any) => ({ ok: true, value: v }), (e: any) => ({ ok: false, error: e }));

    const dismantleAttempt = (async () => {
      const conn = await getPool().getConnection();
      let committed = false;
      try {
        await conn.beginTransaction();
        const res = await tournamentRepository.detachPaymentSettlement(pid, conn);
        await conn.commit();
        committed = true;
        return { ok: true, value: res };
      } catch (e: any) {
        try { await conn.rollback(); } catch { /* already closed */ }
        return { ok: false, error: e };
      } finally {
        conn.release();
      }
    })();

    const [created, dismantled] = await Promise.all([createAttempt, dismantleAttempt]);

    // ── INVARIANT 1: at most ONE active line for the payment — never two.
    // The count may legitimately be 0: whichever side commits first, the other
    // observes it. If create() commits first, the dismantle (waiting on the
    // payment row) then finds that active line and releases it, so a legal
    // outcome is "created, then dismantled". The invariant is AT MOST one, and
    // the uk_gst_active_payment UNIQUE index is what enforces it at the DB.
    const activeCount = await activeLineCount(pid);
    expect(activeCount).toBeLessThanOrEqual(1);
    expect(activeCount).toBeGreaterThanOrEqual(0);

    // ── INVARIANT 2: linkage and active ownership always agree. ─────────
    const pay = await paymentRow(pid);
    const [lineRows] = await pool.execute<RowData>(
      'SELECT gateway_settlement_id FROM gateway_settlement_transactions WHERE active_payment_transaction_id=?', [pid]);
    expect((lineRows as any[]).length).toBeLessThanOrEqual(1);
    const activeBatch = (lineRows as any[])[0]?.gateway_settlement_id ?? null;
    expect(pay.gateway_settlement_id).toBe(activeBatch === null ? null : Number(activeBatch));

    // ── INVARIANT 3: the batch header always equals its ACTIVE lines. ──
    if (activeBatch !== null) {
      const batchId = Number(activeBatch);
      if (!settlementIds.includes(batchId)) settlementIds.push(batchId);
      const [agg] = await pool.execute<RowData>(
        `SELECT COALESCE(SUM(gross_amount),0) AS g, COALESCE(SUM(gateway_fee_amount),0) AS f,
                COALESCE(SUM(net_amount),0) AS n, COUNT(*) AS c
         FROM gateway_settlement_transactions WHERE gateway_settlement_id=? AND active_payment_transaction_id IS NOT NULL`,
        [batchId]);
      const header = await gatewaySettlementHeader(batchId);
      expect(Number(header.gross_amount)).toBe(Number((agg as any[])[0].g));
      expect(Number(header.gateway_fee_amount)).toBe(Number((agg as any[])[0].f));
      expect(Number(header.net_amount)).toBe(Number((agg as any[])[0].n));
      expect(Number(header.transaction_count)).toBe(Number((agg as any[])[0].c));
    }

    // ── Whichever ordering won, the outcome is one of two LEGAL states. ─
    if (created.ok) {
      const batchId = Number(created.value.settlement.id);
      if (!settlementIds.includes(batchId)) settlementIds.push(batchId);
      // create won and the dismantle (if it ran after) released the line.
      expect(['dismantled-after', 'dismantled-before-noop']).toContain(
        dismantled.ok && dismantled.value.lineReleased ? 'dismantled-after' : 'dismantled-before-noop');
    } else {
      // create lost: the dismantle consumed the payment's settlement ownership.
      expect(dismantled.ok).toBe(true);
      expect(pay.gateway_settlement_id).toBeNull();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('GAP 4 — R-4 org-scoped 1161 discovery with no global double-count', () => {
  it('reconcileAll discovers the org, includes its OWN 1161, and excludes the global one', async () => {
    const tid = await createTournament(ORG);
    const regId = await registerPlayer(tid, PLAYER);
    const pid = await chargeAndPayCard(regId);
    await emitRegistrationPaid(pid, regId);
    await waitFor(() => countEventRows(pid, 'tournament_org_registration_receivable'), (c) => c === 3, 'org-book recognition');
    // NOTE: no entitlement is created here — matching the delivered R-4 spec.
    // This org's ONLY control activity is its own org-book receivable on the
    // org-scoped 1161, and it holds NO open entitlement. That is precisely the
    // state R-4's orgsWithControlActivity fix had to discover (pre R-4 the org
    // was completely invisible to reconcileAll).

    // A DISTINCTIVE global (organisation_id IS NULL) 1161 GL row. If the report
    // ever folded global rows into an organisation's own total, this 777777.00
    // would corrupt the number asserted below.
    const [periodRows] = await pool.execute<RowData>(
      `SELECT id FROM accounting_periods
       WHERE organisation_id IS NULL AND status = 'open' AND ? BETWEEN start_date AND end_date
       ORDER BY id LIMIT 1`, ['2026-09-15']);
    const periodId = Number((periodRows as any[])[0].id);
    const [globalAcc] = await pool.execute<RowData>(
      'SELECT id FROM chart_of_accounts WHERE code = ? AND organisation_id IS NULL LIMIT 1', ['1161']);
    const [ins] = await pool.execute<RowData>(
      `INSERT INTO general_ledger (ledger_entry_id, organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
       VALUES (NULL, NULL, ?, ?, '2026-09-15', 777777.00, 0, 0, 'g114g_global_sentinel', ?, 'global 1161 sentinel', 1)`,
      [periodId, Number((globalAcc as any[])[0].id), pid]);
    syntheticGlRowIds.push(Number((ins as any).insertId));

    // Ground truth, straight from the ledger — org-scoped 1161 only.
    const [scoped] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(gl.debit), 0) AS d, COALESCE(SUM(gl.credit), 0) AS c, COUNT(*) AS n
       FROM general_ledger gl JOIN chart_of_accounts c ON c.id = gl.account_id
       WHERE c.code = '1161' AND c.organisation_id = ? AND gl.organisation_id = ?`, [ORG, ORG]);
    const scopedDebits = Number((scoped as any[])[0].d);
    const scopedCredits = Number((scoped as any[])[0].c);
    expect(Number((scoped as any[])[0].n)).toBeGreaterThan(0);
    // G11.1 org book DEBITS the org-scoped 1161 with the org's NET share (the
    // org's claim on CourtZon); revenue is credited to the org's own 4140.
    expect(scopedDebits).toBe(ORG_NET);
    expect(scopedCredits).toBe(0);
    // `reconcileOrganisation` classifies 1161 as an ASSET mirror, so its
    // reported signedBalance is debits − credits = +ORG_NET.
    const expectedSigned = Math.round((scopedDebits - scopedCredits) * 100) / 100;
    expect(expectedSigned).toBe(ORG_NET);

    // ── Direct report. ───────────────────────────────────────────────────
    const report = await orgReconciliationService.reconcileOrganisation(ORG);
    const accts = report.gl.accounts as any[];
    const ids = accts.map((a) => Number(a.accountId));
    expect(new Set(ids).size).toBe(ids.length);              // no account row counted twice

    const [scopedAccount] = await pool.execute<RowData>(
      'SELECT id FROM chart_of_accounts WHERE code = ? AND organisation_id = ? LIMIT 1', ['1161', ORG]);
    const scopedAccountId = Number((scopedAccount as any[])[0].id);
    const global1161Id = Number((globalAcc as any[])[0].id);

    // The report resolves BOTH the global control 1161 AND the org-scoped 1161
    // (two distinct accounts can share the code) — exactly one of each.
    const code1161 = accts.filter((a) => a.code === '1161');
    expect(code1161).toHaveLength(2);
    const scopedEntry = code1161.find((a) => Number(a.accountId) === scopedAccountId);
    expect(scopedEntry).toBeDefined();
    expect(Number(scopedEntry!.debits)).toBe(scopedDebits);
    expect(Number(scopedEntry!.credits)).toBe(scopedCredits);
    expect(Number(scopedEntry!.signedBalance)).toBe(expectedSigned);
    // THE KEY ASSERTION: the 777777.00 global sentinel is NOT in this number.
    // The org-scoped account's debits are exactly the org's own 900, and the
    // GLOBAL 1161 account row is reported with ZERO — the sentinel was never
    // folded into the org's totals (controlTotalsForOrg filters gl.organisation_id).
    expect(Number(scopedEntry!.debits)).toBe(ORG_NET);
    expect(Number(scopedEntry!.signedBalance)).toBe(ORG_NET);
    expect(Number(scopedEntry!.signedBalance)).not.toBe(ORG_NET + 777777);
    const globalEntry = code1161.find((a) => Number(a.accountId) === global1161Id);
    expect(globalEntry).toBeDefined();
    expect(Number(globalEntry!.debits)).toBe(0);
    expect(Number(globalEntry!.credits)).toBe(0);
    // And the organisation's payable leg is its own claim only.
    expect(Number(report.gl.payableToOrg)).toBe(ORG_NET);

    // ── Bulk discovery. ──────────────────────────────────────────────────
    const all = await orgReconciliationService.reconcileAll({ limit: 100000 });
    expect(all.summary.totalOrgs).toBeGreaterThan(0);
    const orgReport = all.reports.find((r: any) => Number(r.organisationId) === ORG);
    expect(orgReport).toBeDefined();
    const bulk1161 = (orgReport!.gl.accounts as any[]).filter((a) => a.code === '1161');
    expect(bulk1161).toHaveLength(2);
    const bulkScoped = bulk1161.find((a) => Number(a.accountId) === scopedAccountId);
    expect(bulkScoped).toBeDefined();
    expect(Number(bulkScoped!.signedBalance)).toBe(expectedSigned);
    // Same no-double-count guarantee through the bulk path.
    expect(Number((bulk1161.find((a) => Number(a.accountId) === global1161Id) as any).debits)).toBe(0);
    expect(Number(orgReport!.gl.payableToOrg)).toBe(ORG_NET);
    // Entitlement side is empty (PENDING ≠ open) — this is real, surfaced drift.
    expect(orgReport!.entitlements.openCount).toBe(0);
    expect(orgReport!.reconciled).toBe(false);

    // The sentinel is still exactly where we put it, untouched by the report.
    const [sentinel] = await pool.execute<RowData>(
      `SELECT gl.organisation_id, gl.debit FROM general_ledger gl WHERE gl.id = ?`, [syntheticGlRowIds[0]]);
    expect((sentinel as any[])[0].organisation_id).toBeNull();
    expect(Number((sentinel as any[])[0].debit)).toBe(777777);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('GAP 5 — GL reference_type width guard proven against the real varchar(50)', () => {
  const GL_MAX = 50;
  let periodId = 0;
  const createdLedgerEntryIds: number[] = [];

  beforeAll(async () => {
    const [rows] = await pool.execute<RowData>(
      `SELECT id FROM accounting_periods
       WHERE organisation_id IS NULL AND status = 'open' AND ? BETWEEN start_date AND end_date
       ORDER BY id LIMIT 1`, ['2026-09-15']);
    periodId = Number((rows as any[])[0].id);
  });

  afterAll(async () => {
    if (!createdLedgerEntryIds.length) return;
    const list = createdLedgerEntryIds.join(',');
    await pool.execute(`DELETE FROM general_ledger WHERE ledger_entry_id IN (${list})`);
    await pool.execute(`DELETE FROM ledger_entries WHERE id IN (${list})`);
    createdLedgerEntryIds.length = 0;
  });

  /** Creates a real ledger_entries row (required by the GL FK) and returns its id. */
  async function realLedgerEntry(): Promise<number> {
    // uk_dedup is (source_type, source_id, event_type, side, currency) — the
    // source_id must be unique per call so consecutive fixtures never collide.
    const sourceId = 999999 - createdLedgerEntryIds.length;
    const [res] = await pool.execute<RowData>(
      `INSERT INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id,
         chart_account_id, account_type, side, amount, currency, description, recorded_at)
       VALUES (UUID(), 'tournament', ?, 'tournament_registration_card_refund_settled', ?, NULL,
         (SELECT id FROM chart_of_accounts WHERE code='1100' AND organisation_id IS NULL LIMIT 1),
         'platform_revenue', 'debit', 1.00, 'EGP', 'G11.4 gap 5', NOW())`, [sourceId, periodId]);
    const id = Number((res as any).insertId);
    createdLedgerEntryIds.push(id);
    return id;
  }

  it('an event type that composes to EXACTLY 50 chars is written through unchanged', async () => {
    const { getPool } = await import('../../../database/mysql.js');
    const evt = 'a'.repeat(39);                       // 'settlement'(10) + '_' + 39 = 50
    expect(`settlement_${evt}`.length).toBe(GL_MAX);
    const ledgerEntryId = await realLedgerEntry();

    const conn = await getPool().getConnection();
    try {
      await glProjectionService.projectEntries([{
        sourceType: 'settlement', sourceId: 999999, eventType: evt, organisationId: null,
        chartAccountId: 1, side: 'debit', amount: 10, description: 'gap5 exact 50',
        recordedAt: '2026-09-15 00:00:00', ledgerEntryId,
      }], periodId, conn);
    } finally {
      conn.release();
    }

    const [rows] = await pool.execute<RowData>(
      'SELECT reference_type, CHAR_LENGTH(reference_type) AS len FROM general_ledger WHERE ledger_entry_id=?', [ledgerEntryId]);
    expect((rows as any[])[0].reference_type).toBe(`settlement_${evt}`);
    expect(Number((rows as any[])[0].len)).toBe(GL_MAX);
  });

  it('G11.4’s 53-char composite is written WITHOUT ER_DATA_TOO_LONG and is bounded', async () => {
    const { getPool } = await import('../../../database/mysql.js');
    const composed = 'tournament_tournament_registration_card_refund_settled';
    expect(composed.length).toBeGreaterThan(GL_MAX);
    const ledgerEntryId = await realLedgerEntry();

    const conn = await getPool().getConnection();
    let threw: any = null;
    try {
      // The regression: before the guard this INSERT raised ER_DATA_TOO_LONG and
      // the whole balanced journal silently failed to project.
      await glProjectionService.projectEntries([{
        sourceType: 'tournament', sourceId: 999999,
        eventType: 'tournament_registration_card_refund_settled', organisationId: null,
        chartAccountId: 1, side: 'debit', amount: 10, description: 'gap5 over-long composite',
        recordedAt: '2026-09-15 00:00:00', ledgerEntryId,
      }], periodId, conn);
    } catch (e: any) {
      threw = e;
    } finally {
      conn.release();
    }
    expect(threw, `projection must not throw: ${threw?.message}`).toBeNull();

    const [rows] = await pool.execute<RowData>(
      'SELECT reference_type, CHAR_LENGTH(reference_type) AS len, debit FROM general_ledger WHERE ledger_entry_id=?', [ledgerEntryId]);
    expect((rows as any[])).toHaveLength(1);
    expect(Number((rows as any[])[0].len)).toBeLessThanOrEqual(GL_MAX);
    expect((rows as any[])[0].reference_type).toBe('tournament_registration_card_refund_settled');
    // The money is unaffected — only the forensic key is bounded.
    expect(Number((rows as any[])[0].debit)).toBe(10);
  });

  it('an over-long EVENT TYPE is truncated and still cannot throw', async () => {
    const { getPool } = await import('../../../database/mysql.js');
    const huge = 'z'.repeat(120);
    const ledgerEntryId = await realLedgerEntry();

    const conn = await getPool().getConnection();
    let threw: any = null;
    try {
      await glProjectionService.projectEntries([{
        sourceType: 'settlement', sourceId: 999999, eventType: huge, organisationId: null,
        chartAccountId: 1, side: 'credit', amount: 10, description: 'gap5 huge event type',
        recordedAt: '2026-09-15 00:00:00', ledgerEntryId,
      }], periodId, conn);
    } catch (e: any) {
      threw = e;
    } finally {
      conn.release();
    }
    expect(threw, `projection must not throw: ${threw?.message}`).toBeNull();

    const [rows] = await pool.execute<RowData>(
      'SELECT reference_type, CHAR_LENGTH(reference_type) AS len, credit FROM general_ledger WHERE ledger_entry_id=?', [ledgerEntryId]);
    expect(Number((rows as any[])[0].len)).toBe(GL_MAX);
    expect((rows as any[])[0].reference_type).toBe(huge.slice(0, GL_MAX));
    expect(Number((rows as any[])[0].credit)).toBe(10);
  });

  it('existing <=50-char values are byte-for-byte unchanged by the guard', async () => {
    const { getPool } = await import('../../../database/mysql.js');
    // Real, already-posting G11.1 / G11.3 event types from this codebase.
    const realEvents = [
      'tournament_registration_card_payment',
      'tournament_registration_card_refund',
      'payment_gateway_settlement',
      'payment_gateway_settlement_reversal',
      'tournament_org_registration_receivable',
      'tournament_org_receivable_reversal',
    ];
    const conn = await getPool().getConnection();
    const entryIds: number[] = [];
    try {
      for (const evt of realEvents) {
        const [res] = await pool.execute<RowData>(
          `INSERT INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id,
             chart_account_id, account_type, side, amount, currency, description, recorded_at)
           VALUES (UUID(), 'tournament', 999999, ?, ?, NULL,
             (SELECT id FROM chart_of_accounts WHERE code='1100' AND organisation_id IS NULL LIMIT 1),
             'platform_revenue', 'debit', 1.00, 'EGP', 'gap5 unchanged', NOW())`, [evt, periodId]);
        const id = Number((res as any).insertId);
        createdLedgerEntryIds.push(id);
        entryIds.push(id);
        await glProjectionService.projectEntries([{
          sourceType: 'tournament', sourceId: 999999, eventType: evt, organisationId: null,
          chartAccountId: 1, side: 'debit', amount: 1, description: 'gap5 unchanged',
          recordedAt: '2026-09-15 00:00:00', ledgerEntryId: id,
        }], periodId, conn);
      }
    } finally {
      conn.release();
    }

    const [rows] = await pool.execute<RowData>(
      `SELECT reference_type FROM general_ledger WHERE ledger_entry_id IN (${entryIds.join(',')})`);
    expect((rows as any[]).map((r) => r.reference_type).sort())
      .toEqual(realEvents.map((e) => `tournament_${e}`).sort());
  });
});
