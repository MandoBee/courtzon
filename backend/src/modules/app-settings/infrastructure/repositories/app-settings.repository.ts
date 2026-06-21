import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

const PUBLIC_KEYS = [
  'site_name',
  'site_tagline',
  'favicon_url',
  'favicon_dark_url',
  'site_logo_url',
  'site_logo_dark_url',
  'pwa_icon_192',
  'pwa_icon_512',
  'domain_name',
  'meta_description',
  'maintenance_mode',
] as const;

export class AppSettingsRepository {
  private pool = getPool();

  async listAll(): Promise<Array<{ setting_key: string; value: unknown; updated_at: string }>> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT setting_key, value, updated_at FROM app_settings ORDER BY setting_key',
    );
    return rows.map((row: RowData[number]) => ({
      setting_key: row.setting_key as string,
      value: typeof row.value === 'string' ? JSON.parse(row.value) : row.value,
      updated_at: row.updated_at as string,
    }));
  }

  async listPublic(): Promise<Record<string, unknown>> {
    const placeholders = PUBLIC_KEYS.map(() => '?').join(', ');
    const [rows] = await this.pool.execute<RowData>(
      `SELECT setting_key, value FROM app_settings WHERE setting_key IN (${placeholders})`,
      [...PUBLIC_KEYS],
    );
    const map: Record<string, unknown> = {};
    for (const row of rows) {
      map[row.setting_key as string] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    }
    return map;
  }

  async upsertMany(
    settings: Record<string, unknown>,
    updatedBy: number | null,
  ): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      await this.pool.execute(
        `INSERT INTO app_settings (setting_key, value, updated_by)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)`,
        [key, JSON.stringify(value), updatedBy],
      );
    }
  }
}

export const appSettingsRepository = new AppSettingsRepository();
