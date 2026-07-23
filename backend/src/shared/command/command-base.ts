import type { PoolConnection } from 'mysql2/promise';
import type { EnvelopeContext } from '../event-bus/event-envelope.js';

export interface Command {
  commandId: string;
  commandType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  actorId?: number;
  correlationId?: string;
  causationId?: string;
  metadata?: Record<string, unknown>;
}

export interface CommandHandler<TCommand extends Command, TResult> {
  validate(command: TCommand): Promise<void>;
  authorize?(command: TCommand): Promise<void>;
  execute(command: TCommand, conn: PoolConnection): Promise<TResult>;
  events?(command: TCommand, result: TResult): CommandEvent[];
}

export interface CommandEvent {
  eventName: string;
  payload: Record<string, unknown>;
  context: EnvelopeContext;
}

export interface CommandResult<TResult> {
  status: 'processed' | 'skipped';
  data?: TResult;
  reason?: string;
}

export interface CommandError {
  status: 'error';
  code: string;
  message: string;
  details?: unknown;
}
