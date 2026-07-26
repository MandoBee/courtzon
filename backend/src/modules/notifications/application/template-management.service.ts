import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { AppError, NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('template-management');

const VARIABLE_CATALOG: Record<string, Array<{ key: string; label: string; description: string }>> = {
  'booking.created': [
    { key: 'bookingId', label: 'Booking ID', description: 'The unique booking identifier' },
    { key: 'startTime', label: 'Start Time', description: 'The booking start time' },
    { key: 'endTime', label: 'End Time', description: 'The booking end time' },
    { key: 'location', label: 'Location', description: 'Venue or court name' },
  ],
  'booking.confirmed': [
    { key: 'bookingId', label: 'Booking ID', description: 'The unique booking identifier' },
    { key: 'startTime', label: 'Start Time', description: 'The booking start time' },
    { key: 'amount', label: 'Amount', description: 'The amount paid' },
  ],
  'booking.cancelled': [
    { key: 'bookingId', label: 'Booking ID', description: 'The unique booking identifier' },
    { key: 'reason', label: 'Cancellation Reason', description: 'Why the booking was cancelled' },
  ],
  'booking.reminder': [
    { key: 'bookingId', label: 'Booking ID', description: 'The unique booking identifier' },
    { key: 'startTime', label: 'Start Time', description: 'When the booking starts' },
    { key: 'location', label: 'Location', description: 'Venue or court name' },
  ],
};

const DEFAULT_CATALOG = [
  { key: 'userName', label: 'User Name', description: 'The full name of the recipient' },
  { key: 'userEmail', label: 'User Email', description: 'The email of the recipient' },
];

function getVariableCatalog(notificationTypeId?: number, eventKey?: string) {
  if (eventKey && VARIABLE_CATALOG[eventKey]) {
    return [...DEFAULT_CATALOG, ...VARIABLE_CATALOG[eventKey]];
  }
  return DEFAULT_CATALOG;
}

export const templateManagementService = {
  async list(filters: {
    q?: string;
    status?: string;
    notification_type_id?: number;
    locale?: string;
    page?: number;
    limit?: number;
    sort_by?: string;
    sort_order?: string;
  }) {
    const pool = getPool();
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.q) {
      conditions.push('(t.name LIKE ? OR t.code LIKE ? OR t.event_name LIKE ?)');
      const q = `%${filters.q}%`;
      params.push(q, q, q);
    }
    if (filters.status) {
      conditions.push('t.status = ?');
      params.push(filters.status);
    }
    if (filters.notification_type_id) {
      conditions.push('t.notification_type_id = ?');
      params.push(filters.notification_type_id);
    }
    if (filters.locale) {
      conditions.push('t.locale = ?');
      params.push(filters.locale);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) as total FROM notification_templates t ${whereClause}`;
    const [countRows] = await pool.execute<RowDataPacket[]>(countSql, params);
    const total = countRows[0].total;

    const sortBy = filters.sort_by === 'version' ? 't.version' : 't.created_at';
    const sortOrder = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    const dataSql = `
      SELECT t.*, nt.code as notification_type_code, nt.name as notification_type_name, nt.event_key
      FROM notification_templates t
      LEFT JOIN notification_types nt ON nt.id = t.notification_type_id
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(dataSql, [...params, String(limit), String(offset)]);

    return {
      data: rows,
      total,
      page,
      limit,
    };
  },

  async getById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT t.*, nt.code as notification_type_code, nt.name as notification_type_name, nt.event_key
       FROM notification_templates t
       LEFT JOIN notification_types nt ON nt.id = t.notification_type_id
       WHERE t.id = ?`,
      [id],
    );
    if (!rows.length) {
      throw new NotFoundError('NotificationTemplate', ErrorCodes.NOTIFICATION_NOT_FOUND);
    }
    return rows[0];
  },

  async create(
    data: {
      code: string;
      notification_type_id: number;
      name: string;
      description?: string | null;
      locale: string;
      title_template: string;
      body_template?: string | null;
      content_format?: string;
      action_key?: string | null;
      route_pattern?: string | null;
      image_url?: string | null;
      actions?: any;
      variables?: any;
      is_default?: boolean;
    },
    userId: number | null,
  ) {
    const pool = getPool();

    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM notification_templates WHERE code = ?',
      [data.code],
    );
    if (existing.length) {
      throw new ConflictError('A template with this code already exists', ErrorCodes.NOTIFICATION_FAILED, { code: data.code });
    }

    const [typeRows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, event_key FROM notification_types WHERE id = ?',
      [data.notification_type_id],
    );
    if (!typeRows.length) {
      throw new NotFoundError('NotificationType', ErrorCodes.NOTIFICATION_NOT_FOUND);
    }
    const typeInfo = typeRows[0] as any;

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO notification_templates
       (code, notification_type_id, name, description, event_name, locale, title_template, body_template,
        content_format, action_key, route_pattern, image_url, actions, variables,
        status, is_default, version, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, 1, 1, ?)`,
      [
        data.code,
        data.notification_type_id,
        data.name,
        data.description ?? null,
        typeInfo.event_key,
        data.locale,
        data.title_template,
        data.body_template ?? null,
        data.content_format ?? 'handlebars',
        data.action_key ?? null,
        data.route_pattern ?? null,
        data.image_url ?? null,
        data.actions ? JSON.stringify(data.actions) : null,
        data.variables ? JSON.stringify(data.variables) : null,
        data.is_default ? 1 : 0,
        userId,
      ],
    );

    const template = await this.getById(result.insertId);
    return template;
  },

  async update(
    id: number,
    data: {
      code?: string;
      name?: string;
      description?: string | null;
      locale?: string;
      title_template?: string;
      body_template?: string | null;
      content_format?: string;
      action_key?: string | null;
      route_pattern?: string | null;
      image_url?: string | null;
      actions?: any;
      variables?: any;
      is_default?: boolean;
    },
    userId: number | null,
  ) {
    const existing = await this.getById(id);

    if (existing.status !== 'draft') {
      throw new AppError('Only draft templates can be updated', 400, 'VALIDATION_ERROR', { code: ErrorCodes.VALIDATION_INVALID_VALUE });
    }

    if (data.code && data.code !== existing.code) {
      const [dup] = await getPool().execute<RowDataPacket[]>(
        'SELECT id FROM notification_templates WHERE code = ? AND id != ?',
        [data.code, id],
      );
      if (dup.length) {
        throw new ConflictError('A template with this code already exists', ErrorCodes.NOTIFICATION_FAILED, { code: data.code });
      }
    }

    const setParts: string[] = [];
    const params: any[] = [];

    const allowedFields: Record<string, string> = {
      code: 'code',
      name: 'name',
      description: 'description',
      locale: 'locale',
      title_template: 'title_template',
      body_template: 'body_template',
      content_format: 'content_format',
      action_key: 'action_key',
      route_pattern: 'route_pattern',
      image_url: 'image_url',
      is_default: 'is_default',
    };

    for (const [key, col] of Object.entries(allowedFields)) {
      if ((data as any)[key] !== undefined) {
        setParts.push(`${col} = ?`);
        params.push((data as any)[key]);
      }
    }

    if (data.actions !== undefined) {
      setParts.push('actions = ?');
      params.push(data.actions ? JSON.stringify(data.actions) : null);
    }
    if (data.variables !== undefined) {
      setParts.push('variables = ?');
      params.push(data.variables ? JSON.stringify(data.variables) : null);
    }

    if (!setParts.length) return existing;

    params.push(id);
    await getPool().execute(
      `UPDATE notification_templates SET ${setParts.join(', ')} WHERE id = ?`,
      params,
    );

    return this.getById(id);
  },

  async delete(id: number, userId: number | null) {
    const existing = await this.getById(id);

    if (existing.status !== 'draft') {
      throw new AppError('Only draft templates can be deleted', 400, 'VALIDATION_ERROR', { code: ErrorCodes.VALIDATION_INVALID_VALUE });
    }

    await getPool().execute(
      'UPDATE notification_templates SET is_active = 0, status = "archived" WHERE id = ?',
      [id],
    );
  },

  async publish(id: number, userId: number | null) {
    const existing = await this.getById(id);

    if (existing.status !== 'draft' && existing.status !== 'published') {
      throw new AppError('Only draft or published templates can be published', 400, 'VALIDATION_ERROR', { code: ErrorCodes.VALIDATION_INVALID_VALUE });
    }

    const pool = getPool();

    const [maxVersion] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(MAX(version), 0) as maxVer FROM notification_templates
       WHERE notification_type_id = ? AND locale = ?`,
      [existing.notification_type_id, existing.locale],
    );
    const newVersion = (maxVersion[0] as any).maxVer + 1;

    if (existing.status === 'published') {
      await pool.execute(
        `UPDATE notification_templates SET status = 'archived' WHERE id != ? AND notification_type_id = ? AND locale = ? AND status = 'published'`,
        [id, existing.notification_type_id, existing.locale],
      );
    }

    await pool.execute(
      `UPDATE notification_templates SET status = 'published', version = ?, published_at = NOW() WHERE id = ?`,
      [newVersion, id],
    );

    return this.getById(id);
  },

  async archive(id: number, userId: number | null) {
    const existing = await this.getById(id);

    if (existing.status === 'archived') {
      throw new AppError('Template is already archived', 400, 'VALIDATION_ERROR', { code: ErrorCodes.VALIDATION_INVALID_VALUE });
    }

    await getPool().execute(
      "UPDATE notification_templates SET status = 'archived' WHERE id = ?",
      [id],
    );

    return this.getById(id);
  },

  async duplicate(id: number, userId: number | null) {
    const existing = await this.getById(id);

    const newCode = `${existing.code}_copy_${Date.now()}`;

    const pool = getPool();
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO notification_templates
       (code, notification_type_id, name, description, event_name, locale, title_template, body_template,
        content_format, action_key, route_pattern, image_url, actions, variables,
        status, is_default, version, is_active, created_by)
       SELECT ?, notification_type_id, CONCAT(name, ' (Copy)'), description, event_name, locale,
              title_template, body_template, content_format, action_key, route_pattern, image_url,
              actions, variables, 'draft', 0, 1, 1, ?
       FROM notification_templates WHERE id = ?`,
      [newCode, userId, id],
    );

    return this.getById(result.insertId);
  },

  async preview(id: number, sampleData: Record<string, any>) {
    const existing = await this.getById(id);
    const variableCatalog = getVariableCatalog(existing.notification_type_id, existing.event_key);

    return {
      title_template: existing.title_template,
      body_template: existing.body_template,
      variables: variableCatalog,
      sample_data: sampleData,
    };
  },

  async getVariables(typeId: number) {
    const pool = getPool();
    const [typeRows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, event_key, code FROM notification_types WHERE id = ?',
      [typeId],
    );
    if (!typeRows.length) {
      throw new NotFoundError('NotificationType', ErrorCodes.NOTIFICATION_NOT_FOUND);
    }
    const typeInfo = typeRows[0] as any;
    return getVariableCatalog(typeId, typeInfo.event_key);
  },

  async getOptions() {
    const pool = getPool();

    const [statusRows] = await pool.execute<RowDataPacket[]>(
      "SELECT DISTINCT status FROM notification_templates WHERE status IS NOT NULL ORDER BY status",
    );
    const statuses = statusRows.map((r: any) => r.status);

    const [localeRows] = await pool.execute<RowDataPacket[]>(
      "SELECT DISTINCT locale FROM notification_templates WHERE locale IS NOT NULL ORDER BY locale",
    );
    const locales = localeRows.map((r: any) => r.locale);

    const contentFormats = ['handlebars', 'text', 'html'];

    return { statuses, locales, content_formats: contentFormats };
  },

  SuccessCodes: {
    CREATED: 'TEMPLATE_CREATED' as const,
    UPDATED: 'TEMPLATE_UPDATED' as const,
    DELETED: 'TEMPLATE_DELETED' as const,
    PUBLISHED: 'TEMPLATE_PUBLISHED' as const,
    ARCHIVED: 'TEMPLATE_ARCHIVED' as const,
    DUPLICATED: 'TEMPLATE_DUPLICATED' as const,
  },
};
