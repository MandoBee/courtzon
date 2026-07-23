import { describe, it, expect } from 'vitest';
import { assertValidBalanceUpdate, planBalanceUpdate, isLowBalance } from '../domain/wallet-aggregate.js';

describe('WalletAggregate — balance operations', () => {

  describe('assertValidBalanceUpdate', () => {
    it('allows valid credit (deposit)', () => {
      expect(() => assertValidBalanceUpdate({
        type: 'deposit', direction: 'credit', amount: 100,
        currentBalance: 50, currentVersion: 1, isLocked: false,
      })).not.toThrow();
    });

    it('allows valid debit (withdrawal) with sufficient balance', () => {
      expect(() => assertValidBalanceUpdate({
        type: 'withdrawal', direction: 'debit', amount: 30,
        currentBalance: 100, currentVersion: 1, isLocked: false,
      })).not.toThrow();
    });

    it('rejects zero amount', () => {
      expect(() => assertValidBalanceUpdate({
        type: 'deposit', direction: 'credit', amount: 0,
        currentBalance: 50, currentVersion: 1, isLocked: false,
      })).toThrow('Transaction amount must be positive');
    });

    it('rejects negative amount', () => {
      expect(() => assertValidBalanceUpdate({
        type: 'deposit', direction: 'credit', amount: -10,
        currentBalance: 50, currentVersion: 1, isLocked: false,
      })).toThrow('Transaction amount must be positive');
    });

    it('rejects debit exceeding balance', () => {
      expect(() => assertValidBalanceUpdate({
        type: 'withdrawal', direction: 'debit', amount: 200,
        currentBalance: 100, currentVersion: 1, isLocked: false,
      })).toThrow('Insufficient balance');
    });

    it('rejects operation on locked wallet', () => {
      expect(() => assertValidBalanceUpdate({
        type: 'deposit', direction: 'credit', amount: 50,
        currentBalance: 100, currentVersion: 1, isLocked: true,
      })).toThrow('Wallet is locked');
    });
  });

  describe('planBalanceUpdate', () => {
    it('increments version for credit', () => {
      const result = planBalanceUpdate({
        type: 'deposit', direction: 'credit', amount: 50,
        currentBalance: 100, currentVersion: 1, isLocked: false,
      });
      expect(result.newBalance).toBe(150);
      expect(result.newVersion).toBe(2);
      expect(result.didUpdate).toBe(true);
    });

    it('decrements balance for debit', () => {
      const result = planBalanceUpdate({
        type: 'withdrawal', direction: 'debit', amount: 30,
        currentBalance: 100, currentVersion: 2, isLocked: false,
      });
      expect(result.newBalance).toBe(70);
      expect(result.newVersion).toBe(3);
    });

    it('increments version regardless of direction', () => {
      const credit = planBalanceUpdate({
        type: 'deposit', direction: 'credit', amount: 10,
        currentBalance: 0, currentVersion: 1, isLocked: false,
      });
      const debit = planBalanceUpdate({
        type: 'withdrawal', direction: 'debit', amount: 10,
        currentBalance: 100, currentVersion: 1, isLocked: false,
      });
      expect(credit.newVersion).toBe(2);
      expect(debit.newVersion).toBe(2);
    });
  });

  describe('isLowBalance', () => {
    it('returns true when balance is below threshold', () => {
      expect(isLowBalance(30)).toBe(true);
    });

    it('returns false when balance equals threshold', () => {
      expect(isLowBalance(50)).toBe(false);
    });

    it('returns false when balance is above threshold', () => {
      expect(isLowBalance(100)).toBe(false);
    });

    it('allows custom threshold', () => {
      expect(isLowBalance(500, 1000)).toBe(true);
      expect(isLowBalance(1500, 1000)).toBe(false);
    });
  });
});
