import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withdrawWalletHandler } from '../commands/withdraw-wallet.command.js';
import type { Command } from '../../../shared/command/command-base.js';

const mockWallet = {
  id: 1, user_id: 1, balance: '200.00', currency_code: 'EGP',
  is_locked: false, aggregate_version: 2,
};

vi.mock('../infrastructure/repositories/wallet.repository.js', () => ({
  walletRepository: {
    findById: vi.fn(),
    persistBalanceUpdate: vi.fn(),
  },
}));

const { walletRepository } = await import('../infrastructure/repositories/wallet.repository.js');

function makeCommand(overrides: Record<string, unknown> = {}): Command {
  return {
    commandId: 'test-cmd-2',
    commandType: 'WithdrawWallet',
    aggregateType: 'wallet',
    aggregateId: '1',
    payload: { walletId: 1, userId: 1, amount: 50, ...overrides },
    correlationId: 'corr-2',
  };
}

describe('WithdrawWallet command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates a valid command', async () => {
    await expect(withdrawWalletHandler.validate(makeCommand())).resolves.not.toThrow();
  });

  it('rejects missing walletId', async () => {
    await expect(withdrawWalletHandler.validate(makeCommand({ walletId: 0 }))).rejects.toThrow('walletId is required');
  });

  it('rejects zero amount', async () => {
    await expect(withdrawWalletHandler.validate(makeCommand({ amount: 0 }))).rejects.toThrow('amount must be positive');
  });

  it('executes withdrawal and decreases balance', async () => {
    vi.mocked(walletRepository.findById).mockResolvedValue(mockWallet);
    vi.mocked(walletRepository.persistBalanceUpdate).mockResolvedValue(undefined);

    const result = await withdrawWalletHandler.execute(makeCommand(), {} as any);

    expect(result.walletId).toBe(1);
    expect(result.newBalance).toBe(150);
    expect(result.aggregateVersion).toBe(3);
    expect(walletRepository.persistBalanceUpdate).toHaveBeenCalledWith(1, 150, 2, expect.anything());
  });

  it('rejects withdrawal exceeding balance', async () => {
    vi.mocked(walletRepository.findById).mockResolvedValue(mockWallet);
    await expect(withdrawWalletHandler.execute(makeCommand({ amount: 999 }), {} as any)).rejects.toThrow('Insufficient balance');
  });

  it('throws NotFoundError for unknown wallet', async () => {
    vi.mocked(walletRepository.findById).mockResolvedValue(null);
    await expect(withdrawWalletHandler.execute(makeCommand(), {} as any)).rejects.toThrow();
  });

  it('emits wallet.withdrawn event on success', () => {
    const command = makeCommand();
    const result = { walletId: 1, userId: 1, newBalance: 150, aggregateVersion: 3 };
    const events = withdrawWalletHandler.events!(command, result);

    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('wallet.withdrawn');
    expect(events[0].payload).toMatchObject({
      walletId: 1, userId: 1, amount: 50, balance: 150, aggregateVersion: 3,
    });
    expect(events[0].context).toMatchObject({
      aggregateType: 'wallet', aggregateId: '1', aggregateVersion: 3,
    });
  });
});
