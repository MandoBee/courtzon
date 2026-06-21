import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export const languagesRepository = {
  async list() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM languages WHERE is_active = TRUE ORDER BY sort_order'
    );
    return rows;
  },

  async listAll() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM languages ORDER BY sort_order');
    return rows;
  },

  async getById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM languages WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async create(data: any) {
    const pool = getPool();
    const [result] = await pool.execute<mysql.ResultSetHeader & RowData>(
      'INSERT INTO languages (code, name, native_name, is_rtl, sort_order) VALUES (?, ?, ?, ?, ?)',
      [data.code, data.name, data.nativeName, data.isRtl ? 1 : 0, data.sortOrder || 0]
    );
    return result.insertId;
  },

  async update(id: number, data: any) {
    const pool = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    const map: Record<string, string> = {
      code: 'code', name: 'name', nativeName: 'native_name',
      isRtl: 'is_rtl', sortOrder: 'sort_order', isActive: 'is_active',
    };
    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) { fields.push(`${col} = ?`); values.push(data[key]); }
    }
    if (!fields.length) return;
    values.push(id);
    await pool.execute(`UPDATE languages SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  async delete(id: number) {
    const pool = getPool();
    await pool.execute('DELETE FROM languages WHERE id = ?', [id]);
  },
};
