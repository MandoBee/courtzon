import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export const provincesRepository = {
  async listAll() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM provinces ORDER BY sort_order, name');
    return rows;
  },

  async listByCountry(countryId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM provinces WHERE country_id = ? ORDER BY sort_order, name', [countryId]
    );
    return rows;
  },

  async getById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM provinces WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async create(data: any) {
    const pool = getPool();
    const [result] = await pool.execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO provinces (country_id, name, native_name, code, type, navigation_polygon, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.countryId, data.name, data.nativeName || null, data.code || null,
       data.type || 'province', data.navigationPolygon ? JSON.stringify(data.navigationPolygon) : null,
       data.sortOrder || 0]
    );
    return result.insertId;
  },

  async update(id: number, data: any) {
    const pool = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    const map: Record<string, string> = {
      countryId: 'country_id', name: 'name', nativeName: 'native_name', code: 'code',
      type: 'type', sortOrder: 'sort_order', isActive: 'is_active',
    };
    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) { fields.push(`${col} = ?`); values.push(data[key]); }
    }
    if (data.navigationPolygon !== undefined) {
      fields.push('navigation_polygon = ?');
      values.push(data.navigationPolygon ? JSON.stringify(data.navigationPolygon) : null);
    }
    if (!fields.length) return;
    values.push(id);
    await pool.execute(`UPDATE provinces SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  async delete(id: number) {
    const pool = getPool();
    await pool.execute('DELETE FROM provinces WHERE id = ?', [id]);
  },
};
