import { auditLogRepository } from '../infrastructure/audit-log.repository.js';
import type { AuditLogCreate } from '../infrastructure/audit-log.repository.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('audit-log');

class AuditLogService {
  async record(entry: AuditLogCreate): Promise<void> {
    try {
      await auditLogRepository.create(entry);
    } catch (err) {
      log.error({ err, action: entry.action, entityType: entry.entityType }, 'Failed to write audit log');
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

export function recordAudit(entry: AuditLogCreate): Promise<void> {
  return auditLogService.record(entry);
}
