import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { buildPagination, paginationClause } from '../../../shared/utils/pagination.js';

type RowData = mysql.RowDataPacket[];
const log = createModuleLogger('system-settings');

interface SettingRow {
  id: number;
  category: string;
  key: string;
  value: unknown;
  value_type: string;
  description: string | null;
  display_name: string | null;
  unit: string | null;
  min_value: string | null;
  max_value: string | null;
  allowed_values: string | null;
  placeholder: string | null;
  help_text: string | null;
  sort_order: number;
  is_visible: number;
  is_required: number;
  is_public: number;
  is_editable: number;
  scope: string;
  restart_policy: string | null;
  feature_flag: string | null;
  setting_version: number;
  validation_rules: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

function parseValue(raw: string | null, valueType: string): unknown {
  if (raw === null || raw === undefined) return null;
  try {
    switch (valueType) {
      case 'number':
      case 'decimal': return Number(raw);
      case 'boolean': return raw === 'true' || raw === '1';
      case 'json': return JSON.parse(raw);
      case 'enum':
      case 'text':
      default: return raw;
    }
  } catch {
    return raw;
  }
}

function serializeValue(value: unknown, valueType: string): string {
  if (value === null || value === undefined) return '';
  switch (valueType) {
    case 'number':
    case 'decimal': return String(value);
    case 'boolean': return value ? 'true' : 'false';
    case 'json': return typeof value === 'string' ? value : JSON.stringify(value);
    default: return String(value);
  }
}

export class SystemSettingsService {
  async list(filters: {
    category?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: SettingRow[]; pagination: { page: number; limit: number; total: number } }> {
    const pool = getPool();
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.category) {
      conditions.push('s.category = ?');
      params.push(filters.category);
    }
    if (filters.search) {
      conditions.push('(s.key LIKE ? OR s.description LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const pag = buildPagination(filters.page, filters.limit);

    const [countRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) as total FROM system_settings s ${where}`,
      params,
    );
    const total = countRows[0]?.total || 0;

    const [rows] = await pool.execute<RowData>(
      `SELECT s.* FROM system_settings s ${where} ORDER BY s.category, s.key${paginationClause(pag)}`,
      params,
    );

    const data = (rows as any[]).map((r) => ({
      ...r,
      value: parseValue(r.value, r.value_type),
    })) as SettingRow[];

    return { data, pagination: { page: pag.page, limit: pag.limit, total } };
  }

  async getByKey(key: string): Promise<SettingRow | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM system_settings WHERE `key` = ? LIMIT 1',
      [key],
    );
    if (!rows.length) return null;
    const row = rows[0] as SettingRow;
    row.value = parseValue(row.value as string | null, row.value_type);
    return row;
  }

  async update(key: string, value: unknown, userId: number): Promise<SettingRow> {
    const pool = getPool();
    const existing = await this.getByKey(key);
    if (!existing) {
      throw Object.assign(new Error(`Setting "${key}" not found`), { statusCode: 404 });
    }

    const serialized = serializeValue(value, existing.value_type);
    const oldValue = existing.value;

    await pool.execute(
      'UPDATE system_settings SET value = ?, updated_by = ? WHERE `key` = ?',
      [serialized, userId, key],
    );

    await pool.execute(
      `INSERT INTO application_settings_history (setting_key, old_value, new_value, changed_by, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [key, oldValue !== null && oldValue !== undefined ? String(oldValue) : null, serialized, userId],
    );

    const updated = await this.getByKey(key);
    return updated!;
  }

  async getHistory(page: number = 1, limit: number = 50): Promise<{ data: any[]; total: number }> {
    const pool = getPool();
    const offset = (page - 1) * limit;
    const [countRows] = await pool.execute<RowData>('SELECT COUNT(*) as total FROM application_settings_history') as any;
    const [rows] = await pool.execute<RowData>(
      `SELECT h.*, u.full_name AS changed_by_name FROM application_settings_history h LEFT JOIN users u ON u.id = h.changed_by ORDER BY h.created_at DESC LIMIT ? OFFSET ?`,
      [String(limit), String(offset)]
    ) as any;
    return { data: rows, total: Number(countRows[0].total) };
  }

  async getCategories(): Promise<string[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT DISTINCT category FROM system_settings ORDER BY category',
    );
    return rows.map((r: RowData[number]) => r.category as string);
  }

  async getMetadata(): Promise<{ categories: string[]; scopes: string[]; valueTypes: string[]; settings: SettingRow[] }> {
    const pool = getPool();
    const [catRows] = await pool.execute<RowData>('SELECT DISTINCT COALESCE(category, \'general\') as cat FROM system_settings ORDER BY cat') as any;
    const [scopeRows] = await pool.execute<RowData>('SELECT DISTINCT COALESCE(scope, \'global\') as sc FROM system_settings ORDER BY sc') as any;
    const [typeRows] = await pool.execute<RowData>('SELECT DISTINCT COALESCE(value_type, \'string\') as vt FROM system_settings ORDER BY vt') as any;
    const [allRows] = await pool.execute<RowData>('SELECT * FROM system_settings ORDER BY COALESCE(sort_order, 100), `key`') as any;
    return {
      categories: catRows.map((r: any) => r.cat),
      scopes: scopeRows.map((r: any) => r.sc),
      valueTypes: typeRows.map((r: any) => r.vt),
      settings: allRows.map((r: any) => ({ ...r, value: parseValue(r.value, r.value_type || 'string') })),
    };
  }

  async getPublic(): Promise<Record<string, unknown>> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      "SELECT `key`, value, value_type FROM system_settings WHERE is_public = 1",
    );
    const map: Record<string, unknown> = {};
    for (const row of rows) {
      map[row.key as string] = parseValue(row.value as string | null, row.value_type as string);
    }
    return map;
  }
}

export const systemSettingsService = new SystemSettingsService();
