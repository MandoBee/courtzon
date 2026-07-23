import type { PoolConnection } from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { auditLogRepository } from '../infrastructure/audit-log.repository.js';
import { createAuditEntry } from '../domain/audit-log-aggregate.js';
import type { Command, CommandHandler } from '../../../shared/command/command-base.js';

const log = createModuleLogger('audit');

export interface RecordAuditPayload {
  actorId: number | null;
  action: string;
  entityType: string;
  entityId?: number | string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RecordAuditResult {
  recorded: boolean;
}

export const recordAuditHandler: CommandHandler<Command, RecordAuditResult> = {

  validate: async (command) => {
    const p = command.payload as unknown as RecordAuditPayload;
    if (!p.action) throw new Error('action is required');
    if (!p.entityType) throw new Error('entityType is required');
  },

  execute: async (command, _conn: PoolConnection) => {
    const p = command.payload as unknown as RecordAuditPayload;
    const entry = createAuditEntry(p);
    try {
      await auditLogRepository.create({
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        beforeState: entry.beforeState,
        afterState: entry.afterState,
        reason: entry.reason,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      });
      return { recorded: true };
    } catch (err) {
      log.error({ err, action: p.action }, 'audit.record_failed');
      return { recorded: false };
    }
  },

  events: (command, result) => [{
    eventName: 'audit.recorded',
    payload: { action: (command.payload as unknown as RecordAuditPayload).action, recorded: result.recorded },
    context: {
      aggregateType: 'audit',
      aggregateId: '0',
      aggregateVersion: 1,
      correlationId: command.correlationId,
      causationId: command.commandId,
    },
  }],
};
