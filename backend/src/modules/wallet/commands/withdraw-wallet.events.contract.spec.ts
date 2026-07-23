import { describe, it, expect, vi } from 'vitest';
import { withdrawWalletHandler } from './withdraw-wallet.command.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/wallet.repository.js', () => ({
  walletRepository: { findById: vi.fn(), persistBalanceUpdate: vi.fn() },
}));

function makeCommand(): Command {
  return {
    commandId: 'contract-test-2',
    commandType: 'WithdrawWallet',
    aggregateType: 'wallet',
    aggregateId: '1',
    payload: { walletId: 1, userId: 1, amount: 30, description: 'test withdrawal' },
    correlationId: 'corr-2',
    causationId: 'cause-2',
    actorId: 1,
  };
}

describe('Event contract: wallet.withdrawn', () => {
  const command = makeCommand();
  const result = { walletId: 1, userId: 1, newBalance: 70, aggregateVersion: 3 };
  const events = withdrawWalletHandler.events!(command, result);
  const event = events[0];

  it('emits event with correct name', () => {
    expect(event.eventName).toBe('wallet.withdrawn');
  });

  it('contains required payload fields', () => {
    expect(event.payload).toHaveProperty('walletId');
    expect(event.payload).toHaveProperty('userId');
    expect(event.payload).toHaveProperty('amount');
    expect(event.payload).toHaveProperty('balance');
    expect(event.payload).toHaveProperty('aggregateVersion');
  });

  it('contains required context fields', () => {
    expect(event.context).toHaveProperty('aggregateType', 'wallet');
    expect(event.context).toHaveProperty('aggregateId', '1');
    expect(event.context).toHaveProperty('aggregateVersion', 3);
  });

  it('includes tracing metadata', () => {
    expect(event.context).toHaveProperty('correlationId', 'corr-2');
    expect(event.context).toHaveProperty('causationId', 'contract-test-2');
  });

  it('maintains schema stability', () => {
    const payload = event.payload;
    expect(Object.keys(payload)).toEqual(
      expect.arrayContaining(['walletId', 'userId', 'amount', 'balance', 'aggregateVersion']),
    );
  });
});
