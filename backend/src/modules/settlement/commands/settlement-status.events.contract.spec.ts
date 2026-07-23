import { describe, it, expect, vi } from 'vitest';
import { changeSettlementStatusHandler } from './change-settlement-status.command.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/settlement.repository.js', () => ({
  AggregateVersionConflict: class extends Error {},
  settlementRepository: { findSettlementById: vi.fn(), persistTransition: vi.fn() },
}));

describe('Event contract: settlement status change', () => {
  it('emits correct event name for approved', () => {
    const events = changeSettlementStatusHandler.events!(
      { commandId: 'ec1', commandType: 'ChangeSettlementStatus', aggregateType: 'settlement', aggregateId: '1', payload: { settlementId: 1, toStatus: 'approved' } } as Command,
      { settlementId: 1, aggregateVersion: 2, status: 'approved' },
    );
    expect(events[0].eventName).toBe('settlement.approved');
  });

  it('contains required payload fields for approved', () => {
    const events = changeSettlementStatusHandler.events!(
      { commandId: 'ec2', commandType: 'ChangeSettlementStatus', aggregateType: 'settlement', aggregateId: '1', payload: { settlementId: 1, toStatus: 'approved' } } as Command,
      { settlementId: 1, aggregateVersion: 2, status: 'approved' },
    );
    expect(events[0].payload).toHaveProperty('settlementId');
    expect(events[0].payload).toHaveProperty('status', 'approved');
    expect(events[0].payload).toHaveProperty('aggregateVersion', 2);
  });

  it('contains required context fields', () => {
    const events = changeSettlementStatusHandler.events!(
      { commandId: 'ec3', commandType: 'ChangeSettlementStatus', aggregateType: 'settlement', aggregateId: '1', payload: { settlementId: 1, toStatus: 'approved' }, correlationId: 'corr-1' } as Command,
      { settlementId: 1, aggregateVersion: 2, status: 'approved' },
    );
    expect(events[0].context).toHaveProperty('aggregateType', 'settlement');
    expect(events[0].context).toHaveProperty('aggregateId', '1');
    expect(events[0].context).toHaveProperty('aggregateVersion', 2);
    expect(events[0].context).toHaveProperty('correlationId', 'corr-1');
  });
});
