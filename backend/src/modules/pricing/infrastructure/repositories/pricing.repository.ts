import { getPool } from '../../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

type RowData = RowDataPacket[];

export class PricingRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  // ── Pricing Rules ──

  async findRules(filters?: { scope?: string; scopeId?: number; resourceId?: number }): Promise<any[]> {
    let sql = 'SELECT * FROM pricing_rules WHERE 1=1';
    const params: any[] = [];
    if (filters?.scope) { sql += ' AND scope = ?'; params.push(filters.scope); }
    if (filters?.scopeId) { sql += ' AND scope_id = ?'; params.push(filters.scopeId); }
    if (filters?.resourceId) { sql += ' AND resource_id = ?'; params.push(filters.resourceId); }
    sql += ' ORDER BY priority ASC';
    const [rows] = await this.pool.execute<RowData>(sql, params);
    return rows;
  }

  async findRuleById(id: number): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>('SELECT * FROM pricing_rules WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async createRule(data: any): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO pricing_rules (name, rule_type, scope, scope_id, resource_id, value, priority, days_of_week, time_start, time_end, date_start, date_end, is_active, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.ruleType, data.scope, data.scopeId || null, data.resourceId || null,
       data.value, data.priority || 0,
       data.daysOfWeek ? JSON.stringify(data.daysOfWeek) : null,
       data.timeRange?.start || null, data.timeRange?.end || null,
       data.dateRange?.start || null, data.dateRange?.end || null,
       data.isActive ?? true, data.metadata ? JSON.stringify(data.metadata) : null],
    );
    return result.insertId;
  }

  async updateRule(id: number, data: any): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (key === 'id') continue;
      const col = key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
      fields.push(`${col} = ?`);
      params.push(value);
    }
    if (!fields.length) return;
    params.push(id);
    await this.pool.execute(`UPDATE pricing_rules SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  async deleteRule(id: number): Promise<void> {
    await this.pool.execute('DELETE FROM pricing_rules WHERE id = ?', [id]);
  }

  // ── Season Rules ──

  async findSeasons(organisationId?: number): Promise<any[]> {
    let sql = 'SELECT * FROM pricing_seasons WHERE 1=1';
    const params: any[] = [];
    if (organisationId) { sql += ' AND organisation_id = ?'; params.push(organisationId); }
    sql += ' ORDER BY date_start ASC';
    const [rows] = await this.pool.execute<RowData>(sql, params);
    return rows;
  }

  async createSeason(data: any): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO pricing_seasons (name, organisation_id, date_start, date_end, multiplier, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.name, data.organisationId || null, data.dateRange.start, data.dateRange.end, data.multiplier, data.isActive ?? true],
    );
    return result.insertId;
  }

  async deleteSeason(id: number): Promise<void> {
    await this.pool.execute('DELETE FROM pricing_seasons WHERE id = ?', [id]);
  }

  // ── Resource base price ──

  async getResourceBasePrice(resourceId: number): Promise<number> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT hourly_rate FROM resources WHERE id = ?', [resourceId],
    );
    return rows.length ? Number(rows[0].hourly_rate) : 0;
  }
}

export const pricingRepository = new PricingRepository();
