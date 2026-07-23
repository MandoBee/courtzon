import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';

const log = createModuleLogger('organisations');

import { getPool } from '../../../database/mysql.js';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export interface UpdateOrgStatusPayload {
  organisationId: number;
  status: string;
  actorId?: number;
}

export interface UpdateOrgStatusResult {
  organisationId: number;
  status: string;
}

export const updateOrgStatusHandler: CommandHandler<Command, UpdateOrgStatusResult> = {
  validate: async (command) => {
    const p = command.payload as unknown as UpdateOrgStatusPayload;
    if (!p.organisationId || p.organisationId <= 0) throw new Error('organisationId is required');
    if (!p.status) throw new Error('status is required');
  },
  execute: async (command, _conn: PoolConnection) => {
    const p = command.payload as unknown as UpdateOrgStatusPayload;
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT id, is_active FROM organisations WHERE id = ?', [p.organisationId]);
    if (!rows.length) throw new NotFoundError('Organisation');

    await pool.execute<ResultSetHeader>('UPDATE organisations SET is_active = ?, updated_at = NOW() WHERE id = ?', [p.status === 'active' ? 1 : 0, p.organisationId]);
    log.info({ organisationId: p.organisationId, status: p.status }, 'org.status_updated');
    return { organisationId: p.organisationId, status: p.status };
  },
  events: (command, result) => [{
    eventName: `organisation.${result.status}`,
    payload: { organisationId: result.organisationId, status: result.status },
    context: {
      aggregateType: 'organisation',
      aggregateId: String(result.organisationId),
      aggregateVersion: 1,
      correlationId: command.correlationId,
      causationId: command.commandId,
    },
  }],
};
