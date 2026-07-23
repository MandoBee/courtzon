import { describe, it, expect, vi } from 'vitest';
import { depositWalletHandler } from './deposit-wallet.command.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/wallet.repository.js', () => ({
  walletRepository: { findById: vi.fn(), persistBalanceUpdate: vi.fn() },
}));

function makeCommand(): Command {
  return {
    commandId: 'contract-test-1',
    commandType: 'DepositWallet',
    aggregateType: 'wallet',
    aggregateId: '1',
    payload: { walletId: 1, userId: 1, amount: 50, currency: 'EGP' },
    correlationId: 'corr-1',
    causationId: 'cause-1',
    actorId: 1,
  };
}

describe('Event contract: wallet.deposited', () => {
  const command = makeCommand();
  const result = { walletId: 1, userId: 1, newBalance: 150, aggregateVersion: 2 };
  const events = depositWalletHandler.events!(command, result);
  const event = events[0];

  it('emits event with correct name', () => {
    expect(event.eventName).toBe('wallet.deposited');
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
    expect(event.context).toHaveProperty('aggregateVersion', 2);
  });

  it('includes tracing metadata', () => {
    expect(event.context).toHaveProperty('correlationId', 'corr-1');
    expect(event.context).toHaveProperty('causationId', 'contract-test-1');
  });

  it('maintains schema stability', () => {
    const payload = event.payload;
    expect(Object.keys(payload)).toEqual(
      expect.arrayContaining(['walletId', 'userId', 'amount', 'balance', 'aggregateVersion']),
    );
  });
});
