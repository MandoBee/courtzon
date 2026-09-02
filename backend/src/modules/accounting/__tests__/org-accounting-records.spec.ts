/**
 * Organisation Accounting Records — integration spec.
 *
 * The organisation-scoped records endpoint (orgAccountingRecordsHandler) lists
 * EVERY general-ledger entry belonging to the organisation: automatically
 * created entries (marketplace orders, bookings, settlements, …) AND manual
 * journal entries (reference_type='journal'). :orgId is authoritative — an
 * organisation can never read another organisation's (or the platform's)
 * records.
 */
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3003';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { orgAccountingRecordsHandler } from '../presentation/accounting.controller.js';

type RowData = RowDataPacket[];

describe('Organisation Accounting Records', () => {
  let pool: mysql.Pool;
  let orgA: number;
  let orgB: number;
  let manualRowIdA: number;
  let autoRowIdA: number;
  let rowIdB: number;
  let accountId: number;
  let periodId: number;
  let createdPeriod: number | null = null;

  function makeReply() {
    const r: any = {};
    r.status = () => r;
    r.send = (body: any) => body;
    return r;
  }

  async function list(orgId: number) {
    const mod = await import('../presentation/accounting.controller.js');
    const res: any = await mod.orgAccountingRecordsHandler({ params: { orgId: String(orgId) }, query: {} } as any, makeReply() as any);
    return res?.data ?? [];
  }

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });

    // Clean any prior fixture rows.
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (SELECT id FROM organisations WHERE slug LIKE 'org-records-fixture-%')`);
    await pool.execute(`DELETE FROM organisations WHERE slug LIKE 'org-records-fixture-%'`);

    // Resolve (or create) an open global accounting period for the GL rows.
    const [periods] = await pool.execute<RowData>(`SELECT id FROM accounting_periods WHERE organisation_id IS NULL AND status='open' ORDER BY id LIMIT 1`);
    if ((periods as any[]).length) {
      periodId = (periods as any[])[0].id;
    } else {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const last = new Date(y, m, 0).getDate();
      const end = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
      const [ins] = await pool.execute<RowData>(
        `INSERT INTO accounting_periods (organisation_id, fiscal_year, period_number, start_date, end_date, status) VALUES (NULL, ?, ?, ?, ?, 'open')`,
        [y, m, start, end],
      );
      periodId = (ins as any).insertId;
      createdPeriod = periodId;
    }

    const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
    const otId = (ot as any[])[0].id;
    const [a] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Records Org A', 'org-records-fixture-a', 1)`, [otId],
    );
    orgA = (a as any).insertId;
    const [b] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Records Org B', 'org-records-fixture-b', 1)`, [otId],
    );
    orgB = (b as any).insertId;

    // A postable global account for GL rows.
    const [acc] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code = '1120' AND organisation_id IS NULL LIMIT 1`);
    accountId = (acc as any[])[0]?.id ?? (await pool.execute<RowData>(`SELECT id FROM chart_of_accounts LIMIT 1`))[0][0]?.id;

    // Org A: one MANUAL journal line + one AUTOMATIC marketplace line.
    const [m] = await pool.execute<RowData>(
      `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
       VALUES (?, ?, ?, '2026-09-01', 100, 0, 0, 'journal', 999901, 'Manual journal fixture', 1)`,
      [orgA, periodId, accountId],
    );
    manualRowIdA = (m as any).insertId;
    const [auto] = await pool.execute<RowData>(
      `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
       VALUES (?, ?, ?, '2026-09-01', 0, 60, 0, 'marketplace_marketplace_org_receivable', 24, 'Automatic org-book fixture', 1)`,
      [orgA, periodId, accountId],
    );
    autoRowIdA = (auto as any).insertId;

    // Org B: an unrelated row that must NEVER leak into org A's records.
    const [bRow] = await pool.execute<RowData>(
      `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
       VALUES (?, ?, ?, '2026-09-01', 0, 999, 0, 'marketplace_marketplace_org_receivable', 500, 'Org B fixture', 1)`,
      [orgB, periodId, accountId],
    );
    rowIdB = (bRow as any).insertId;
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (?, ?)`, [orgA, orgB]);
    await pool.execute(`DELETE FROM organisations WHERE id IN (?, ?)`, [orgA, orgB]);
    if (createdPeriod != null) {
      const [refs] = await pool.execute<RowData>(`SELECT COUNT(*) AS c FROM general_ledger WHERE period_id = ?`, [createdPeriod]);
      if (Number((refs as any[])[0].c) === 0) {
        await pool.execute(`DELETE FROM accounting_periods WHERE id = ?`, [createdPeriod]);
      }
    }
    await pool.end();
  });

  it('returns BOTH automatic and manual entries for the organisation', async () => {
    const rows = await list(orgA);
    expect(rows.some((r: any) => r.id === manualRowIdA)).toBe(true);
    expect(rows.some((r: any) => r.id === autoRowIdA)).toBe(true);
    // Manual journal line is clearly identifiable.
    const manual = rows.find((r: any) => r.id === manualRowIdA);
    expect(manual.reference_type).toBe('journal');
    expect(manual.account_code).toBe('1120');
    // Automatic entry is included.
    const auto = rows.find((r: any) => r.id === autoRowIdA);
    expect(auto.reference_type).toBe('marketplace_marketplace_org_receivable');
    expect(Number(auto.credit)).toBe(60);
  });

  it('never leaks another organisation\'s records (org isolation)', async () => {
    const rowsA = await list(orgA);
    expect(rowsA.some((r: any) => r.id === rowIdB)).toBe(false);
    const rowsB = await list(orgB);
    expect(rowsB.some((r: any) => r.id === rowIdB)).toBe(true);
    expect(rowsB.some((r: any) => r.id === manualRowIdA)).toBe(false);
  });

  it('returns an empty list for an organisation with no records', async () => {
    const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
    const [c] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Records Org C', 'org-records-fixture-c', 1)`, [(ot as any[])[0].id],
    );
    const orgC = (c as any).insertId;
    try {
      const rows = await list(orgC);
      expect(rows).toEqual([]);
    } finally {
      await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgC]);
    }
  });
});