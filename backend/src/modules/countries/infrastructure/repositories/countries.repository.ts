import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export const countriesRepository = {
  async list() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM countries WHERE is_active = TRUE ORDER BY sort_order, name'
    );
    return rows;
  },

  async listAll() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM countries ORDER BY sort_order, name');
    return rows;
  },

  async getById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM countries WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async findByIsoCode(isoCode: string) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM countries WHERE iso_code = ?', [isoCode]);
    return rows[0] || null;
  },

  async create(data: any) {
    const pool = getPool();
    const [result] = await pool.execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO countries (iso_code, iso_code_3, name, native_name, phone_code, phone_max_length, phone_min_length, default_locale, default_currency, flag_emoji, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.isoCode, data.isoCode3, data.name, data.nativeName || null, data.phoneCode,
       data.phoneMaxLength || 15, data.phoneMinLength || 7, data.defaultLocale || 'en',
       data.defaultCurrency, data.flagEmoji || null, data.sortOrder || 0]
    );
    return result.insertId;
  },

  async update(id: number, data: any) {
    const pool = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    const map: Record<string, string> = {
      isoCode: 'iso_code', isoCode3: 'iso_code_3', name: 'name', nativeName: 'native_name',
      phoneCode: 'phone_code', phoneMaxLength: 'phone_max_length', phoneMinLength: 'phone_min_length',
      defaultLocale: 'default_locale', defaultCurrency: 'default_currency',
      flagEmoji: 'flag_emoji', sortOrder: 'sort_order', isActive: 'is_active',
    };
    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) { fields.push(`${col} = ?`); values.push(data[key]); }
    }
    if (!fields.length) return;
    values.push(id);
    await pool.execute(`UPDATE countries SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  async delete(id: number) {
    const pool = getPool();
    await pool.execute('DELETE FROM countries WHERE id = ?', [id]);
  },
};
