import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export class BanksRepository {
  private pool: mysql.Pool;
  constructor() { this.pool = getPool(); }

  async list(countryId?: number): Promise<any[]> {
    let sql = 'SELECT * FROM banks WHERE 1=1';
    const params: any[] = [];
    if (countryId) { sql += ' AND country_id = ?'; params.push(countryId); }
    sql += ' ORDER BY sort_order, name';
    const [rows] = await this.pool.execute<RowData>(sql, params);
    return rows;
  }

  async findById(id: number): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>('SELECT * FROM banks WHERE id = ?', [id]);
    return rows.length ? rows[0] : null;
  }

  async create(data: any): Promise<number> {
    const [r] = await this.pool.execute<mysql.ResultSetHeader>(
      'INSERT INTO banks (country_id, name, slug, swift, sort_order) VALUES (?, ?, ?, ?, ?)',
      [data.countryId, data.name, data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), data.swift || null, data.sortOrder || 0]
    );
    return r.insertId;
  }

  async update(id: number, data: any): Promise<void> {
    const fields: string[] = []; const vals: any[] = [];
    for (const k of ['country_id','name','swift','is_active','sort_order']) {
      const ck = k.replace(/_[a-z]/g, (m: string) => m[1].toUpperCase());
      if (data[ck] !== undefined) { fields.push(`${k}=?`); vals.push(data[ck]); }
    }
    if (!fields.length) return;
    vals.push(id);
    await this.pool.execute(`UPDATE banks SET ${fields.join(',')} WHERE id=?`, vals);
  }

  async remove(id: number): Promise<void> {
    await this.pool.execute('DELETE FROM banks WHERE id = ?', [id]);
  }

  async listBranches(bankId?: number): Promise<any[]> {
    let sql = 'SELECT * FROM bank_branches WHERE 1=1';
    const params: any[] = [];
    if (bankId) { sql += ' AND bank_id = ?'; params.push(bankId); }
    sql += ' ORDER BY sort_order, name';
    const [rows] = await this.pool.execute<RowData>(sql, params);
    return rows;
  }

  async findBranchById(id: number): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>('SELECT * FROM bank_branches WHERE id = ?', [id]);
    return rows.length ? rows[0] : null;
  }

  async createBranch(data: any): Promise<number> {
    const [r] = await this.pool.execute<mysql.ResultSetHeader>(
      'INSERT INTO bank_branches (bank_id, name, address, sort_order) VALUES (?, ?, ?, ?)',
      [data.bankId, data.name, data.address || null, data.sortOrder || 0]
    );
    return r.insertId;
  }

  async updateBranch(id: number, data: any): Promise<void> {
    const fields: string[] = []; const vals: any[] = [];
    for (const k of ['name','address','is_active','sort_order']) {
      const ck = k.replace(/_[a-z]/g, (m: string) => m[1].toUpperCase());
      if (data[ck] !== undefined) { fields.push(`${k}=?`); vals.push(data[ck]); }
    }
    if (!fields.length) return;
    vals.push(id);
    await this.pool.execute(`UPDATE bank_branches SET ${fields.join(',')} WHERE id=?`, vals);
  }

  async removeBranch(id: number): Promise<void> {
    await this.pool.execute('DELETE FROM bank_branches WHERE id = ?', [id]);
  }
}

export const banksRepository = new BanksRepository();
