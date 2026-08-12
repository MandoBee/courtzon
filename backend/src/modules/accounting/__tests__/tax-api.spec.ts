import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

describe('Tax Rate API + Marketplace Tax', () => {
  let pool: mysql.Pool;
  let orgId: number;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const [o] = await pool.execute<RowData>(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Tax API Test', 'tax-api-test', 1)`, [(ot as any[])[0].id]);
    orgId = (o as any).insertId;
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM tax_rates WHERE name LIKE 'API%'`);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.end();
  });

  it('1. createTaxRateHandler persists org scope + category + type', async () => {
    const mod = await import('../presentation/accounting.controller.js');
    const mockReply = { status: (c: number) => ({ send: (b: any) => b }) };
    const mockReq: any = { body: { name: 'API Global 5%', rate: 5, rateType: 'percentage', taxCategory: 'vat' }, userId: 1, ip: '', headers: {} };
    const res = await mod.createTaxRateHandler(mockReq, mockReply as any);
    expect(res.data.id).toBeGreaterThan(0);
  });

  it('2. org-scoped tax rate created', async () => {
    const mod = await import('../presentation/accounting.controller.js');
    const mockReply = { status: (c: number) => ({ send: (b: any) => b }) };
    const mockReq: any = { body: { name: 'API Org 8%', rate: 8, rateType: 'percentage', taxCategory: 'gst', organisationId: orgId }, userId: 1, ip: '', headers: {} };
    const res = await mod.createTaxRateHandler(mockReq, mockReply as any);
    expect(res.data.organisation_id).toBe(orgId);
    expect(res.data.tax_category).toBe('gst');
  });

  it('3. duplicate scoped tax rate rejected by unique index', async () => {
    const mod = await import('../presentation/accounting.controller.js');
    const mockReply = { status: (c: number) => ({ send: (b: any) => b }) };
    const mockReq: any = { body: { name: 'API Org 8%', rate: 8, rateType: 'percentage', taxCategory: 'gst', organisationId: orgId }, userId: 1, ip: '', headers: {} };
    await expect(mod.createTaxRateHandler(mockReq, mockReply as any)).rejects.toThrow();
  });

  it('4. invalid category rejected', async () => {
    const mod = await import('../presentation/accounting.controller.js');
    const mockReply = { status: (c: number) => ({ send: (b: any) => b }) };
    const mockReq: any = { body: { name: 'Bad Cat', rate: 5, rateType: 'percentage', taxCategory: 'invalid_cat' }, userId: 1, ip: '', headers: {} };
    await expect(mod.createTaxRateHandler(mockReq, mockReply as any)).rejects.toThrow();
  });

  it('5. marketplace resolveOrderTax returns persisted tax', async () => {
    const [ord] = await pool.execute<RowData>(`INSERT INTO orders (public_id, buyer_id, subtotal, tax_amount, total, currency_code, shipping_cost, commission_amount, courtzon_commission, org_product_share, org_shipping_share, discount_amount, courtzon_fee) VALUES (UUID(), 1, 100, 15, 115, 'EGP', 0, 0, 0, 0, 0, 0, 0)`);
    const orderId = (ord as any).insertId;

    const [rows] = await pool.execute<RowData>(`SELECT COALESCE(tax_amount, 0) AS tax_amount FROM orders WHERE id = ?`, [orderId]);
    expect(Number((rows as any[])[0].tax_amount)).toBe(15);

    await pool.execute(`DELETE FROM orders WHERE id = ?`, [orderId]);
  });

  it('6. invoice_items support price_type + tax_treatment columns', async () => {
    const [cols] = await pool.execute<RowData>(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'courtzon_v3' AND TABLE_NAME = 'invoice_items'`);
    const names = (cols as any[]).map(c => c.COLUMN_NAME);
    expect(names).toContain('price_type');
    expect(names).toContain('tax_treatment');
    expect(names).toContain('tax_rate_id');
    expect(names).toContain('net_amount');
  });
});
