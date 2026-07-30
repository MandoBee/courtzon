import { getPool } from '../../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

export const refereeRepository = {
  async findById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM referees WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async findAvailability(coachId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM referee_availability WHERE referee_id = ?', [coachId]);
    return rows;
  },

  async findAssignments(coachId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM referee_assignments WHERE referee_id = ? ORDER BY created_at DESC', [coachId]);
    return rows;
  },
};
