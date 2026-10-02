import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3013';
  process.env.PAYMENT_GATEWAY_PROVIDER = 'mock';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
type RowData = RowDataPacket[];

/**
 * G11.8 — PLAYER SELF-SERVICE registration cancellation + automatic refund.
 *
 * Reuses the G11.3 refund execution core: draw-lock (pre-draw allowed, locked
 * rejected), payment-row lock, exactly-once cash mark / card PaymentService
 * refund, accounting recognition prerequisite, payment:refunded, entitlement
 * withdrawal, audit TOURNAMENT.REFUND_EXECUTED. NO refund-request row.
 * Covers idempotency, concurrency, org-less fail-closed (422), non-owner 404.
 */

const ORG = 10060500;
const ORG_2 = 10060501;
const PLAYER = 10060511;
const OTHER_PLAYER = 10060512;
const CREATOR = 10060510;
const PLAN = 10060590;
const BRACKET = 1;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(probe: () => Promise<T>, isReady: (v: T) => boolean, what: string, timeoutMs = 25_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let v = await probe();
  while (!isReady(v)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for: ${what} — last=${JSON.stringify(v)}`);
    await sleep(120);
    v = await probe();
  }
  return v;
}

let pool: mysql.Pool;
let refundService: any;
let paymentGateway: any;
const paymentIds: number[] = [];
const regIds: number[] = [];
const tournamentIds: number[] = [];
let EVENT_BASE_ID = 0;

const num = async (sql: string, params: any[] = []) => {
  const [rows] = await pool.execute<RowData>(sql, params);
  return Number((rows as any[])[0]?.v ?? 0);
};

async function countEventRows(paymentId: number, eventType: string): Promise<number> {
  return num(`SELECT COUNT(*) AS v FROM ledger_entries WHERE source_type='tournament' AND source_id=? AND event_type=?`, [paymentId, eventType]);
}

async function createTournament(org: number | null, entryFee = 300, rate = 10): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournaments
       (public_id, creator_id, organisation_id, bracket_type_id, name,
        max_participants, min_participants, entry_fee, registration_fee,
        currency_code, price_type, tournament_type, commission_rate, status, start_date)
     VALUES (UUID(), ?, ?, ?, ?, 16, 2, ?, 0, 'EGP', 'FIXED', 'community', ?, 'registration_open', '2026-12-01')`,
    [CREATOR, org, BRACKET, `G118-${Date.now()}`, entryFee, rate],
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
     VALUES (?, ?, 'unpaid', 'registered')`, [tournamentId, playerId],
  );
  const regId = Number((res as any).insertId);
  regIds.push(regId);
  await pool.execute(
    `INSERT INTO tournament_participants (tournament_id, registration_id, participant_type, status, member_user_ids)
     VALUES (?, ?, 'individual', 'active', JSON_ARRAY(?))`, [tournamentId, regId, playerId],
  );
  return regId;
}

async function cashPayment(regId: number, amount: number, userId = PLAYER): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO payment_transactions
       (user_id, reference_type, reference_id, payment_method, amount, currency, payment_status, paid_at, trace_id)
     VALUES (?, 'tournament', ?, 'cash', ?, 'EGP', 'paid', NOW(), UUID())`,
    [userId, regId, amount],
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

/** Post a real paid (cash) registration with the G11.2 ledger recognition. */
async function setupPaidRegistration(tournamentId: number, playerId = PLAYER, amount = 300): Promise<{ regId: number; paymentId: number }> {
  const regId = await registerPlayer(tournamentId, playerId);
  const pid = await cashPayment(regId, amount, playerId);
  await emitPaymentSucceeded(pid, regId, amount, 'cash');
  await waitFor(() => countEventRows(pid, 'tournament_cash_commission_receivable'), (c) => c === 2, 'cash recognition');
  return { regId, paymentId: pid };
}

async function generateAndLockDraw(tournamentId: number) {
  const { participantDrawService } = await import('../application/participant-draw.service.js');
  await participantDrawService.generateDraw(tournamentId, CREATOR);
  await participantDrawService.approveDraw(tournamentId, CREATOR);
  await participantDrawService.lockDraw(tournamentId, CREATOR);
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  const [evBase] = await pool.execute<RowData>('SELECT COALESCE(MAX(id),0) AS m FROM published_events');
  const [prBase] = await pool.execute<RowData>('SELECT COALESCE(MAX(id),0) AS m FROM processed_events');
  EVENT_BASE_ID = Math.min(Number((evBase as any[])[0].m), Number((prBase as any[])[0].m));
  const { registerAccountingEventListeners } = await import('../../financial/application/accounting-event.listener.js');
  registerAccountingEventListeners();
  refundService = (await import('../application/tournament-refund.service.js')).tournamentRefundService;
  paymentGateway = (await import('../../../shared/services/gateway/gateway-factory.js')).paymentGateway;
  // Fresh start: purge any leftovers from a prior interrupted run.
  await cleanupAll();
  await seedBase();
}, 120000);

afterAll(async () => {
  await cleanupAll();
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 120000);

async function cleanupAll() {
  if (!pool) return;
  await pool.execute(`DELETE FROM tournament_registration_refund_requests WHERE tournament_id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM financial_entitlements WHERE organisation_id IN (${ORG}, ${ORG_2}) OR source_type='tournament'`);
  await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id IN (${ORG}, ${ORG_2}) OR source_type='tournament'`);
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (${ORG}, ${ORG_2}) OR account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id IN (${ORG}, ${ORG_2}))`);
  await pool.execute(`DELETE FROM payment_transactions WHERE id IN (${paymentIds.length ? paymentIds.join(',') : 0}) OR reference_type='tournament'`);
  await pool.execute(`DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM user_wallets WHERE user_id IN (${PLAYER}, ${OTHER_PLAYER}))`);
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
  await pool.execute(`DELETE FROM users WHERE id IN (${CREATOR}, ${PLAYER}, ${OTHER_PLAYER})`);
  await pool.execute(`DELETE FROM organisations WHERE id IN (${ORG}, ${ORG_2})`);
  await pool.execute(`DELETE FROM published_events WHERE id > ${EVENT_BASE_ID}`);
  await pool.execute(`DELETE FROM processed_events WHERE id > ${EVENT_BASE_ID}`);
  paymentIds.length = 0; regIds.length = 0; tournamentIds.length = 0;
  if (paymentGateway?.clearRefundLedger) paymentGateway.clearRefundLedger();
}

async function seedBase() {
  if (!pool) return;
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  for (const [id, name] of [[ORG, 'G118 Org'], [ORG_2, 'G118 Org2']] as const) {
    await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${id}, UUID(), ?, 1, '${name}', 'g118-${id}', 1)`, [otId]);
  }
  const mkUser = async (id: number, email: string) => {
    await pool.execute(
      `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
       VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'G118 User', 'male', 'active')`,
      [id, `015${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, email],
    );
  };
  await mkUser(CREATOR, 'g118-creator@test.com');
  await mkUser(PLAYER, 'g118-player@test.com');
  await mkUser(OTHER_PLAYER, 'g118-other@test.com');
  await pool.execute(`INSERT INTO subscription_plans (id, plan_name, price_monthly, is_active, is_internal, sort_order) VALUES (?, 'G118 Plan', 0, 1, 1, 0)`, [PLAN]);
  await pool.execute(`INSERT INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES (?, 'tournament', 'percentage', ?)`, [PLAN, 10]);
  await pool.execute(`INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, start_date, end_date, subscription_status, auto_renew) VALUES (?, ?, 'monthly', '2020-01-01', '2099-01-01', 'active', 0)`, [ORG, PLAN]);
  const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
  await accountingEngineService.provisionOrganisationMarketplaceAccounts(ORG);
  await accountingEngineService.provisionOrganisationMarketplaceAccounts(ORG_2);
}

beforeEach(async () => { await cleanupAll(); await seedBase(); });
afterEach(() => { vi.clearAllMocks(); });

describe('G11.8 — player self-service cancellation + automatic refund', () => {
  it('1/2/11/13. owner pre-draw-lock cancellation executes a FULL cash refund, exactly once', async () => {
    const tid = await createTournament(ORG, 300, 10);
    const { regId, paymentId: pid } = await setupPaidRegistration(tid, PLAYER, 300);

    const result = await refundService.cancelRegistrationSelfService(regId, PLAYER, 'changed my mind');
    expect(result.success).toBe(true);
    expect(result.alreadyHandled).toBe(false);
    expect(result.method).toBe('cash');
    expect(result.amount).toBe(300);

    // Settlement/draw untouched; compensation commissions reverse 4192 (CourtZon 2) + org cash book (4).
    await waitFor(() => countEventRows(pid, 'tournament_cash_commission_refund'), (c) => c === 2, 'cash CourtZon reversal');
    await waitFor(() => countEventRows(pid, 'tournament_org_cash_payment_reversal'), (c) => c === 4, 'cash org reversal');
    expect(await countEventRows(pid, 'tournament_cash_commission_refund')).toBe(2); // exactly once
    expect(await countEventRows(pid, 'tournament_org_cash_payment_reversal')).toBe(4);

    // Payment, registration + participant state.
    expect(await num(`SELECT COUNT(*) AS v FROM payment_transactions WHERE id=? AND payment_status='refunded'`, [pid])).toBe(1);
    const [regRows] = await pool.execute<RowData>('SELECT payment_status, status FROM tournament_registrations WHERE id=?', [regId]);
    expect((regRows as any[])[0].payment_status).toBe('refunded');
    expect((regRows as any[])[0].status).toBe('withdrawn');
    expect(await num(`SELECT COUNT(*) AS v FROM tournament_participants WHERE registration_id=? AND status='withdrawn'`, [regId])).toBe(1);

    // Entitlement: none remain active for the registration.
    expect(await num(`SELECT COUNT(*) AS v FROM financial_entitlements WHERE source_type='tournament' AND source_id=? AND status NOT IN ('CANCELLED')`, [regId])).toBe(0);
    // Wallet: registration refunds never touch the wallet.
    expect(await num(`SELECT COUNT(*) AS v FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM user_wallets WHERE user_id=?)`, [PLAYER])).toBe(0);
    // Audit exactly once.
    expect(await num(`SELECT COUNT(*) AS v FROM audit_logs WHERE action='TOURNAMENT.REFUND_EXECUTED' AND entity_type='tournament_registration' AND entity_id=?`, [regId])).toBe(1);
    // No refund-request row is created (self-service executes directly).
    expect(await num(`SELECT COUNT(*) AS v FROM tournament_registration_refund_requests WHERE registration_id=?`, [regId])).toBe(0);
  });

  it('3. another player cannot cancel (404 — no existence leak)', async () => {
    const tid = await createTournament(ORG);
    const { regId, paymentId: pid } = await setupPaidRegistration(tid, PLAYER, 100);
    await expect(refundService.cancelRegistrationSelfService(regId, OTHER_PLAYER)).rejects.toMatchObject({ statusCode: 404 });
    // Nothing changed on the owner's side (payment still paid, no reversal).
    expect(await num(`SELECT COUNT(*) AS v FROM payment_transactions WHERE id=? AND payment_status='paid'`, [pid])).toBe(1);
    expect(await countEventRows(pid, 'tournament_cash_commission_refund')).toBe(0);
  });

  it('4. unauthenticated is rejected at the route guard (401) — route requires tournaments.registration.cancel', async () => {
    // Source-contract: the route is registered with authMiddleware + the new
    // permission key (401 is produced by the auth middleware for anonymous calls).
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const routes = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../presentation/tournament.routes.ts'), 'utf8');
    expect(routes).toMatch(/\/tournaments\/registration\/:registrationId\/cancel/);
    expect(routes).toMatch(/requirePermission\(\['tournaments\.registration\.cancel'\]\)/);
  });

  it('5/6. post-draw-lock cancellation is rejected 409 with NO financial modification', async () => {
    const tid = await createTournament(ORG, 300, 10);
    // Draw generation requires at least 2 participants (existing primitive).
    const regA = await registerPlayer(tid, PLAYER);
    const regB = await registerPlayer(tid, OTHER_PLAYER);
    await generateAndLockDraw(tid);

    await expect(refundService.cancelRegistrationSelfService(regA, PLAYER, 'oops'))
      .rejects.toMatchObject({ statusCode: 409, code: 'TOURNAMENT_DRAW_LOCKED' });

    // No financial modification whatsoever for the whole tournament.
    expect(await num(`SELECT COUNT(*) AS v FROM payment_transactions WHERE reference_type='tournament' AND reference_id IN (?, ?)`, [regA, regB])).toBe(0);
    expect(await num(`SELECT COUNT(*) AS v FROM ledger_entries WHERE source_type='tournament'`)).toBe(0);
    expect(await num(`SELECT COUNT(*) AS v FROM financial_entitlements WHERE source_type='tournament' AND source_id IN (?, ?)`, [regA, regB])).toBe(0);
    // Registration state untouched.
    expect(await num(`SELECT COUNT(*) AS v FROM tournament_registrations WHERE id=? AND status='registered'`, [regA])).toBe(1);
  });

  it('7. org-less (legacy) tournament fails closed with 422 and nothing changes', async () => {
    const tid = await createTournament(null, 300, 10); // organisation_id NULL
    const regId = await registerPlayer(tid, PLAYER);
    await expect(refundService.cancelRegistrationSelfService(regId, PLAYER))
      .rejects.toMatchObject({ statusCode: 422, code: 'TOURNAMENT_ORGANISATION_REQUIRED' });
    expect(await num(`SELECT COUNT(*) AS v FROM tournament_registrations WHERE id=? AND status='registered'`, [regId])).toBe(1);
    expect(await num(`SELECT COUNT(*) AS v FROM ledger_entries WHERE source_type='tournament'`)).toBe(0);
  });

  it('8. repeated cancellation is idempotent (alreadyHandled)', async () => {
    const tid = await createTournament(ORG, 300, 10);
    const { regId, paymentId: pid } = await setupPaidRegistration(tid, PLAYER, 300);
    await refundService.cancelRegistrationSelfService(regId, PLAYER);
    await waitFor(() => countEventRows(pid, 'tournament_cash_commission_refund'), (c) => c === 2, 'cash reversal');

    const again = await refundService.cancelRegistrationSelfService(regId, PLAYER);
    expect(again.alreadyHandled).toBe(true);
    // No second reversal / audit.
    expect(await countEventRows(pid, 'tournament_cash_commission_refund')).toBe(2);
    expect(await countEventRows(pid, 'tournament_org_cash_payment_reversal')).toBe(4);
    expect(await num(`SELECT COUNT(*) AS v FROM audit_logs WHERE action='TOURNAMENT.REFUND_EXECUTED' AND entity_type='tournament_registration' AND entity_id=?`, [regId])).toBe(1);
  });

  it('9a. an already-refunded payment does not double reverse', async () => {
    const tid = await createTournament(ORG, 300, 10);
    const { regId, paymentId: pid } = await setupPaidRegistration(tid, PLAYER, 300);
    // Simulate a concurrent G11.3 refund having already set the payment refunded
    // AND the registration withdrawn (recovery/idempotency branch).
    await pool.execute(`UPDATE payment_transactions SET payment_status='refunded' WHERE id=?`, [pid]);
    await pool.execute(`UPDATE tournament_registrations SET status='withdrawn', payment_status='refunded' WHERE id=?`, [regId]);

    const result = await refundService.cancelRegistrationSelfService(regId, PLAYER);
    expect(result.alreadyHandled).toBe(true);
    expect(await countEventRows(pid, 'tournament_cash_commission_refund')).toBe(0); // never adds a second reversal
    expect(await num(`SELECT COUNT(*) AS v FROM audit_logs WHERE action='TOURNAMENT.REFUND_EXECUTED' AND entity_type='tournament_registration' AND entity_id=?`, [regId])).toBe(0);
  });

  it('9b. concurrent self-cancellations serialize on the payment row — exactly one execution', async () => {
    const tid = await createTournament(ORG, 300, 10);
    const { regId, paymentId: pid } = await setupPaidRegistration(tid, PLAYER, 300);

    const [a, b] = await Promise.allSettled([
      refundService.cancelRegistrationSelfService(regId, PLAYER),
      refundService.cancelRegistrationSelfService(regId, PLAYER),
    ]);
    const fulfilled = a.status === 'fulfilled' ? [a.value] : [];
    if (b.status === 'fulfilled') fulfilled.push(b.value);
    const executed = fulfilled.filter((r) => r && r.success && r.alreadyHandled === false).length;
    // Serialization invariant: EXACTLY ONE of the concurrent calls performs the refund.
    expect(executed).toBe(1);

    await waitFor(() => countEventRows(pid, 'tournament_cash_commission_refund'), (c) => c === 2, 'cash reversal');
    expect(await countEventRows(pid, 'tournament_cash_commission_refund')).toBe(2);
    expect(await countEventRows(pid, 'tournament_org_cash_payment_reversal')).toBe(4);
    expect(await num(`SELECT COUNT(*) AS v FROM audit_logs WHERE action='TOURNAMENT.REFUND_EXECUTED' AND entity_type='tournament_registration' AND entity_id=?`, [regId])).toBe(1);
    expect(await num(`SELECT COUNT(*) AS v FROM payment_transactions WHERE id=? AND payment_status='refunded'`, [pid])).toBe(1);
  });

  it('10. payment becomes refunded exactly once (cash conditional transition)', async () => {
    const tid = await createTournament(ORG, 300, 10);
    const { regId, paymentId: pid } = await setupPaidRegistration(tid, PLAYER, 300);
    await refundService.cancelRegistrationSelfService(regId, PLAYER);
    await waitFor(() => num(`SELECT COUNT(*) AS v FROM payment_transactions WHERE id=? AND payment_status='refunded'`, [pid]), (n) => n === 1, 'payment refunded');
    // No other status written back.
    const [rows] = await pool.execute<RowData>('SELECT payment_status FROM payment_transactions WHERE id=?', [pid]);
    expect((rows as any[])[0].payment_status).toBe('refunded');
  });

  it('13b. drawLocked is derived read-only on /my/tournaments (no new column)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, '../../../modules/player-experience/presentation/player.controller.ts'), 'utf8');
    expect(src).toMatch(/LEFT JOIN tournament_draws td ON td\.tournament_id = t\.id AND td\.is_current = 1/);
    expect(src).toMatch(/\(td\.status = 'locked'\) AS drawLocked/);
  });

  it('14. notifications: templates + engine mapping exist for player + organisation recipients', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = dirname(fileURLToPath(import.meta.url));
    const templates = readFileSync(resolve(dir, '../../notifications/application/template.service.ts'), 'utf8');
    const engine = readFileSync(resolve(dir, '../../notifications/application/notification-engine.ts'), 'utf8');
    const ntf = readFileSync(resolve(dir, '../../notifications/application/tournament-notification.service.ts'), 'utf8');
    expect(templates).toContain("eventName: 'tournament:registration-refunded'");
    expect(templates).toContain("'tournament:registration-refunded:player'");
    expect(templates).toContain("'tournament:registration-refunded:orgStaff'");
    expect(engine).toContain("'tournament:registration-refunded'");
    expect(engine).toContain("eventName === 'tournament:registration-refunded'");
    expect(ntf).toContain("case 'tournament:registration-refunded':");
    expect(ntf).toContain("this.handleRegistrationRefunded(ctx)");
  });

  it('15. frontend cancel posts to the NEW endpoint and gates the button', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../');
    const page = readFileSync(resolve(root, 'frontend/src/pages/player/TournamentsPage.tsx'), 'utf8');
    const svc = readFileSync(resolve(root, 'frontend/src/services/tournament.ts'), 'utf8');
    expect(page).not.toMatch(/api\.delete\(`\/tournaments\/registration/);
    expect(page).toMatch(/playerCancelRegistration\(registrationId\)/);
    expect(page).toMatch(/Can permission="tournaments\.registration\.cancel"/);
    expect(page).toMatch(/invalidateQueries\(\{ queryKey: \['my-tournaments'\] \}\)/);
    expect(page).toMatch(/drawLocked/);
    expect(svc).toContain('`/tournaments/registration/${registrationId}/cancel`');
    expect(svc).toContain('playerCancelRegistration');
  });
});