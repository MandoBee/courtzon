import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];

class FinancialAdminService {
  async listOrganisations(search?: string) {
    const pool = getPool();
    const params: any[] = [];
    let where = '';
    if (search) { where = 'WHERE o.name LIKE ?'; params.push(`%${search}%`); }
    const [rows] = await pool.execute<RowData>(
      `SELECT o.id, o.name
       FROM organisations o
       ${where}
       ORDER BY o.name`,
      params,
    );
    return rows;
  }
}

export const financialAdminService = new FinancialAdminService();