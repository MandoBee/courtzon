import { describe, it, expect, vi } from 'vitest';
import { processWithdrawalHandler } from './process-withdrawal.command.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../../../database/mysql.js', () => ({
  getPool: vi.fn(() => ({ execute: vi.fn() })),
}));

describe('Event contract: withdrawal status', () => {
  it('emits withdrawal.approved for approved status', () => {
    const events = processWithdrawalHandler.events!(
      { commandId: 'ec1', commandType: 'ProcessWithdrawal', aggregateType: 'withdrawal', aggregateId: '1', payload: { withdrawalId: 1, toStatus: 'approved' } } as Command,
      { withdrawalId: 1, status: 'approved' },
    );
    expect(events[0].eventName).toBe('withdrawal.approved');
  });

  it('contains required payload and context', () => {
    const events = processWithdrawalHandler.events!(
      { commandId: 'ec2', commandType: 'ProcessWithdrawal', aggregateType: 'withdrawal', aggregateId: '1', payload: { withdrawalId: 1, toStatus: 'rejected' }, correlationId: 'corr-1' } as Command,
      { withdrawalId: 1, status: 'rejected' },
    );
    expect(events[0].payload).toHaveProperty('withdrawalId', 1);
    expect(events[0].context).toHaveProperty('aggregateType', 'withdrawal');
  });
});
