import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import { generateUUID } from '../../../../shared/utils/token.js';

type RowData = mysql.RowDataPacket[];

export class ResourceRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  private async attachAmenities(resources: any[]): Promise<any[]> {
    if (!resources.length) return resources;
    const branchIds = [...new Set(resources.map((r) => r.branch_id))];
    const placeholders = branchIds.map(() => '?').join(',');
    const [rows] = await this.pool.execute<RowData>(
      `SELECT baa.branch_id, a.id, a.name_en, a.name_ar, a.icon, a.category
       FROM branch_amenity_assignments baa
       JOIN amenities a ON a.id = baa.amenity_id
       WHERE baa.branch_id IN (${placeholders}) AND a.is_active = TRUE
       ORDER BY a.sort_order`,
      branchIds
    );
    const groupedByBranch: Record<number, any[]> = {};
    for (const row of rows) {
      if (!groupedByBranch[row.branch_id]) groupedByBranch[row.branch_id] = [];
      groupedByBranch[row.branch_id].push({ id: row.id, name_en: row.name_en, name_ar: row.name_ar, icon: row.icon, category: row.category });
    }
    for (const r of resources) {
      r.amenities = groupedByBranch[r.branch_id] || [];
    }
    return resources;
  }

  async findByBranch(branchId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT r.*, rt.slug as resource_type_slug, rt.name as resource_type_name,
              rt.has_slots, rt.default_slot_duration, s.name as sport_name
       FROM resources r
       JOIN resource_types rt ON rt.id = r.resource_type_id
       LEFT JOIN sports s ON s.id = r.sport_id
       WHERE r.branch_id = ? AND r.deleted_at IS NULL
       ORDER BY r.name`,
      [branchId]
    );
    return this.attachAmenities(rows);
  }

  async findById(id: number): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT r.*, rt.slug as resource_type_slug, rt.name as resource_type_name,
              rt.has_slots, rt.default_slot_duration, s.name as sport_name
       FROM resources r
       JOIN resource_types rt ON rt.id = r.resource_type_id
       LEFT JOIN sports s ON s.id = r.sport_id
       WHERE r.id = ? AND r.deleted_at IS NULL`, [id]
    );
    if (!rows.length) return null;
    const result = await this.attachAmenities(rows);
    const resource = result[0];
    const [peakRows] = await this.pool.execute<RowData>(
      `SELECT day_of_week, has_peak, start_time, end_time
       FROM resource_peak_hours WHERE resource_id = ? ORDER BY day_of_week`, [id]
    );
    resource.peak_hours = peakRows.map((r: any) => ({
      dayOfWeek: r.day_of_week,
      hasPeak: r.has_peak,
      startTime: r.start_time,
      endTime: r.end_time,
    }));
    return resource;
  }

  async create(data: any): Promise<number> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO resources (public_id, branch_id, resource_type_id, sport_id, name,
        description, capacity, hourly_price, slot_duration, max_bookings_per_slot,
        opening_time, closing_time, pricing_type, peak_hour_value, images)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [generateUUID(), data.branchId, data.resourceTypeId, data.sportId || null,
       data.name, data.description || null, data.capacity || 1,
       data.hourlyPrice || null, data.slotDuration || null, data.maxBookingsPerSlot || 1,
       data.openingTime || null, data.closingTime || null,
       data.pricingType || 'per_hour', data.peakHourValue || null,
       data.images ? JSON.stringify(data.images) : null]
    );
    return result.insertId;
  }

  async update(id: number, data: any): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ['name','description','capacity','hourly_price','slot_duration',
      'max_bookings_per_slot','is_active','sport_id','resource_type_id',
      'pricing_type','peak_hour_value','opening_time','closing_time'];
    for (const key of allowed) {
      const camelKey = key.replace(/_[a-z]/g, (m: string) => m[1].toUpperCase());
      if (data[camelKey] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[camelKey]);
      } else if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
    if (data.images !== undefined) {
      fields.push('images = ?');
      values.push(JSON.stringify(data.images));
    }
    if (!fields.length) return;
    values.push(id);
    await this.pool.execute(
      `UPDATE resources SET ${fields.join(', ')} WHERE id = ?`, values
    );

    if (data.peakHours) {
      await this.upsertPeakHours(id, data.peakHours);
    }
  }

  async upsertPeakHours(resourceId: number, peakHours: any[]): Promise<void> {
    for (const ph of peakHours) {
      await this.pool.execute(
        `INSERT INTO resource_peak_hours (resource_id, day_of_week, has_peak, start_time, end_time)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE has_peak = VALUES(has_peak),
          start_time = VALUES(start_time), end_time = VALUES(end_time)`,
        [resourceId, ph.dayOfWeek, ph.hasPeak,
         ph.startTime || null, ph.endTime || null]
      );
    }
  }

  async softDelete(id: number): Promise<void> {
    await this.pool.execute(
      `UPDATE resources SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`, [id]
    );
  }

  async setActiveByBranch(branchId: number, isActive: boolean): Promise<void> {
    await this.pool.execute(
      `UPDATE resources SET is_active = ? WHERE branch_id = ? AND deleted_at IS NULL`, [isActive, branchId]
    );
  }

  async getResourceTypes(): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT * FROM resource_types WHERE is_active = TRUE ORDER BY sort_order`
    );
    return rows;
  }

  async createResourceType(data: any): Promise<number> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO resource_types (slug, name, has_slots, default_slot_duration, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [data.slug, data.name, data.hasSlots ?? true, data.defaultSlotDuration ?? 30, data.sortOrder ?? 0]
    );
    return result.insertId;
  }

  async getResourceTypeAttributes(resourceTypeId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT * FROM resource_type_attributes WHERE resource_type_id = ? AND is_active = TRUE`,
      [resourceTypeId]
    );
    return rows;
  }

  async getMaintenanceRecords(resourceId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT * FROM resource_maintenance WHERE resource_id = ? ORDER BY start_date DESC`,
      [resourceId]
    );
    return rows;
  }

  async createMaintenance(data: any): Promise<number> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO resource_maintenance (resource_id, title, description, start_date, end_date, start_time, end_time, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.resourceId, data.title, data.description || null, data.startDate, data.endDate || null,
       data.startTime || null, data.endTime || null, data.reason || null, data.status || 'scheduled']
    );
    return result.insertId;
  }

  async updateMaintenance(id: number, data: any): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ['title', 'description', 'start_date', 'end_date', 'start_time', 'end_time', 'reason', 'status'];
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
      `UPDATE resource_maintenance SET ${fields.join(', ')} WHERE id = ?`, values
    );
  }

  async deleteMaintenance(id: number): Promise<void> {
    await this.pool.execute('DELETE FROM resource_maintenance WHERE id = ?', [id]);
  }

  async saveResourceAttributeValues(resourceId: number, attributes: Record<string, any>): Promise<void> {
    const [res] = await this.pool.execute<RowData>(
      `SELECT resource_type_id FROM resources WHERE id = ?`, [resourceId]
    );
    if (!res.length) return;
    const attrs = await this.getResourceTypeAttributes(res[0].resource_type_id);
    for (const [key, value] of Object.entries(attributes)) {
      const attrDef = attrs.find(a => a.attribute_key === key);
      if (!attrDef) continue;
      await this.pool.execute(
        `INSERT INTO resource_attribute_values (resource_id, attribute_id, value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [resourceId, attrDef.id, String(value)]
      );
    }
  }
}

export const resourceRepository = new ResourceRepository();
