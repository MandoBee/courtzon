/**
 * Multi-Book COA protection + organization custom-account editability.
 *
 * - System-controlled accounts (is_system=1), including the auto-provisioned
 *   organization marketplace accounts, are protected from structural change
 *   (rename / code / type / normal_side / parent / ownership / deactivation).
 * - Custom organization accounts (is_system=0) remain editable.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3011';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { createProductFixture, cleanupProductFixture, type ProductFixture } from '../../../tests/helpers/product-fixture.js';
type RowData = RowDataPacket[];

describe('Multi-Book COA protection & org custom accounts', () => {
  let pool: mysql.Pool;
  let orgId: number;
  let product: ProductFixture;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    await pool.execute(`DELETE FROM order_items WHERE seller_id IN (SELECT id FROM organisations WHERE slug='mp-prot-org')`);
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id IN (SELECT id FROM organisations WHERE slug='mp-prot-org')`);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (SELECT id FROM organisations WHERE slug='mp-prot-org')`);
    await pool.execute(`DELETE FROM orders WHERE buyer_id = 1`);
    await pool.execute(`DELETE FROM organisations WHERE slug='mp-prot-org'`);
    const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'MP Prot Org', 'mp-prot-org', 1)`, [ot[0].id],
    );
    orgId = (o as any).insertId;
    product = await createProductFixture(pool, orgId);
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM order_items WHERE seller_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM orders WHERE buyer_id = 1`);
    await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id = ?`, [orgId]);
    await cleanupProductFixture(pool, product);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.end();
  });

  it('provisions org marketplace system accounts idempotently (MKT-SALES, MKT-COMM-EXP, MKT-SHIP-LIAB, 1161) as is_system=1', async () => {
    const { accountingEngineService } = await import('../application/accounting-engine.service.js');
    await accountingEngineService.provisionOrganisationMarketplaceAccounts(orgId);
    await accountingEngineService.provisionOrganisationMarketplaceAccounts(orgId); // idempotent

    for (const code of ['MKT-SALES', 'MKT-COMM-EXP', 'MKT-SHIP-LIAB', '1161']) {
      const [rows] = await pool.execute<RowData>(
        `SELECT COUNT(*) c, MAX(is_system) s FROM chart_of_accounts WHERE organisation_id=? AND code=?`, [orgId, code],
      );
      expect(Number((rows as any[])[0].c)).toBe(1);
      expect(Number((rows as any[])[0].s)).toBe(1);
    }
  });

  it('system-controlled org account rejects structural update (rename/code/type/normal_side/parent/ownership/deactivate)', async () => {
    const { accountingEngineService } = await import('../application/accounting-engine.service.js');
    await accountingEngineService.provisionOrganisationMarketplaceAccounts(orgId);
    const [[salesAcct]] = await pool.execute<RowData>(
      `SELECT id FROM chart_of_accounts WHERE organisation_id=? AND code='MKT-SALES'`, [orgId],
    );
    const { updateAccountHandler } = await import('../../accounting/presentation/accounting.controller.js');
    const accountId = Number((salesAcct as any).id);

    const makeReq = (body: any): any => ({
      params: { id: String(accountId) },
      body,
      headers: {},
      ip: '127.0.0.1',
    });
    const reply = { send: (x: any) => x };

    // Structural attempts must be rejected with FORBIDDEN.
    const attempts = [
      { name: 'Renamed' },
      { code: 'X' },
      { type: 'liability' },
      { normalSide: 'debit' },
      { parentId: 1 },
      { organisationId: 999 },
      { isActive: false },
    ];
    for (const body of attempts) {
      await expect(updateAccountHandler(makeReq(body), reply)).rejects.toMatchObject({ statusCode: 403 });
    }

    // Description-only update remains allowed.
    const ok = await updateAccountHandler(makeReq({ description: 'org marketplace sales' }), reply);
    expect(ok).toBeTruthy();
  });

  it('organization custom (is_system=0) account remains editable', async () => {
    const { updateAccountHandler } = await import('../../accounting/presentation/accounting.controller.js');
    const [parent] = await pool.execute<RowData>(
      `SELECT id FROM chart_of_accounts WHERE code='EXPENSES-GENERAL' AND organisation_id IS NULL LIMIT 1`,
    );
    const [ins] = await pool.execute<RowData>(
      `INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active)
       VALUES (?, 'CUSTOM-X', 'Custom X', 'expense', 'debit', ?, 0, 1)`, [orgId, (parent as any[])[0].id],
    );
    const customId = (ins as any).insertId;
    const reply = { send: (x: any) => x };
    const req = (body: any) => ({ params: { id: String(customId) }, body, headers: {}, ip: '127.0.0.1' });
    const ok = await updateAccountHandler(req({ name: 'Custom Renamed', description: 'mine' }), reply);
    expect(ok).toBeTruthy();
    const [[row]] = await pool.execute<RowData>(
      `SELECT name FROM chart_of_accounts WHERE id=?`, [customId],
    );
    expect((row as any).name).toBe('Custom Renamed');
    await pool.execute(`DELETE FROM chart_of_accounts WHERE id=?`, [customId]);
  });
});