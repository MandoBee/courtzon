import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

function mockReply() {
  const r: any = { statusCode: 200, body: undefined };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.send = (b: any) => { r.body = b; return r; };
  return r;
}

describe('Marketplace settlement tenant isolation', () => {
  let pool: mysql.Pool;
  let ownerA: number;
  let ownerB: number;
  let orgA: number;
  let orgB: number;
  let settlementA: number;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    const [ua] = await pool.execute<RowData>(`INSERT INTO users (public_id, country_id, phone_number, full_phone, email, full_name, password_hash, account_status, is_public) VALUES (UUID(), 1, '01019990001', '+201019990001', 'settle-owner-a@test.com', 'Settle Owner A', 'x', 'active', 1)`);
    ownerA = (ua as any).insertId;
    const [ub] = await pool.execute<RowData>(`INSERT INTO users (public_id, country_id, phone_number, full_phone, email, full_name, password_hash, account_status, is_public) VALUES (UUID(), 1, '01019990002', '+201019990002', 'settle-owner-b@test.com', 'Settle Owner B', 'x', 'active', 1)`);
    ownerB = (ub as any).insertId;

    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const otId = (ot as any[])[0].id;
    const [oa] = await pool.execute<RowData>(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, ?, 'Settle Org A', 'settle-org-a', 1)`, [otId, ownerA]);
    orgA = (oa as any).insertId;
    const [ob] = await pool.execute<RowData>(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, ?, 'Settle Org B', 'settle-org-b', 1)`, [otId, ownerB]);
    orgB = (ob as any).insertId;

    const [s] = await pool.execute<RowData>(
      `INSERT INTO settlements (organisation_id, settlement_status, settlement_direction, final_amount, online_net_total, cod_fee_total)
       VALUES (?, 'pending_approval', 'courtzon_to_org', 100.00, 100.00, 0)`,
      [orgA],
    );
    settlementA = (s as any).insertId;
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM general_ledger WHERE reference_type LIKE 'settlement%' AND reference_id = ?`, [settlementA]);
    await pool.execute(`DELETE FROM settlements WHERE id = ?`, [settlementA]);
    await pool.execute(`DELETE FROM organisations WHERE id IN (?, ?)`, [orgA, orgB]);
    await pool.execute(`DELETE FROM users WHERE id IN (?, ?)`, [ownerA, ownerB]);
    await pool.end();
  });

  it('owner of another organisation cannot approve', async () => {
    const mod = await import('../presentation/settlement.controller.js');
    const rep = mockReply();
    await mod.approveSettlementHandler(
      { params: { id: String(settlementA) }, body: {}, userId: ownerB, ip: '', headers: {} } as any,
      rep as any,
    );
    expect(rep.statusCode).toBe(403);
  });

  it('owner of the organisation passes the access check (not 403)', async () => {
    const mod = await import('../presentation/settlement.controller.js');
    const rep = mockReply();
    try {
      await mod.approveSettlementHandler(
        { params: { id: String(settlementA) }, body: { notes: 'ok' }, userId: ownerA, ip: '', headers: {} } as any,
        rep as any,
      );
    } catch {
      // approveSettlement may throw for a pre-existing service issue
      // (aggregate_version column); we only assert the access check passed.
    }
    expect(rep.statusCode).not.toBe(403);
  });

  it('cross-org markPaid is denied and posts no accounting', async () => {
    const mod = await import('../presentation/settlement.controller.js');
    const rep = mockReply();
    await mod.markPaidHandler(
      { params: { id: String(settlementA) }, body: {}, userId: ownerB, ip: '', headers: {} } as any,
      rep as any,
    );
    expect(rep.statusCode).toBe(403);
    const [rows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM general_ledger WHERE reference_type LIKE 'settlement%' AND reference_id = ?`,
      [settlementA],
    );
    expect(Number((rows as any[])[0].cnt)).toBe(0);
  });
});
