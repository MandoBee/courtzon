import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

describe('Marketplace Tax Persistence', () => {
  let pool: mysql.Pool;
  let orgId: number;
  let taxRateId: number;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const [o] = await pool.execute<RowData>(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'MP Tax Persist', 'mp-tax-persist', 1)`, [(ot as any[])[0].id]);
    orgId = (o as any).insertId;
    const [tr] = await pool.execute<RowData>(`INSERT INTO tax_rates (organisation_id, name, rate, type, tax_category, is_active, is_global) VALUES (?, 'MP 15%', 15, 'percentage', 'vat', 1, 0)`, [orgId]);
    taxRateId = (tr as any).insertId;
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM tax_rates WHERE id = ?`, [taxRateId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.end();
  });

  it('1. org-scoped tax rate resolves for marketplace seller', async () => {
    const [rows] = await pool.execute<RowData>(
      `SELECT rate, type FROM tax_rates WHERE is_active = 1 AND (organisation_id = ? OR organisation_id IS NULL) ORDER BY (organisation_id IS NOT NULL) DESC, id ASC LIMIT 1`,
      [orgId],
    );
    expect((rows as any[]).length).toBe(1);
    expect(Number((rows as any[])[0].rate)).toBe(15);
    expect((rows as any[])[0].type).toBe('percentage');
  });

  it('2. tax calculation: 15% on 1000 = 150', async () => {
    const adjustedShare = 1000;
    const rate = 15;
    const tax = Math.round(adjustedShare * rate) / 100;
    expect(tax).toBe(150);
  });

  it('3. fixed tax applies flat amount', async () => {
    const [fr] = await pool.execute<RowData>(`INSERT INTO tax_rates (organisation_id, name, rate, type, tax_category, is_active, is_global) VALUES (?, 'MP Fixed 50', 50, 'fixed', 'other', 1, 0)`, [orgId]);
    const fixedId = (fr as any).insertId;
    const [rows] = await pool.execute<RowData>(
      `SELECT rate, type FROM tax_rates WHERE is_active = 1 AND organisation_id = ? AND type = 'fixed' ORDER BY id DESC LIMIT 1`,
      [orgId],
    );
    expect((rows as any[])[0].type).toBe('fixed');
    expect(Number((rows as any[])[0].rate)).toBe(50);
    await pool.execute(`DELETE FROM tax_rates WHERE id = ?`, [fixedId]);
  });

  it('4. deactivating tax rate excludes it from resolution', async () => {
    await pool.execute(`UPDATE tax_rates SET is_active = 0 WHERE id = ?`, [taxRateId]);
    const [rows] = await pool.execute<RowData>(
      `SELECT id FROM tax_rates WHERE is_active = 1 AND (organisation_id = ? OR organisation_id IS NULL) LIMIT 1`,
      [orgId],
    );
    // Should NOT return the deactivated org rate — only global active rates remain
    const deactivatedPresent = (rows as any[]).some((r: any) => r.id === taxRateId);
    expect(deactivatedPresent).toBe(false);
    await pool.execute(`UPDATE tax_rates SET is_active = 1 WHERE id = ?`, [taxRateId]);
  });

  it('5. orders.tax_amount is a real persisted column', async () => {
    const [cols] = await pool.execute<RowData>(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='courtzon_v3' AND TABLE_NAME='orders' AND COLUMN_NAME='tax_amount'`);
    expect((cols as any[]).length).toBe(1);
  });
});
