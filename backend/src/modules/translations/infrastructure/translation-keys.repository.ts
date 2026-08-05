import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { buildPagination, paginationClause } from '../../../shared/utils/pagination.js';

type RowData = mysql.RowDataPacket[];

export interface TranslationKeyRow {
  id: number;
  key: string;
  default_value: string;
  module_slug: string;
  element_type: string;
  element_label: string;
  component_path: string | null;
}

export const translationKeysRepository = {
  async listPaginated(opts: { page: number; limit: number; search?: string; module?: string; elementType?: string }) {
    const pool = getPool();
    const { search, module, elementType } = opts;
    const pag = buildPagination(opts.page, opts.limit);
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (search) {
      where += ' AND (`key` LIKE ? OR default_value LIKE ? OR element_label LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (module) {
      where += ' AND module_slug = ?';
      params.push(module);
    }
    if (elementType) {
      where += ' AND element_type = ?';
      params.push(elementType);
    }
    const [countRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS total FROM translation_keys ${where}`,
      params
    );
    const total = Number((countRows[0] as { total: number }).total);
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM translation_keys ${where} ORDER BY \`key\`${paginationClause(pag)}`,
      params,
    );
    return { rows: rows as TranslationKeyRow[], total, page: pag.page, limit: pag.limit };
  },

  async listAllKeys(): Promise<string[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT `key` FROM translation_keys ORDER BY `key`');
    return (rows as { key: string }[]).map((r) => r.key);
  },

  async listModules(): Promise<string[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT DISTINCT module_slug FROM translation_keys ORDER BY module_slug'
    );
    return (rows as { module_slug: string }[]).map((r) => r.module_slug);
  },

  async listElementTypes(): Promise<string[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT DISTINCT element_type FROM translation_keys ORDER BY element_type'
    );
    return (rows as { element_type: string }[]).map((r) => r.element_type);
  },

  async getByKey(key: string): Promise<TranslationKeyRow | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM translation_keys WHERE `key` = ? LIMIT 1',
      [key]
    );
    return (rows[0] as TranslationKeyRow) || null;
  },

  async upsertKey(entry: {
    key: string;
    defaultValue: string;
    moduleSlug: string;
    elementType: string;
    elementLabel: string;
    componentPath?: string;
  }): Promise<'inserted' | 'updated' | 'unchanged'> {
    const pool = getPool();
    const [result] = await pool.execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO translation_keys (\`key\`, default_value, module_slug, element_type, element_label, component_path)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         default_value = VALUES(default_value),
         module_slug = VALUES(module_slug),
         element_type = VALUES(element_type),
         element_label = VALUES(element_label),
         component_path = VALUES(component_path)`,
      [
        entry.key,
        entry.defaultValue,
        entry.moduleSlug,
        entry.elementType,
        entry.elementLabel,
        entry.componentPath || null,
      ]
    );
    if (result.affectedRows === 0) return 'unchanged';
    return result.insertId ? 'inserted' : 'updated';
  },

  async deprecateMissingKeys(activeKeys: Set<string>): Promise<number> {
    const pool = getPool();
    const [allRows] = await pool.execute<{ key: string; id: number }[] & RowData>(
      'SELECT `key`, id FROM translation_keys WHERE is_deprecated = FALSE'
    );
    let deprecated = 0;
    for (const row of allRows as any[]) {
      if (!activeKeys.has(row.key)) {
        await pool.execute(
          'UPDATE translation_keys SET is_deprecated = TRUE WHERE id = ?',
          [row.id]
        );
        deprecated++;
      }
    }
    return deprecated;
  },

  async getRegistryHash(): Promise<string | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT value FROM system_settings WHERE category = ? AND `key` = ? LIMIT 1',
      ['i18n', 'translations.registry_hash']
    );
    if (!rows.length) return null;
    try { return JSON.parse((rows[0] as any).value); } catch { return null; }
  },

  async setRegistryHash(hash: string): Promise<void> {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO system_settings (category, \`key\`, value, value_type, description, is_public, is_editable)
       VALUES ('i18n', 'translations.registry_hash', ?, 'string', 'SHA-256 hash of the last synced translation registry', 0, 0)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      [JSON.stringify(hash)]
    );
  },

  async getDefaultsMap(): Promise<Record<string, string>> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT `key`, default_value FROM translation_keys'
    );
    const map: Record<string, string> = {};
    for (const row of rows as { key: string; default_value: string }[]) {
      map[row.key] = row.default_value;
    }
    return map;
  },

  async listForLocalePack(locale: string) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT tk.\`key\`, tk.default_value, tk.module_slug, tk.element_type, tk.element_label,
              tr.id AS translation_id, tr.value AS translated_value
       FROM translation_keys tk
       LEFT JOIN translations tr ON tr.\`key\` = tk.\`key\` AND tr.locale = ?
       ORDER BY tk.\`key\``,
      [locale]
    );
    return rows;
  },
};
