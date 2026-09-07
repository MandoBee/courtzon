import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3022';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * Unified settlement breakdown persistence.
 *
 * The unified settlement row must persist the explicit online-vs-COD split
 * (online_net_total / cod_fee_total) plus gross / courtzon_fee / organization_net
 * so the GL settlement:paid handler can clear the FULL merchant payable AND the
 * FULL COD commission receivable against the net cash movement, and the UI can
 * show the auditable breakdown.
 */
describe('Unified Settlement Breakdown Persistence', () => {
  let pool: mysql.Pool;
  let orgId: number;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    await pool.execute(`DELETE FROM settlements WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'sett-breakdown-org')`);
    await pool.execute(`DELETE FROM organisations WHERE slug = 'sett-breakdown-org'`);
    const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
    const otId = (ot as any[])[0].id;
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Sett Breakdown Org', 'sett-breakdown-org', 1)`,
      [otId],
    );
    orgId = (o as any).insertId;
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM settlements WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.end();
  });

  it('persists the online vs COD breakdown at settlement creation', async () => {
    const { unifiedSettlementRepository } = await import('../infrastructure/repositories/unified-settlement.repository.js');

    const settlementId = await unifiedSettlementRepository.create({
      organisationId: orgId,
      branchId: null,
      requestedBy: 1,
      requestedByRole: 'admin',
      batchCode: 'SET-BREAKDOWN-TEST',
      settlementType: 'unified',
      organizationPosition: 40,
      courtzonPosition: 760,
      net: 720,
      direction: 'COURTZON_TO_ORGANIZATION',
      finalAmount: 720,
      commissionAmount: 40,
      grossAmount: 800,
      courtzonFee: 40,
      organizationNet: 760,
      onlineNetTotal: 760,
      codFeeTotal: 40,
      notes: 'breakdown round-trip test',
    });

    const [rows] = await pool.execute<RowData>(
      `SELECT gross_amount, courtzon_fee, organization_net, online_net_total, cod_fee_total, net_amount, final_amount
       FROM settlements WHERE id = ?`,
      [settlementId],
    );
    const r = (rows as any[])[0];
    expect(Number(r.gross_amount)).toBe(800);
    expect(Number(r.courtzon_fee)).toBe(40);
    expect(Number(r.organization_net)).toBe(760);
    expect(Number(r.online_net_total)).toBe(760);
    expect(Number(r.cod_fee_total)).toBe(40);
    expect(Number(r.net_amount)).toBe(720);
    expect(Number(r.final_amount)).toBe(720);
  });
});