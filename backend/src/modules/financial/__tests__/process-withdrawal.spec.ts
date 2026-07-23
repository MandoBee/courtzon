import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processWithdrawalHandler } from '../commands/process-withdrawal.command.js';
import type { Command } from '../../../shared/command/command-base.js';

const mockExecute = vi.fn();

vi.mock('../../../database/mysql.js', () => ({
  getPool: vi.fn(() => ({ execute: mockExecute })),
}));

function makeCommand(overrides: Record<string, unknown> = {}): Command {
  return {
    commandId: 'fin-test-1',
    commandType: 'ProcessWithdrawal',
    aggregateType: 'withdrawal',
    aggregateId: '1',
    payload: { withdrawalId: 1, toStatus: 'approved', ...overrides },
    correlationId: 'corr-1',
  };
}

describe('ProcessWithdrawal command', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('validates a valid command', async () => {
    await expect(processWithdrawalHandler.validate(makeCommand())).resolves.not.toThrow();
  });

  it('rejects missing withdrawalId', async () => {
    await expect(processWithdrawalHandler.validate(makeCommand({ withdrawalId: 0 }))).rejects.toThrow('withdrawalId is required');
  });

  it('transitions pending → approved', async () => {
    mockExecute
      .mockResolvedValueOnce([[{ id: 1, status: 'pending' }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await processWithdrawalHandler.execute(makeCommand(), {} as any);
    expect(result.status).toBe('approved');
  });

  it('throws NotFoundError for unknown withdrawal', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);
    await expect(processWithdrawalHandler.execute(makeCommand(), {} as any)).rejects.toThrow();
  });
});
