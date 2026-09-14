import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { assertValidActivityTransition } from '../domain/activities-aggregate.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';
import type { ActivityStatus } from '../domain/activities-aggregate.js';

const log = createModuleLogger('activities');

import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export interface UpdateActivityStatusPayload {
  activityId: number;
  status: ActivityStatus;
}

export interface UpdateActivityStatusResult {
  activityId: number;
  status: ActivityStatus;
}

export const updateActivityStatusHandler: CommandHandler<Command, UpdateActivityStatusResult> = {
  validate: async (command) => {
    const p = command.payload as unknown as UpdateActivityStatusPayload;
    if (!p.activityId || p.activityId <= 0) throw new Error('activityId is required');
    if (!p.status) throw new Error('status is required');
  },
  execute: async (command, conn: PoolConnection) => {
    const p = command.payload as unknown as UpdateActivityStatusPayload;
    const [rows] = await conn.execute<RowDataPacket[]>('SELECT id, status FROM activities WHERE id = ?', [p.activityId]);
    if (!rows.length) throw new NotFoundError('Activity');

    assertValidActivityTransition(rows[0].status as ActivityStatus, p.status);

    await conn.execute<ResultSetHeader>('UPDATE activities SET status = ?, updated_at = NOW() WHERE id = ?', [p.status, p.activityId]);
    log.info({ activityId: p.activityId, status: p.status }, 'activity.status_updated');
    return { activityId: p.activityId, status: p.status };
  },
  events: (command, result) => [{
    eventName: `activity.${result.status}`,
    payload: { activityId: result.activityId, status: result.status },
    context: {
      aggregateType: 'activity',
      aggregateId: String(result.activityId),
      aggregateVersion: 1,
      correlationId: command.correlationId,
      causationId: command.commandId,
    },
  }],
};
