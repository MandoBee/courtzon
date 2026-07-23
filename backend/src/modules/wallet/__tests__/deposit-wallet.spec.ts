import { describe, it, expect, vi, beforeEach } from 'vitest';
import { depositWalletHandler } from '../commands/deposit-wallet.command.js';
import type { Command } from '../../../shared/command/command-base.js';

const mockWallet = {
  id: 1, user_id: 1, balance: '100.00', currency_code: 'EGP',
  is_locked: false, aggregate_version: 1,
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
    commandId: 'test-cmd-1',
    commandType: 'DepositWallet',
    aggregateType: 'wallet',
    aggregateId: '1',
    payload: { walletId: 1, userId: 1, amount: 50, ...overrides },
    correlationId: 'corr-1',
  };
}

describe('DepositWallet command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates a valid command', async () => {
    await expect(depositWalletHandler.validate(makeCommand())).resolves.not.toThrow();
  });

  it('rejects missing walletId', async () => {
    await expect(depositWalletHandler.validate(makeCommand({ walletId: 0 }))).rejects.toThrow('walletId is required');
  });

  it('rejects missing userId', async () => {
    await expect(depositWalletHandler.validate(makeCommand({ userId: 0 }))).rejects.toThrow('userId is required');
  });

  it('rejects zero amount', async () => {
    await expect(depositWalletHandler.validate(makeCommand({ amount: 0 }))).rejects.toThrow('amount must be positive');
  });

  it('executes deposit and updates balance', async () => {
    vi.mocked(walletRepository.findById).mockResolvedValue(mockWallet);
    vi.mocked(walletRepository.persistBalanceUpdate).mockResolvedValue(undefined);

    const result = await depositWalletHandler.execute(makeCommand(), {} as any);

    expect(result.walletId).toBe(1);
    expect(result.newBalance).toBe(150);
    expect(result.aggregateVersion).toBe(2);
    expect(walletRepository.persistBalanceUpdate).toHaveBeenCalledWith(1, 150, 1, expect.anything());
  });

  it('throws NotFoundError for unknown wallet', async () => {
    vi.mocked(walletRepository.findById).mockResolvedValue(null);
    await expect(depositWalletHandler.execute(makeCommand(), {} as any)).rejects.toThrow();
  });

  it('emits wallet.deposited event on success', () => {
    const command = makeCommand();
    const result = { walletId: 1, userId: 1, newBalance: 150, aggregateVersion: 2 };
    const events = depositWalletHandler.events!(command, result);

    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('wallet.deposited');
    expect(events[0].payload).toMatchObject({
      walletId: 1, userId: 1, amount: 50, balance: 150, aggregateVersion: 2,
    });
    expect(events[0].context).toMatchObject({
      aggregateType: 'wallet', aggregateId: '1', aggregateVersion: 2,
    });
  });
});
