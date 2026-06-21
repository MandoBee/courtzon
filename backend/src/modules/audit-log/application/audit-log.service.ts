import { auditLogRepository } from '../infrastructure/audit-log.repository.js';
import type { AuditLogCreate } from '../infrastructure/audit-log.repository.js';

class AuditLogService {
  async record(entry: AuditLogCreate): Promise<void> {
    try {
      await auditLogRepository.create(entry);
    } catch {
      console.error('Failed to write audit log:', entry);
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
