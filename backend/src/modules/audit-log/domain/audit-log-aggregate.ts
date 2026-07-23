import type { AuditAction } from './audit-log.types.js';

export interface AuditLogRecord {
  id?: number;
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

export function createAuditEntry(data: AuditLogRecord): AuditLogRecord {
  if (!data.action) throw new Error('action is required');
  if (!data.entityType) throw new Error('entityType is required');
  return data;
}
