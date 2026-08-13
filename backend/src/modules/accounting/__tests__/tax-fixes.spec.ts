import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

const here = fileURLToPath(new URL('.', import.meta.url));

describe('Accounting Tax & Payroll Fixes', () => {
  let pool: mysql.Pool;
  let orgId: number;          // org WITH invoice overrides (Advanced Mode)
  let plainOrgId: number;     // org WITHOUT overrides (global fallback)
  let orgTaxAccountId: number;
  let invSeq = 0;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });

    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const otId = (ot as any[])[0].id;

    const [o] = await pool.execute<RowData>(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Tax Fixes Test Org', 'tax-fixes-org', 1)`, [otId]);
    orgId = (o as any).insertId;

    const [po] = await pool.execute<RowData>(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Tax Fixes Plain Org', 'tax-fixes-plain-org', 1)`, [otId]);
    plainOrgId = (po as any).insertId;

    // Org-owned Advanced-Mode tax account under LIABILITIES-TAX
    const [l3t] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code='LIABILITIES-TAX' AND organisation_id IS NULL`);
    const [tl] = await pool.execute<RowData>(`INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active) VALUES (?, 'TX-FIXES-TAX', 'Tax Fixes Org Tax Liability', 'liability', 'credit', ?, 0, 1)`, [orgId, (l3t as any[])[0].id]);
    orgTaxAccountId = (tl as any).insertId;

    // Complete org override for invoice_issue/invoice_cancel → Advanced Mode
    for (const et of ['invoice_issue', 'invoice_cancel']) {
      await pool.execute(`INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active) VALUES (?, ?, 'revenue', (SELECT id FROM chart_of_accounts WHERE code='4100' AND organisation_id IS NULL), 1)`, [et, orgId]);
      await pool.execute(`INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active) VALUES (?, ?, 'receivable', (SELECT id FROM chart_of_accounts WHERE code='1140' AND organisation_id IS NULL), 1)`, [et, orgId]);
      await pool.execute(`INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active) VALUES (?, ?, 'tax_liability', ?, 1)`, [et, orgId, orgTaxAccountId]);
    }

    // Open period covering the invoice date (Aug 2026)
    await pool.execute(`INSERT INTO accounting_periods (organisation_id, fiscal_year, period_number, start_date, end_date, status) VALUES (?, 2026, 8, '2026-08-01', '2026-08-31', 'open')`, [plainOrgId]);
  });

  afterAll(async () => {
    for (const id of [plainOrgId, orgId]) {
      await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [id]);
      await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [id]);
      await pool.execute(`DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE organisation_id = ?)`, [id]);
      await pool.execute(`DELETE FROM invoices WHERE organisation_id = ?`, [id]);
      await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE organisation_id = ?`, [id]);
      await pool.execute(`DELETE FROM accounting_periods WHERE organisation_id = ?`, [id]);
      await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id = ? AND code LIKE 'TX-FIXES-%'`, [id]);
      await pool.execute(`DELETE FROM organisations WHERE id = ?`, [id]);
    }
    await pool.end();
  });

  async function createDraftInvoice(org: number | null, net: number, tax: number): Promise<number> {
    const number = `TAXFIX-${Date.now()}-${++invSeq}`;
    const [ir] = await pool.execute<RowData>(`INSERT INTO invoices (organisation_id, user_id, invoice_number, invoice_type, status, issue_date, subtotal, tax_amount, total, created_by) VALUES (?, 1, ?, 'sales', 'draft', '2026-08-10', ?, ?, ?, 1)`, [org, number, net, tax, net + tax]);
    const invId = (ir as any).insertId;
    await pool.execute(`INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, price_type, tax_treatment, net_amount, tax_rate, tax_amount, total) VALUES (?, 'Item', 1, ?, 'net', 'taxable', ?, 10, ?, ?)`, [invId, net, net, tax, net + tax]);
    return invId;
  }

  async function issueAndCancel(net: number, tax: number) {
    const mod = await import('../presentation/accounting.controller.js');
    const mockReply = { status: (c: number) => ({ send: (b: any) => b }), send: (b: any) => b };
    const invId = await createDraftInvoice(null, net, tax);
    await mod.issueInvoiceHandler({ params: { id: invId }, userId: 1, ip: '', headers: {} } as any, mockReply as any);
    await mod.cancelInvoiceHandler({ params: { id: invId }, userId: 1, ip: '', headers: {} } as any, mockReply as any);
    await pool.execute(`DELETE FROM invoice_items WHERE invoice_id = ?`, [invId]);
    await pool.execute(`DELETE FROM invoices WHERE id = ?`, [invId]);
  }

  // ── Mapping correctness (C1 + C2) ──

  it('1. invoice_issue tax_liability maps to 2300 Tax Liability (not 4100)', async () => {
    const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
    const mapping = await accountingEngineService.resolveMapping('invoice_issue', null);
    const taxAcc = mapping.find(m => m.concept === 'tax_liability')?.accountId;
    const [row] = await pool.execute<RowData>(`SELECT code, name FROM chart_of_accounts WHERE id = ?`, [taxAcc]);
    expect((row as any[])[0].code).toBe('2300');
    expect((row as any[])[0].name).toBe('Tax Liability');
  });

  it('2. invoice_cancel tax_liability maps to 2300 Tax Liability (not 4100)', async () => {
    const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
    const mapping = await accountingEngineService.resolveMapping('invoice_cancel', null);
    const taxAcc = mapping.find(m => m.concept === 'tax_liability')?.accountId;
    const [row] = await pool.execute<RowData>(`SELECT code FROM chart_of_accounts WHERE id = ?`, [taxAcc]);
    expect((row as any[])[0].code).toBe('2300');
  });

  it('3. payroll_post salary_expense maps to 5300 Salary Expense', async () => {
    const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
    const mapping = await accountingEngineService.resolveMapping('payroll_post', null);
    const expAcc = mapping.find(m => m.concept === 'salary_expense')?.accountId;
    const [row] = await pool.execute<RowData>(`SELECT code, name, type FROM chart_of_accounts WHERE id = ?`, [expAcc]);
    expect((row as any[])[0].code).toBe('5300');
    expect((row as any[])[0].name).toBe('Salary Expense');
    expect((row as any[])[0].type).toBe('expense');
  });

  it('4. payroll_post salary_expense does NOT map to Bad Debt (5100)', async () => {
    const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
    const mapping = await accountingEngineService.resolveMapping('payroll_post', null);
    const expAcc = mapping.find(m => m.concept === 'salary_expense')?.accountId;
    const [row] = await pool.execute<RowData>(`SELECT code FROM chart_of_accounts WHERE id = ?`, [expAcc]);
    expect((row as any[])[0].code).not.toBe('5100');
  });

  it('4b. payroll_post salary_payable preserved → 2200 Org Payable', async () => {
    const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
    const mapping = await accountingEngineService.resolveMapping('payroll_post', null);
    const payAcc = mapping.find(m => m.concept === 'salary_payable')?.accountId;
    const [row] = await pool.execute<RowData>(`SELECT code FROM chart_of_accounts WHERE id = ?`, [payAcc]);
    expect((row as any[])[0].code).toBe('2200');
  });

  // ── Posting behavior (issue + cancel) ──

  it('5. invoice_issue posts Receivable debit, Revenue credit, Tax Liability credit (global 2300)', async () => {
    const mod = await import('../presentation/accounting.controller.js');
    const mockReply = { status: (c: number) => ({ send: (b: any) => b }), send: (b: any) => b };
    const invId = await createDraftInvoice(null, 1000, 100);
    await mod.issueInvoiceHandler({ params: { id: invId }, userId: 1, ip: '', headers: {} } as any, mockReply as any);

    const [le] = await pool.execute<RowData>(`SELECT * FROM ledger_entries WHERE source_type='invoice' AND source_id=? AND event_type='invoice_issue'`, [invId]);
    const entries = le as any[];
    expect(entries.length).toBe(3);

    const dr = entries.find(e => e.side === 'debit');
    const crs = entries.filter(e => e.side === 'credit');
    expect(Number(dr.amount)).toBe(1100);
    expect(crs.reduce((s, e) => s + Number(e.amount), 0)).toBe(1100);

    const revEntry = crs.find(e => Number(e.amount) === 1000);
    const taxEntry = crs.find(e => Number(e.amount) === 100);
    expect(revEntry).toBeTruthy();
    expect(taxEntry).toBeTruthy();

    const [revCodeRow] = await pool.execute<RowData>(`SELECT code FROM chart_of_accounts WHERE id = ?`, [(revEntry as any).chart_account_id]);
    const [taxCodeRow] = await pool.execute<RowData>(`SELECT code FROM chart_of_accounts WHERE id = ?`, [(taxEntry as any).chart_account_id]);
    expect((revCodeRow as any[])[0].code).toBe('4100');
    expect((taxCodeRow as any[])[0].code).toBe('2300');

    await pool.execute(`DELETE FROM invoice_items WHERE invoice_id = ?`, [invId]);
    await pool.execute(`DELETE FROM invoices WHERE id = ?`, [invId]);
  });

  it('6. invoice_cancel reverses tax liability effect', async () => {
    const mod = await import('../presentation/accounting.controller.js');
    const mockReply = { status: (c: number) => ({ send: (b: any) => b }), send: (b: any) => b };
    const invId = await createDraftInvoice(null, 500, 50);
    await mod.issueInvoiceHandler({ params: { id: invId }, userId: 1, ip: '', headers: {} } as any, mockReply as any);
    await mod.cancelInvoiceHandler({ params: { id: invId }, userId: 1, ip: '', headers: {} } as any, mockReply as any);

    const [le] = await pool.execute<RowData>(`SELECT * FROM ledger_entries WHERE source_type='invoice' AND source_id=? AND event_type='invoice_cancel'`, [invId]);
    const entries = le as any[];
    expect(entries.length).toBe(3);

    const cr = entries.find(e => e.side === 'credit');
    expect(Number(cr.amount)).toBe(550);

    const drs = entries.filter(e => e.side === 'debit');
    expect(drs.reduce((s, e) => s + Number(e.amount), 0)).toBe(550);

    const revEntry = drs.find(e => Number(e.amount) === 500);
    const taxEntry = drs.find(e => Number(e.amount) === 50);
    expect(revEntry).toBeTruthy();
    expect(taxEntry).toBeTruthy();

    const [revCodeRow] = await pool.execute<RowData>(`SELECT code FROM chart_of_accounts WHERE id = ?`, [(revEntry as any).chart_account_id]);
    const [taxCodeRow] = await pool.execute<RowData>(`SELECT code FROM chart_of_accounts WHERE id = ?`, [(taxEntry as any).chart_account_id]);
    expect((revCodeRow as any[])[0].code).toBe('4100');
    expect((taxCodeRow as any[])[0].code).toBe('2300');

    await pool.execute(`DELETE FROM invoice_items WHERE invoice_id = ?`, [invId]);
    await pool.execute(`DELETE FROM invoices WHERE id = ?`, [invId]);
  });

  it('5b. org override posting: invoice_issue posts tax to org-owned tax account', async () => {
    const mod = await import('../presentation/accounting.controller.js');
    const mockReply = { status: (c: number) => ({ send: (b: any) => b }), send: (b: any) => b };
    const invId = await createDraftInvoice(orgId, 1000, 100);
    await mod.issueInvoiceHandler({ params: { id: invId }, userId: 1, ip: '', headers: {} } as any, mockReply as any);

    const [le] = await pool.execute<RowData>(`SELECT * FROM ledger_entries WHERE source_type='invoice' AND source_id=? AND event_type='invoice_issue'`, [invId]);
    const entries = le as any[];
    expect(entries.length).toBe(3);
    const taxEntry = entries.find(e => e.side === 'credit' && Number(e.amount) === 100);
    expect(taxEntry).toBeTruthy();
    expect((taxEntry as any).chart_account_id).toBe(orgTaxAccountId);

    await pool.execute(`DELETE FROM invoice_items WHERE invoice_id = ?`, [invId]);
    await pool.execute(`DELETE FROM invoices WHERE id = ?`, [invId]);
  });

  // ── Tax Summary (C3) ──

  it('7. tax summary resolves global tax mappings (2300 + INPUT-TAX)', async () => {
    const mod = await import('../presentation/accounting.controller.js');
    const mockReply = { status: (c: number) => ({ send: (b: any) => b }), send: (b: any) => b };
    const res = await mod.taxSummaryHandler({ query: {}, userId: 1, ip: '', headers: {} } as any, mockReply as any);
    const codes = (res.data.accountingTaxBalances as any[]).map((a: any) => a.code);
    expect(codes).toContain('2300');
    expect(codes).toContain('INPUT-TAX');
    expect(codes).not.toContain('4100');
  });

  it('8. tax summary resolves organisation override tax mappings', async () => {
    const mod = await import('../presentation/accounting.controller.js');
    const mockReply = { status: (c: number) => ({ send: (b: any) => b }), send: (b: any) => b };
    const res = await mod.taxSummaryHandler({ query: { organisationId: String(orgId) }, userId: 1, ip: '', headers: {} } as any, mockReply as any);
    const codes = (res.data.accountingTaxBalances as any[]).map((a: any) => a.code);
    expect(codes).toContain('TX-FIXES-TAX');
  });

  it('8b. tax summary org override keeps global fallback for non-overridden event types', async () => {
    const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
    const ids = await accountingEngineService.resolveTaxAccountIds(orgId);
    expect(ids).toContain(orgTaxAccountId);
    const [globalTax] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code='2300' AND organisation_id IS NULL`);
    expect(ids).toContain((globalTax as any[])[0].id);
    const [inputTax] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code='INPUT-TAX' AND organisation_id IS NULL`);
    expect(ids).toContain((inputTax as any[])[0].id);
  });

  it('8c. plain org (no overrides) falls back to global tax mappings', async () => {
    const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
    const ids = await accountingEngineService.resolveTaxAccountIds(plainOrgId);
    const [globalTax] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code='2300' AND organisation_id IS NULL`);
    expect(ids).toContain((globalTax as any[])[0].id);
    const [inputTax] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code='INPUT-TAX' AND organisation_id IS NULL`);
    expect(ids).toContain((inputTax as any[])[0].id);
  });

  // ── No hard-coded tax codes/names in production logic ──

  it('9. no production accounting logic hard-codes tax account codes or names', () => {
    const controller = readFileSync(`${here}../presentation/accounting.controller.ts`, 'utf8');
    const engine = readFileSync(`${here}../../financial/application/accounting-engine.service.ts`, 'utf8');
    const combined = `${controller}\n${engine}`;
    expect(combined).not.toContain(`code = '2300'`);
    expect(combined).not.toContain(`code = 'INPUT-TAX'`);
    expect(combined).not.toContain(`LIKE 'TX-%'`);
    expect(combined).not.toContain(`LIKE '%Tax%'`);
  });

  // ── Financial report classification ──

  it('10. financial reports classify 2300 as liability and 5300 as expense', async () => {
    const [rows] = await pool.execute<RowData>(`SELECT code, type, is_active, parent_id FROM chart_of_accounts WHERE code IN ('2300','5300') AND organisation_id IS NULL`);
    const byCode = new Map((rows as any[]).map((r: any) => [r.code, r]));
    const tax = byCode.get('2300');
    const salary = byCode.get('5300');
    expect(tax.type).toBe('liability');
    expect(salary.type).toBe('expense');
    expect(Number(tax.is_active)).toBe(1);
    expect(Number(salary.is_active)).toBe(1);
    expect(salary.parent_id).not.toBeNull();
    expect(tax.parent_id).not.toBeNull();
  });
});
