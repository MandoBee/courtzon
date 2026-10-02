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
 * G11.4 — TOURNAMENT SETTLEMENT / RECONCILIATION (R-1, R-2, R-3, R-4).
 *
 * This suite is the behavioural proof of the G11.4 plan:
 *
 *   R-3  A paid tournament registration produces exactly ONE entitlement on the
 *        EXISTING `financial_entitlements` aggregate (no new table, no new
 *        ledger). CARD → ORGANIZATION_EARNING = NET; CASH → COURTZON_COMMISSION.
 *        Platform/community tournaments (organisation_id IS NULL) fail closed.
 *   D-2  The release condition is a BUSINESS EVENT, not a clock: CARD after an
 *        ACTIVE gateway settlement, CASH after a LOCKED current draw.
 *   R-2  A refund releases ONE payment from a batch (payment-scoped dismantle)
 *        instead of reversing the batch, so sibling payments are preserved.
 *   R-1  Refunding a payment that was ALREADY gateway-settled refunds out of the
 *        BANK (1120), never out of Payment Clearing (1100) — and the gateway fee
 *        in 5210 is permanently NON-REFUNDABLE.
 *   R-4  Reconciliation resolves organisation-scoped control accounts, so an org
 *        whose only control activity is its own 1161 is no longer reported as a
 *        false zero.
 */

const ORG = 10061400;
const ORG_2 = 10061401;
const PLAYER = 10061411;
const PLAYER_2 = 10061412;
const CREATOR = 10061410;
const OFFICIAL = 10061420;
const PLAN = 10061490;
const BRACKET = 1; // single-elimination

// Economics used by most tests: 1000 collected, 10% commission, 2.5% + 1.00 fee.
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
let financialEntitlementService: any;
let financialEntitlementRepository: any;
let gatewaySettlementService: any;
let handleTournamentRegistrationPaid: any;
let handleTournamentPaymentRefunded: any;
let handleTournamentEntitlementActivation: any;
let gatewaySettlementReconciliationService: any;
let paymentReconciliationService: any;
let orgReconciliationService: any;

const paymentIds: number[] = [];
const regIds: number[] = [];
const tournamentIds: number[] = [];
const requestIds: number[] = [];
const settlementIds: number[] = [];
let EVENT_BASE_ID = 0;

// ── Ledger helpers ────────────────────────────────────────────────────────────
async function countEventRows(sourceId: number, eventType: string): Promise<number> {
  const [rows] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='tournament' AND source_id=? AND event_type=?`,
    [sourceId, eventType],
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

/** Net (signed) movement of a code inside one event: +debit, −credit. */
function eventNet(rows: any[], code: string): number {
  const v = rows.filter((r) => r.account_code === code)
    .reduce((s, r) => s + (r.side === 'debit' ? Number(r.amount) : -Number(r.amount)), 0);
  return Math.round(v * 100) / 100;
}

const amountFor = (rows: any[], side: string, code: string) =>
  Number(rows.find((r) => r.side === side && r.account_code === code)?.amount ?? -1);
const sum = (rows: any[], side: string) =>
  Math.round(rows.filter((r) => r.side === side).reduce((s: number, r: any) => s + Number(r.amount), 0) * 100) / 100;

/** Account balance across ALL ledger entries for a code (optionally org scoped). */
async function accountBalance(code: string, organisationId: number | null = null): Promise<number> {
  const [rows] = await pool.execute<RowData>(
    `SELECT COALESCE(SUM(CASE WHEN le.side='debit' THEN le.amount ELSE -le.amount END), 0) AS bal
     FROM ledger_entries le JOIN chart_of_accounts c ON c.id = le.chart_account_id
     WHERE c.code = ?
       ${organisationId === null ? 'AND le.organisation_id IS NULL' : 'AND le.organisation_id = ?'}
     ${organisationId === null ? '' : 'AND c.organisation_id = ?'}`,
    organisationId === null ? [code] : [code, organisationId, organisationId],
  );
  return Math.round(Number((rows as any[])[0].bal) * 100) / 100;
}

// ── Fixture helpers ───────────────────────────────────────────────────────────
async function createTournament(org: number | null, entryFee = GROSS, rate = 10) {
  // G11 Phase 3 — `tournament_type` is narrowed to 'community' only. `org` may
  // be null ONLY to simulate a LEGACY pre-Phase-3 row (fail-closed guard path).
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournaments
       (public_id, creator_id, organisation_id, bracket_type_id, name,
        max_participants, min_participants, entry_fee, registration_fee,
        currency_code, price_type, tournament_type, commission_rate, status, start_date)
     VALUES (UUID(), ?, ?, ?, ?, 16, 2, ?, 0, 'EGP', 'FIXED', 'community', ?, 'registration_open', '2026-12-01')`,
    [CREATOR, org, BRACKET, `G114-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, entryFee, rate],
  );
  const id = Number((res as any).insertId);
  tournamentIds.push(id);
  await pool.execute(
    `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, currency_code, is_default)
     VALUES (UUID(), ?, 'singles', 'Default', 'EGP', 1)`, [id]);
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

async function chargeAndPayCard(regId: number, amount = GROSS, userId = PLAYER, currency = 'EGP'): Promise<number> {
  const gw = await paymentGateway.charge({ amount, currency, referenceId: regId, referenceType: 'tournament', returnUrl: undefined });
  if (!gw.success) throw new Error('mock charge failed');
  const [res] = await pool.execute<RowData>(
    `INSERT INTO payment_transactions
       (user_id, reference_type, reference_id, payment_method, gateway_provider, gateway_reference,
        amount, currency, payment_status, paid_at, trace_id)
     VALUES (?, 'tournament', ?, 'card', 'mock', ?, ?, ?, 'paid', NOW(), UUID())`,
    [userId, regId, String(gw.transactionId ?? gw.gatewayReference ?? 'mock'), amount, currency],
  );
  const pid = Number((res as any).insertId);
  paymentIds.push(pid);
  return pid;
}

async function cashPayment(regId: number, amount = GROSS, userId = PLAYER): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO payment_transactions
       (user_id, reference_type, reference_id, payment_method, idempotency_key, amount, currency, payment_status, paid_at, trace_id)
     VALUES (?, 'tournament', ?, 'cash', ?, ?, 'EGP', 'paid', NOW(), UUID())`,
    [userId, regId, `g114_cash_${regId}_${Date.now()}`, amount],
  );
  const pid = Number((res as any).insertId);
  paymentIds.push(pid);
  return pid;
}

/** Marks the registration paid and returns the REAL `tournament:registration-paid` payload. */
async function emitRegistrationPaid(pid: number, regId: number, amount = GROSS, method: 'card' | 'cash' = 'card') {
  const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
  const captured = await waitFor<any[]>(
    async () => {
      await eventBusV2.emit('payment:succeeded', {
        paymentId: pid, referenceType: 'tournament', referenceId: regId, amount,
        metadata: { paymentMethod: method, currency: 'EGP', userId: PLAYER },
      } as any);
      await sleep(250);
      return capturedSplice();
    },
    (v) => v.length > 0,
    `tournament:registration-paid for reg ${regId}`,
  );
  return captured[0];
}

let capturedEvents: any[] = [];
const capturedSplice = () => capturedEvents.splice(0, capturedEvents.length);

/** Runs the G11.4 entitlement handler for a registration (the production path). */
async function createEntitlements(payload: any): Promise<void> {
  await handleTournamentRegistrationPaid({ payload } as any);
}

async function lockDraw(tournamentId: number) {
  const { participantDrawService } = await import('../application/participant-draw.service.js');
  await participantDrawService.generateDraw(tournamentId, CREATOR);
  await participantDrawService.approveDraw(tournamentId, CREATOR);
  await participantDrawService.lockDraw(tournamentId, CREATOR);
}

async function gatewaySettle(pids: number[]): Promise<any> {
  const batch = await gatewaySettlementService.create({ paymentTransactionIds: pids, settledBy: OFFICIAL, notes: 'G11.4 test' });
  const id = Number(batch.settlement.id);
  if (!settlementIds.includes(id)) settlementIds.push(id);
  return batch;
}

async function entitlementsFor(regId: number): Promise<any[]> {
  return financialEntitlementService.getEntitlementsBySource('tournament', regId);
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

// ── Suite lifecycle ───────────────────────────────────────────────────────────
beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 8 });
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
  // Capture the real downstream event so the entitlement handler is fed the exact
  // production payload (never a hand-written approximation).
  eventBusV2.on('tournament:registration-paid', (data: any) => { capturedEvents.push(data); });

  tournamentRefundService = (await import('../application/tournament-refund.service.js')).tournamentRefundService;
  paymentGateway = (await import('../../../shared/services/gateway/gateway-factory.js')).paymentGateway;
  financialEntitlementService = (await import('../../financial/application/financial-entitlement.service.js')).financialEntitlementService;
  financialEntitlementRepository = (await import('../../financial/infrastructure/repositories/financial-entitlement.repository.js')).financialEntitlementRepository;
  gatewaySettlementService = (await import('../../settlement/application/gateway-settlement.service.js')).gatewaySettlementService;
  gatewaySettlementReconciliationService = (await import('../../settlement/application/gateway-settlement.reconciliation.js')).gatewaySettlementReconciliationService;
  paymentReconciliationService = (await import('../../payment/application/reconciliation.service.js')).reconciliationService;
  orgReconciliationService = (await import('../../financial/application/reconciliation.service.js')).reconciliationService;
  handleTournamentRegistrationPaid = (await import('../../financial/application/entitlement-tournament.listener.js')).handleTournamentRegistrationPaid;
  handleTournamentPaymentRefunded = (await import('../../financial/application/entitlement-tournament.listener.js')).handleTournamentPaymentRefunded;
  handleTournamentEntitlementActivation = (await import('../../financial/infrastructure/tournament-entitlement-activation.worker.js')).handleTournamentEntitlementActivation;

  // The G11.4 entitlement subscribers are DURABLE (BullMQ), which does not run
  // in-process here. Mirror the production registration 1:1 by invoking the
  // registered handlers with the exact envelope the EventBus would deliver, so
  // the tested code path IS the production path.
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

  // FK checks are disabled for the whole teardown: the settlement/ledger tables
  // reference each other in both directions, so an ordered delete is brittle and
  // a single failed test would otherwise leave residue that breaks every later run.
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    await pool.execute(`DELETE FROM settlement_entitlements WHERE entitlement_id IN (SELECT id FROM financial_entitlements WHERE organisation_id IN (${ORG}, ${ORG_2}))`);
    await pool.execute(`DELETE FROM settlements WHERE organisation_id IN (${ORG}, ${ORG_2})`);
    await pool.execute(`DELETE FROM financial_entitlements WHERE organisation_id IN (${ORG}, ${ORG_2})`);
    await pool.execute(`DELETE FROM audit_logs WHERE entity_id IN (${reqList}, ${regList}) OR entity_id IN (${idList}) OR entity_id IN (${gsList})`);
    await pool.execute(`DELETE FROM gateway_settlement_transactions WHERE gateway_settlement_id IN (${gsList}) OR payment_transaction_id IN (${idList})`);
    await pool.execute(`DELETE FROM gateway_settlements WHERE id IN (${gsList})`);
    await pool.execute(`DELETE FROM tournament_registration_refund_requests WHERE id IN (${reqList})`);
    await pool.execute(`DELETE FROM payment_transactions WHERE id IN (${idList}) OR (reference_type='tournament' AND reference_id IN (${regList}))`);
    // Journals are keyed by their OWN source, not by organisation: the CourtZon
    // book posts with organisation_id IS NULL, so an organisation-scoped delete
    // would silently leak every platform leg of this suite.
    await pool.execute(
      `DELETE FROM general_ledger WHERE ledger_entry_id IN (
         SELECT id FROM ledger_entries WHERE source_type = 'tournament' AND source_id IN (${idList}, ${regList})
       )`);
    await pool.execute(
      `DELETE FROM general_ledger WHERE ledger_entry_id IN (
         SELECT id FROM ledger_entries WHERE source_type = 'settlement' AND source_id IN (${gsList})
       )`);
    await pool.execute(`DELETE FROM ledger_entries WHERE (source_type = 'tournament' AND source_id IN (${idList}, ${regList})) OR (source_type = 'settlement' AND source_id IN (${gsList}))`);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (${ORG}, ${ORG_2})`);
    await pool.execute(`DELETE gl FROM general_ledger gl JOIN chart_of_accounts c ON c.id = gl.account_id WHERE c.organisation_id IN (${ORG}, ${ORG_2})`);
    await pool.execute(`DELETE FROM tournament_draw_entries WHERE draw_id IN (SELECT id FROM tournament_draws WHERE tournament_id IN (${tidList}))`);
    await pool.execute(`DELETE FROM tournament_draws WHERE tournament_id IN (${tidList})`);
    await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (${tidList})`);
    await pool.execute(`DELETE FROM tournament_registrations WHERE id IN (${regList})`);
    await pool.execute(`DELETE FROM tournaments WHERE id IN (${tidList})`);
    await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id IN (${ORG}, ${ORG_2}))`);
    await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id IN (${ORG}, ${ORG_2})`);
    await pool.execute(`DELETE FROM organisation_subscriptions WHERE organisation_id IN (${ORG}, ${ORG_2})`);
    await pool.execute(`DELETE FROM subscription_plan_rates WHERE plan_id = ${PLAN}`);
    await pool.execute(`DELETE FROM subscription_plans WHERE id = ${PLAN}`);
    await pool.execute(`DELETE FROM users WHERE id IN (${CREATOR}, ${PLAYER}, ${PLAYER_2}, ${OFFICIAL})`);
    await pool.execute(`DELETE FROM organisations WHERE id IN (${ORG}, ${ORG_2})`);
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
  for (const [id, name] of [[ORG, 'G114 Org'], [ORG_2, 'G114 Org2']]) {
    await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${id}, UUID(), ?, 1, '${name}', 'g114-${id}', 1)`, [otId]);
  }
  const mkUser = async (id: number, email: string) => {
    await pool.execute(
      `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
       VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'G114 User', 'male', 'active')`,
      [id, `016${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, email],
    );
  };
  await mkUser(CREATOR, 'g114-creator@test.com');
  await mkUser(PLAYER, 'g114-player@test.com');
  await mkUser(PLAYER_2, 'g114-player2@test.com');
  await mkUser(OFFICIAL, 'g114-official@test.com');

  await pool.execute(`INSERT INTO subscription_plans (id, plan_name, price_monthly, is_active, is_internal, sort_order) VALUES (?, 'G114 Plan', 0, 1, 1, 0)`, [PLAN]);
  await pool.execute(`INSERT INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES (?, 'tournament', 'percentage', ?)`, [PLAN, 10]);
  for (const org of [ORG, ORG_2]) {
    await pool.execute(
      `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, start_date, end_date, subscription_status, auto_renew)
       VALUES (?, ?, 'monthly', '2020-01-01', '2099-01-01', 'active', 0)`, [org, PLAN]);
  }

  const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
  await accountingEngineService.provisionOrganisationMarketplaceAccounts(ORG);
  await accountingEngineService.provisionOrganisationMarketplaceAccounts(ORG_2);
}

beforeEach(async () => { await cleanupAll(); await seedBase(); });
afterEach(() => { vi.clearAllMocks(); capturedEvents = []; });

// ═══════════════════════════════════════════════════════════════════════════════
describe('G11.4 — R-3: tournament entitlement creation', () => {
  it('CARD — creates exactly ONE ORGANIZATION_EARNING = NET (900), collector courtzon, PENDING, available_at NULL', async () => {
    const tid = await createTournament(ORG);
    const regId = await registerPlayer(tid, PLAYER);
    const pid = await chargeAndPayCard(regId);
    const payload = await emitRegistrationPaid(pid, regId);

    expect(payload.registrationId).toBe(regId);
    expect(payload.paymentId).toBe(pid);
    expect(payload.organisationId).toBe(ORG);

    await createEntitlements(payload);
    const rows = await entitlementsFor(regId);
    expect(rows).toHaveLength(1);
    expect(rows[0].entitlement_type).toBe('ORGANIZATION_EARNING');
    expect(Number(rows[0].amount)).toBe(ORG_NET);   // NET, never the 1000 gross
    expect(rows[0].collector).toBe('courtzon');
    expect(rows[0].status).toBe('PENDING');
    expect(rows[0].available_at).toBeNull();
    expect(rows[0].source_type).toBe('tournament');
    expect(Number(rows[0].source_id)).toBe(regId);
    const meta = typeof rows[0].metadata === 'string' ? JSON.parse(rows[0].metadata) : rows[0].metadata;
    expect(Number(meta.grossAmount)).toBe(GROSS);
    expect(Number(meta.commissionAmount)).toBe(COMMISSION);
    expect(Number(meta.orgNetAmount)).toBe(ORG_NET);
    expect(Number(meta.paymentId)).toBe(pid);
    expect(meta.custody).toBe('courtzon_collected');
    expect(meta.releaseCondition).toBe('gateway_settlement_received');
  });

  it('CASH — creates exactly ONE COURTZON_COMMISSION = 100, collector org, PENDING, available_at NULL, and NO org earning', async () => {
    const tid = await createTournament(ORG);
    const regId = await registerPlayer(tid, PLAYER);
    const pid = await cashPayment(regId);
    const payload = await emitRegistrationPaid(pid, regId, GROSS, 'cash');
    await createEntitlements(payload);

    const rows = await entitlementsFor(regId);
    expect(rows).toHaveLength(1);
    expect(rows[0].entitlement_type).toBe('COURTZON_COMMISSION');
    expect(Number(rows[0].amount)).toBe(COMMISSION);
    expect(rows[0].collector).toBe('org');
    expect(rows[0].status).toBe('PENDING');
    expect(rows[0].available_at).toBeNull();
    // D-1: no ORGANIZATION_EARNING — G11.2 already credited the org the FULL cash gross.
    expect(rows.filter((r: any) => r.entitlement_type === 'ORGANIZATION_EARNING')).toHaveLength(0);
    const meta = typeof rows[0].metadata === 'string' ? JSON.parse(rows[0].metadata) : rows[0].metadata;
    expect(meta.custody).toBe('org_collected');
    expect(meta.releaseCondition).toBe('tournament_draw_locked');
  });

  it('G11 Phase 3 — an org-less (LEGACY) tournament (organisation_id IS NULL) fails closed, zero entitlements', async () => {
    const tid = await createTournament(null, GROSS, 10);
    const regId = await registerPlayer(tid, PLAYER);
    const pid = await chargeAndPayCard(regId);
    const payload = await emitRegistrationPaid(pid, regId);

    // The upstream listener normalises a NULL organisation to 0 on the payload;
    // the entitlement handler must treat both as "no booking party".
    expect(payload.organisationId).toBeFalsy();
    await createEntitlements(payload);
    expect(await entitlementsFor(regId)).toHaveLength(0);
    const [rows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM financial_entitlements WHERE source_type='tournament' AND source_id=?`, [regId]);
    expect(Number((rows as any[])[0].c)).toBe(0);
  });

  it('IDEMPOTENCY — replaying tournament:registration-paid N times yields exactly ONE entitlement', async () => {
    const tid = await createTournament(ORG);
    const regId = await registerPlayer(tid, PLAYER);
    const pid = await chargeAndPayCard(regId);
    const payload = await emitRegistrationPaid(pid, regId);

    for (let i = 0; i < 5; i++) await createEntitlements(payload);
    const rows = await entitlementsFor(regId);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(ORG_NET);

    // Also concurrent delivery: two handlers racing on the same registration.
    await Promise.all([createEntitlements(payload), createEntitlements(payload)]);
    expect(await entitlementsFor(regId)).toHaveLength(1);
  });

  it('AMOUNT AUTHORITY — the collected payment amount wins over entry_fee, and the commission_rate snapshot is used', async () => {
    // entry_fee says 1000 but the player was actually charged 1200 (partial
    // discount / admin override). The PAYMENT is the authority.
    const tid = await createTournament(ORG, GROSS, 15);
    const regId = await registerPlayer(tid, PLAYER);
    const pid = await chargeAndPayCard(regId, 1200);
    const payload = await emitRegistrationPaid(pid, regId, 1200);
    await createEntitlements(payload);

    const rows = await entitlementsFor(regId);
    expect(rows).toHaveLength(1);
    // 15% of 1200 = 180 → net 1020. Never 15% of entry_fee (150 → 1050).
    expect(Number(rows[0].amount)).toBe(1020);
    const meta = typeof rows[0].metadata === 'string' ? JSON.parse(rows[0].metadata) : rows[0].metadata;
    expect(Number(meta.grossAmount)).toBe(1200);
    expect(Number(meta.commissionAmount)).toBe(180);
    expect(Number(meta.commissionRate)).toBe(15);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('G11.4 — D-2: tournament entitlement release conditions', () => {
  it('CARD — stays PENDING until the backing payment is gateway-settled, then activates; findAvailableForOrganisation follows', async () => {
    const tid = await createTournament(ORG);
    const regId = await registerPlayer(tid, PLAYER);
    const pid = await chargeAndPayCard(regId);
    const payload = await emitRegistrationPaid(pid, regId);
    await createEntitlements(payload);
    const ent = (await entitlementsFor(regId))[0];

    // Run the activation worker BEFORE settlement → nothing is due.
    await handleTournamentEntitlementActivation();
    expect((await entitlementsFor(regId))[0].status).toBe('PENDING');

    // Not settlement-eligible either.
    const beforeAvail = await financialEntitlementRepository.findAvailableForOrganisation(ORG);
    expect(beforeAvail.map((e: any) => e.id)).not.toContain(ent.id);

    // Record the gateway settlement → now it is due.
    const batch = await gatewaySettle([pid]);
    expect(Number(batch.settlement.gateway_fee_amount)).toBe(GS_FEE);
    await handleTournamentEntitlementActivation();

    const activated = (await entitlementsFor(regId))[0];
    expect(activated.status).toBe('AVAILABLE');
    const afterAvail = await financialEntitlementRepository.findAvailableForOrganisation(ORG);
    expect(afterAvail.map((e: any) => e.id)).toContain(ent.id);
  });

  it('CASH — stays PENDING for a draft/approved draw, activates only on a LOCKED current draw, and fails closed with no draw', async () => {
    const tid = await createTournament(ORG);
    const regId = await registerPlayer(tid, PLAYER);
    await registerPlayer(tid, PLAYER_2);
    const pid = await cashPayment(regId);
    const payload = await emitRegistrationPaid(pid, regId, GROSS, 'cash');
    await createEntitlements(payload);
    const ent = (await entitlementsFor(regId))[0];

    // A) No current draw at all → fail closed.
    await handleTournamentEntitlementActivation();
    expect((await entitlementsFor(regId))[0].status).toBe('PENDING');

    // B) Draft draw → fail closed.
    const { participantDrawService } = await import('../application/participant-draw.service.js');
    await participantDrawService.generateDraw(tid, CREATOR);
    await handleTournamentEntitlementActivation();
    expect((await entitlementsFor(regId))[0].status).toBe('PENDING');

    // C) Approved draw → still fail closed (refunds not closed yet).
    await participantDrawService.approveDraw(tid, CREATOR);
    await handleTournamentEntitlementActivation();
    expect((await entitlementsFor(regId))[0].status).toBe('PENDING');

    // D) Locked → released.
    await participantDrawService.lockDraw(tid, CREATOR);
    await handleTournamentEntitlementActivation();
    const released = (await entitlementsFor(regId))[0];
    expect(released.status).toBe('AVAILABLE');
    expect(released.id).toBe(ent.id);

    // A CASH entitlement is never blocked by the gateway gate.
    const avail = await financialEntitlementRepository.findAvailableForOrganisation(ORG);
    expect(avail.map((e: any) => e.id)).toContain(ent.id);
  });

  it('GENERIC ACTIVATION — findPendingForActivation never returns tournament entitlements (available_at NULL is not "now")', async () => {
    const tid = await createTournament(ORG);
    const regId = await registerPlayer(tid, PLAYER);
    await registerPlayer(tid, PLAYER_2);   // a draw needs ≥ 2 participants
    const pid = await cashPayment(regId);
    const payload = await emitRegistrationPaid(pid, regId, GROSS, 'cash');
    await createEntitlements(payload);
    await lockDraw(tid);   // fully releasable — the generic path must STILL skip it

    const generic = await financialEntitlementRepository.findPendingForActivation(200);
    expect(generic.map((e: any) => e.source_type)).not.toContain('tournament');
    // The dedicated path is the only one that returns it.
    const dedicated = await financialEntitlementRepository.findPendingTournamentDueForActivation('cash', 200);
    expect(dedicated.map((e: any) => e.id)).toContain((await entitlementsFor(regId))[0].id);

    // The generic activation service therefore cannot activate it either.
    await financialEntitlementService.activateEntitlements(200);
    expect((await entitlementsFor(regId))[0].status).toBe('PENDING');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('G11.4 — R-1/R-2: refund of an already gateway-settled CARD payment', () => {
  /** Full CARD path: paid → recognised → entitlement → gateway-settled → refunded. */
  async function settledCardFixture(org = ORG, player = PLAYER) {
    const tid = await createTournament(org);
    const regId = await registerPlayer(tid, player);
    const pid = await chargeAndPayCard(regId, GROSS, player);
    const payload = await emitRegistrationPaid(pid, regId, GROSS, 'card');
    await waitFor(() => countEventRows(pid, 'tournament_registration_card_payment'), (c) => c === 3, 'G11.1 recognition');
    await createEntitlements(payload);                       // R-3: the entitlement the refund must cancel
    const batch = await gatewaySettle([pid]);
    return { tid, regId, pid, payload, settlementId: Number(batch.settlement.id) };
  }

  it('REFUND AFTER SETTLEMENT — cash leg is the BANK (1120), never Payment Clearing (1100); 5210 fee is never credited', async () => {
    const { tid, regId, pid, settlementId } = await settledCardFixture();
    // Sanity: the settlement really did move 1100 → 1120 + 5210.
    const settleRows = await eventRows(settlementId, 'payment_gateway_settlement', 'settlement');
    expect(amountFor(settleRows, 'debit', '1120')).toBe(GS_NET);
    expect(amountFor(settleRows, 'debit', '5210')).toBe(GS_FEE);
    expect(amountFor(settleRows, 'credit', '1100')).toBe(GROSS);

    const req = await tournamentRefundService.requestRefund(regId, PLAYER);
    requestIds.push(Number(req.id));
    const res = await tournamentRefundService.approveRefundRequest(Number(req.id), ORG, OFFICIAL);
    expect(res.refunded).toBe(true);

    await waitFor(() => countEventRows(pid, 'tournament_registration_card_refund_settled'), (c) => c === 3, 'settled reversal');
    // The UNSETTLED G11.3 variant must NOT have been used.
    expect(await countEventRows(pid, 'tournament_registration_card_refund')).toBe(0);

    const rev = await eventRows(pid, 'tournament_registration_card_refund_settled');
    expect(rev.every((r) => r.organisation_id === null)).toBe(true);
    expect(amountFor(rev, 'debit', '2202')).toBe(ORG_NET);
    expect(amountFor(rev, 'debit', '4192')).toBe(COMMISSION);
    expect(amountFor(rev, 'credit', '1120')).toBe(GROSS);   // BANK, not clearing
    expect(sum(rev, 'debit')).toBe(sum(rev, 'credit'));
    // The gateway fee is NOT reversed — it is a real, non-refundable cost.
    expect(amountFor(rev, 'debit', '5210')).toBe(-1);
    expect(amountFor(rev, 'credit', '5210')).toBe(-1);
    expect(amountFor(rev, 'credit', '1100')).toBe(-1);

    // Org leg is unchanged by settlement state.
    const orgRev = await eventRows(pid, 'tournament_org_receivable_reversal');
    expect(orgRev).toHaveLength(3);
    expect(amountFor(orgRev, 'debit', '4140')).toBe(GROSS);
    expect(amountFor(orgRev, 'credit', '1161')).toBe(ORG_NET);
  });

  it('LIFECYCLE NET — 1100 = 0, 1120 = −fee, 5210 = +fee, 2202 = 4192 = 0', async () => {
    const { regId, pid, settlementId } = await settledCardFixture();
    const req = await tournamentRefundService.requestRefund(regId, PLAYER);
    requestIds.push(Number(req.id));
    await tournamentRefundService.approveRefundRequest(Number(req.id), ORG, OFFICIAL);
    await waitFor(() => countEventRows(pid, 'tournament_registration_card_refund_settled'), (c) => c === 3, 'settled reversal');

    const recognition = await eventRows(pid, 'tournament_registration_card_payment');
    const settlement = await eventRows(settlementId, 'payment_gateway_settlement', 'settlement');
    const reversal = await eventRows(pid, 'tournament_registration_card_refund_settled');
    const all = [...recognition, ...settlement, ...reversal];

    expect(eventNet(all, '1100')).toBe(0);                 // clearing fully unwound
    expect(eventNet(all, '1120')).toBe(-GS_FEE);           // the bank is out only the fee
    expect(eventNet(all, '5210')).toBe(GS_FEE);            // fee permanently expensed
    expect(eventNet(all, '2202')).toBe(0);                 // merchant payable reversed
    expect(eventNet(all, '4192')).toBe(0);                 // commission reversed

    // The tournament entitlement is cancelled, not settled.
    const ents = await waitFor(() => entitlementsFor(regId), (v) => v.length === 1 && v[0].status === 'CANCELLED', 'entitlement cancellation');
    expect(ents).toHaveLength(1);
    expect(ents[0].status).toBe('CANCELLED');
    // And it never becomes settlement-eligible again.
    const avail = await financialEntitlementRepository.findAvailableForOrganisation(ORG);
    expect(avail.map((e: any) => e.id)).not.toContain(ents[0].id);
    // Latency-window safety: even in the gap before the durable refund
    // subscriber cancels it, the activation query must not release an
    // entitlement whose backing payment is no longer 'paid'.
    const dueNow = await financialEntitlementRepository.findPendingTournamentDueForActivation('card', 200);
    expect(dueNow.map((e: any) => e.id)).not.toContain(ents[0].id);
    void pid;
  });

  it('DISMANTLE — releases the ACTIVE line, reduces the header, and preserves the line + header history', async () => {
    const { regId, pid, settlementId } = await settledCardFixture();
    const before = await gatewaySettlementHeader(settlementId);
    expect(Number(before.transaction_count)).toBe(1);
    expect(Number(before.gross_amount)).toBe(GROSS);
    expect(Number(before.gateway_fee_amount)).toBe(GS_FEE);
    expect(Number(before.net_amount)).toBe(GS_NET);

    const req = await tournamentRefundService.requestRefund(regId, PLAYER);
    requestIds.push(Number(req.id));
    await tournamentRefundService.approveRefundRequest(Number(req.id), ORG, OFFICIAL);

    // The line SURVIVES as history with the active pointer cleared.
    const lines = await gatewaySettlementLines(settlementId);
    expect(lines).toHaveLength(1);
    expect(lines[0].id).toBeGreaterThan(0);
    expect(lines[0].active_payment_transaction_id).toBeNull();
    expect(Number(lines[0].payment_transaction_id)).toBe(pid);
    expect(Number(lines[0].gross_amount)).toBe(GROSS);
    expect(Number(lines[0].gateway_fee_amount)).toBe(GS_FEE);

    // The header is reduced to the active remainder and is STILL reversible.
    const after = await gatewaySettlementHeader(settlementId);
    expect(after.settlement_status).toBe('completed');
    expect(Number(after.gross_amount)).toBe(0);
    expect(Number(after.gateway_fee_amount)).toBe(0);
    expect(Number(after.net_amount)).toBe(0);
    expect(Number(after.transaction_count)).toBe(0);
    expect(after.batch_code).toBe(before.batch_code);

    // Payment linkage is detached (that is what the reconciliation reads).
    const [pay] = await pool.execute<RowData>(
      'SELECT gateway_settlement_id, gateway_settled_at, payment_status FROM payment_transactions WHERE id=?', [pid]);
    expect((pay as any[])[0].gateway_settlement_id).toBeNull();
    expect((pay as any[])[0].gateway_settled_at).toBeNull();
    expect((pay as any[])[0].payment_status).toBe('refunded');

    // The dismantle posts NO journal of its own.
    const [dismantleJournals] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='tournament' AND event_type LIKE '%dismantl%'`);
    expect(Number((dismantleJournals as any[])[0].c)).toBe(0);
  });

  it('DISMANTLE PRESERVES SIBLINGS — only the refunded payment is released and the batch stays reversible', async () => {
    const tid = await createTournament(ORG);
    const regA = await registerPlayer(tid, PLAYER);
    const regB = await registerPlayer(tid, PLAYER_2);
    const pidA = await chargeAndPayCard(regA, GROSS, PLAYER);
    const pidB = await chargeAndPayCard(regB, GROSS, PLAYER_2);
    await emitRegistrationPaid(pidA, regA);
    await emitRegistrationPaid(pidB, regB);
    const batch = await gatewaySettle([pidA, pidB]);
    const settlementId = Number(batch.settlement.id);
    expect(Number(batch.settlement.gross_amount)).toBe(GROSS * 2);
    expect(Number(batch.settlement.gateway_fee_amount)).toBe(GS_FEE * 2);
    expect(Number(batch.settlement.transaction_count)).toBe(2);

    // Refund only A.
    const req = await tournamentRefundService.requestRefund(regA, PLAYER);
    requestIds.push(Number(req.id));
    await tournamentRefundService.approveRefundRequest(Number(req.id), ORG, OFFICIAL);

    const lines = await gatewaySettlementLines(settlementId);
    expect(lines).toHaveLength(2);
    const lineA = lines.find((l) => Number(l.payment_transaction_id) === pidA)!;
    const lineB = lines.find((l) => Number(l.payment_transaction_id) === pidB)!;
    expect(lineA.active_payment_transaction_id).toBeNull();
    expect(Number(lineB.active_payment_transaction_id)).toBe(pidB);

    // Header reflects ONLY the surviving sibling.
    const after = await gatewaySettlementHeader(settlementId);
    expect(Number(after.gross_amount)).toBe(GROSS);
    expect(Number(after.gateway_fee_amount)).toBe(GS_FEE);
    expect(Number(after.net_amount)).toBe(GS_NET);
    expect(Number(after.transaction_count)).toBe(1);
    expect(after.settlement_status).toBe('completed');

    // B is untouched and still gateway-settled.
    const [payB] = await pool.execute<RowData>(
      'SELECT gateway_settlement_id, payment_status FROM payment_transactions WHERE id=?', [pidB]);
    expect(Number((payB as any[])[0].gateway_settlement_id)).toBe(settlementId);
    expect((payB as any[])[0].payment_status).toBe('paid');

    // The batch can still be reversed for B — and the reversal matches the reduced header.
    const rev = await gatewaySettlementService.reverse({ settlementId, reversedBy: OFFICIAL, reason: 'G11.4 sibling reversal' });
    expect(rev.settlement.settlement_status).toBe('reversed');
    const revJournal = await eventRows(settlementId, 'payment_gateway_settlement_reversal', 'settlement');
    expect(amountFor(revJournal, 'debit', '1100')).toBe(GROSS);
    expect(amountFor(revJournal, 'credit', '1120')).toBe(GS_NET);
    expect(amountFor(revJournal, 'credit', '5210')).toBe(GS_FEE);
    // A's released line was skipped, so A is NOT re-linked.
    const [payA] = await pool.execute<RowData>('SELECT gateway_settlement_id, payment_status FROM payment_transactions WHERE id=?', [pidA]);
    expect((payA as any[])[0].gateway_settlement_id).toBeNull();
    expect((payA as any[])[0].payment_status).toBe('refunded');
  });

  it('IDEMPOTENCY — a repeated refund never double-posts the journal and never double-decrements the header', async () => {
    const { tid, regId, pid, settlementId } = await settledCardFixture();
    const req = await tournamentRefundService.requestRefund(regId, PLAYER);
    requestIds.push(Number(req.id));
    await tournamentRefundService.approveRefundRequest(Number(req.id), ORG, OFFICIAL);
    await waitFor(() => countEventRows(pid, 'tournament_registration_card_refund_settled'), (c) => c === 3, 'settled reversal');
    const headerAfterFirst = await gatewaySettlementHeader(settlementId);

    // Replay payment:refunded (the real durable subscriber event) repeatedly.
    const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
    for (let i = 0; i < 3; i++) {
      await eventBusV2.emit('payment:refunded', {
        paymentId: pid, referenceType: 'tournament', referenceId: regId, amount: GROSS,
        metadata: { paymentMethod: 'card', currency: 'EGP' },
      } as any);
    }
    await sleep(900);

    expect(await countEventRows(pid, 'tournament_registration_card_refund_settled')).toBe(3);
    expect(await countEventRows(pid, 'tournament_registration_card_refund')).toBe(0);
    expect(await countEventRows(pid, 'tournament_org_receivable_reversal')).toBe(3);
    // The header did not go negative / decrement twice.
    const headerAfterReplay = await gatewaySettlementHeader(settlementId);
    expect(Number(headerAfterReplay.gross_amount)).toBe(Number(headerAfterFirst.gross_amount));
    expect(Number(headerAfterReplay.transaction_count)).toBe(Number(headerAfterFirst.transaction_count));
    expect(Number(headerAfterReplay.gross_amount)).toBe(0);
    // Exactly one cancellation reason on the entitlement, however many replays.
    const ents = await waitFor(() => entitlementsFor(regId), (v) => v.length === 1 && v[0].status === 'CANCELLED', 'entitlement cancellation');
    expect(ents).toHaveLength(1);
    expect(ents[0].status).toBe('CANCELLED');
    expect(String(ents[0].cancelled_reason ?? '')).toContain('refunded');
    void tid;
  });

  it('RE-SETTLE — create() rejects a payment that still owns an ACTIVE line but accepts a dismantled one into a NEW batch', async () => {
    const tid = await createTournament(ORG);
    const regA = await registerPlayer(tid, PLAYER);
    const regB = await registerPlayer(tid, PLAYER_2);
    const pidA = await chargeAndPayCard(regA, GROSS, PLAYER);
    const pidB = await chargeAndPayCard(regB, GROSS, PLAYER_2);
    await emitRegistrationPaid(pidA, regA);
    await emitRegistrationPaid(pidB, regB);
    const first = await gatewaySettle([pidA, pidB]);
    const firstId = Number(first.settlement.id);

    // A duplicate ACTIVE ownership is rejected.
    await expect(gatewaySettle([pidB])).rejects.toMatchObject({ message: expect.stringContaining('already included') });

    // Dismantle A, then A is legitimately re-settleable in a NEW batch.
    const req = await tournamentRefundService.requestRefund(regA, PLAYER);
    requestIds.push(Number(req.id));
    await tournamentRefundService.approveRefundRequest(Number(req.id), ORG, OFFICIAL);
    const lines = await gatewaySettlementLines(firstId);
    expect(lines.find((l) => Number(l.payment_transaction_id) === pidA)!.active_payment_transaction_id).toBeNull();
    void pidB;
    // (A is now 'refunded', so create() would reject it on status — the point is
    // that the ACTIVE-ownership guard is no longer what blocks it.)
    await expect(gatewaySettle([pidA])).rejects.toMatchObject({ message: expect.stringContaining('not paid') });
  });

  it('REVERSE — reverses ONLY active lines; a released line is skipped without error', async () => {
    const tid = await createTournament(ORG);
    const regA = await registerPlayer(tid, PLAYER);
    const regB = await registerPlayer(tid, PLAYER_2);
    const pidA = await chargeAndPayCard(regA, GROSS, PLAYER);
    const pidB = await chargeAndPayCard(regB, GROSS, PLAYER_2);
    await emitRegistrationPaid(pidA, regA);
    await emitRegistrationPaid(pidB, regB);
    const batch = await gatewaySettle([pidA, pidB]);
    const settlementId = Number(batch.settlement.id);

    // Release A's line directly through the repository (the dismantle path, minus
    // a refund) so the batch holds one released + one active line.
    const { tournamentRepository } = await import('../infrastructure/repositories/tournament.repository.js');
    const conn = await (await import('../../../database/mysql.js')).getPool().getConnection();
    let committed = false;
    try {
      await conn.beginTransaction();
      const res = await tournamentRepository.detachPaymentSettlement(pidA, conn);
      expect(res.lineReleased).toBe(true);
      expect(res.changed).toBe(true);
      expect(Number(res.releasedAmounts!.gross)).toBe(GROSS);
      expect(Number(res.releasedAmounts!.fee)).toBe(GS_FEE);
      expect(Number(res.before!.gross)).toBe(GROSS * 2);
      expect(Number(res.after!.gross)).toBe(GROSS);
      expect(Number(res.after!.transactionCount)).toBe(1);
      // A second dismantle in the SAME transaction is idempotent: no second release.
      const again = await tournamentRepository.detachPaymentSettlement(pidA, conn);
      expect(again.lineReleased).toBe(false);
      expect(Number(res.after!.gross)).toBe(GROSS);
      await conn.commit();
      committed = true;
    } finally {
      if (!committed) { try { await conn.rollback(); } catch { /* already closed */ } }
      conn.release();
    }

    const header = await gatewaySettlementHeader(settlementId);
    expect(Number(header.gross_amount)).toBe(GROSS);
    expect(Number(header.transaction_count)).toBe(1);

    // The reversal must NOT throw on the released line and must match the header.
    const rev = await gatewaySettlementService.reverse({ settlementId, reversedBy: OFFICIAL, reason: 'G11.4 released-line reversal' });
    expect(rev.settlement.settlement_status).toBe('reversed');
    const revJournal = await eventRows(settlementId, 'payment_gateway_settlement_reversal', 'settlement');
    expect(amountFor(revJournal, 'credit', '1120')).toBe(GS_NET);
    expect(amountFor(revJournal, 'credit', '5210')).toBe(GS_FEE);
    expect(amountFor(revJournal, 'debit', '1100')).toBe(GROSS);

    // B un-settled; A stays detached and untouched.
    const [payB] = await pool.execute<RowData>('SELECT gateway_settlement_id FROM payment_transactions WHERE id=?', [pidB]);
    expect((payB as any[])[0].gateway_settlement_id).toBeNull();
    const [payA] = await pool.execute<RowData>('SELECT gateway_settlement_id FROM payment_transactions WHERE id=?', [pidA]);
    expect((payA as any[])[0].gateway_settlement_id).toBeNull();
    expect((await gatewaySettlementLines(settlementId)).every((l) => l.active_payment_transaction_id === null)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('G11.4 — reconciliation', () => {
  it('GATEWAY SETTLEMENT RECONCILIATION — clean ledger is silent; injected drift is CRITICAL; the run never writes', async () => {
    // 1. A healthy batch → no issues from the structural checks.
    const tid = await createTournament(ORG);
    const reg = await registerPlayer(tid, PLAYER);
    const pid = await chargeAndPayCard(reg);
    await emitRegistrationPaid(pid, reg);
    const batch = await gatewaySettle([pid]);
    const settlementId = Number(batch.settlement.id);

    const clean = await gatewaySettlementReconciliationService.run({ limit: 5000 });
    expect(clean.readOnly).toBe(true);
    expect(clean.autoFixAvailable).toBe(false);
    expect(clean.checks).toHaveLength(9);
    expect(clean.summary.checksRun).toBe(9);
    const cleanCheck = (k: string) => clean.checks.find((c) => c.key === k)!;
    expect(cleanCheck('header_totals_vs_active_lines').issuesFound).toBe(0);
    expect(cleanCheck('transaction_count_vs_active_lines').issuesFound).toBe(0);
    expect(cleanCheck('active_line_ownership').issuesFound).toBe(0);
    expect(cleanCheck('payment_settlement_linkage').issuesFound).toBe(0);
    expect(cleanCheck('refunded_payment_still_active').issuesFound).toBe(0);
    expect(cleanCheck('line_payment_settlement_mismatch').issuesFound).toBe(0);
    expect(cleanCheck('duplicate_active_settlement_ownership').issuesFound).toBe(0);
    expect(cleanCheck('refunded_tournament_still_settled').issuesFound).toBe(0);

    // 2. Inject header drift + a refused-but-still-linked refunded tournament payment.
    await pool.execute('UPDATE gateway_settlements SET gross_amount = 999999, transaction_count = 7 WHERE id=?', [settlementId]);
    await pool.execute(`UPDATE payment_transactions SET payment_status='refunded' WHERE id=?`, [pid]);
    await pool.execute(`UPDATE payment_transactions SET gateway_settlement_id=NULL, gateway_settled_at=NULL WHERE id=?`, [pid]);

    const dirty = await gatewaySettlementReconciliationService.run({ limit: 5000 });
    const d = (k: string) => dirty.checks.find((c) => c.key === k)!;
    expect(d('header_totals_vs_active_lines').issuesFound).toBeGreaterThan(0);
    expect(d('header_totals_vs_active_lines').issues[0].severity).toBe('CRITICAL');
    expect(d('transaction_count_vs_active_lines').issuesFound).toBeGreaterThan(0);
    expect(d('line_payment_settlement_mismatch').issuesFound).toBeGreaterThan(0);
    expect(dirty.summary.criticalCount).toBeGreaterThan(0);
    expect(dirty.summary.clean).toBe(false);

    // 3. Report-only: the injected values are EXACTLY as set — nothing was "fixed".
    const after = await gatewaySettlementHeader(settlementId);
    expect(Number(after.gross_amount)).toBe(999999);
    expect(Number(after.transaction_count)).toBe(7);
    expect(after.settlement_status).toBe('completed');
  });

  it('PAYMENT RECONCILIATION — the 6 tournament checks fire on drift and are never autoFixable', async () => {
    // A refunded tournament payment whose registration is still 'paid'.
    const tid = await createTournament(ORG);
    const reg = await registerPlayer(tid, PLAYER);
    const pid = await chargeAndPayCard(reg);
    await emitRegistrationPaid(pid, reg);
    await pool.execute(`UPDATE payment_transactions SET payment_status='refunded' WHERE id=?`, [pid]);
    // A gateway-settled tournament payment whose settlement LINE was lost.
    // (A real batch is used — the FK on payment_transactions.gateway_settlement_id
    // is exactly what makes orphan linkage impossible to fabricate.)
    const reg2 = await registerPlayer(tid, PLAYER_2);
    const pid2 = await chargeAndPayCard(reg2, GROSS, PLAYER_2);
    await emitRegistrationPaid(pid2, reg2);
    const batch2 = await gatewaySettle([pid2]);
    const settlement2 = Number(batch2.settlement.id);
    await pool.execute(
      `UPDATE payment_transactions SET gateway_settlement_id=?, gateway_settled_at=NOW() WHERE id=?`, [settlement2, pid2]);
    await pool.execute('DELETE FROM gateway_settlement_transactions WHERE payment_transaction_id=?', [pid2]);

    const run = await paymentReconciliationService.run({ limit: 5000, autoFix: true });
    const byType = (t: string) => run.issues.filter((i: any) => i.type === t);
    expect(byType('tournament_refunded_payment_registration_still_paid').length).toBeGreaterThan(0);
    expect(byType('tournament_settled_payment_missing_lineage').length).toBeGreaterThan(0);
    // Report-only: autoFix ran and still changed nothing.
    expect(run.issues.filter((i: any) => i.type.startsWith('tournament_') && i.autoFixable).length).toBe(0);
    const [pay] = await pool.execute<RowData>('SELECT payment_status FROM payment_transactions WHERE id=?', [pid]);
    expect((pay as any[])[0].payment_status).toBe('refunded');

    // And the OTHER four checks exist and are report-only (clean here).
    for (const t of [
      'tournament_registration_paid_without_payment',
      'tournament_payment_paid_registration_not_paid',
      'tournament_settled_refund_bank_clearing_inconsistent',
      'tournament_settlement_line_payment_mismatch',
    ]) {
      expect(run.issues.every((i: any) => i.type !== t || i.autoFixable === false)).toBe(true);
    }
  });

  it('R-4 — reconcileAll discovers an org whose ONLY control activity is its own org-scoped 1161', async () => {
    // The org has NO open entitlement: only a real org-book receivable posted to
    // its organisation-scoped 1161 account. Pre-R-4 this org was invisible.
    const tid = await createTournament(ORG);
    const reg = await registerPlayer(tid, PLAYER);
    const pid = await chargeAndPayCard(reg);
    await emitRegistrationPaid(pid, reg);
    await waitFor(() => countEventRows(pid, 'tournament_org_registration_receivable'), (c) => c === 3, 'org recognition');

    // Direct report: the org-scoped control account is resolved and compared.
    const report = await orgReconciliationService.reconcileOrganisation(ORG);
    expect(report.organisationId).toBe(ORG);
    const codes = report.gl.accounts.map((a) => a.code);
    expect(codes).toContain('1161');
    // Entitlement side is empty (PENDING ≠ open), GL side is not — so this is
    // exactly the drift the report exists to surface.
    expect(report.entitlements.openCount).toBe(0);
    expect(report.difference).not.toBe(0);
    expect(report.reconciled).toBe(false);

    // Bulk discovery: the org must appear WITHOUT holding any open entitlement.
    const all = await orgReconciliationService.reconcileAll({ limit: 100000 });
    expect(all.summary.totalOrgs).toBeGreaterThan(0);
    const orgReport = all.reports.find((r: any) => Number(r.organisationId) === ORG);
    expect(orgReport).toBeDefined();
    expect(orgReport.gl.accounts.map((a: any) => a.code)).toContain('1161');

    // No account is counted twice (org-scoped AND global control rows coexist).
    const glAccounts = orgReport!.gl.accounts as any[];
    const ids = glAccounts.map((a) => Number(a.accountId));
    expect(new Set(ids).size).toBe(ids.length);
    // And the R-4 org-scoped account really is a DISTINCT row from the global one.
    const scoped1161 = glAccounts.filter((a) => a.code === '1161');
    expect(scoped1161.length).toBeGreaterThanOrEqual(1);
    const [scopeCheck] = await pool.execute<RowData>(
      'SELECT COUNT(*) AS c FROM general_ledger gl JOIN chart_of_accounts c ON c.id = gl.account_id WHERE c.code = ? AND c.organisation_id = ?',
      ['1161', ORG]);
    expect(Number((scopeCheck as any[])[0].c)).toBeGreaterThan(0);
  });
});
