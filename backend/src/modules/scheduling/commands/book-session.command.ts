import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';

const log = createModuleLogger('scheduling');

export interface BookSessionPayload {
  coachId: number;
  userId: number;
  resourceId: number;
  date: string;
  startTime: string;
  endTime: string;
  branchId: number;
  organisationId: number;
}

export interface BookSessionResult {
  bookingId: number;
  sessionId: number;
}

export const bookSessionHandler: CommandHandler<Command, BookSessionResult> = {

  validate: async (command) => {
    const p = command.payload as unknown as BookSessionPayload;
    if (!p.coachId || p.coachId <= 0) throw new Error('coachId is required');
    if (!p.userId || p.userId <= 0) throw new Error('userId is required');
    if (!p.resourceId || p.resourceId <= 0) throw new Error('resourceId is required');
    if (!p.date) throw new Error('date is required');
    if (!p.startTime || !p.endTime) throw new Error('startTime and endTime are required');
  },

  execute: async (command, _conn: PoolConnection) => {
    const p = command.payload as unknown as BookSessionPayload;
    log.info({ coachId: p.coachId, userId: p.userId, date: p.date }, 'session.book_initiated');
    return { bookingId: 0, sessionId: 0 };
  },

  events: (command, result) => [{
    eventName: 'session.booked',
    payload: { bookingId: result.bookingId, sessionId: result.sessionId },
    context: {
      aggregateType: 'session',
      aggregateId: String(result.sessionId),
      aggregateVersion: 1,
      correlationId: command.correlationId,
      causationId: command.commandId,
    },
  }],
};
