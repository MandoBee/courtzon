import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { buildPagination, paginationClause } from '../../../shared/utils/pagination.js';
import { recordAudit } from '../../audit-log/index.js';

type RowData = mysql.RowDataPacket[];
const log = createModuleLogger('feature-flags');

interface FeatureFlagRow {
  id: number;
  flag_key: string;
  label: string;
  description: string | null;
  module: string;
  is_enabled: number;
  is_system: number;
  created_at: string;
  updated_at: string;
}

export class FeatureFlagService {
  async list(filters: {
    page?: number;
    limit?: number;
  }): Promise<{ data: FeatureFlagRow[]; pagination: { page: number; limit: number; total: number } }> {
    const pool = getPool();
    const pag = buildPagination(filters.page, filters.limit);

    const [countRows] = await pool.execute<RowData>('SELECT COUNT(*) as total FROM feature_flags');
    const total = countRows[0]?.total || 0;

    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM feature_flags ORDER BY module, flag_key${paginationClause(pag)}`,
    );

    return { data: rows as FeatureFlagRow[], pagination: { page: pag.page, limit: pag.limit, total } };
  }

  async toggle(id: number, enabled: boolean, userId: number): Promise<FeatureFlagRow> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM feature_flags WHERE id = ?', [id]);
    if (!rows.length) {
      throw Object.assign(new Error('Feature flag not found'), { statusCode: 404 });
    }

    const flag = rows[0] as FeatureFlagRow;
    const beforeEnabled = !!flag.is_enabled;

    await pool.execute('UPDATE feature_flags SET is_enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);

    recordAudit({
      actorId: userId,
      action: 'FEATURE_FLAG.TOGGLE',
      entityType: 'feature_flag',
      entityId: id,
      beforeState: { is_enabled: beforeEnabled },
      afterState: { is_enabled: enabled },
    });

    const [updatedRows] = await pool.execute<RowData>('SELECT * FROM feature_flags WHERE id = ?', [id]);
    return updatedRows[0] as FeatureFlagRow;
  }

  async create(
    data: { flagKey: string; label: string; description?: string; module?: string; isEnabled?: boolean },
    userId: number,
  ): Promise<FeatureFlagRow> {
    const pool = getPool();
    const [result] = await pool.execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO feature_flags (flag_key, label, description, module, is_enabled)
       VALUES (?, ?, ?, ?, ?)`,
      [
        data.flagKey,
        data.label,
        data.description || null,
        data.module || 'general',
        data.isEnabled ? 1 : 0,
      ],
    );

    recordAudit({
      actorId: userId,
      action: 'FEATURE_FLAG.CREATE',
      entityType: 'feature_flag',
      entityId: result.insertId,
      afterState: { flag_key: data.flagKey, label: data.label, module: data.module || 'general' },
    });

    const [rows] = await pool.execute<RowData>('SELECT * FROM feature_flags WHERE id = ?', [result.insertId]);
    return rows[0] as FeatureFlagRow;
  }

  async update(
    id: number,
    data: { flagKey?: string; label?: string; description?: string; module?: string; isEnabled?: boolean },
    userId: number,
  ): Promise<FeatureFlagRow> {
    const pool = getPool();
    const [existing] = await pool.execute<RowData>('SELECT * FROM feature_flags WHERE id = ?', [id]);
    if (!existing.length) {
      throw Object.assign(new Error('Feature flag not found'), { statusCode: 404 });
    }

    const fields: string[] = [];
    const values: any[] = [];
    const fieldMap: Record<string, string> = {
      flagKey: 'flag_key',
      label: 'label',
      description: 'description',
      module: 'module',
      isEnabled: 'is_enabled',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if ((data as any)[key] !== undefined) {
        fields.push(`${col} = ?`);
        values.push(col === 'is_enabled' ? ((data as any)[key] ? 1 : 0) : (data as any)[key]);
      }
    }

    if (fields.length) {
      values.push(id);
      await pool.execute(`UPDATE feature_flags SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    recordAudit({
      actorId: userId,
      action: 'FEATURE_FLAG.UPDATE',
      entityType: 'feature_flag',
      entityId: id,
      beforeState: existing[0],
      afterState: data,
    });

    const [rows] = await pool.execute<RowData>('SELECT * FROM feature_flags WHERE id = ?', [id]);
    return rows[0] as FeatureFlagRow;
  }

  async delete(id: number, userId: number): Promise<void> {
    const pool = getPool();
    const [existing] = await pool.execute<RowData>('SELECT * FROM feature_flags WHERE id = ?', [id]);
    if (!existing.length) {
      throw Object.assign(new Error('Feature flag not found'), { statusCode: 404 });
    }

    await pool.execute('DELETE FROM feature_flags WHERE id = ?', [id]);

    recordAudit({
      actorId: userId,
      action: 'FEATURE_FLAG.DELETE',
      entityType: 'feature_flag',
      entityId: id,
      beforeState: existing[0],
    });
  }
}

export const featureFlagService = new FeatureFlagService();
