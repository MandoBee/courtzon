import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export const amenitiesRepository = {
  async listAll() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM amenities ORDER BY sort_order');
    return rows;
  },

  async getById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM amenities WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async create(data: any) {
    const pool = getPool();
    const [result] = await pool.execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO amenities (name_en, name_ar, icon, category, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [data.nameEn, data.nameAr, data.icon || '', data.category || 'facilities', data.sortOrder || 0]
    );
    return result.insertId;
  },

  async update(id: number, data: any) {
    const pool = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    const map: Record<string, string> = {
      nameEn: 'name_en', nameAr: 'name_ar', icon: 'icon',
      category: 'category', sortOrder: 'sort_order', isActive: 'is_active',
    };
    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) { fields.push(`${col} = ?`); values.push(data[key]); }
    }
    if (!fields.length) return;
    values.push(id);
    await pool.execute(`UPDATE amenities SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  async delete(id: number) {
    const pool = getPool();
    await pool.execute('DELETE FROM amenities WHERE id = ?', [id]);
  },
};
