import { getPool } from '../../../database/mysql.js';

export interface AuditLogCreate {
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

class AuditLogRepository {
  async create(entry: AuditLogCreate): Promise<void> {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before_state, after_state, reason, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        entry.actorId,
        entry.action,
        entry.entityType,
        entry.entityId?.toString() || null,
        entry.beforeState ? JSON.stringify(entry.beforeState) : null,
        entry.afterState ? JSON.stringify(entry.afterState) : null,
        entry.reason || null,
        entry.ipAddress || null,
        entry.userAgent || null,
      ]
    );
  }

  async findRecent(limit = 100, offset = 0): Promise<any[]> {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT al.*, u.full_name, u.email
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    return rows as any[];
  }

  async findByUser(userId: number, limit = 50, offset = 0): Promise<any[]> {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT al.*, u.full_name
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       WHERE al.actor_id = ?
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );
    return rows as any[];
  }

  async findByAction(action: string, limit = 50, offset = 0): Promise<any[]> {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT al.*, u.full_name
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       WHERE al.action = ?
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [action, limit, offset]
    );
    return rows as any[];
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
  }): Promise<{ rows: any[]; total: number }> {
    const pool = getPool();
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.entityType) {
      conditions.push('al.entity_type = ?');
      params.push(filters.entityType);
    }
    if (filters.action) {
      conditions.push('al.action = ?');
      params.push(filters.action);
    }
    if (filters.actorId) {
      conditions.push('al.actor_id = ?');
      params.push(filters.actorId);
    }
    if (filters.dateFrom) {
      conditions.push('al.created_at >= ?');
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      conditions.push('al.created_at <= ?');
      params.push(filters.dateTo);
    }
    if (filters.ipAddress) {
      conditions.push('al.ip_address LIKE ?');
      params.push(`%${filters.ipAddress}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 30;
    const offset = filters.offset || 0;

    const [countRows] = await pool.execute<any[]>(
      `SELECT COUNT(*) as total FROM audit_logs al ${where}`, params
    );
    const total = countRows[0]?.total || 0;

    const [rows] = await pool.query(
      `SELECT al.*, u.full_name, u.email
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return { rows: rows as any[], total };
  }
}

export const auditLogRepository = new AuditLogRepository();
