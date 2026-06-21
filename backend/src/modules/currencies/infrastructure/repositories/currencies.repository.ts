import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export const currenciesRepository = {
  async list() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM currencies WHERE is_active = TRUE ORDER BY code'
    );
    return rows;
  },

  async listAll() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM currencies ORDER BY code');
    return rows;
  },

  async getById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM currencies WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async findByCode(code: string) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM currencies WHERE code = ? AND is_active = TRUE LIMIT 1',
      [code.toUpperCase()],
    );
    return rows[0] || null;
  },

  async create(data: any) {
    const pool = getPool();
    const [result] = await pool.execute<mysql.ResultSetHeader & RowData>(
      'INSERT INTO currencies (code, name, symbol, decimal_places, sort_order) VALUES (?, ?, ?, ?, ?)',
      [data.code, data.name, data.symbol, data.decimalPlaces || 2, data.sortOrder || 0]
    );
    return result.insertId;
  },

  async update(id: number, data: any) {
    const pool = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    const map: Record<string, string> = {
      code: 'code', name: 'name', symbol: 'symbol',
      decimalPlaces: 'decimal_places', sortOrder: 'sort_order', isActive: 'is_active',
    };
    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) { fields.push(`${col} = ?`); values.push(data[key]); }
    }
    if (!fields.length) return;
    values.push(id);
    await pool.execute(`UPDATE currencies SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  async delete(id: number) {
    const pool = getPool();
    await pool.execute('DELETE FROM currencies WHERE id = ?', [id]);
  },
};
