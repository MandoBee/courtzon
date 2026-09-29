import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3008';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * G11.6 — Player Wallet Payout (locked Phase 1 scope).
 *
 * Covers:
 *   method validation (bank_transfer|cash) at submit + persistence
 *   bank payout details requirement (player_profiles, plaintext repo convention)
 *   wallet_transactions 'withdrawal' debit history row (idempotent)
 *   withdrawal accounting idempotency (submitted + completed)
 *   prize clawback vs reserved balance (available-balance guard, full-only)
 *   read-only withdrawal reconciliation
 */

const WIN = 20060201;     // has bank details + prize setup
const NOBANK = 20060202;  // no bank details (bank rejected / cash accepted)
const PWIN = 20060203;    // prize-only winner (zero pre-seeded balance)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(probe: () => Promise<T>, isReady: (value: T) => boolean, what: string, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await probe();
  while (!isReady(value)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for: ${what} — last ${JSON.stringify(value)}`);
    await sleep(120);
    value = await probe();
  }
  return value;
}

let pool: mysql.Pool;
const tournamentIds: number[] = [];
const regIds: number[] = [];
const prizeIds: number[] = [];
const awardIds: number[] = [];
const withdrawalIds: number[] = [];

const exec = (sql: string, params: any[] = []) => pool.execute(sql, params);
const num = async (sql: string, params: any[] = []) => {
  const [rows] = await pool.execute<RowData>(sql, params);
  return Number((rows as any[])[0]?.v ?? 0);
};

async function mkUser(id: number, email: string, withBank: boolean) {
  await pool.execute(
    `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'G11.6', 'male', 'active')`,
    [id, `015${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, email],
  );
  await pool.execute(
    `INSERT INTO user_wallets (user_id, balance, reserved_balance, currency_code, is_locked, version)
     VALUES (?, 0, 0, 'EGP', 0, 1)`, [id],
  );
  if (withBank) {
    await pool.execute(
      `INSERT INTO player_profiles (user_id, bank_account_holder, bank_account_number, bank_name, iban, created_at, updated_at)
       VALUES (?, 'Test Holder', '123456789', 'Test Bank', 'EG00000000', NOW(), NOW())
       ON DUPLICATE KEY UPDATE bank_account_holder = VALUES(bank_account_holder), bank_account_number = VALUES(bank_account_number), bank_name = VALUES(bank_name), iban = VALUES(iban)`,
      [id],
    );
  }
}

async function createPlatformTournament(): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournaments
       (public_id, creator_id, organisation_id, bracket_type_id, name, max_participants, min_participants,
        entry_fee, registration_fee, currency_code, price_type, tournament_type, commission_rate, status,
        registration_payment_methods, start_date, end_date)
     VALUES (UUID(), ?, NULL, 3, 'G11.6 Cup', 16, 2, 100, 0, 'EGP', 'FIXED', 'platform', 0, 'completed', NULL, '2026-12-01', '2026-12-31')`,
    [WIN],
  );
  const tid = Number((res as any).insertId);
  tournamentIds.push(tid);
  return tid;
}

async function createRegistration(tid: number, player: number): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status) VALUES (?, ?, 'paid', 'registered')`, [tid, player],
  );
  const rid = Number((res as any).insertId);
  regIds.push(rid);
  return rid;
}

async function createPrize(tid: number, placement: number, amount: number): Promise<number> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournament_prizes (tournament_id, placement, prize_type, description, amount, currency_code, display_order)
     VALUES (?, ?, 'cash', 'Prize', ?, 'EGP', 0)`, [tid, placement, amount],
  );
  const pid = Number((res as any).insertId);
  prizeIds.push(pid);
  return pid;
}

async function upsertStanding(tid: number, registrationId: number, rank: number) {
  await pool.execute<RowData>(
    `INSERT INTO tournament_standings (tournament_id, registration_id, wins, losses, draws, points, games_won, games_lost, sets_won, sets_lost, rank_position)
     VALUES (?, ?, 0,0,0,0,0,0,0,0, ?)`, [tid, registrationId, rank],
  );
}

async function bindPrize(): Promise<number> {
  const tid = await createPlatformTournament();
  const reg = await createRegistration(tid, PWIN);
  await createPrize(tid, 1, 500);
  await upsertStanding(tid, reg, 1);
  const { tournamentPrizeAwardService } = await import('../../tournaments/application/tournament-prize-award.service.js');
  const bound = await tournamentPrizeAwardService.bindAwardsForTournament(tid);
  expect(bound).toHaveLength(1);
  const awardId = (bound as any[])[0].id;
  awardIds.push(awardId);
  return awardId;
}

async function ledgerRows(sourceId: number, eventType: string): Promise<any[]> {
  const [rows] = await pool.execute<RowData>(
    `SELECT le.side, le.amount, c.code AS account_code
     FROM ledger_entries le JOIN chart_of_accounts c ON c.id = le.chart_account_id
     WHERE le.source_type = 'wallet' AND le.source_id = ? AND le.event_type = ? ORDER BY le.id`, [sourceId, eventType],
  );
  return rows as any[];
}

const sumSide = (rows: any[], side: string) => Math.round(rows.filter((r) => r.side === side).reduce((s: number, r: any) => s + Number(r.amount), 0) * 100) / 100;

async function walletBalance(userId: number): Promise<number> {
  return num(`SELECT balance AS v FROM user_wallets WHERE user_id = ?`, [userId]);
}
async function reservedBalance(userId: number): Promise<number> {
  return num(`SELECT reserved_balance AS v FROM user_wallets WHERE user_id = ?`, [userId]);
}
async function debitRows(requestId: number): Promise<any[]> {
  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM wallet_transactions WHERE reference_type = 'withdrawal_request' AND reference_id = ? ORDER BY id`, [requestId],
  );
  return rows as any[];
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  const { registerAccountingEventListeners } = await import('../../financial/application/accounting-event.listener.js');
  registerAccountingEventListeners();
  await mkUser(WIN, 'g116-win@test.com', true);
  await mkUser(NOBANK, 'g116-nobank@test.com', false);
  await mkUser(PWIN, 'g116-pwin@test.com', true);
}, 120000);

afterAll(async () => {
  await cleanup();
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 120000);

async function cleanup() {
  if (!pool) return;
  await pool.execute(`DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM user_wallets WHERE user_id IN (${WIN}, ${NOBANK}, ${PWIN}))`);
  await pool.execute(`DELETE FROM withdrawal_requests WHERE user_id IN (${WIN}, ${NOBANK}, ${PWIN})`);
  await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id IS NULL AND source_type = 'wallet' AND source_id NOT IN (SELECT id FROM withdrawal_requests)`);
  await pool.execute(`DELETE FROM tournament_prize_awards WHERE id IN (${awardIds.length ? awardIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM tournament_standings WHERE tournament_id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE id IN (${regIds.length ? regIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM tournament_prizes WHERE id IN (${prizeIds.length ? prizeIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM user_wallets WHERE user_id IN (${WIN}, ${NOBANK}, ${PWIN})`);
  await pool.execute(`DELETE FROM player_profiles WHERE user_id IN (${WIN}, ${NOBANK}, ${PWIN})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${WIN}, ${NOBANK}, ${PWIN})`);
  tournamentIds.length = 0; regIds.length = 0; prizeIds.length = 0; awardIds.length = 0; withdrawalIds.length = 0;
}

beforeEach(async () => {
  await cleanup();
  await mkUser(WIN, 'g116-win@test.com', true);
  await mkUser(NOBANK, 'g116-nobank@test.com', false);
  await mkUser(PWIN, 'g116-pwin@test.com', true);
  await pool.execute(`UPDATE user_wallets SET balance = 500 WHERE user_id = ${WIN}`);
  await pool.execute(`UPDATE user_wallets SET balance = 500 WHERE user_id = ${NOBANK}`);
});

/** Walk the canonical 7-state machine to completion (admin actor). */
async function completeWithdrawal(requestId: number, actor = WIN, referenceNumber = 'REF') {
  const { withdrawalService } = await import('../application/withdrawal.service.js');
  await withdrawalService.transition(requestId, 'under_review', actor);
  await withdrawalService.transition(requestId, 'approved', actor);
  await withdrawalService.transition(requestId, 'processing', actor);
  await withdrawalService.transition(requestId, 'completed', actor, { referenceNumber });
}

afterEach(() => vi.clearAllMocks());

describe('G11.6 — withdrawal method + bank details', () => {
  it('1. bank transfer submission persists the method', async () => {
    const { withdrawalService } = await import('../application/withdrawal.service.js');
    const r = await withdrawalService.submit(WIN, 100, 'test', undefined, 'bank_transfer');
    withdrawalIds.push(r.id);
    expect(r.method).toBe('bank_transfer');
    const [rows] = await pool.execute<RowData>('SELECT method FROM withdrawal_requests WHERE id = ?', [r.id]);
    expect((rows as any[])[0].method).toBe('bank_transfer');
  });

  it('2. cash withdrawal submission persists the method', async () => {
    const { withdrawalService } = await import('../application/withdrawal.service.js');
    const r = await withdrawalService.submit(WIN, 100, 'test', undefined, 'cash');
    withdrawalIds.push(r.id);
    expect(r.method).toBe('cash');
    const [rows] = await pool.execute<RowData>('SELECT method FROM withdrawal_requests WHERE id = ?', [r.id]);
    expect((rows as any[])[0].method).toBe('cash');
  });

  it('3. invalid withdrawal method is rejected', async () => {
    const { withdrawalService } = await import('../application/withdrawal.service.js');
    await expect(withdrawalService.submit(WIN, 100, 'test', undefined, 'cheque' as any)).rejects.toThrow(/Invalid withdrawal method/);
  });

  it('4. bank withdrawal without valid bank details is rejected', async () => {
    const { withdrawalService } = await import('../application/withdrawal.service.js');
    await expect(withdrawalService.submit(NOBANK, 100, 'test', undefined, 'bank_transfer')).rejects.toThrow(/Bank payout details are required/);
  });

  it('5. cash withdrawal without bank details is accepted', async () => {
    const { withdrawalService } = await import('../application/withdrawal.service.js');
    const r = await withdrawalService.submit(NOBANK, 100, 'test', undefined, 'cash');
    withdrawalIds.push(r.id);
    expect(r.method).toBe('cash');
  });

  it('6. duplicate submitted event does not double-post wallet accounting', async () => {
    const { withdrawalService } = await import('../application/withdrawal.service.js');
    const r = await withdrawalService.submit(WIN, 100, 'test', undefined, 'cash');
    withdrawalIds.push(r.id);
    const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
    await eventBusV2.emit('wallet:withdrawal-submitted' as any, { withdrawalId: r.id, userId: WIN, amount: 100 });
    await eventBusV2.emit('wallet:withdrawal-submitted' as any, { withdrawalId: r.id, userId: WIN, amount: 100 });
    await waitFor(() => ledgerRows(r.id, 'withdrawal_request'), (rows) => rows.length === 2, 'withdrawal_request posting');
    const rows = await ledgerRows(r.id, 'withdrawal_request');
    expect(rows).toHaveLength(2);
    expect(sumSide(rows, 'debit')).toBe(100);
    expect(sumSide(rows, 'credit')).toBe(100);
  });

  it('7. completion writes exactly one wallet_transactions withdrawal debit row', async () => {
    const { withdrawalService } = await import('../application/withdrawal.service.js');
    const r = await withdrawalService.submit(WIN, 100, 'test', undefined, 'cash');
    withdrawalIds.push(r.id);
    await completeWithdrawal(r.id);
    const rows = await debitRows(r.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].transaction_type).toBe('withdrawal');
    expect(rows[0].direction).toBe('debit');
    expect(Number(rows[0].amount)).toBe(100);
    expect(rows[0].reference_type).toBe('withdrawal_request');
    expect(rows[0].reference_id).toBe(r.id);
    expect(await walletBalance(WIN)).toBe(400);
    expect(await reservedBalance(WIN)).toBe(0);
  });

  it('8. duplicate completion is blocked and never duplicates the debit row', async () => {
    const { withdrawalService } = await import('../application/withdrawal.service.js');
    const r = await withdrawalService.submit(WIN, 100, 'test', undefined, 'bank_transfer');
    withdrawalIds.push(r.id);
    await completeWithdrawal(r.id, WIN, 'BT1');
    await expect(withdrawalService.transition(r.id, 'completed', WIN)).rejects.toThrow(/Cannot transition/);
    const rows = await debitRows(r.id);
    expect(rows).toHaveLength(1);
  });

  it('13. bank completion posts Dr 1130 / Cr 1120 (withdrawal_completion)', async () => {
    const { withdrawalService } = await import('../application/withdrawal.service.js');
    const r = await withdrawalService.submit(WIN, 100, 'test', undefined, 'bank_transfer');
    withdrawalIds.push(r.id);
    await completeWithdrawal(r.id, WIN, 'BT2');
    await waitFor(() => ledgerRows(r.id, 'withdrawal_completion'), (rows) => rows.length === 2, 'withdrawal_completion posting');
    const rows = await ledgerRows(r.id, 'withdrawal_completion');
    expect(rows).toHaveLength(2);
    expect(sumSide(rows, 'debit')).toBe(100);
    expect(sumSide(rows, 'credit')).toBe(100);
    expect(rows.some((r) => r.account_code === '1130' && r.side === 'debit')).toBe(true);
    expect(rows.some((r) => r.account_code === '1120' && r.side === 'credit')).toBe(true);
  });

  it('14. cash completion posts the same Dr 1130 / Cr 1120 (CourtZon book, no org cash)', async () => {
    const { withdrawalService } = await import('../application/withdrawal.service.js');
    const r = await withdrawalService.submit(NOBANK, 100, 'test', undefined, 'cash');
    withdrawalIds.push(r.id);
    await completeWithdrawal(r.id, NOBANK, 'CASH1');
    await waitFor(() => ledgerRows(r.id, 'withdrawal_completion'), (rows) => rows.length === 2, 'withdrawal_completion posting');
    const rows = await ledgerRows(r.id, 'withdrawal_completion');
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.account_code === '1130' && r.side === 'debit')).toBe(true);
    expect(rows.some((r) => r.account_code === '1120' && r.side === 'credit')).toBe(true);
    expect(rows.every((r) => r.account_code === '1130' || r.account_code === '1120')).toBe(true);
  });
});

describe('G11.6 — prize clawback vs reserved balance (full-only)', () => {
  it('9/10. clawback blocked while an active withdrawal reserves funds (available insufficient)', async () => {
    const awardId = await bindPrize();
    expect(await walletBalance(PWIN)).toBe(500);
    const { withdrawalService } = await import('../application/withdrawal.service.js');
    const wr = await withdrawalService.submit(PWIN, 300, 'test', undefined, 'cash');
    withdrawalIds.push(wr.id);
    expect(await reservedBalance(PWIN)).toBe(300);

    const { tournamentPrizeAwardService } = await import('../../tournaments/application/tournament-prize-award.service.js');
    await expect(tournamentPrizeAwardService.refundAward(awardId, WIN, 'clawback')).rejects.toThrow(/Insufficient available balance/);

    // No partial clawback — nothing moved, award still credited, no refund txn.
    expect(await walletBalance(PWIN)).toBe(500);
    const [rows] = await pool.execute<RowData>('SELECT status FROM tournament_prize_awards WHERE id = ?', [awardId]);
    expect((rows as any[])[0].status).toBe('credited');
    const [refunds] = await pool.execute<RowData>('SELECT COUNT(*) AS v FROM wallet_transactions WHERE reference_type = ? AND reference_id = ?', ['tournament_prize_refund', awardId]);
    expect(Number((refunds as any[])[0].v)).toBe(0);
  });

  it('11/12. full clawback succeeds when available balance is sufficient (no partial)', async () => {
    const awardId = await bindPrize();
    expect(await walletBalance(PWIN)).toBe(500);
    const { tournamentPrizeAwardService } = await import('../../tournaments/application/tournament-prize-award.service.js');
    const refunded = await tournamentPrizeAwardService.refundAward(awardId, WIN, 'clawback');
    expect(refunded.status).toBe('refunded');
    expect(await walletBalance(PWIN)).toBe(0);
    // FULL clawback — the entire prize amount was reversed in one debit.
    const [rows] = await pool.execute<RowData>('SELECT amount, direction FROM wallet_transactions WHERE reference_type = ? AND reference_id = ?', ['tournament_prize_refund', awardId]);
    expect(rows as any[]).toHaveLength(1);
    expect(Number((rows as any[])[0].amount)).toBe(500);
    expect((rows as any[])[0].direction).toBe('debit');
  });
});

describe('G11.6 — read-only withdrawal reconciliation', () => {
  it('15. reconciliation is read-only and detects a debit-history inconsistency', async () => {
    const { withdrawalService } = await import('../application/withdrawal.service.js');
    const r = await withdrawalService.submit(WIN, 100, 'test', undefined, 'cash');
    withdrawalIds.push(r.id);
    await completeWithdrawal(r.id, WIN, 'RC1');
    const before = await walletBalance(WIN);
    const reqBefore = await num('SELECT amount AS v FROM withdrawal_requests WHERE id = ?', [r.id]);

    const { walletWithdrawalReconciliationService } = await import('../../financial/application/wallet-withdrawal-reconciliation.service.js');
    const report1 = await walletWithdrawalReconciliationService.run();
    expect(report1.readOnly).toBe(true);
    expect(report1.autoFixAvailable).toBe(false);
    const check = (key: string) => report1.checks.find((c) => c.key === key)!;
    const c2Before = check('c2_debit_history_parity').difference;

    // Inject inconsistency: remove the debit history row for this withdrawal.
    await pool.execute(`DELETE FROM wallet_transactions WHERE reference_type = 'withdrawal_request' AND reference_id = ?`, [r.id]);

    const report2 = await walletWithdrawalReconciliationService.run();
    const c2b = report2.checks.find((c) => c.key === 'c2_debit_history_parity')!;
    expect(Number(c2b.difference)).toBeCloseTo(Number(c2Before) + 100, 4);

    // Read-only: nothing was mutated by either run.
    expect(await walletBalance(WIN)).toBe(before);
    expect(await num('SELECT amount AS v FROM withdrawal_requests WHERE id = ?', [r.id])).toBe(reqBefore);
    expect(await num('SELECT COUNT(*) AS v FROM wallet_transactions WHERE reference_type = ?', ['withdrawal_request'])).toBe(0);
  });
});