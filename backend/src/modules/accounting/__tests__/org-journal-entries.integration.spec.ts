/**
 * Organisation Journal Entries — integration spec.
 *
 * The organisation-scoped journal-entries endpoint (orgJournalEntriesHandler)
 * delegates to the SAME canonical grouped query used by the Super Admin Journal
 * Entries screen (listJournalEntriesHandler), with the organisation scope
 * injected from the authoritative :orgId route param. The organisation user
 * therefore sees exactly their own general-ledger journal entries — identical
 * data, lines and debit/credit — and never another organisation's (or the
 * platform's).
 */
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3004';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { orgJournalEntriesHandler } from '../presentation/accounting.controller.js';
import { listJournalEntriesHandler } from '../presentation/accounting.controller.js';

type RowData = RowDataPacket[];

describe('Organisation Journal Entries (canonical, org-scoped)', () => {
  let pool: mysql.Pool;
  let orgA: number;
  let orgB: number;
  let periodId: number;
  let createdPeriod: number | null = null;
  // account ids resolved by code (global accounts are fine for GL fixture rows)
  const acc: Record<string, number> = {};

  function makeReply() {
    const r: any = {};
    r.status = () => r;
    r.send = (body: any) => body;
    return r;
  }

  async function orgEntries(orgId: number, query: Record<string, string> = {}) {
    const res: any = await orgJournalEntriesHandler({ params: { orgId: String(orgId) }, query } as any, makeReply() as any);
    return res;
  }

  async function adminEntries(query: Record<string, string> = {}) {
    const res: any = await listJournalEntriesHandler({ query } as any, makeReply() as any);
    return res;
  }

  async function glInsert(orgId: number | null, entryDate: string, debit: number, credit: number, refType: string, refId: number, desc: string, code: string) {
    await pool.execute<RowData>(
      `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1)`,
      [orgId, periodId, acc[code], entryDate, debit, credit, refType, refId, desc],
    );
  }

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });

    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (SELECT id FROM organisations WHERE slug LIKE 'org-journal-fixture-%')`);
    await pool.execute(`DELETE FROM organisations WHERE slug LIKE 'org-journal-fixture-%'`);

    // Resolve (or create) an open global accounting period.
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

    for (const code of ['1120', '4100', '1161', '1100', '2202', '4160']) {
      const [r] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code = ? LIMIT 1`, [code]);
      acc[code] = (r as any[])[0]?.id;
    }
    expect(acc['1120']).toBeTruthy();
    expect(acc['1161']).toBeTruthy();

    const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
    const otId = (ot as any[])[0].id;
    const [a] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Journal Org A', 'org-journal-fixture-a', 1)`, [otId],
    );
    orgA = (a as any).insertId;
    const [b] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Journal Org B', 'org-journal-fixture-b', 1)`, [otId],
    );
    orgB = (b as any).insertId;

    // Org A: one MANUAL journal entry (balanced) …
    await glInsert(orgA, '2026-09-01', 100, 0, 'journal', 999901, 'Manual journal fixture', '1120');
    await glInsert(orgA, '2026-09-01', 0, 100, 'journal', 999901, 'Manual journal fixture', '4100');
    // …and one AUTOMATIC org-book entry (Dr 1161 810 + Dr 4100 40 / Cr 2202 800 + Cr 1100 50).
    await glInsert(orgA, '2026-08-30', 810, 0, 'marketplace_marketplace_org_receivable', 24, 'Order #24 organization book', '1161');
    await glInsert(orgA, '2026-08-30', 40, 0, 'marketplace_marketplace_org_receivable', 24, 'Order #24 organization book', '4100');
    await glInsert(orgA, '2026-08-30', 0, 800, 'marketplace_marketplace_org_receivable', 24, 'Order #24 organization book', '2202');
    await glInsert(orgA, '2026-08-30', 0, 50, 'marketplace_marketplace_org_receivable', 24, 'Order #24 organization book', '1100');

    // Org B: an unrelated automatic entry that must never leak into org A.
    await glInsert(orgB, '2026-08-30', 999, 0, 'marketplace_marketplace_org_receivable', 500, 'Org B entry', '1161');
    await glInsert(orgB, '2026-08-30', 0, 999, 'marketplace_marketplace_org_receivable', 500, 'Org B entry', '2202');

    // Platform (org NULL) CourtZon-book entry — must never leak into an org.
    await glInsert(null, '2026-08-30', 850, 0, 'marketplace_marketplace_card_payment', 24, 'Order #24 courtzon book', '1100');
    await glInsert(null, '2026-08-30', 0, 810, 'marketplace_marketplace_card_payment', 24, 'Order #24 courtzon book', '2202');
    await glInsert(null, '2026-08-30', 0, 40, 'marketplace_marketplace_card_payment', 24, 'Order #24 courtzon book', '4160');
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (?, ?) OR (organisation_id IS NULL AND reference_type='marketplace_marketplace_card_payment' AND reference_id=24)`, [orgA, orgB]);
    await pool.execute(`DELETE FROM organisations WHERE id IN (?, ?)`, [orgA, orgB]);
    if (createdPeriod != null) {
      const [refs] = await pool.execute<RowData>(`SELECT COUNT(*) AS c FROM general_ledger WHERE period_id = ?`, [createdPeriod]);
      if (Number((refs as any[])[0].c) === 0) {
        await pool.execute(`DELETE FROM accounting_periods WHERE id = ?`, [createdPeriod]);
      }
    }
    await pool.end();
  });

  function lineTotals(entry: any) {
    const dr = entry.lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
    const cr = entry.lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
    return { dr, cr };
  }

  it('returns ONLY the organisation\'s own journal entries (automatic + manual), balanced', async () => {
    const res = await orgEntries(orgA);
    const entries = res.data;
    expect(entries.length).toBe(2); // manual + automatic org-book

    const manual = entries.find((e: any) => e.reference_type === 'journal');
    expect(manual).toBeTruthy();
    expect(manual.lines.length).toBe(2);
    expect(lineTotals(manual)).toEqual({ dr: 100, cr: 100 });

    const auto = entries.find((e: any) => e.reference_type === 'marketplace_marketplace_org_receivable');
    expect(auto).toBeTruthy();
    expect(auto.reference_id).toBe(24);
    expect(auto.lines.length).toBe(4);
    // Same accounting values as the canonical screen for Order #24's org book.
    expect(lineTotals(auto)).toEqual({ dr: 850, cr: 850 });
    const dr810 = auto.lines.find((l: any) => l.account_code === '1161');
    const dr40 = auto.lines.find((l: any) => l.account_code === '4100');
    expect(dr810.debit).toBe(810);
    expect(dr40.debit).toBe(40);
  });

  it('never leaks another organisation\'s or the platform\'s entries', async () => {
    const resA = await orgEntries(orgA);
    const refsA = (resA.data as any[]).map((e: any) => `${e.reference_type}:${e.reference_id}`);
    expect(refsA).not.toContain('marketplace_marketplace_org_receivable:500'); // org B
    expect(refsA).not.toContain('marketplace_marketplace_card_payment:24');   // platform
    expect((resA.data as any[]).every((e: any) => e.organisation_id === orgA)).toBe(true);

    const resB = await orgEntries(orgB);
    const refsB = (resB.data as any[]).map((e: any) => `${e.reference_type}:${e.reference_id}`);
    expect(refsB).toContain('marketplace_marketplace_org_receivable:500');
    expect(refsB).not.toContain('journal:999901');
    expect(refsB).not.toContain('marketplace_marketplace_card_payment:24');
  });

  it('date filters work on the same canonical query', async () => {
    const res = await orgEntries(orgA, { dateFrom: '2026-09-01', dateTo: '2026-09-01' });
    const entries = res.data as any[];
    expect(entries.length).toBe(1);
    expect(entries[0].reference_type).toBe('journal');
  });

it('Super Admin (no org scope) still receives the same entries via the canonical query', async () => {
  // Without the org scope the canonical query returns the same fixture entries
  // (org + platform), proving the org param is the ONLY difference.
  const manual = await adminEntries({ grouped: 'true', referenceType: 'journal', referenceId: '999901' });
  expect(manual.data.length).toBe(1);
  expect(manual.data[0].organisation_id).toBe(orgA);

  const orgAEntry = await adminEntries({ grouped: 'true', referenceType: 'marketplace_marketplace_org_receivable', referenceId: '24' });
  expect(orgAEntry.data.length).toBe(1);
  expect(orgAEntry.data[0].organisation_id).toBe(orgA);
  expect(lineTotals(orgAEntry.data[0])).toEqual({ dr: 850, cr: 850 });

  const orgBEntry = await adminEntries({ grouped: 'true', referenceType: 'marketplace_marketplace_org_receivable', referenceId: '500' });
  expect(orgBEntry.data.length).toBe(1);
  expect(orgBEntry.data[0].organisation_id).toBe(orgB);

  const platform = await adminEntries({ grouped: 'true', referenceType: 'marketplace_marketplace_card_payment', referenceId: '24' });
  expect(platform.data.length).toBe(1);
  expect(platform.data[0].organisation_id).toBeNull();
  expect(lineTotals(platform.data[0])).toEqual({ dr: 850, cr: 850 });
});

  it('the org route is protected by the org.accounting.view permission (source-level)', () => {
    const routesPath = path.resolve(__dirname, '../presentation/accounting.routes.ts');
    const routes = fs.readFileSync(routesPath, 'utf-8');
    expect(routes).toContain(`app.get('/org/:orgId/accounting/journal-entries', { preHandler: [orgAccountingView] }, ctrl.orgJournalEntriesHandler)`);
    expect(routes).toContain(`requireOrgScopedPermission('org.accounting.view')`);
  });
});