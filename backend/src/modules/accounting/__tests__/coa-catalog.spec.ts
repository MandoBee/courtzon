import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

describe('L4 Catalog + Organisation COA Customization', () => {
  let pool: mysql.Pool;
  let orgA: number;
  let orgB: number;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const otId = (ot as any[])[0].id;
    const [a] = await pool.execute<RowData>(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'COA Catalog Org A', 'coa-catalog-org-a', 1)`, [otId]);
    orgA = (a as any).insertId;
    const [b] = await pool.execute<RowData>(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'COA Catalog Org B', 'coa-catalog-org-b', 1)`, [otId]);
    orgB = (b as any).insertId;
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM organisation_coa_customizations WHERE organisation_id IN (?, ?)`, [orgA, orgB]);
    await pool.execute(`DELETE FROM organisations WHERE id IN (?, ?)`, [orgA, orgB]);
    await pool.end();
  });

  it('every EVENT_CONCEPTS event resolves a complete global mapping', async () => {
    const { EVENT_CONCEPTS, getEventConcepts, validateCompleteMapping } = await import('../../financial/application/accounting-concepts.js');
    const { accountingEngineService, ORG_BOOK_EVENTS } = await import('../../financial/application/accounting-engine.service.js');
    const eventTypes = Object.keys(EVENT_CONCEPTS);
    expect(eventTypes.length).toBeGreaterThanOrEqual(46);

    for (const eventType of eventTypes) {
      // Organization-book events are org-scoped by design (their accounts are
      // org-owned L4 accounts MKT-SALES / MKT-COMM-EXP / MKT-SHIP-LIAB / org 1161).
      // They have NO global mapping — resolving them with org=null is invalid.
      if (ORG_BOOK_EVENTS[eventType]) continue;
      const mapping = await accountingEngineService.resolveMapping(eventType, null);
      const mappedConcepts = mapping.map(m => m.concept);
      const missing = validateCompleteMapping(eventType, mappedConcepts);
      expect(missing, `${eventType} missing concepts`).toEqual([]);
      // Every mapped account must be a real, active L4 postable account.
      const ids = [...new Set(mapping.map(m => m.accountId))];
      for (const id of ids) {
        await expect(accountingEngineService.validateAccounts([id], null)).resolves.toBeUndefined();
      }
    }
  });

  it('catalog contains the expected default L4 accounts with correct parents', async () => {
    const cases: [string, string, string, string][] = [
      ['1121', 'Bank 2', 'ASSETS-CASH', 'asset'],
      ['1125', 'Cash Register 1', 'ASSETS-CASH', 'asset'],
      ['1110', 'Payment Gateway 1', 'ASSETS-CLEARING', 'asset'],
      ['1161', 'Marketplace Receivable', 'ASSETS-RECEIVABLES', 'asset'],
      ['2201', 'Coach Payable', 'LIABILITIES-PAYABLES', 'liability'],
      ['2450', 'Settlement Payable', 'LIABILITIES-PAYABLES', 'liability'],
      ['2310', 'Withholding Tax Payable', 'LIABILITIES-TAX', 'liability'],
      ['4110', 'Court Booking Revenue', 'REVENUE-COURT', 'revenue'],
      ['4180', 'Commission Revenue', 'REVENUE-COURT', 'revenue'],
      ['4310', 'Booking Refunds', 'REVENUE-CONTRA', 'contra_revenue'],
      ['5210', 'Payment Gateway Fees', 'EXPENSES-GENERAL', 'expense'],
    ];
    for (const [code, name, parentCode, type] of cases) {
      const [rows] = await pool.execute<RowData>(
        `SELECT c.id, c.name, c.type, c.is_system, p.code AS parent
         FROM chart_of_accounts c LEFT JOIN chart_of_accounts p ON p.id = c.parent_id
         WHERE c.code = ? AND c.organisation_id IS NULL`, [code]);
      expect(rows.length, `account ${code} exists`).toBe(1);
      const r = (rows as any[])[0];
      expect(r.name).toBe(name);
      expect(r.type).toBe(type);
      expect(r.parent).toBe(parentCode);
      expect(r.is_system).toBe(0); // default catalog accounts are not system-required
    }
  });

  it('org customization is isolated per organisation (rename/hide does not affect global or other orgs)', async () => {
    const mod = await import('../presentation/accounting.controller.js');
    const reply = { status: (c: number) => ({ send: (b: any) => b }), send: (b: any) => b };

    // Pick a global default account (Payment Gateway 1) to customise.
    const [rows] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code = '1110' AND organisation_id IS NULL`);
    const acctId = (rows as any[])[0].id;

    // Org A renames + hides it.
    await mod.upsertOrgCustomizationHandler(
      { params: { accountId: String(acctId) }, body: { organisationId: orgA, isVisible: false, displayName: 'CIB Main Account' }, userId: 1, ip: '', headers: {} } as any,
      reply as any,
    );

    // Org A view reflects the customization.
    const resA: any = await mod.listOrgAccountsHandler(
      { query: { organisationId: String(orgA) } } as any, reply as any,
    );
    const ga = resA.data.global.find((g: any) => g.id === acctId);
    expect(ga.customization.is_visible).toBe(false);
    expect(ga.effective_name).toBe('CIB Main Account');

    // Org B view is unaffected (global default).
    const resB: any = await mod.listOrgAccountsHandler(
      { query: { organisationId: String(orgB) } } as any, reply as any,
    );
    const gb = resB.data.global.find((g: any) => g.id === acctId);
    expect(gb.customization).toBeNull();
    expect(gb.effective_name).toBe('Payment Gateway 1');

    // The global account row itself is untouched.
    const [g] = await pool.execute<RowData>(`SELECT name, is_active, is_system FROM chart_of_accounts WHERE id = ?`, [acctId]);
    expect((g as any[])[0].name).toBe('Payment Gateway 1');
    expect((g as any[])[0].is_active).toBe(1);

    // Reset restores the global default presentation for org A.
    await mod.resetOrgCustomizationHandler(
      { params: { accountId: String(acctId) }, query: { organisationId: String(orgA) }, userId: 1, ip: '', headers: {} } as any,
      reply as any,
    );
    const resA2: any = await mod.listOrgAccountsHandler(
      { query: { organisationId: String(orgA) } } as any, reply as any,
    );
    const ga2 = resA2.data.global.find((g: any) => g.id === acctId);
    expect(ga2.customization).toBeNull();
    expect(ga2.effective_name).toBe('Payment Gateway 1');
  });

  it('cannot customise an organisation-specific account via the overlay', async () => {
    const mod = await import('../presentation/accounting.controller.js');
    const reply = { status: (c: number) => ({ send: (b: any) => b }), send: (b: any) => b };

    const [l3] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code = 'ASSETS-CASH' AND organisation_id IS NULL`);
    const [oc] = await pool.execute<RowData>(`INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active) VALUES (?, 'ORGA-CASH', 'Org A Cash', 'asset', 'debit', ?, 0, 1)`, [orgA, (l3 as any[])[0].id]);
    const orgAcctId = (oc as any).insertId;

    await expect(
      mod.upsertOrgCustomizationHandler(
        { params: { accountId: String(orgAcctId) }, body: { organisationId: orgA, isVisible: false }, userId: 1, ip: '', headers: {} } as any,
        reply as any,
      ),
    ).rejects.toThrow(/global default/);

    await pool.execute(`DELETE FROM chart_of_accounts WHERE id = ?`, [orgAcctId]);
  });

  it('org-scoped routes force :orgId and ignore a spoofed query/body organisationId', async () => {
    const mod = await import('../presentation/accounting.controller.js');
    const reply = { status: (c: number) => ({ send: (b: any) => b }), send: (b: any) => b };

    const [rows] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code = '1110' AND organisation_id IS NULL`);
    const acctId = (rows as any[])[0].id;

    // Customise as orgA via the org route (body.organisationId spoofed to orgB).
    await mod.orgUpsertCustomizationHandler(
      { params: { orgId: String(orgA), accountId: String(acctId) }, body: { organisationId: orgB, isVisible: false, displayName: 'Org A Local Name' }, userId: 1, ip: '', headers: {} } as any,
      reply as any,
    );

    // orgA sees its customization; the route orgId wins over any query spoof.
    const resA: any = await mod.orgCoaHandler({ params: { orgId: String(orgA) }, query: { organisationId: String(orgB) } } as any, reply as any);
    const ga = resA.data.global.find((g: any) => g.id === acctId);
    expect(ga.customization.is_visible).toBe(false);
    expect(ga.effective_name).toBe('Org A Local Name');

    // orgB is unaffected.
    const resB: any = await mod.orgCoaHandler({ params: { orgId: String(orgB) } } as any, reply as any);
    const gb = resB.data.global.find((g: any) => g.id === acctId);
    expect(gb.customization).toBeNull();

    // Cleanup: reset orgA's customization.
    await mod.orgResetCustomizationHandler({ params: { orgId: String(orgA), accountId: String(acctId) }, query: { organisationId: String(orgB) }, userId: 1, ip: '', headers: {} } as any, reply as any);
  });
});
