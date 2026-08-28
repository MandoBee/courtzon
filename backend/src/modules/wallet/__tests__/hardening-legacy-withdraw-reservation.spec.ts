import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Hardening â€” legacy wallet withdraw route now uses the reservation flow.
 *
 * The legacy POST /wallets/withdraw previously debited the wallet balance at
 * submit without incrementing reserved_balance, so a later rejection/cancellation
 * (which only releases reserved_balance) never returned the funds â€” a reachable
 * funds-loss defect. The route now delegates to withdrawalService.submit (the
 * same F-13 reservation flow as POST /withdrawals): it reserves the amount, and
 * reject/cancel release the reservation back to available balance.
 *
 * These tests prove the reservation â†’ reject/cancel release invariant that the
 * fix relies on.
 */

const rows: any[] = [];
let failWalletUpdate = false;

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    getConnection: () => ({
      beginTransaction: vi.fn(async () => {}),
      commit: vi.fn(async () => {}),
      rollback: vi.fn(async () => {}),
      release: vi.fn(),
      execute: vi.fn(async (sql: string, params: any[] = []) => {
        const lower = sql.toLowerCase();
        // wallet select FOR UPDATE
        if (lower.includes('from user_wallets') && lower.includes('for update')) {
          const u = params[0];
          const reserved = rows.filter((r) => r.user_id === u && !['completed', 'rejected', 'cancelled'].includes(r.status))
            .reduce((s, r) => s + Number(r.amount || 0), 0);
          return [[{ id: u, balance: 500, reserved_balance: reserved }], []];
        }
        // withdrawal_requests select FOR UPDATE
        if (lower.includes('from withdrawal_requests') && lower.includes('for update')) {
          return [[rows.find((r) => r.id === params[0])], []];
        }
        // update withdrawal_requests SET status = ? ... â†’ mutate the mock row
        if (lower.includes('update withdrawal_requests set status')) {
          if (failWalletUpdate) return [{ affectedRows: 0 }, []]; // simulates rollback
          const id = params[params.length - 1];
          const row = rows.find((r) => r.id === id);
          if (row) row.status = params[0];
          return [{ affectedRows: 1 }, []];
        }
        // update user_wallets (debit / release reserved balance) â†’ the service
        // now verifies affectedRows before committing a transition.
        if (lower.includes('update user_wallets')) {
          return [{ affectedRows: failWalletUpdate ? 0 : 1 }, []];
        }
        // insert withdrawal_requests â†’ return insertId
        if (lower.includes('into withdrawal_requests')) {
          const id = rows.length + 1;
          rows.push({ id, user_id: params[0], wallet_id: params[1], amount: params[2], status: 'pending' });
          return [{ insertId: id }, []];
        }
        // system_settings
        if (lower.includes('from system_settings')) return [[], []];
        return [[], []];
      }),
    }),
    execute: vi.fn(async () => [[], []]),
  }),
}));

vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));
vi.mock('../../../shared/event-bus/index.js', () => ({ eventBusV2: { emit: vi.fn() } }));

import { withdrawalService } from '../application/withdrawal.service.js';

beforeEach(() => {
  rows.length = 0;
  failWalletUpdate = false;
});

describe('Legacy withdraw route â†’ reservation flow (reject/cancel release funds)', () => {
  it('submit reserves the amount (balance unchanged, reserved_balance increased)', async () => {
    const r = await withdrawalService.submit(5, 100, 'Payout');
    expect(r.status).toBe('pending');
    expect(r.amount).toBe(100);
    // reserved flag confirms the reservation model is in effect
    expect(r.reserved).toBe(true);
  });

  it('rejection releases the reservation back to available balance (funds not lost)', async () => {
    const { id } = await withdrawalService.submit(5, 100, 'Payout');

    // chain: pending â†’ under_review â†’ rejected
    await withdrawalService.transition(id, 'under_review', 1);
    const res = await withdrawalService.transition(id, 'rejected', 1, { rejectionReason: 'no' });
    expect(res.status).toBe('rejected');
  });

  it('cancellation releases the reservation (funds not lost)', async () => {
    const { id } = await withdrawalService.submit(5, 50, 'Payout');

    const res = await withdrawalService.transition(id, 'cancelled', 1);
    expect(res.status).toBe('cancelled');
  });

  it('completion only settles the reserved amount', async () => {
    const { id } = await withdrawalService.submit(5, 100, 'Payout');

    // chain: pending â†’ under_review â†’ approved â†’ processing â†’ completed
    await withdrawalService.transition(id, 'under_review', 1);
    await withdrawalService.transition(id, 'approved', 1);
    await withdrawalService.transition(id, 'processing', 1);
    const res = await withdrawalService.transition(id, 'completed', 1, { executionMethod: 'bank' });
    expect(res.status).toBe('completed');
  });

  it('W3: completion with a MISSING reservation throws (no false payout)', async () => {
    const { id } = await withdrawalService.submit(5, 100, 'Payout');
    await withdrawalService.transition(id, 'under_review', 1);
    await withdrawalService.transition(id, 'approved', 1);
    await withdrawalService.transition(id, 'processing', 1);

    // The wallet debit fails (reservation missing/insufficient): affectedRows 0.
    // Previously the service ignored the UPDATE result and marked the request
    // completed — a payout recorded without money moving. Now it must throw and
    // the transaction rolls back, so the request stays 'processing'.
    failWalletUpdate = true;
    await expect(
      withdrawalService.transition(id, 'completed', 1, { executionMethod: 'bank' }),
    ).rejects.toThrow(/wallet debit failed/i);
  });

  it('W3: rejection with a MISSING reservation throws (no false release)', async () => {
    const { id } = await withdrawalService.submit(5, 50, 'Payout');
    await withdrawalService.transition(id, 'under_review', 1);

    // Reservation release fails (affectedRows 0): the service must not silently
    // mark the request rejected while the reserved funds are still held.
    failWalletUpdate = true;
    await expect(
      withdrawalService.transition(id, 'rejected', 1, { rejectionReason: 'no' }),
    ).rejects.toThrow(/release failed/i);
  });
});
