import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3002';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

describe('Marketplace settlement markPaid concurrency (V2 aggregate)', () => {
  let pool: mysql.Pool;
  let ownerId: number;
  let orgId: number;
  let settlementId: number;
  let settlement2Id: number; // pending_approval — invalid pay state
  let settlement3Id: number; // approved — used for sequential test

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 10, charset: 'utf8mb4' });
    const [u] = await pool.execute<RowData>(`INSERT INTO users (public_id, country_id, phone_number, full_phone, email, full_name, password_hash, account_status, is_public) VALUES (UUID(), 1, '01019991001', '+201019991001', 'settle-pay-owner@test.com', 'Pay Owner', 'x', 'active', 1)`);
    ownerId = (u as any).insertId;
    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const otId = (ot as any[])[0].id;
    const [o] = await pool.execute<RowData>(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, ?, 'Pay Org', 'pay-org', 1)`, [otId, ownerId]);
    orgId = (o as any).insertId;

    const [s1] = await pool.execute<RowData>(
      `INSERT INTO settlements (organisation_id, settlement_status, settlement_direction, final_amount, online_net_total, cod_fee_total)
       VALUES (?, 'approved', 'courtzon_to_org', 100.00, 100.00, 0)`, [orgId],
    );
    settlementId = (s1 as any).insertId;

    const [s2] = await pool.execute<RowData>(
      `INSERT INTO settlements (organisation_id, settlement_status, settlement_direction, final_amount, online_net_total, cod_fee_total)
       VALUES (?, 'pending_approval', 'courtzon_to_org', 100.00, 100.00, 0)`, [orgId],
    );
    settlement2Id = (s2 as any).insertId;

    const [s3] = await pool.execute<RowData>(
      `INSERT INTO settlements (organisation_id, settlement_status, settlement_direction, final_amount, online_net_total, cod_fee_total)
       VALUES (?, 'approved', 'org_to_courtzon', 50.00, 0, 50.00)`, [orgId],
    );
    settlement3Id = (s3 as any).insertId;
  });

  afterAll(async () => {
    for (const sid of [settlementId, settlement2Id, settlement3Id]) {
      await pool.execute(`DELETE FROM published_events WHERE aggregate_type='settlement' AND aggregate_id = ?`, [String(sid)]);
      await pool.execute(`DELETE FROM general_ledger WHERE reference_type LIKE 'settlement%' AND reference_id = ?`, [sid]);
      await pool.execute(`DELETE te FROM transaction_entries te JOIN transactions t ON t.id = te.transaction_id WHERE t.source_type='settlement' AND t.source_id = ?`, [sid]);
      await pool.execute(`DELETE FROM transactions WHERE source_type='settlement' AND source_id = ?`, [sid]);
      await pool.execute(`DELETE FROM settlement_transfers WHERE settlement_id = ?`, [sid]);
      await pool.execute(`DELETE FROM settlement_orders WHERE settlement_id = ?`, [sid]);
      await pool.execute(`DELETE FROM settlements WHERE id = ?`, [sid]);
    }
    await pool.execute(`DELETE FROM processed_commands WHERE command_type='MarkSettlementPaid'`);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.execute(`DELETE FROM users WHERE id = ?`, [ownerId]);
    await pool.end();
  });

  it('two concurrent markPaid requests result in exactly one success and one payout', async () => {
    const { settlementService } = await import('../application/settlement.service.js');

    const results = await Promise.allSettled([
      settlementService.markPaid(settlementId),
      settlementService.markPaid(settlementId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const [rows] = await pool.execute<RowData>(
      `SELECT settlement_status, aggregate_version FROM settlements WHERE id = ?`, [settlementId],
    );
    expect((rows as any[])[0].settlement_status).toBe('paid');
    expect(Number((rows as any[])[0].aggregate_version)).toBe(2);

    const [txnRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM transactions WHERE type='payout' AND source_type='settlement' AND source_id = ?`,
      [settlementId],
    );
    expect(Number((txnRows as any[])[0].cnt)).toBe(1);

    const [evtRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM published_events WHERE event_name='settlement:paid' AND aggregate_type='settlement' AND aggregate_id = ?`,
      [String(settlementId)],
    );
    expect(Number((evtRows as any[])[0].cnt)).toBe(1);
  });

  it('repeated sequential markPaid fails without a duplicate payout', async () => {
    const { settlementService } = await import('../application/settlement.service.js');

    await settlementService.markPaid(settlement3Id);
    await expect(settlementService.markPaid(settlement3Id)).rejects.toThrow();

    const [txnRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM transactions WHERE type='payout' AND source_type='settlement' AND source_id = ?`,
      [settlement3Id],
    );
    expect(Number((txnRows as any[])[0].cnt)).toBe(1);

    const [evtRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM published_events WHERE event_name='settlement:paid' AND aggregate_type='settlement' AND aggregate_id = ?`,
      [String(settlement3Id)],
    );
    expect(Number((evtRows as any[])[0].cnt)).toBe(1);
  });

  it('invalid state (pending_approval) cannot be paid', async () => {
    const { settlementService } = await import('../application/settlement.service.js');
    await expect(settlementService.markPaid(settlement2Id)).rejects.toThrow('Cannot mark paid in status "pending_approval"');

    const [txnRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM transactions WHERE type='payout' AND source_type='settlement' AND source_id = ?`,
      [settlement2Id],
    );
    expect(Number((txnRows as any[])[0].cnt)).toBe(0);
  });
});
