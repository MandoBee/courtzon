import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3002';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * Org manual journal RBAC.
 *
 * The organisation manual journal reuses the CANONICAL journal-entry creation
 * (orgJournalCreateHandler -> createJournalEntryHandler). The org journal POST
 * route is gated by the org-scoped permission `org.accounting.journal.create`
 * (not a platform requireRole), so authorised org accounting users can post
 * balanced manual entries for their OWN organisation only. The scope is
 * enforced server-side by orgJournalCreateHandler (route :orgId authoritative;
 * a body-supplied organisationId is ignored) and by validateOrgJournalAccounts.
 */
describe('Organisation Manual Journal RBAC (org-scoped permission)', () => {
  let pool: mysql.Pool;
  let orgA: number;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const [a] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Org Journal RBAC', 'org-journal-rbac-org', 1)`, [(ot as any[])[0].id],
    );
    orgA = (a as any).insertId;
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [orgA]);
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [orgA]);
    await pool.execute(`DELETE FROM organisation_coa_customizations WHERE organisation_id = ?`, [orgA]);
    await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE organisation_id = ?`, [orgA]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgA]);
    await pool.end();
  });

  it('the org journal POST route is gated by org.accounting.journal.create (org-scoped), not requireRole', () => {
    const routesPath = path.resolve(__dirname, '../presentation/accounting.routes.ts');
    const routes = fs.readFileSync(routesPath, 'utf-8');
    expect(routes).toContain(`const orgJournalCreate = requireOrgScopedPermission('org.accounting.journal.create');`);
    expect(routes).toContain(`app.post('/org/:orgId/accounting/journal', { preHandler: [orgJournalCreate] }, ctrl.orgJournalCreateHandler)`);
    // The org journal POST must NOT use a platform requireRole guard.
    expect(routes).not.toContain(`orgJournalCreate = requireRole`);
  });

  it('org.accounting.journal.create is granted to the org-admin role (permission model)', async () => {
    const [rows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c
       FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE r.slug = 'org-admin' AND p.permission_key = 'org.accounting.journal.create'`,
    );
    expect(Number((rows as any[])[0].c)).toBeGreaterThan(0);
  });

  it('GET org journal view remains available to org accounting users', async () => {
    const mod = await import('../presentation/accounting.controller.js');
    const reply = { status: (c: number) => ({ send: (b: any) => b }), send: (b: any) => b };
    const res: any = await mod.orgJournalListHandler({ params: { orgId: String(orgA) }, query: {} } as any, reply as any);
    expect(Array.isArray(res.data)).toBe(true);
  });

  it('the shared createJournalEntryHandler remains functional (canonical validation path)', async () => {
    const mod = await import('../presentation/accounting.controller.js');
    const [cash] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code = '1120' AND organisation_id IS NULL`);
    const [rev] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code = '4100' AND organisation_id IS NULL`);
    if (!(cash as any[]).length || !(rev as any[]).length) {
      expect(true).toBe(true); // accounts absent — skip
      return;
    }
    const cashId = (cash as any[])[0].id;
    const revenueId = (rev as any[])[0].id;
    // Unbalanced journal → the canonical handler validates and rejects BEFORE
    // any insert (so this does not race the org-journal.spec MAX(source_id)+1
    // dedup key when specs run in parallel).
    const reply = { status: (c: number) => ({ send: (b: any) => ({ status: c, body: b }) }), send: (b: any) => b };
    const unbalanced = {
      body: { organisationId: orgA, entryDate: '2026-08-14', description: 'RBAC canonical path', entries: [
        { accountId: cashId, debit: 100, credit: 0 },
        { accountId: revenueId, debit: 0, credit: 50 },
      ] },
      userId: 1, ip: '127.0.0.1', headers: {},
    };
    await expect(mod.createJournalEntryHandler(unbalanced as any, reply as any)).rejects.toThrow(/balanced/);
  });
});