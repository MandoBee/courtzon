import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';

const log = createModuleLogger('match');

export interface UpdateMatchStatusPayload {
  matchId: number;
  status: string;
}

export interface UpdateMatchStatusResult {
  matchId: number;
  status: string;
}

import { getPool } from '../../../database/mysql.js';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export const updateMatchStatusHandler: CommandHandler<Command, UpdateMatchStatusResult> = {

  validate: async (command) => {
    const p = command.payload as unknown as UpdateMatchStatusPayload;
    if (!p.matchId || p.matchId <= 0) throw new Error('matchId is required');
    if (!p.status) throw new Error('status is required');
  },

  execute: async (command, _conn: PoolConnection) => {
    const p = command.payload as unknown as UpdateMatchStatusPayload;
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT id, status FROM matches WHERE id = ?', [p.matchId]);
    if (!rows.length) throw new NotFoundError('Match');

    await pool.execute<ResultSetHeader>('UPDATE matches SET status = ?, updated_at = NOW() WHERE id = ?', [p.status, p.matchId]);
    log.info({ matchId: p.matchId, status: p.status }, 'match.status_updated');
    return { matchId: p.matchId, status: p.status };
  },

  events: (command, result) => [{
    eventName: `match.status_${result.status}`,
    payload: { matchId: result.matchId, status: result.status },
    context: {
      aggregateType: 'match',
      aggregateId: String(result.matchId),
      aggregateVersion: 1,
      correlationId: command.correlationId,
      causationId: command.commandId,
    },
  }],
};
