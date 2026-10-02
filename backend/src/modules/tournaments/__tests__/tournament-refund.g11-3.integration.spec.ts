import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3009';
  process.env.PAYMENT_GATEWAY_PROVIDER = 'mock';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * G11.3 — TOURNAMENT FULL REFUND (request → organisation approval → execution).
 *
 * Covers: CARD full refund, CASH gateway-free refund, exact accounting
 * reversals (net-zero vs recognition), draw-lock cutoff (draft/approved allowed,
 * locked rejected), settlement payment-scoped detach, idempotency (duplicate
 * request / duplicate approval / payment:refunded replay / crash recovery),
 * RBAC (own-registration only, cross-org rejected).
 */

const ORG = 10060400;
const ORG_2 = 10060401;
const PLAYER = 10060411;
const PLAYER_2 = 10060412;
const PLAYER_3 = 10060413;
const CREATOR = 10060410;
const OFFICIAL = 10060420;
const PLAN = 10060490;
const BRACKET = 1; // single-elimination

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(probe: () => Promise<T>, isReady: (value: T) => boolean, what: string, timeoutMs = 25_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await probe();
  while (!isReady(value)) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${what} — last value ${JSON.stringify(value)}`);
    }
    await sleep(120);
    value = await probe();
  }
  return value;
}

let pool: mysql.Pool;
let tournamentRefundService: any;
let paymentService: any;
let paymentGateway: any;
const paymentIds: number[] = [];
const regIds: number[] = [];
const tournamentIds: number[] = [];
const requestIds: number[] = [];
let EVENT_BASE_ID = 0;

async function countEventRows(paymentId: number, eventType: string): Promise<number> {
  const [rows] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS c FROM ledger_entries WHERE source_type='tournament' AND source_id=? AND event_type=?`,
    [paymentId, eventType],
  );
  return Number((rows as any[])[0].c);
}

async function eventRows(paymentId: number, eventType: string): Promise<any[]> {
  const [rows] = await pool.execute<RowData>(
    `SELECT le.side, le.amount, le.organisation_id, c.code AS account_code, le.source_type, le.source_id
     FROM ledger_entries le JOIN chart_of_accounts c ON c.id = le.chart_account_id
     WHERE le.source_type='tournament' AND le.source_id=? AND le.event_type=?
     ORDER BY le.id`,
    [paymentId, eventType],
  );
  return rows as any[];
}

const amountFor = (rows: any[], side: string, code: string) => Number(rows.find((r) => r.side === side && r.account_code === code)?.amount ?? -1);
const sum = (rows: any[], side: string) => Math.round(rows.filter((r) => r.side === side).reduce((s: number, r: any) => s + Number(r.amount), 0) * 100) / 100;

async function createTournament(org: number, entryFee = 1000, rate = 10) {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournaments
       (public_id, creator_id, organisation_id, bracket_type_id, name,
        max_participants, min_participants, entry_fee, registration_fee,
        currency_code, price_type, tournament_type, commission_rate, status, start_date)
     VALUES (UUID(), ?, ?, ?, ?, 16, 2, ?, 0, 'EGP', 'FIXED', 'community', ?, 'registration_open', '2026-12-01')`,
    [CREATOR, org, BRACKET, `G113-${Date.now()}`, entryFee, rate],
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
  // participant 1:1 (individual) — member_user_ids JSON is the member cache.
  await pool.execute(
    `INSERT INTO tournament_participants (tournament_id, registration_id, participant_type, status, member_user_ids)
     VALUES (?, ?, 'individual', 'active', JSON_ARRAY(?))`,
    [tournamentId, regId, playerId],
  );
  return regId;
}

async function chargeAndPayCard(regId: number, amount: number, userId = PLAYER, currency = 'EGP'): Promise<number> {
  const gw = await paymentGateway.charge({ amount, currency, referenceId: regId, referenceType: 'tournament', returnUrl: undefined });
  if (!gw.success) throw new Error('mock charge failed');
  const [res] = await pool.execute<RowData>(
    `INSERT INTO payment_transactions
       (user_id, reference_type, reference_id, payment_method, gateway_provider, gateway_reference, amount, currency, payment_status, paid_at, trace_id)
     VALUES (?, 'tournament', ?, 'card', 'mock', ?, ?, ?, 'paid', NOW(), UUID())`,
    [userId, regId, String(gw.transactionId ?? gw.gatewayReference ?? 'mock'), amount, currency],
  );
  const pid = Number((res as any).insertId);
  paymentIds.push(pid);
  await pool.execute(`UPDATE payment_transactions SET gateway_settlement_id = NULL WHERE id = ${pid}`);
  return pid;
}

async function cashPayment(regId: number, amount: number, userId = PLAYER): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO payment_transactions
       (user_id, reference_type, reference_id, payment_method, idempotency_key, amount, currency, payment_status, paid_at, trace_id)
     VALUES (?, 'tournament', ?, 'cash', ?, ?, 'EGP', 'paid', NOW(), UUID())`,
    [userId, regId, `tournament_cash_payment_${regId}`, amount],
  );
  const pid = Number((res as any).insertId);
  paymentIds.push(pid);
  return pid;
}

async function emitPaymentSucceeded(pid: number, regId: number, amount: number, method: 'card' | 'cash') {
  const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
  await eventBusV2.emit('payment:succeeded', {
    paymentId: pid, referenceType: 'tournament', referenceId: regId, amount,
    metadata: { paymentMethod: method, currency: 'EGP', userId: PLAYER },
  } as any);
}

async function generateAndLockDraw(tournamentId: number) {
  const { participantDrawService } = await import('../application/participant-draw.service.js');
  await participantDrawService.generateDraw(tournamentId, CREATOR);
  await participantDrawService.approveDraw(tournamentId, CREATOR);
  await participantDrawService.lockDraw(tournamentId, CREATOR);
}

async function currentDrawStatus(tournamentId: number): Promise<string | null> {
  const [rows] = await pool.execute<RowData>(
    'SELECT status FROM tournament_draws WHERE tournament_id=? AND is_current=1 LIMIT 1', [tournamentId]);
  return (rows as any[])[0]?.status ?? null;
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });
  const [evBase] = await pool.execute<RowData>('SELECT COALESCE(MAX(id),0) AS m FROM published_events');
  const [prBase] = await pool.execute<RowData>('SELECT COALESCE(MAX(id),0) AS m FROM processed_events');
  EVENT_BASE_ID = Math.min(Number((evBase as any[])[0].m), Number((prBase as any[])[0].m));
  await seedBase();

  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  const { registerAccountingEventListeners } = await import('../../financial/application/accounting-event.listener.js');
  registerAccountingEventListeners();
  tournamentRefundService = (await import('../application/tournament-refund.service.js')).tournamentRefundService;
  paymentService = (await import('../../payment/application/payment.service.js')).paymentService;
  paymentGateway = (await import('../../../shared/services/gateway/gateway-factory.js')).paymentGateway;
}, 120000);

afterAll(async () => {
  await cleanupAll();
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 120000);

async function cleanupAll() {
  if (!pool) return;
  await pool.execute(`DELETE FROM gateway_settlement_transactions WHERE gateway_settlement_id IN (999900, 999901)`);
  await pool.execute(`DELETE FROM gateway_settlements WHERE id IN (999900, 999901)`);
  await pool.execute(`DELETE FROM tournament_registration_refund_requests WHERE id IN (${requestIds.length ? requestIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM payment_transactions WHERE id IN (${paymentIds.length ? paymentIds.join(',') : 0}) OR reference_type='tournament'`);
  await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id IN (${ORG}, ${ORG_2}) OR source_type='tournament'`);
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (${ORG}, ${ORG_2})`);
  // Safety net: purge ANY general_ledger rows referencing org-scoped accounts
  // (e.g. org-book CourtZon/NULL-scoped residue) before dropping the COA.
  await pool.execute(`DELETE gl FROM general_ledger gl JOIN chart_of_accounts c ON c.id = gl.account_id WHERE c.organisation_id IN (${ORG}, ${ORG_2})`);
  await pool.execute(`DELETE FROM tournament_draw_entries WHERE draw_id IN (SELECT id FROM tournament_draws WHERE tournament_id IN (${tournamentIds.length ? tournamentIds.join(',') : 0}))`);
  await pool.execute(`DELETE FROM tournament_draws WHERE tournament_id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE id IN (${regIds.length ? regIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id IN (${ORG}, ${ORG_2}))`);
  await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id IN (${ORG}, ${ORG_2})`);
  await pool.execute(`DELETE FROM organisation_subscriptions WHERE organisation_id IN (${ORG}, ${ORG_2})`);
  await pool.execute(`DELETE FROM subscription_plan_rates WHERE plan_id = ${PLAN}`);
  await pool.execute(`DELETE FROM subscription_plans WHERE id = ${PLAN}`);
  await pool.execute(`DELETE FROM users WHERE id IN (${CREATOR}, ${PLAYER}, ${PLAYER_2}, ${PLAYER_3}, ${OFFICIAL})`);
  await pool.execute(`DELETE FROM organisations WHERE id IN (${ORG}, ${ORG_2})`);
  await pool.execute(`DELETE FROM published_events WHERE id > ${EVENT_BASE_ID}`);
  await pool.execute(`DELETE FROM processed_events WHERE id > ${EVENT_BASE_ID}`);
  paymentIds.length = 0; regIds.length = 0; tournamentIds.length = 0; requestIds.length = 0;
  if (paymentGateway?.clearRefundLedger) paymentGateway.clearRefundLedger();
}

async function seedBase() {
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  for (const [id, name] of [[ORG, 'G113 Org'], [ORG_2, 'G113 Org2']]) {
    await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${id}, UUID(), ?, 1, '${name}', 'g113-${id}', 1)`, [otId]);
  }
  const mkUser = async (id: number, email: string) => {
    await pool.execute(
      `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
       VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'G113 User', 'male', 'active')`,
      [id, `015${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, email],
    );
  };
  await mkUser(CREATOR, 'g113-creator@test.com');
  await mkUser(PLAYER, 'g113-player@test.com');
  await mkUser(PLAYER_2, 'g113-player2@test.com');
  await mkUser(PLAYER_3, 'g113-player3@test.com');
  await mkUser(OFFICIAL, 'g113-official@test.com');

  await pool.execute(`INSERT INTO subscription_plans (id, plan_name, price_monthly, is_active, is_internal, sort_order) VALUES (?, 'G113 Plan', 0, 1, 1, 0)`, [PLAN]);
  await pool.execute(`INSERT INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES (?, 'tournament', 'percentage', ?)`, [PLAN, 10]);
  await pool.execute(
    `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, start_date, end_date, subscription_status, auto_renew)
     VALUES (?, ?, 'monthly', '2020-01-01', '2099-01-01', 'active', 0)`, [ORG, PLAN]);
  await pool.execute(
    `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, start_date, end_date, subscription_status, auto_renew)
     VALUES (?, ?, 'monthly', '2020-01-01', '2099-01-01', 'active', 0)`, [ORG_2, PLAN]);

  const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
  await accountingEngineService.provisionOrganisationMarketplaceAccounts(ORG);
  await accountingEngineService.provisionOrganisationMarketplaceAccounts(ORG_2);
}

beforeEach(async () => { await cleanupAll(); await seedBase(); });
afterEach(() => { vi.clearAllMocks(); });

describe('G11.3 — tournament FULL refund (request → approval → execution)', () => {
  it('CARD — full flow: request → approve → exact reversals, net-zero vs G11.1 recognition', async () => {
    const tid = await createTournament(ORG, 1000, 10);
    const regId = await registerPlayer(tid, PLAYER);
    const pid = await chargeAndPayCard(regId, 1000);
    await emitPaymentSucceeded(pid, regId, 1000, 'card');
    // G11.1 recognition posted (CourtZon 3 + org 3).
    await waitFor(() => countEventRows(pid, 'tournament_registration_card_payment'), (c) => c === 3, 'card CourtZon recognition');
    await waitFor(() => countEventRows(pid, 'tournament_org_registration_receivable'), (c) => c === 3, 'card org recognition');

    const req = await tournamentRefundService.requestRefund(regId, PLAYER, 'Changed my mind');
    requestIds.push(Number(req.id));
    expect(req.status).toBe('pending');

    const result = await tournamentRefundService.approveRefundRequest(Number(req.id), ORG, OFFICIAL);
    expect(result.refunded).toBe(true);

    // Payment + registration state.
    const [payRows] = await pool.execute<RowData>('SELECT payment_status FROM payment_transactions WHERE id=?', [pid]);
    expect((payRows as any[])[0].payment_status).toBe('refunded');
    const [regRows] = await pool.execute<RowData>('SELECT payment_status, status FROM tournament_registrations WHERE id=?', [regId]);
    expect((regRows as any[])[0].payment_status).toBe('refunded');
    expect((regRows as any[])[0].status).toBe('withdrawn');
    const [partRows] = await pool.execute<RowData>('SELECT status FROM tournament_participants WHERE registration_id=?', [regId]);
    expect((partRows as any[])[0].status).toBe('withdrawn');

    // Exact reversals.
    await waitFor(() => countEventRows(pid, 'tournament_registration_card_refund'), (c) => c === 3, 'card CourtZon reversal');
    await waitFor(() => countEventRows(pid, 'tournament_org_receivable_reversal'), (c) => c === 3, 'card org reversal');
    const courtRev = await eventRows(pid, 'tournament_registration_card_refund');
    const orgRev = await eventRows(pid, 'tournament_org_receivable_reversal');
    expect(courtRev.every((r) => r.organisation_id === null)).toBe(true);
    expect(amountFor(courtRev, 'debit', '2202')).toBe(900);
    expect(amountFor(courtRev, 'debit', '4192')).toBe(100);
    expect(amountFor(courtRev, 'credit', '1100')).toBe(1000);
    expect(sum(courtRev, 'debit')).toBe(sum(courtRev, 'credit'));
    expect(orgRev.every((r) => Number(r.organisation_id) === ORG)).toBe(true);
    expect(amountFor(orgRev, 'debit', '4140')).toBe(1000);
    expect(amountFor(orgRev, 'credit', '1161')).toBe(900);
    expect(amountFor(orgRev, 'credit', 'MKT-COMM-EXP')).toBe(100);
    expect(sum(orgRev, 'debit')).toBe(sum(orgRev, 'credit'));

    // Net-zero vs recognition for a COMMISSION/clearing/receivable snapshot.
    const courtRec = await eventRows(pid, 'tournament_registration_card_payment');
    const orgRec = await eventRows(pid, 'tournament_org_registration_receivable');
    const net = (rows: any[]) => Math.round(rows.reduce((s: number, r: any) => s + (r.side === 'debit' ? Number(r.amount) : -Number(r.amount)), 0) * 100) / 100;
    const courtNet = net([...courtRec, ...courtRev]);
    const orgNetAcct = net([...orgRec, ...orgRev]);
    expect(courtNet).toBe(0);
    expect(orgNetAcct).toBe(0);
  });

  it('CASH — gateway-free full refund: exact G11.2 reversal, net-zero', async () => {
    const tid = await createTournament(ORG, 1000, 10);
    const regId = await registerPlayer(tid, PLAYER);
    const pid = await cashPayment(regId, 1000);
    await emitPaymentSucceeded(pid, regId, 1000, 'cash');
    await waitFor(() => countEventRows(pid, 'tournament_cash_commission_receivable'), (c) => c === 2, 'cash CourtZon recognition');
    await waitFor(() => countEventRows(pid, 'tournament_org_cash_payment'), (c) => c === 4, 'cash org recognition');

    const req = await tournamentRefundService.requestRefund(regId, PLAYER);
    requestIds.push(Number(req.id));
    const result = await tournamentRefundService.approveRefundRequest(Number(req.id), ORG, OFFICIAL);
    expect(result.method).toBe('cash');

    const [payRows] = await pool.execute<RowData>('SELECT payment_status FROM payment_transactions WHERE id=?', [pid]);
    expect((payRows as any[])[0].payment_status).toBe('refunded');

    await waitFor(() => countEventRows(pid, 'tournament_cash_commission_refund'), (c) => c === 2, 'cash CourtZon reversal');
    await waitFor(() => countEventRows(pid, 'tournament_org_cash_payment_reversal'), (c) => c === 4, 'cash org reversal');
    const courtRev = await eventRows(pid, 'tournament_cash_commission_refund');
    const orgRev = await eventRows(pid, 'tournament_org_cash_payment_reversal');
    expect(amountFor(courtRev, 'debit', '4192')).toBe(100);
    expect(amountFor(courtRev, 'credit', '2202')).toBe(100);
    expect(sum(courtRev, 'debit')).toBe(sum(courtRev, 'credit'));
    expect(amountFor(orgRev, 'debit', '4140')).toBe(1000);
    expect(amountFor(orgRev, 'debit', 'MKT-CZ-PAY')).toBe(100);
    expect(amountFor(orgRev, 'credit', 'ORG-CASH')).toBe(1000);
    expect(amountFor(orgRev, 'credit', 'MKT-COMM-EXP')).toBe(100);
    expect(sum(orgRev, 'debit')).toBe(sum(orgRev, 'credit'));

    const courtRec = await eventRows(pid, 'tournament_cash_commission_receivable');
    const orgRec = await eventRows(pid, 'tournament_org_cash_payment');
    const net = (rows: any[]) => Math.round(rows.reduce((s: number, r: any) => s + (r.side === 'debit' ? Number(r.amount) : -Number(r.amount)), 0) * 100) / 100;
    expect(net([...courtRec, ...courtRev])).toBe(0);
    expect(net([...orgRec, ...orgRev])).toBe(0);
  });

  it('DRAW CUTOFF — refunds allowed with no/draft/approved current draw, REJECTED once locked; tournaments.status is NOT the cutoff', async () => {
    const { participantDrawService: pds } = await import('../application/participant-draw.service.js');

    // A) NO current draw → refund allowed.
    const t1 = await createTournament(ORG, 1000, 10);
    const r1 = await registerPlayer(t1, PLAYER);
    await registerPlayer(t1, PLAYER_2);
    const p1 = await chargeAndPayCard(r1, 1000);
    await emitPaymentSucceeded(p1, r1, 1000, 'card');
    await waitFor(() => countEventRows(p1, 'tournament_registration_card_payment'), (c) => c === 3, 'recognition t1');
    const req1 = await tournamentRefundService.requestRefund(r1, PLAYER);
    requestIds.push(Number(req1.id));
    expect((await tournamentRefundService.approveRefundRequest(Number(req1.id), ORG, OFFICIAL)).refunded).toBe(true);

    // B) DRAFT → allowed; then APPROVED → still allowed (execution happens on an approved draw).
    const t2 = await createTournament(ORG, 1000, 10);
    const r2 = await registerPlayer(t2, PLAYER);
    await registerPlayer(t2, PLAYER_2);
    const p2 = await chargeAndPayCard(r2, 1000);
    await emitPaymentSucceeded(p2, r2, 1000, 'card');
    await waitFor(() => countEventRows(p2, 'tournament_registration_card_payment'), (c) => c === 3, 'recognition t2');
    await pds.generateDraw(t2, CREATOR);
    expect(await currentDrawStatus(t2)).toBe('draft');
    const reqDraft = await tournamentRefundService.requestRefund(r2, PLAYER);
    requestIds.push(Number(reqDraft.id));
    await pds.approveDraw(t2, CREATOR);
    expect(await currentDrawStatus(t2)).toBe('approved');
    expect((await tournamentRefundService.approveRefundRequest(Number(reqDraft.id), ORG, OFFICIAL)).refunded).toBe(true);

    // C) EXECUTION-TIME race: request created while APPROVED, draw LOCKED, approve → rejected; payment untouched.
    const t3 = await createTournament(ORG, 1000, 10);
    const r3 = await registerPlayer(t3, PLAYER);
    await registerPlayer(t3, PLAYER_2);
    const p3 = await chargeAndPayCard(r3, 1000);
    await emitPaymentSucceeded(p3, r3, 1000, 'card');
    await waitFor(() => countEventRows(p3, 'tournament_registration_card_payment'), (c) => c === 3, 'recognition t3');
    await pds.generateDraw(t3, CREATOR);
    await pds.approveDraw(t3, CREATOR);
    const reqRace = await tournamentRefundService.requestRefund(r3, PLAYER);
    requestIds.push(Number(reqRace.id));
    await pds.lockDraw(t3, CREATOR);
    expect(await currentDrawStatus(t3)).toBe('locked');
    await expect(tournamentRefundService.approveRefundRequest(Number(reqRace.id), ORG, OFFICIAL)).rejects.toMatchObject({ message: expect.stringContaining('LOCKED') });
    const [pay3] = await pool.execute<RowData>('SELECT payment_status FROM payment_transactions WHERE id=?', [p3]);
    expect((pay3 as any[])[0].payment_status).toBe('paid');

    // D) tournaments.status is NOT the cutoff: any tournaments.status with a locked current draw still rejects.
    await pool.execute(`UPDATE tournaments SET status = 'running' WHERE id = ?`, [t3]);
    await expect(tournamentRefundService.approveRefundRequest(Number(reqRace.id), ORG, OFFICIAL)).rejects.toMatchObject({ message: expect.stringContaining('LOCKED') });

    // E) a NEW request cannot be submitted once locked (advisory at request time).
    const r4 = await registerPlayer(t3, PLAYER_3);
    const p4 = await chargeAndPayCard(r4, 1000, PLAYER_3);
    await emitPaymentSucceeded(p4, r4, 1000, 'card');
    await waitFor(() => countEventRows(p4, 'tournament_registration_card_payment'), (c) => c === 3, 'recognition t3-2');
    await expect(tournamentRefundService.requestRefund(r4, PLAYER_3)).rejects.toMatchObject({ message: expect.stringContaining('LOCKED') });
  });

  it('SETTLEMENT — payment-scoped detach before draw lock; batch settlement untouched; locked rejects even when detached', async () => {
    const tid = await createTournament(ORG, 1000, 10);
    const regId = await registerPlayer(tid, PLAYER);
    const pid = await chargeAndPayCard(regId, 1000);
    await emitPaymentSucceeded(pid, regId, 1000, 'card');
    await waitFor(() => countEventRows(pid, 'tournament_registration_card_payment'), (c) => c === 3, 'recognition');
    // Simulate this payment has been gateway-settled (real batch + link row).
    await pool.execute(`INSERT INTO gateway_settlements (id, batch_code, settlement_status, gross_amount, gateway_fee_amount, net_amount, currency, transaction_count) VALUES (999900, 'g113-batch-1', 'completed', 1000, 0, 1000, 'EGP', 1)`);
    await pool.execute(`INSERT INTO gateway_settlement_transactions (gateway_settlement_id, payment_transaction_id, gross_amount, net_amount, currency) VALUES (999900, ?, 1000, 1000, 'EGP')`, [pid]);
    await pool.execute(`UPDATE payment_transactions SET gateway_settlement_id = 999900, gateway_settled_at = NOW() WHERE id = ?`, [pid]);

    const req = await tournamentRefundService.requestRefund(regId, PLAYER);
    requestIds.push(Number(req.id));
    const res = await tournamentRefundService.approveRefundRequest(Number(req.id), ORG, OFFICIAL);
    expect(res.refunded).toBe(true);

    // Payment-scoped detach: this payment un-settled, NO gateway_settlements batch row ever created/modified.
    const [pay] = await pool.execute<RowData>('SELECT gateway_settlement_id, gateway_settled_at, payment_status FROM payment_transactions WHERE id=?', [pid]);
    expect((pay as any[])[0].gateway_settlement_id).toBe(null);
    expect((pay as any[])[0].gateway_settled_at).toBe(null);
    expect((pay as any[])[0].payment_status).toBe('refunded');
    // The BATCH is untouched (still 'completed', never reversed) — only the
    // payment was detached.
    const [batch] = await pool.execute<RowData>('SELECT settlement_status FROM gateway_settlements WHERE id = 999900');
    expect((batch as any[])[0].settlement_status).toBe('completed');
    const [gst] = await pool.execute<RowData>('SELECT COUNT(*) AS c FROM gateway_settlement_transactions WHERE gateway_settlement_id = 999900');
    expect(Number((gst as any[])[0].c)).toBe(1); // batch line preserved

    // Post-lock refund rejected even if the payment were detached.
    const tid2 = await createTournament(ORG, 1000, 10);
    const regB = await registerPlayer(tid2, PLAYER);
    await registerPlayer(tid2, PLAYER_2);
    const pidB = await chargeAndPayCard(regB, 1000);
    await emitPaymentSucceeded(pidB, regB, 1000, 'card');
    await waitFor(() => countEventRows(pidB, 'tournament_registration_card_payment'), (c) => c === 3, 'recognitionB');
    await pool.execute(`INSERT INTO gateway_settlements (id, batch_code, settlement_status, gross_amount, gateway_fee_amount, net_amount, currency, transaction_count) VALUES (999901, 'g113-batch-2', 'completed', 1000, 0, 1000, 'EGP', 1)`);
    await pool.execute(`INSERT INTO gateway_settlement_transactions (gateway_settlement_id, payment_transaction_id, gross_amount, net_amount, currency) VALUES (999901, ?, 1000, 1000, 'EGP')`, [pidB]);
    await pool.execute(`UPDATE payment_transactions SET gateway_settlement_id = 999901 WHERE id = ?`, [pidB]);
    const { participantDrawService } = await import('../application/participant-draw.service.js');
    await participantDrawService.generateDraw(tid2, CREATOR);
    await participantDrawService.approveDraw(tid2, CREATOR);
    const reqB = await tournamentRefundService.requestRefund(regB, PLAYER);
    requestIds.push(Number(reqB.id));
    await participantDrawService.lockDraw(tid2, CREATOR);
    await expect(tournamentRefundService.approveRefundRequest(Number(reqB.id), ORG, OFFICIAL)).rejects.toMatchObject({ message: expect.stringContaining('LOCKED') });
  });

  it('IDEMPOTENCY — duplicate request prevented; duplicate approval refrains; replay produces no duplicate journal', async () => {
    const tid = await createTournament(ORG, 1000, 10);
    const regId = await registerPlayer(tid, PLAYER);
    const pid = await chargeAndPayCard(regId, 1000);
    await emitPaymentSucceeded(pid, regId, 1000, 'card');
    await waitFor(() => countEventRows(pid, 'tournament_registration_card_payment'), (c) => c === 3, 'recognition');

    const req1 = await tournamentRefundService.requestRefund(regId, PLAYER);
    requestIds.push(Number(req1.id));
    await expect(tournamentRefundService.requestRefund(regId, PLAYER)).rejects.toMatchObject({ message: expect.stringContaining('already open') });

    const res1 = await tournamentRefundService.approveRefundRequest(Number(req1.id), ORG, OFFICIAL);
    expect(res1.refunded).toBe(true);
    await waitFor(() => countEventRows(pid, 'tournament_registration_card_refund'), (c) => c === 3, 'reversal');

    // Duplicate approval (post-execution) → idempotent, no second reversal journal.
    const res2 = await tournamentRefundService.approveRefundRequest(Number(req1.id), ORG, OFFICIAL);
    expect(res2.alreadyHandled || res2.refunded).toBe(true);
    await sleep(600);
    expect(await countEventRows(pid, 'tournament_registration_card_refund')).toBe(3);
    expect(await countEventRows(pid, 'tournament_org_receivable_reversal')).toBe(3);

    // Replay payment:refunded (card) — the generic payment:refunded handler must NOT double post.
    const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
    await eventBusV2.emit('payment:refunded', {
      paymentId: pid, referenceType: 'tournament', referenceId: regId, amount: 1000,
      metadata: { paymentMethod: 'card', currency: 'EGP' },
    } as any);
    await sleep(800);
    expect(await countEventRows(pid, 'tournament_registration_card_refund')).toBe(3);
    expect(await countEventRows(pid, 'tournament_org_receivable_reversal')).toBe(3);
  });

  it('CRASH/RETRY — payment already refunded + request approved → recovery finalizes without re-executing', async () => {
    const tid = await createTournament(ORG, 1000, 10);
    const regId = await registerPlayer(tid, PLAYER);
    const pid = await cashPayment(regId, 1000);
    await emitPaymentSucceeded(pid, regId, 1000, 'cash');
    await waitFor(() => countEventRows(pid, 'tournament_cash_commission_receivable'), (c) => c === 2, 'cash recognition');

    const req = await tournamentRefundService.requestRefund(regId, PLAYER);
    requestIds.push(Number(req.id));
    const res = await tournamentRefundService.approveRefundRequest(Number(req.id), ORG, OFFICIAL);
    expect(res.refunded).toBe(true);
    await waitFor(() => countEventRows(pid, 'tournament_cash_commission_refund'), (c) => c === 2, 'cash reversal');

    // Simulate a crash between execution and finalize: roll the request back to approved,
    // payment already refunded → a retried approval must finalize WITHOUT a second cash emit/journal.
    await pool.execute(`UPDATE tournament_registration_refund_requests SET status='approved', executed_at=NULL WHERE id=?`, [req.id]);
    const res2 = await tournamentRefundService.approveRefundRequest(Number(req.id), ORG, OFFICIAL);
    expect(res2.refunded).toBe(true);
    await sleep(600);
    expect(await countEventRows(pid, 'tournament_cash_commission_refund')).toBe(2);
    const [reqRow] = await pool.execute<RowData>('SELECT status FROM tournament_registration_refund_requests WHERE id=?', [req.id]);
    expect((reqRow as any[])[0].status).toBe('executed');
  });

  it('RBAC — player can request only their OWN registration; cross-org approval rejected', async () => {
    const tid = await createTournament(ORG, 1000, 10);
    const regA = await registerPlayer(tid, PLAYER);
    const regB = await registerPlayer(tid, PLAYER_2);
    const pidA = await chargeAndPayCard(regA, 1000);
    const pidB = await chargeAndPayCard(regB, 1000, PLAYER_2);
    await emitPaymentSucceeded(pidA, regA, 1000, 'card');
    await emitPaymentSucceeded(pidB, regB, 1000, 'card');
    await waitFor(() => countEventRows(pidA, 'tournament_registration_card_payment'), (c) => c === 3, 'recognition A');
    await waitFor(() => countEventRows(pidB, 'tournament_registration_card_payment'), (c) => c === 3, 'recognition B');

    // PLAYER_2 cannot request a refund for PLAYER's registration.
    await expect(tournamentRefundService.requestRefund(regA, PLAYER_2)).rejects.toThrow('own registration');

    const reqA = await tournamentRefundService.requestRefund(regA, PLAYER);
    requestIds.push(Number(reqA.id));
    const reqB = await tournamentRefundService.requestRefund(regB, PLAYER_2);
    requestIds.push(Number(reqB.id));

    // ORG official: own org OK. A different org's official cannot approve ORG's request.
    await expect(tournamentRefundService.approveRefundRequest(Number(reqA.id), ORG_2, OFFICIAL)).rejects.toThrow('does not belong to your organisation');
    // Own-org approval succeeds.
    const res = await tournamentRefundService.approveRefundRequest(Number(reqA.id), ORG, OFFICIAL);
    expect(res.refunded).toBe(true);

    // Reject path: own org only.
    await expect(tournamentRefundService.rejectRefundRequest(Number(reqB.id), ORG_2, OFFICIAL)).rejects.toThrow('does not belong to your organisation');
    const rej = await tournamentRefundService.rejectRefundRequest(Number(reqB.id), ORG, OFFICIAL, 'No longer interested');
    expect(rej.status).toBe('rejected');
  });

  it('REJECT lifecycle — pending → rejected; no financial side effects', async () => {
    const tid = await createTournament(ORG, 1000, 10);
    const regId = await registerPlayer(tid, PLAYER);
    const pid = await cashPayment(regId, 1000);
    await emitPaymentSucceeded(pid, regId, 1000, 'cash');
    await waitFor(() => countEventRows(pid, 'tournament_cash_commission_receivable'), (c) => c === 2, 'cash recognition');

    const req = await tournamentRefundService.requestRefund(regId, PLAYER);
    requestIds.push(Number(req.id));
    await tournamentRefundService.rejectRefundRequest(Number(req.id), ORG, OFFICIAL, 'no budget');
    const [pay] = await pool.execute<RowData>('SELECT payment_status FROM payment_transactions WHERE id=?', [pid]);
    expect((pay as any[])[0].payment_status).toBe('paid'); // untouched
    // Registration payment_status is UNCHANGED by a rejected refund ('unpaid':
    // the payment listener is intentionally NOT wired in this spec, so the
    // recognition flow alone does not move the registration to paid). Rejection
    // must leave it exactly as it was.
    const [reg] = await pool.execute<RowData>('SELECT payment_status FROM tournament_registrations WHERE id=?', [regId]);
    expect((reg as any[])[0].payment_status).toBe('unpaid');
    // A rejected request cannot be approved.
    await expect(tournamentRefundService.approveRefundRequest(Number(req.id), ORG, OFFICIAL)).rejects.toThrow('already been rejected');
  });
});