import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { planWithdrawalTransition } from '../domain/financial-aggregate.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';
import type { WithdrawalStatus } from '../domain/financial-aggregate.js';

const log = createModuleLogger('financial');

export interface ProcessWithdrawalPayload {
  withdrawalId: number;
  toStatus: WithdrawalStatus;
  notes?: string;
  actorId?: number;
}

export interface ProcessWithdrawalResult {
  withdrawalId: number;
  status: WithdrawalStatus;
}

import { getPool } from '../../../database/mysql.js';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export const processWithdrawalHandler: CommandHandler<Command, ProcessWithdrawalResult> = {

  validate: async (command) => {
    const p = command.payload as unknown as ProcessWithdrawalPayload;
    if (!p.withdrawalId || p.withdrawalId <= 0) throw new Error('withdrawalId is required');
    if (!p.toStatus) throw new Error('toStatus is required');
  },

  execute: async (command, _conn: PoolConnection) => {
    const p = command.payload as unknown as ProcessWithdrawalPayload;
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, status FROM withdrawal_requests WHERE id = ?',
      [p.withdrawalId],
    );
    if (!rows.length) throw new NotFoundError('Withdrawal request');

    const current = rows[0].status as WithdrawalStatus;
    if (current === p.toStatus) {
      log.warn({ withdrawalId: p.withdrawalId, status: p.toStatus }, 'withdrawal.already_in_status');
      return { withdrawalId: p.withdrawalId, status: p.toStatus };
    }

    const transition = planWithdrawalTransition(current, p.toStatus, 1);
    await pool.execute<ResultSetHeader>(
      `UPDATE withdrawal_requests SET status = ?, admin_notes = COALESCE(?, admin_notes), reviewed_at = NOW() WHERE id = ? AND status = ?`,
      [p.toStatus, p.notes || null, p.withdrawalId, current],
    );

    log.info({ withdrawalId: p.withdrawalId, status: p.toStatus, version: transition.newVersion }, 'withdrawal.processed');
    return { withdrawalId: p.withdrawalId, status: p.toStatus };
  },

  events: (command, result) => [{
    eventName: `withdrawal.${result.status}`,
    payload: { withdrawalId: result.withdrawalId, status: result.status },
    context: {
      aggregateType: 'withdrawal',
      aggregateId: String(result.withdrawalId),
      aggregateVersion: 1,
      correlationId: command.correlationId,
      causationId: command.commandId,
    },
  }],
};
