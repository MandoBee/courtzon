import { describe, it, expect, vi, beforeEach } from 'vitest';
import { markSettlementPaidHandler } from '../commands/mark-settlement-paid.command.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/settlement.repository.js', () => ({
  AggregateVersionConflict: class extends Error {},
  settlementRepository: {
    findSettlementById: vi.fn(),
    persistTransition: vi.fn(),
    getBankAccount: vi.fn(),
  },
}));

vi.mock('../../financial/infrastructure/transaction.repository.js', () => ({
  transactionRepository: {
    createTransaction: vi.fn(),
    createEntries: vi.fn(),
  },
}));

const { settlementRepository } = await import('../infrastructure/repositories/settlement.repository.js');
const { transactionRepository } = await import('../../financial/infrastructure/transaction.repository.js');

const mockSettlement = {
  id: 1,
  organisation_id: 10,
  branch_id: 5,
  settlement_status: 'approved',
  aggregate_version: 1,
  final_amount: 100,
  settlement_direction: 'courtzon_to_org',
  online_net_total: 100,
  cod_fee_total: 0,
};

function makeCommand(overrides: Record<string, unknown> = {}): Command {
  return {
    commandId: 'mark-paid-1',
    commandType: 'MarkSettlementPaid',
    aggregateType: 'settlement',
    aggregateId: '1',
    payload: { settlementId: 1, ...overrides },
    correlationId: 'corr-1',
  };
}

const mockConn = { execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };

describe('MarkSettlementPaid command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(settlementRepository.findSettlementById).mockResolvedValue(mockSettlement);
    vi.mocked(settlementRepository.persistTransition).mockResolvedValue(undefined);
    vi.mocked(transactionRepository.createTransaction).mockResolvedValue(99);
    vi.mocked(transactionRepository.createEntries).mockResolvedValue(undefined);
    vi.mocked(settlementRepository.getBankAccount).mockResolvedValue(null);
  });

  it('validates a valid command', async () => {
    await expect(markSettlementPaidHandler.validate(makeCommand())).resolves.not.toThrow();
  });

  it('rejects missing settlementId', async () => {
    await expect(markSettlementPaidHandler.validate(makeCommand({ settlementId: 0 })))
      .rejects.toThrow('settlementId is required');
  });

  it('marks an approved settlement paid with optimistic locking', async () => {
    const result = await markSettlementPaidHandler.execute(makeCommand(), mockConn as any);

    expect(result.status).toBe('paid');
    expect(result.aggregateVersion).toBe(2);
    expect(result.amount).toBe(100);
    expect(result.direction).toBe('courtzon_to_org');
    expect(settlementRepository.persistTransition).toHaveBeenCalledWith(
      1, 'paid', 1, { paid_at: expect.any(Date) }, mockConn,
    );
  });

  it('creates exactly one payout transaction + entries for courtzon_to_org', async () => {
    await markSettlementPaidHandler.execute(makeCommand(), mockConn as any);

    expect(transactionRepository.createTransaction).toHaveBeenCalledTimes(1);
    expect(transactionRepository.createTransaction).toHaveBeenCalledWith({
      type: 'payout',
      sourceType: 'settlement',
      sourceId: 1,
      totalAmount: 100,
      status: 'completed',
    }, mockConn);
    expect(transactionRepository.createEntries).toHaveBeenCalledTimes(1);
  });

  it('does not create a payout when final_amount is 0', async () => {
    vi.mocked(settlementRepository.findSettlementById).mockResolvedValue({
      ...mockSettlement, final_amount: 0, settlement_direction: 'courtzon_to_org',
    });

    const result = await markSettlementPaidHandler.execute(makeCommand(), mockConn as any);

    expect(transactionRepository.createTransaction).not.toHaveBeenCalled();
    expect(transactionRepository.createEntries).not.toHaveBeenCalled();
    expect(result.amount).toBe(0);
  });

  it('does not create a payout when direction is missing', async () => {
    vi.mocked(settlementRepository.findSettlementById).mockResolvedValue({
      ...mockSettlement, settlement_direction: null,
    });

    await markSettlementPaidHandler.execute(makeCommand(), mockConn as any);
    expect(transactionRepository.createTransaction).not.toHaveBeenCalled();
  });

  it('throws NotFoundError for an unknown settlement', async () => {
    vi.mocked(settlementRepository.findSettlementById).mockResolvedValue(null);
    await expect(markSettlementPaidHandler.execute(makeCommand(), mockConn as any)).rejects.toThrow();
  });

  it.each(['paid', 'rejected', 'cancelled', 'completed', 'pending_approval', 'requested'])(
    'throws ConflictError when status is %s',
    async (status) => {
      vi.mocked(settlementRepository.findSettlementById).mockResolvedValue({
        ...mockSettlement, settlement_status: status,
      });
      await expect(markSettlementPaidHandler.execute(makeCommand(), mockConn as any))
        .rejects.toThrow(`Cannot mark paid in status "${status}"`);
      expect(transactionRepository.createTransaction).not.toHaveBeenCalled();
      expect(settlementRepository.persistTransition).not.toHaveBeenCalled();
    },
  );

  it('emits settlement:paid with full component amounts', () => {
    const result = {
      settlementId: 1, aggregateVersion: 2, status: 'paid' as const,
      amount: 100, direction: 'courtzon_to_org' as const,
      onlineNet: 100, codFee: 0, organisationId: 10, currency: 'EGP',
    };
    const events = markSettlementPaidHandler.events!(makeCommand(), result);

    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('settlement:paid');
    expect(events[0].payload).toMatchObject({
      settlementId: 1, amount: 100, direction: 'courtzon_to_org', organisationId: 10,
      onlineNet: 100, codFee: 0,
    });
    expect(events[0].context).toMatchObject({ aggregateType: 'settlement', aggregateId: '1', aggregateVersion: 2 });
  });

  it('does not emit settlement:paid when amount is 0 or direction missing', () => {
    expect(markSettlementPaidHandler.events!(makeCommand(), {
      settlementId: 1, aggregateVersion: 2, status: 'paid', amount: 0,
      direction: 'courtzon_to_org', onlineNet: 0, codFee: 0, organisationId: 10, currency: 'EGP',
    })).toHaveLength(0);

    expect(markSettlementPaidHandler.events!(makeCommand(), {
      settlementId: 1, aggregateVersion: 2, status: 'paid', amount: 100,
      direction: null, onlineNet: 100, codFee: 0, organisationId: 10, currency: 'EGP',
    })).toHaveLength(0);
  });
});
