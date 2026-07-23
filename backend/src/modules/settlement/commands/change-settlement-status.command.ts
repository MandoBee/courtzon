import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { settlementRepository } from '../infrastructure/repositories/settlement.repository.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { planTransition, isTerminal } from '../domain/settlement-aggregate.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';
import type { SettlementStatus } from '../domain/settlement-aggregate.js';

const log = createModuleLogger('settlement');

export interface ChangeSettlementStatusPayload {
  settlementId: number;
  toStatus: SettlementStatus;
  reason?: string;
  extra?: Record<string, unknown>;
}

export interface ChangeSettlementStatusResult {
  settlementId: number;
  aggregateVersion?: number;
  status: SettlementStatus;
}

export const changeSettlementStatusHandler: CommandHandler<Command, ChangeSettlementStatusResult> = {

  validate: async (command) => {
    const p = command.payload as unknown as ChangeSettlementStatusPayload;
    if (!p.settlementId || p.settlementId <= 0) throw new Error('settlementId is required and must be positive');
    if (!p.toStatus) throw new Error('toStatus is required');
  },

  execute: async (command, conn: PoolConnection) => {
    const p = command.payload as unknown as ChangeSettlementStatusPayload;
    const settlement = await settlementRepository.findSettlementById(p.settlementId, conn);
    if (!settlement) throw new NotFoundError('Settlement');

    if (isTerminal(settlement.settlement_status as SettlementStatus)) {
      log.warn({ settlementId: p.settlementId, status: settlement.settlement_status }, 'settlement.already_terminal');
      return { settlementId: p.settlementId, status: settlement.settlement_status as SettlementStatus };
    }

    if (settlement.settlement_status === p.toStatus) {
      log.warn({ settlementId: p.settlementId, status: p.toStatus }, 'settlement.already_in_status');
      return { settlementId: p.settlementId, status: p.toStatus };
    }

    const transition = planTransition({
      fromStatus: settlement.settlement_status as SettlementStatus,
      toStatus: p.toStatus,
      currentVersion: settlement.aggregate_version || 1,
    });

    const extra: Record<string, any> = { ...(p.extra || {}) };
    if (p.reason) {
      extra.rejected_reason = p.reason;
    }

    await settlementRepository.persistTransition(p.settlementId, p.toStatus, settlement.aggregate_version || 1, extra, conn);
    log.info({ settlementId: p.settlementId, status: p.toStatus, version: transition.newVersion }, 'settlement.status_changed');
    return { settlementId: p.settlementId, aggregateVersion: transition.newVersion, status: p.toStatus };
  },

  events: (command, result) => {
    const p = command.payload as unknown as ChangeSettlementStatusPayload;
    const eventName = p.toStatus === 'completed' ? 'settlement.completed'
      : p.toStatus === 'rejected' || p.toStatus === 'cancelled' ? 'settlement.failed'
      : `settlement.${p.toStatus}`;
    return [{
      eventName,
      payload: {
        settlementId: result.settlementId,
        status: result.status,
        aggregateVersion: result.aggregateVersion,
        reason: p.reason || null,
      },
      context: {
        aggregateType: 'settlement',
        aggregateId: String(result.settlementId),
        aggregateVersion: result.aggregateVersion || 1,
        correlationId: command.correlationId,
        causationId: command.commandId,
      },
    }];
  },
};
