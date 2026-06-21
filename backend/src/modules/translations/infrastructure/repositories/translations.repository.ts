import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export const translationsRepository = {
  async list(locale?: string, search?: string) {
    const pool = getPool();
    let sql = 'SELECT * FROM translations WHERE 1=1';
    const params: any[] = [];
    if (locale) { sql += ' AND locale = ?'; params.push(locale); }
    if (search) { sql += ' AND (`key` LIKE ? OR value LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    sql += ' ORDER BY `key`, locale';
    const [rows] = await pool.execute<RowData>(sql, params);
    return rows;
  },

  async getById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM translations WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async getByKeyAndLocale(key: string, locale: string) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM translations WHERE `key` = ? AND locale = ?', [key, locale]
    );
    return rows[0] || null;
  },

  async create(data: { key: string; locale: string; value: string; isAuto?: boolean }) {
    const pool = getPool();
    const [result] = await pool.execute<mysql.ResultSetHeader & RowData>(
      'INSERT INTO translations (`key`, locale, value, is_auto) VALUES (?, ?, ?, ?)',
      [data.key, data.locale, data.value, data.isAuto ? 1 : 0]
    );
    return result.insertId;
  },

  async upsert(data: { key: string; locale: string; value: string; isAuto?: boolean }) {
    const pool = getPool();
    await pool.execute(
      'INSERT INTO translations (`key`, locale, value, is_auto) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), is_auto = VALUES(is_auto)',
      [data.key, data.locale, data.value, data.isAuto ? 1 : 0]
    );
  },

  async getValuesForKeys(keys: string[], locales: string[]) {
    if (!keys.length || !locales.length) return [];
    const pool = getPool();
    const keyPlaceholders = keys.map(() => '?').join(',');
    const localePlaceholders = locales.map(() => '?').join(',');
    const [rows] = await pool.execute<RowData>(
      `SELECT id, \`key\`, locale, value FROM translations
       WHERE \`key\` IN (${keyPlaceholders}) AND locale IN (${localePlaceholders})`,
      [...keys, ...locales]
    );
    return rows;
  },

  async getValuesByLocale(locale: string) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT `key`, value FROM translations WHERE locale = ?',
      [locale]
    );
    const map: Record<string, string> = {};
    for (const row of rows as { key: string; value: string }[]) {
      map[row.key] = row.value;
    }
    return map;
  },

  async createLocalePack(locale: string, keys: string[]) {
    const pool = getPool();
    let inserted = 0;
    for (const key of keys) {
      const [result] = await pool.execute<mysql.ResultSetHeader & RowData>(
        'INSERT IGNORE INTO translations (`key`, locale, value, is_auto) VALUES (?, ?, ?, 0)',
        [key, locale, '']
      );
      if (result.affectedRows > 0) inserted++;
    }
    return inserted;
  },

  async localeHasAnyTranslation(locale: string) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT 1 FROM translations WHERE locale = ? LIMIT 1',
      [locale]
    );
    return rows.length > 0;
  },

  async listDistinctLocales(): Promise<string[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT DISTINCT locale FROM translations ORDER BY locale'
    );
    return (rows as { locale: string }[]).map((r) => r.locale);
  },

  async update(id: number, data: { value?: string; isAuto?: boolean }) {
    const pool = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    if (data.value !== undefined) { fields.push('value = ?'); values.push(data.value); }
    if (data.isAuto !== undefined) { fields.push('is_auto = ?'); values.push(data.isAuto ? 1 : 0); }
    if (!fields.length) return;
    values.push(id);
    await pool.execute(`UPDATE translations SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  async delete(id: number) {
    const pool = getPool();
    await pool.execute('DELETE FROM translations WHERE id = ?', [id]);
  },

  async listLocales() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT DISTINCT locale FROM translations ORDER BY locale'
    );
    return rows.map((r: any) => r.locale);
  },

  async listKeys() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT DISTINCT `key` FROM translations ORDER BY `key`'
    );
    return rows.map((r: any) => r.key);
  },

  async exportAll() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM translations ORDER BY `key`, locale');
    return rows;
  },
};
