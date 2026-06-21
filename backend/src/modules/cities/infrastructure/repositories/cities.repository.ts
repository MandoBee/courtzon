import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export const citiesRepository = {
  async listAll() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM cities ORDER BY sort_order, name');
    return rows;
  },

  async listByProvince(provinceId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM cities WHERE province_id = ? ORDER BY sort_order, name', [provinceId]
    );
    return rows;
  },

  async getById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM cities WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async create(data: any) {
    const pool = getPool();
    const [result] = await pool.execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO cities (province_id, name, native_name, navigation_polygon, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [data.provinceId, data.name, data.nativeName || null,
       data.navigationPolygon ? JSON.stringify(data.navigationPolygon) : null,
       data.sortOrder || 0]
    );
    return result.insertId;
  },

  async update(id: number, data: any) {
    const pool = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    const map: Record<string, string> = {
      provinceId: 'province_id', name: 'name', nativeName: 'native_name',
      sortOrder: 'sort_order', isActive: 'is_active',
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
    await pool.execute(`UPDATE cities SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  async delete(id: number) {
    const pool = getPool();
    await pool.execute('DELETE FROM cities WHERE id = ?', [id]);
  },
};
