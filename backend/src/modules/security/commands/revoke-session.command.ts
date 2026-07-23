import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { securityRepository } from '../infrastructure/security.repository.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { canRevokeSession } from '../domain/security-aggregate.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';

const log = createModuleLogger('security');

export interface RevokeSessionPayload {
  sessionId: number;
  actorId?: number;
}

export interface RevokeSessionResult {
  sessionId: number;
  revoked: boolean;
}

export const revokeSessionHandler: CommandHandler<Command, RevokeSessionResult> = {

  validate: async (command) => {
    const p = command.payload as unknown as RevokeSessionPayload;
    if (!p.sessionId || p.sessionId <= 0) throw new Error('sessionId is required and must be positive');
  },

  execute: async (command, _conn: PoolConnection) => {
    const p = command.payload as unknown as RevokeSessionPayload;
    const session = await securityRepository.getSessionById(p.sessionId);
    if (!session) throw new NotFoundError('Session');

    if (!canRevokeSession(session)) {
      log.warn({ sessionId: p.sessionId }, 'session.already_revoked');
      return { sessionId: p.sessionId, revoked: false };
    }

    await securityRepository.revokeSession(p.sessionId);
    log.info({ sessionId: p.sessionId }, 'session.revoked');
    return { sessionId: p.sessionId, revoked: true };
  },

  events: (command, result) => [{
    eventName: 'session.revoked',
    payload: { sessionId: result.sessionId, revoked: result.revoked },
    context: {
      aggregateType: 'session',
      aggregateId: String(result.sessionId),
      aggregateVersion: 1,
      correlationId: command.correlationId,
      causationId: command.commandId,
    },
  }],
};
