import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import { generateUUID } from '../../../../shared/utils/token.js';

type RowData = mysql.RowDataPacket[];

export class BranchRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  async findByOrg(orgId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT * FROM branches WHERE organisation_id = ? AND deleted_at IS NULL ORDER BY name`,
      [orgId]
    );
    return rows;
  }

  async findBySport(sportId: number, playerId?: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT DISTINCT b.*,
        ${playerId ? `(SELECT bpa.status FROM branch_player_access bpa WHERE bpa.branch_id = b.id AND bpa.player_id = ?) as player_access_status` : 'NULL as player_access_status'}
       FROM branches b
       JOIN resources r ON r.branch_id = b.id
       WHERE r.sport_id = ? AND r.deleted_at IS NULL AND b.deleted_at IS NULL
       ORDER BY b.name`,
      playerId ? [playerId, sportId] : [sportId]
    );
    return rows;
  }

  async findById(id: number): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT * FROM branches WHERE id = ? AND deleted_at IS NULL`, [id]
    );
    return rows.length ? rows[0] : null;
  }

  async create(data: any): Promise<number> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, description, email, phone,
        address_line1, address_line2, city, state, country_id, postal_code,
        latitude, longitude, access_type, currency_id, timezone, opening_time, closing_time, images)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [generateUUID(), data.organisationId, data.name, data.slug,
       data.description || null, data.email || null, data.phone || null,
       data.addressLine1 || null, data.addressLine2 || null,
       data.city || null, data.state || null, data.countryId || null,
       data.postalCode || null, data.latitude || null, data.longitude || null,
       data.accessType || 'open', data.currencyId || null,
       data.timezone || null, data.openingTime || null, data.closingTime || null,
       data.images ? JSON.stringify(data.images) : null]
    );
    return result.insertId;
  }

  async update(id: number, data: any): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ['name','slug','description','email','phone','address_line1',
      'address_line2','city','state','country_id','postal_code','latitude',
      'longitude','access_type','is_active','currency_id','timezone',
      'opening_time','closing_time'];
    for (const key of allowed) {
      const camelKey = key.replace(/_[a-z]/g, (m) => m[1].toUpperCase());
      if (data[camelKey] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[camelKey]);
      }
    }
    if (data.images !== undefined) {
      fields.push('images = ?');
      values.push(JSON.stringify(data.images));
    }
    if (!fields.length) return;
    values.push(id);
    await this.pool.execute(
      `UPDATE branches SET ${fields.join(', ')} WHERE id = ?`, values
    );
  }

  async softDelete(id: number): Promise<void> {
    await this.pool.execute(
      `UPDATE branches SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`, [id]
    );
  }

  async getPlayerAccessRequests(branchId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT bpa.*, u.full_name, u.email, u.full_phone
       FROM branch_player_access bpa
       JOIN users u ON u.id = bpa.player_id
       WHERE bpa.branch_id = ?
       ORDER BY bpa.created_at DESC`,
      [branchId]
    );
    return rows;
  }

  async approveAccess(branchId: number, playerId: number, reviewerId: number): Promise<void> {
    await this.pool.execute(
      `UPDATE branch_player_access
       SET status = 'approved', reviewed_by = ?, reviewed_at = NOW()
       WHERE branch_id = ? AND player_id = ?`,
      [reviewerId, branchId, playerId]
    );
  }

  async rejectAccess(branchId: number, playerId: number, reviewerId: number, note: string | null): Promise<void> {
    await this.pool.execute(
      `UPDATE branch_player_access
       SET status = 'rejected', reviewed_by = ?, review_note = ?, reviewed_at = NOW()
       WHERE branch_id = ? AND player_id = ?`,
      [reviewerId, note, branchId, playerId]
    );
  }

  async getAllAccessRequests(filters?: { status?: string; orgId?: number; branchId?: number }): Promise<any[]> {
    let sql = `SELECT bpa.*, u.full_name, u.email, u.phone_number,
                      br.name as branch_name, br.id as branch_id, org.name as organisation_name, org.id as organisation_id,
                      reviewer.full_name as reviewer_name
               FROM branch_player_access bpa
               JOIN users u ON u.id = bpa.player_id AND u.deleted_at IS NULL
               JOIN branches br ON br.id = bpa.branch_id AND br.deleted_at IS NULL
               JOIN organisations org ON org.id = br.organisation_id AND org.deleted_at IS NULL
               LEFT JOIN users reviewer ON reviewer.id = bpa.reviewed_by`;
    const params: any[] = [];
    const conditions: string[] = [];
    if (filters?.status) { conditions.push(`bpa.status = ?`); params.push(filters.status); }
    if (filters?.orgId) { conditions.push(`br.organisation_id = ?`); params.push(filters.orgId); }
    if (filters?.branchId) { conditions.push(`bpa.branch_id = ?`); params.push(filters.branchId); }
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ` ORDER BY bpa.updated_at DESC, bpa.created_at DESC`;
    const [rows] = await this.pool.execute<RowData>(sql, params);
    return rows;
  }

  async requestAccess(branchId: number, playerId: number): Promise<void> {
    await this.pool.execute(
      `INSERT INTO branch_player_access (branch_id, player_id, status, created_at)
       VALUES (?, ?, 'pending', NOW())
       ON DUPLICATE KEY UPDATE status = 'pending', updated_at = NOW()`,
      [branchId, playerId]
    );
  }

  async getPlayerAccessStatus(branchId: number, playerId: number): Promise<string | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT status FROM branch_player_access WHERE branch_id = ? AND player_id = ?`,
      [branchId, playerId]
    );
    return rows.length ? (rows[0] as any).status : null;
  }

  async updateAccessStatus(branchId: number, playerId: number, status: string, reviewerId: number, note?: string): Promise<void> {
    await this.pool.execute(
      `UPDATE branch_player_access
       SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_note = ?, updated_at = NOW()
       WHERE branch_id = ? AND player_id = ?`,
      [status, reviewerId, note || null, branchId, playerId]
    );
  }

  async getHolidays(branchId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT * FROM holidays WHERE owner_type = 'branch' AND owner_id = ? ORDER BY date_from`,
      [branchId]
    );
    return rows;
  }

  async createHoliday(data: any): Promise<number> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO holidays (owner_type, owner_id, name, date_from, date_to, is_recurring, is_open_modified, open_time, close_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['branch', data.ownerId, data.name, data.dateFrom, data.dateTo,
       data.isRecurring ? 1 : 0, data.isOpenModified ? 1 : 0,
       data.openTime || null, data.closeTime || null]
    );
    return result.insertId;
  }

  async updateHoliday(id: number, data: any): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ['name', 'date_from', 'date_to', 'is_recurring', 'is_open_modified', 'open_time', 'close_time'];
    for (const key of allowed) {
      const camelKey = key.replace(/_[a-z]/g, (m: string) => m[1].toUpperCase());
      if (data[camelKey] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[camelKey]);
      }
    }
    if (!fields.length) return;
    values.push(id);
    await this.pool.execute(
      `UPDATE holidays SET ${fields.join(', ')} WHERE id = ?`, values
    );
  }

  async deleteHoliday(id: number): Promise<void> {
    await this.pool.execute('DELETE FROM holidays WHERE id = ?', [id]);
  }
}

export const branchRepository = new BranchRepository();
