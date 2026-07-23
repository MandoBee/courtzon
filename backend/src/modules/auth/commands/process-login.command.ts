import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';

const log = createModuleLogger('auth');

export interface ProcessLoginPayload {
  userId: number;
  ip: string;
  userAgent?: string;
}

export interface ProcessLoginResult {
  userId: number;
  success: boolean;
}

export const processLoginHandler: CommandHandler<Command, ProcessLoginResult> = {
  validate: async (command) => {
    const p = command.payload as unknown as ProcessLoginPayload;
    if (!p.userId || p.userId <= 0) throw new Error('userId is required');
  },
  execute: async (command, _conn: PoolConnection) => {
    const p = command.payload as unknown as ProcessLoginPayload;
    log.info({ userId: p.userId }, 'auth.login_processed');
    return { userId: p.userId, success: true };
  },
  events: (command, result) => [{
    eventName: 'auth.login_processed',
    payload: { userId: result.userId, success: result.success },
    context: {
      aggregateType: 'auth',
      aggregateId: String(result.userId),
      aggregateVersion: 1,
      correlationId: command.correlationId,
      causationId: command.commandId,
    },
  }],
};
