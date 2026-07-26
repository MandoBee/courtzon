import { getPool } from '../../../../database/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';
import type { NotificationType, NotificationTypeFilters, NotificationTypePriority } from '../../domain/notification-type.entity.js';

type RowData = RowDataPacket[];

function parseRow(row: any): NotificationType {
  return {
    ...row,
    default_channels: typeof row.default_channels === 'string'
      ? JSON.parse(row.default_channels)
      : row.default_channels ?? [],
    enabled: !!row.enabled,
    requires_action: !!row.requires_action,
    system_managed: !!row.system_managed,
  };
}

type CreateData = {
  code: string;
  event_key: string;
  name: string;
  description?: string | null;
  category?: string;
  priority?: NotificationTypePriority;
  default_channels?: string[];
  icon?: string | null;
  enabled?: boolean;
  requires_action?: boolean;
  system_managed?: boolean;
  sort_order?: number;
  created_by?: number | null;
};

type UpdateData = Partial<Omit<CreateData, 'created_by'>> & { updated_by?: number | null };

export class NotificationTypeRepository {
  async findAll(filters: NotificationTypeFilters): Promise<{ data: NotificationType[]; total: number }> {
    const pool = getPool();
    const pag = buildPagination(filters.page, filters.limit);

    const conditions: string[] = ['nt.deleted_at IS NULL'];
    const params: any[] = [];

    if (filters.q) {
      conditions.push('(nt.name LIKE ? OR nt.code LIKE ?)');
      params.push(`%${filters.q}%`, `%${filters.q}%`);
    }
    if (filters.category) {
      conditions.push('nt.category = ?');
      params.push(filters.category);
    }
    if (filters.enabled !== undefined) {
      conditions.push('nt.enabled = ?');
      params.push(filters.enabled ? 1 : 0);
    }

    const where = conditions.join(' AND ');

    const [countRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) as total FROM notification_types nt WHERE ${where}`,
      params,
    );
    const total = (countRows[0] as any).total;

    const sortBy = filters.sort_by === 'created_at' ? 'nt.created_at' : 'nt.sort_order';
    const sortDir = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    const [rows] = await pool.execute<RowData>(
      `SELECT nt.* FROM notification_types nt WHERE ${where} ORDER BY ${sortBy} ${sortDir}${paginationClause(pag)}`,
      params,
    );

    return {
      data: (rows as any[]).map(parseRow),
      total,
    };
  }

  async findById(id: number): Promise<NotificationType | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM notification_types WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
    return rows.length ? parseRow(rows[0]) : null;
  }

  async findByCode(code: string): Promise<NotificationType | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM notification_types WHERE code = ? AND deleted_at IS NULL',
      [code],
    );
    return rows.length ? parseRow(rows[0]) : null;
  }

  async findByEventKey(eventKey: string): Promise<NotificationType | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM notification_types WHERE event_key = ? AND deleted_at IS NULL',
      [eventKey],
    );
    return rows.length ? parseRow(rows[0]) : null;
  }

  async create(data: CreateData): Promise<number> {
    const pool = getPool();
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO notification_types
       (code, event_key, name, description, category, priority, default_channels, icon,
        enabled, requires_action, system_managed, sort_order, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.code,
        data.event_key,
        data.name,
        data.description ?? null,
        data.category ?? 'system',
        data.priority ?? 'normal',
        JSON.stringify(data.default_channels ?? ['in_app']),
        data.icon ?? null,
        data.enabled !== false ? 1 : 0,
        data.requires_action ? 1 : 0,
        data.system_managed ? 1 : 0,
        data.sort_order ?? 0,
        data.created_by ?? null,
      ],
    );
    return result.insertId;
  }

  async update(id: number, data: UpdateData): Promise<boolean> {
    const pool = getPool();
    const fields: string[] = [];
    const values: any[] = [];

    const columnMap: Record<string, string> = {
      code: 'code',
      event_key: 'event_key',
      name: 'name',
      description: 'description',
      category: 'category',
      priority: 'priority',
      default_channels: 'default_channels',
      icon: 'icon',
      enabled: 'enabled',
      requires_action: 'requires_action',
      system_managed: 'system_managed',
      sort_order: 'sort_order',
      updated_by: 'updated_by',
    };

    for (const [key, col] of Object.entries(columnMap)) {
      if ((data as any)[key] !== undefined) {
        fields.push(`${col} = ?`);
        let val: any = (data as any)[key];
        if (key === 'default_channels') {
          val = JSON.stringify(val);
        } else if (key === 'enabled' || key === 'requires_action' || key === 'system_managed') {
          val = val ? 1 : 0;
        }
        values.push(val);
      }
    }

    if (!fields.length) return false;

    values.push(id);
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE notification_types SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
      values,
    );
    return result.affectedRows > 0;
  }

  async softDelete(id: number): Promise<boolean> {
    const pool = getPool();
    const [result] = await pool.execute<ResultSetHeader>(
      'UPDATE notification_types SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
    return result.affectedRows > 0;
  }

  async getOptions(): Promise<{
    categories: string[];
    priorities: NotificationTypePriority[];
    channels: string[];
  }> {
    const pool = getPool();

    const [catRows] = await pool.execute<RowData>(
      'SELECT DISTINCT category FROM notification_types WHERE deleted_at IS NULL AND category IS NOT NULL AND category != \'\' ORDER BY category',
    );
    const categories = (catRows as any[]).map((r) => r.category);

    const [priRows] = await pool.execute<RowData>(
      "SELECT DISTINCT priority FROM notification_types WHERE deleted_at IS NULL ORDER BY FIELD(priority, 'low','normal','high','critical')",
    );
    const priorities = (priRows as any[]).map((r) => r.priority) as NotificationTypePriority[];

    const channelSet = new Set<string>();
    const [chRows] = await pool.execute<RowData>(
      "SELECT default_channels FROM notification_types WHERE deleted_at IS NULL AND default_channels IS NOT NULL AND default_channels != '[]'",
    );
    for (const row of chRows as any[]) {
      try {
        const channels = JSON.parse(row.default_channels);
        if (Array.isArray(channels)) {
          for (const ch of channels) channelSet.add(ch);
        }
      } catch { }
    }
    const channels = Array.from(channelSet).sort();

    return { categories, priorities, channels };
  }
}

export const notificationTypeRepository = new NotificationTypeRepository();
