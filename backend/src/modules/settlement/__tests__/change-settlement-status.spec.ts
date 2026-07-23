import { describe, it, expect, vi, beforeEach } from 'vitest';
import { changeSettlementStatusHandler } from '../commands/change-settlement-status.command.js';
import type { Command } from '../../../shared/command/command-base.js';

const mockSettlement = {
  id: 1, organisation_id: 1, settlement_status: 'pending_approval',
  aggregate_version: 1,
};

vi.mock('../infrastructure/repositories/settlement.repository.js', () => ({
  AggregateVersionConflict: class extends Error {},
  settlementRepository: {
    findSettlementById: vi.fn(),
    persistTransition: vi.fn(),
  },
}));

const { settlementRepository } = await import('../infrastructure/repositories/settlement.repository.js');

function makeCommand(toStatus: string, overrides: Record<string, unknown> = {}): Command {
  return {
    commandId: 'settlement-test-1',
    commandType: 'ChangeSettlementStatus',
    aggregateType: 'settlement',
    aggregateId: '1',
    payload: { settlementId: 1, toStatus, ...overrides },
    correlationId: 'corr-1',
  };
}

describe('ChangeSettlementStatus command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates a valid command', async () => {
    await expect(changeSettlementStatusHandler.validate(makeCommand('approved'))).resolves.not.toThrow();
  });

  it('rejects missing settlementId', async () => {
    await expect(changeSettlementStatusHandler.validate(makeCommand('approved', { settlementId: 0 }))).rejects.toThrow('settlementId is required');
  });

  it('rejects missing toStatus', async () => {
    await expect(changeSettlementStatusHandler.validate(makeCommand(''))).rejects.toThrow('toStatus is required');
  });

  it('approves a pending_approval settlement', async () => {
    vi.mocked(settlementRepository.findSettlementById).mockResolvedValue(mockSettlement);
    vi.mocked(settlementRepository.persistTransition).mockResolvedValue(undefined);

    const result = await changeSettlementStatusHandler.execute(makeCommand('approved'), {} as any);

    expect(result.settlementId).toBe(1);
    expect(result.status).toBe('approved');
    expect(result.aggregateVersion).toBe(2);
    expect(settlementRepository.persistTransition).toHaveBeenCalledWith(1, 'approved', 1, {}, expect.anything());
  });

  it('skips if already in target status', async () => {
    vi.mocked(settlementRepository.findSettlementById).mockResolvedValue({ ...mockSettlement, settlement_status: 'approved' });

    const result = await changeSettlementStatusHandler.execute(makeCommand('approved'), {} as any);

    expect(result.aggregateVersion).toBeUndefined();
    expect(settlementRepository.persistTransition).not.toHaveBeenCalled();
  });

  it('throws NotFoundError for unknown settlement', async () => {
    vi.mocked(settlementRepository.findSettlementById).mockResolvedValue(null);
    await expect(changeSettlementStatusHandler.execute(makeCommand('approved'), {} as any)).rejects.toThrow();
  });

  it('rejects invalid transition', async () => {
    vi.mocked(settlementRepository.findSettlementById).mockResolvedValue(mockSettlement);
    await expect(changeSettlementStatusHandler.execute(makeCommand('completed'), {} as any)).rejects.toThrow('Illegal settlement state transition');
  });

  it('emits settlement event on success', () => {
    const command = makeCommand('approved');
    const result = { settlementId: 1, aggregateVersion: 2, status: 'approved' as const };
    const events = changeSettlementStatusHandler.events!(command, result);

    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('settlement.approved');
    expect(events[0].payload).toMatchObject({ settlementId: 1, status: 'approved', aggregateVersion: 2 });
    expect(events[0].context).toMatchObject({ aggregateType: 'settlement', aggregateId: '1' });
  });

  it('emits settlement.completed for completed status', () => {
    const command = makeCommand('completed');
    const result = { settlementId: 1, aggregateVersion: 3, status: 'completed' as const };
    const events = changeSettlementStatusHandler.events!(command, result);
    expect(events[0].eventName).toBe('settlement.completed');
  });

  it('emits settlement.failed for rejected status', () => {
    const command = makeCommand('rejected', { reason: 'Test reject' });
    const result = { settlementId: 1, aggregateVersion: 2, status: 'rejected' as const };
    const events = changeSettlementStatusHandler.events!(command, result);
    expect(events[0].eventName).toBe('settlement.failed');
    expect(events[0].payload).toHaveProperty('reason', 'Test reject');
  });
});
