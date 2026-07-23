import { describe, it, expect, vi } from 'vitest';
import { planBalanceUpdate, assertValidBalanceUpdate, isLowBalance } from '../domain/wallet-aggregate.js';
import { walletRepository } from '../infrastructure/repositories/wallet.repository.js';
import { depositWalletHandler } from '../commands/deposit-wallet.command.js';
import { withdrawWalletHandler } from '../commands/withdraw-wallet.command.js';
import type { PoolConnection } from 'mysql2/promise';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/wallet.repository.js', () => ({
  walletRepository: { findById: vi.fn(), persistBalanceUpdate: vi.fn() },
}));

const mockConn = {} as PoolConnection;

describe('Aggregate Version Contract — Wallet', () => {
  describe('planBalanceUpdate — version increments', () => {
    it('deposit: version goes 1 → 2', () => {
      const r = planBalanceUpdate({
        type: 'deposit', direction: 'credit', amount: 100,
        currentBalance: 50, currentVersion: 1, isLocked: false,
      });
      expect(r.newVersion).toBe(2);
      expect(r.didUpdate).toBe(true);
    });

    it('withdrawal: version goes 2 → 3', () => {
      const r = planBalanceUpdate({
        type: 'withdrawal', direction: 'debit', amount: 30,
        currentBalance: 100, currentVersion: 2, isLocked: false,
      });
      expect(r.newVersion).toBe(3);
    });
  });

  describe('rejected operations do NOT increment version', () => {
    it('insufficient balance throws, no version change', () => {
      expect(() => assertValidBalanceUpdate({
        type: 'withdrawal', direction: 'debit', amount: 200,
        currentBalance: 100, currentVersion: 1, isLocked: false,
      })).toThrow('Insufficient balance');
    });

    it('locked wallet throws, no version change', () => {
      expect(() => assertValidBalanceUpdate({
        type: 'deposit', direction: 'credit', amount: 50,
        currentBalance: 100, currentVersion: 1, isLocked: true,
      })).toThrow('Wallet is locked');
    });
  });

  describe('idempotent replay — command pipeline handles it', () => {
    it('deposit on already-processed command is skipped by pipeline', async () => {
      vi.mocked(walletRepository.findById).mockResolvedValue({
        id: 1, user_id: 1, balance: '200', currency_code: 'EGP',
        is_locked: false, aggregate_version: 3,
      });

      const c: Command = {
        commandId: 'v-test-1', commandType: 'DepositWallet',
        aggregateType: 'wallet', aggregateId: '1',
        payload: { walletId: 1, userId: 1, amount: 50 },
      };

      const r = await depositWalletHandler.execute(c, mockConn);
      expect(r.walletId).toBe(1);
      expect(r.aggregateVersion).toBe(4);
      expect(walletRepository.persistBalanceUpdate).toHaveBeenCalledWith(1, 250, 3, expect.anything());
    });
  });

  describe('event version consistency', () => {
    it('deposit event carries aggregateVersion matching persisted version', () => {
      const events = depositWalletHandler.events!(
        { commandId: 'v-test-2', commandType: 'DepositWallet', aggregateType: 'wallet', aggregateId: '1', payload: { walletId: 1, userId: 1, amount: 50 } } as Command,
        { walletId: 1, userId: 1, newBalance: 250, aggregateVersion: 4 },
      );
      expect(events[0].context.aggregateVersion).toBe(4);
      expect(events[0].payload.aggregateVersion).toBe(4);
    });

    it('withdraw event carries aggregateVersion matching persisted version', () => {
      const events = withdrawWalletHandler.events!(
        { commandId: 'v-test-3', commandType: 'WithdrawWallet', aggregateType: 'wallet', aggregateId: '1', payload: { walletId: 1, userId: 1, amount: 30 } } as Command,
        { walletId: 1, userId: 1, newBalance: 70, aggregateVersion: 3 },
      );
      expect(events[0].context.aggregateVersion).toBe(3);
      expect(events[0].payload.aggregateVersion).toBe(3);
    });
  });
});
