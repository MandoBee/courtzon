import type { PoolConnection } from 'mysql2/promise';
import { auditLogRepository } from '../infrastructure/audit-log.repository.js';
import type { AuditLogCreate } from '../infrastructure/audit-log.repository.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('audit-log');

export interface AuditRecordOptions {
  /** Bind the audit insert to the caller's transaction when supplied. */
  conn?: PoolConnection;
  /** Callers that must roll back or retry on audit failure opt in explicitly. */
  throwOnError?: boolean;
}

class AuditLogService {
  async record(entry: AuditLogCreate, options: AuditRecordOptions = {}): Promise<void> {
    try {
      await auditLogRepository.create(entry, options.conn);
    } catch (err) {
      log.error({ err, action: entry.action, entityType: entry.entityType }, 'Failed to write audit log');
      if (options.throwOnError) throw err;
    }
  }

  async findRecent(limit?: number, offset?: number) {
    return auditLogRepository.findRecent(limit, offset);
  }

  async findByUser(userId: number, limit?: number, offset?: number) {
    return auditLogRepository.findByUser(userId, limit, offset);
  }

  async findByAction(action: string, limit?: number, offset?: number) {
    return auditLogRepository.findByAction(action, limit, offset);
  }

  async findByFilters(filters: {
    entityType?: string;
    action?: string;
    actorId?: number;
    dateFrom?: string;
    dateTo?: string;
    ipAddress?: string;
    limit?: number;
    offset?: number;
  }) {
    return auditLogRepository.findByFilters(filters);
  }
}

export const auditLogService = new AuditLogService();

export function recordAudit(entry: AuditLogCreate, options?: AuditRecordOptions): Promise<void> {
  return auditLogService.record(entry, options);
}
