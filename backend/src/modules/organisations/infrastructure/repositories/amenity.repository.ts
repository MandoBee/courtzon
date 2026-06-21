import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export class AmenityRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  async findAllActive(): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT * FROM amenities WHERE is_active = TRUE ORDER BY sort_order`
    );
    return rows;
  }

  async findByBranch(branchId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT baa.branch_id, a.id, a.name_en, a.name_ar, a.icon, a.category
       FROM branch_amenity_assignments baa
       JOIN amenities a ON a.id = baa.amenity_id
       WHERE baa.branch_id = ? AND a.is_active = TRUE
       ORDER BY a.category, a.sort_order`,
      [branchId]
    );
    return rows;
  }

  async assign(branchId: number, amenityId: number, value?: string): Promise<void> {
    await this.pool.execute(
      `INSERT INTO branch_amenity_assignments (branch_id, amenity_id, value)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE value = ?`,
      [branchId, amenityId, value || null, value || null]
    );
  }

  async unassign(branchId: number, amenityId: number): Promise<void> {
    await this.pool.execute(
      `DELETE FROM branch_amenity_assignments WHERE branch_id = ? AND amenity_id = ?`,
      [branchId, amenityId]
    );
  }

  async bulkAssign(branchId: number, amenityIds: number[]): Promise<void> {
    await this.pool.execute(
      `DELETE FROM branch_amenity_assignments WHERE branch_id = ?`,
      [branchId]
    );
    for (const id of amenityIds) {
      await this.assign(branchId, id);
    }
  }
}

export const amenityRepository = new AmenityRepository();
