import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

describe('Organisation Manual Journal', () => {
  let pool: mysql.Pool;
  let orgA: number;
  let orgB: number;
  let cashId: number;
  let revenueId: number;
  let orgBCashId: number;

  const reply = { status: (c: number) => ({ send: (b: any) => b }), send: (b: any) => b };

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const otId = (ot as any[])[0].id;
    const [a] = await pool.execute<RowData>(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Org Journal A', 'org-journal-a', 1)`, [otId]);
    orgA = (a as any).insertId;
    const [b] = await pool.execute<RowData>(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Org Journal B', 'org-journal-b', 1)`, [otId]);
    orgB = (b as any).insertId;

    const [cash] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code = '1120' AND organisation_id IS NULL`);
    cashId = (cash as any[])[0].id;
    const [rev] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code = '4100' AND organisation_id IS NULL`);
    revenueId = (rev as any[])[0].id;

    const [l3] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code = 'ASSETS-CASH' AND organisation_id IS NULL`);
    const [oc] = await pool.execute<RowData>(`INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active) VALUES (?, 'ORGB-CASH', 'Org B Cash', 'asset', 'debit', ?, 0, 1)`, [orgB, (l3 as any[])[0].id]);
    orgBCashId = (oc as any).insertId;
  });

  afterAll(async () => {
    for (const orgId of [orgA, orgB]) {
      await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [orgId]);
      await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [orgId]);
      await pool.execute(`DELETE FROM organisation_coa_customizations WHERE organisation_id = ?`, [orgId]);
      await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE organisation_id = ?`, [orgId]);
    }
    await pool.execute(`DELETE FROM chart_of_accounts WHERE id = ?`, [orgBCashId]);
    await pool.execute(`DELETE FROM organisations WHERE id IN (?, ?)`, [orgA, orgB]);
    await pool.end();
  });

  async function createJournal(orgId: number, entries: any[], extra: Record<string, any> = {}) {
    const mod = await import('../presentation/accounting.controller.js');
    return mod.orgJournalCreateHandler(
      { params: { orgId: String(orgId) }, body: { entryDate: '2026-08-14', description: 'Test journal', entries, ...extra }, userId: 1, ip: '', headers: {} } as any,
      reply as any,
    );
  }

  it('posts a balanced organisation journal', async () => {
    const res: any = await createJournal(orgA, [
      { accountId: cashId, debit: 100, credit: 0 },
      { accountId: revenueId, debit: 0, credit: 100 },
    ]);
    expect(Array.isArray(res.data.ids)).toBe(true);
    expect(res.data.ids.length).toBe(2);
  });

  it('rejects an unbalanced journal', async () => {
    await expect(createJournal(orgA, [
      { accountId: cashId, debit: 100, credit: 0 },
      { accountId: revenueId, debit: 0, credit: 50 },
    ])).rejects.toThrow(/balanced/);
  });

  it('rejects a non-postable structural account', async () => {
    const [l3] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code = 'ASSETS-CASH' AND organisation_id IS NULL`);
    const l3Id = (l3 as any[])[0].id;
    await expect(createJournal(orgA, [
      { accountId: l3Id, debit: 100, credit: 0 },
      { accountId: revenueId, debit: 0, credit: 100 },
    ])).rejects.toThrow();
  });

  it('rejects another organisation account (tenant isolation)', async () => {
    await expect(createJournal(orgA, [
      { accountId: orgBCashId, debit: 100, credit: 0 },
      { accountId: revenueId, debit: 0, credit: 100 },
    ])).rejects.toThrow(/another organisation/);
  });

  it('rejects a hidden global account', async () => {
    await pool.execute(`INSERT INTO organisation_coa_customizations (organisation_id, account_id, is_visible) VALUES (?, ?, 0)`, [orgA, revenueId]);
    await expect(createJournal(orgA, [
      { accountId: cashId, debit: 100, credit: 0 },
      { accountId: revenueId, debit: 0, credit: 100 },
    ])).rejects.toThrow(/hidden/);
    await pool.execute(`DELETE FROM organisation_coa_customizations WHERE organisation_id = ? AND account_id = ?`, [orgA, revenueId]);
  });

  it('ignores spoofed body organisationId (route orgId is authoritative)', async () => {
    const res: any = await createJournal(orgA, [
      { accountId: cashId, debit: 25, credit: 0 },
      { accountId: revenueId, debit: 0, credit: 25 },
    ], { organisationId: orgB, description: 'Spoofed org' });
    expect(Array.isArray(res.data.ids)).toBe(true);
    const [rows] = await pool.execute<RowData>(
      `SELECT organisation_id FROM general_ledger WHERE reference_type = 'journal' AND description = 'Spoofed org' LIMIT 1`,
    );
    expect((rows as any[])[0].organisation_id).toBe(orgA);
  });

  it('lists only the organisation own journals', async () => {
    const mod = await import('../presentation/accounting.controller.js');
    const res: any = await mod.orgJournalListHandler({ params: { orgId: String(orgA) }, query: {} } as any, reply as any);
    const rows = res.data;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.organisation_id).toBe(orgA);
      expect(r.reference_type).toBe('journal');
    }
  });
});
