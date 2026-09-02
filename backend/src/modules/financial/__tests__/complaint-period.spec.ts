/**
 * Marketplace complaint-period configuration — integration spec.
 *
 * The complaint period is the single canonical admin-controlled setting
 * `system_settings.marketplace.complaint_period_days` (default 7). Marketplace
 * entitlements stay PENDING until `delivered_at + complaint_period_days` has
 * passed; the complaint-period worker then activates them to AVAILABLE, which
 * makes them settlement-eligible (findAvailableForOrganisation / unified
 * settlement preview).
 *
 * Covers:
 *   1. default complaint period is 7
 *   2. admin can read the setting
 *   3. authorized admin can update it
 *   4. unauthorized users cannot update it (RBAC route guard + missing-key defense)
 *   5. complaint eligibility uses the configured value
 *   6. with complaint_period_days=1, a delivered order becomes eligible after 1 day
 *   7. with complaint_period_days=7, the normal 7-day behaviour is unchanged
 *   8. the complaint-period activation worker uses the configured value
 *   9. findAvailableForOrganisation() respects the configured value
 *  10. unified settlement preview respects the same eligibility rules
 *  11. no business-logic hardcoded complaint-period value
 *
 * Timestamps are controlled relative to NOW() (e.g. delivered_at = NOW() - 2 DAY)
 * so activation is deterministic — no real-time waiting.
 */
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3011';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { setPlatformTimezone } from '../../../shared/utils/business-date.js';
import { systemSettingsService } from '../../admin/application/system-settings.service.js';
import { getMarketplaceComplaintPeriodDays, DEFAULT_MARKETPLACE_COMPLAINT_PERIOD_DAYS } from '../application/complaint-period.config.js';
import { financialEntitlementService } from '../application/financial-entitlement.service.js';
import { unifiedSettlementService } from '../../settlement/application/unified-settlement.service.js';
import { handleComplaintPeriodActivation } from '../infrastructure/marketplace-complaint-period.worker.js';

type RowData = RowDataPacket[];

const KEY = 'marketplace.complaint_period_days';
const FIXTURE_PREFIX = 'cpd-fixture';

describe('Marketplace complaint-period configuration', () => {
  let pool: mysql.Pool;
  const orgs: number[] = [];
  const orders: number[] = [];
  const items: number[] = [];
  const entIds: number[] = [];

  beforeAll(async () => {
    setPlatformTimezone('Africa/Cairo');
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 8, charset: 'utf8mb4' });

    // Clean any prior fixture rows. Items are deleted by seller org (covers orders
    // created with random public_ids by an interrupted earlier run), then orders
    // by fixture prefix and by remaining item join, then orgs.
    await pool.execute(`DELETE FROM financial_entitlements WHERE description LIKE '${FIXTURE_PREFIX}%'`);
    await pool.execute(`DELETE oi FROM order_items oi JOIN organisations o ON o.id = oi.seller_id WHERE o.slug LIKE '${FIXTURE_PREFIX}-%'`);
    await pool.execute(`DELETE FROM orders WHERE public_id LIKE '${FIXTURE_PREFIX}-o-%'`);
    await pool.execute(`DELETE FROM orders WHERE id IN (SELECT DISTINCT oi.order_id FROM order_items oi JOIN organisations o ON o.id = oi.seller_id WHERE o.slug LIKE '${FIXTURE_PREFIX}-%')`);
    await pool.execute(`DELETE FROM organisations WHERE slug LIKE '${FIXTURE_PREFIX}-%'`);

    // Ensure the canonical setting exists with the default (migration 151).
    const existing = await systemSettingsService.getByKey(KEY);
    if (!existing) {
      await pool.execute(
        `INSERT INTO system_settings (category, \`key\`, value, value_type, description, is_visible, is_editable, scope)
         VALUES ('marketplace', ?, '7', 'number', 'Marketplace complaint period in days', 1, 1, 'global')`,
        [KEY],
      );
    }

    const [[ot]] = await pool.query<RowData>('SELECT id FROM organisation_types LIMIT 1');
    const [[prod]] = await pool.query<RowData>('SELECT id FROM products ORDER BY id LIMIT 1');

    // Three independent fixtures (one per scenario).
    const fixtures = [
      { slug: `${FIXTURE_PREFIX}-a`, daysAgo: 2 }, // delivered 2 days ago → eligible when period=1
      { slug: `${FIXTURE_PREFIX}-b`, daysAgo: 0 }, // delivered now → never eligible during a >0 window
      { slug: `${FIXTURE_PREFIX}-c`, daysAgo: 2 }, // delivered 2 days ago → NOT eligible when period=7
    ];
    for (const fx of fixtures) {
      const [org] = await pool.query<RowData>(
        `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, ?, ?, 1)`,
        [ot.id, fx.slug, fx.slug],
      );
      const orgId = (org as any).insertId;
      orgs.push(orgId);

      const deliveredAt = fx.daysAgo === 0 ? 'NOW()' : `DATE_SUB(NOW(), INTERVAL ${fx.daysAgo} DAY)`;
      const [order] = await pool.query<RowData>(
        `INSERT INTO orders (public_id, buyer_id, status, payment_status, subtotal, total, currency_code, payment_method, cash_holder, delivered_at)
         VALUES (?, 1, 'delivered', 'paid', 100, 100, 'EGP', 'cash', 'org', ${deliveredAt})`,
        [`${FIXTURE_PREFIX}-o-${fx.slug}`],
      );
      const orderId = (order as any).insertId;
      orders.push(orderId);

      const [item] = await pool.query<RowData>(
        `INSERT INTO order_items (order_id, product_id, seller_id, quantity, unit_price, total_price)
         VALUES (?, ?, ?, 1, 100, 100)`,
        [orderId, prod.id, orgId],
      );
      const itemId = (item as any).insertId;
      items.push(itemId);

      const [ent] = await pool.query<RowData>(
        `INSERT INTO financial_entitlements (public_id, organisation_id, entitlement_type, source_type, source_id, collector, amount, currency, status, description, created_by)
         VALUES (UUID(), ?, 'ORGANIZATION_EARNING', 'marketplace', ?, 'courtzon', 100, 'EGP', 'PENDING', '${FIXTURE_PREFIX} ent', 1)`,
        [orgId, itemId],
      );
      const entId = (ent as any).insertId;
      entIds.push(entId);
    }
  });

  afterAll(async () => {
    // Restore the canonical setting to its default.
    await systemSettingsService.update(KEY, DEFAULT_MARKETPLACE_COMPLAINT_PERIOD_DAYS, 1).catch(() => undefined);
    await pool.execute(`DELETE FROM financial_entitlements WHERE description LIKE '${FIXTURE_PREFIX}%'`);
    await pool.execute(`DELETE oi FROM order_items oi JOIN organisations o ON o.id = oi.seller_id WHERE o.slug LIKE '${FIXTURE_PREFIX}-%'`);
    await pool.execute(`DELETE FROM orders WHERE public_id LIKE '${FIXTURE_PREFIX}-o-%'`);
    await pool.execute(`DELETE FROM orders WHERE id IN (SELECT DISTINCT oi.order_id FROM order_items oi JOIN organisations o ON o.id = oi.seller_id WHERE o.slug LIKE '${FIXTURE_PREFIX}-%')`);
    await pool.execute(`DELETE FROM organisations WHERE slug LIKE '${FIXTURE_PREFIX}-%'`);
    setPlatformTimezone(null);
    await pool.end();
  });

  async function setPeriod(days: number) {
    await systemSettingsService.update(KEY, days, 1);
  }

  async function statusOf(entId: number): Promise<string> {
    const [rows] = await pool.query<RowData>('SELECT status FROM financial_entitlements WHERE id = ?', [entId]);
    return String((rows as any[])[0]?.status);
  }

  // 1. Default complaint period is 7
  it('default complaint period is 7 days', async () => {
    expect(DEFAULT_MARKETPLACE_COMPLAINT_PERIOD_DAYS).toBe(7);
    expect(await getMarketplaceComplaintPeriodDays()).toBe(7);
    // Fallback when the row is missing or invalid.
    expect(await systemSettingsService.getInt('marketplace.complaint_period_days.missing', 7)).toBe(7);
  });

  // 2. Admin can read the setting
  it('admin can read the setting', async () => {
    const row = await systemSettingsService.getByKey(KEY);
    expect(row).not.toBeNull();
    expect(row!.category).toBe('marketplace');
    expect(row!.value_type).toBe('number');
    expect(row!.value).toBe(7);
    expect(row!.is_editable).toBe(1);
  });

  // 3. Authorized admin can update it
  it('authorized admin can update the setting', async () => {
    const updated = await systemSettingsService.update(KEY, 1, 1);
    expect(updated.value).toBe(1);
    expect(await getMarketplaceComplaintPeriodDays()).toBe(1);
    await setPeriod(7);
  });

  // 4. Unauthorized users cannot update it (route RBAC guard + missing-key defense)
  it('RBAC route guard protects update; a missing key is rejected', () => {
    const routesPath = path.resolve(__dirname, '../../../../../backend/src/modules/admin/presentation/admin.routes.ts');
    const routes = fs.readFileSync(routesPath, 'utf-8');
    expect(routes).toContain(`app.put('/admin/settings/:key', { preHandler: [requirePermission(['app-settings.edit'])] }, ctrl.updateSettingHandler)`);
    expect(routes).toContain(`app.get('/admin/settings/metadata', { preHandler: [requirePermission(['app-settings.view'])] }, ctrl.getSettingsMetadataHandler)`);
    // Service-level defense: updating a key that does not exist throws 404.
    return expect(systemSettingsService.update('marketplace.complaint_period_days.does-not-exist', 3, 1))
      .rejects.toThrow();
  });

  // 5/6/8/9/10 — configured value drives activation + eligibility (period = 1)
  it('with complaint_period_days=1 a delivered order becomes eligible after 1 day', async () => {
    await setPeriod(1);

    // The worker reads the configured value.
    expect(await getMarketplaceComplaintPeriodDays()).toBe(1);

    // orgA delivered 2 days ago → window passed (2 >= 1).
    // orgB delivered now → window NOT passed (0 < 1).
    await handleComplaintPeriodActivation();

    expect(await statusOf(entIds[0])).toBe('AVAILABLE');
    expect(await statusOf(entIds[1])).toBe('PENDING');

    // findAvailableForOrganisation + unified settlement preview respect it.
    const available = await financialEntitlementService.getAvailableForOrganisation(orgs[0]);
    expect(available.some((e) => e.id === entIds[0])).toBe(true);

    const preview = await unifiedSettlementService.preview(orgs[0]);
    expect(preview.entitlements.map((e: any) => e.id)).toContain(entIds[0]);

    const previewB = await unifiedSettlementService.preview(orgs[1]);
    expect(previewB.entitlements).toHaveLength(0);

    await setPeriod(7);
  });

  // 7 — normal 7-day behaviour (delivered within the window stays PENDING)
  it('with complaint_period_days=7 the normal 7-day behaviour is unchanged', async () => {
    await setPeriod(7);
    expect(await getMarketplaceComplaintPeriodDays()).toBe(7);

    // Reset orgC's entitlement back to PENDING: the earlier period=1 worker run
    // already activated it (it was delivered 2 days ago). Re-run activation with
    // period=7 — the 2-day-old delivery is still INSIDE the 7-day window, so it
    // must remain PENDING.
    await pool.execute(
      `UPDATE financial_entitlements SET status = 'PENDING', available_at = NULL, aggregate_version = aggregate_version + 1 WHERE id = ?`,
      [entIds[2]],
    );

    // orgC delivered 2 days ago → within the 7-day window → NOT activated.
    await handleComplaintPeriodActivation();
    expect(await statusOf(entIds[2])).toBe('PENDING');

    const available = await financialEntitlementService.getAvailableForOrganisation(orgs[2]);
    expect(available.some((e) => e.id === entIds[2])).toBe(false);

    const preview = await unifiedSettlementService.preview(orgs[2]);
    expect(preview.entitlements).toHaveLength(0);
  });

  // 11 — no hardcoded complaint-period value in business logic
  it('business logic uses the canonical reader and no hardcoded complaint-period literal', () => {
    const workerPath = path.resolve(__dirname, '../infrastructure/marketplace-complaint-period.worker.ts');
    const complaintPath = path.resolve(__dirname, '../../marketplace/application/marketplace-complaint.service.ts');
    const repoPath = path.resolve(__dirname, '../infrastructure/repositories/financial-entitlement.repository.ts');
    const worker = fs.readFileSync(workerPath, 'utf-8');
    const complaint = fs.readFileSync(complaintPath, 'utf-8');
    const repo = fs.readFileSync(repoPath, 'utf-8');

    // Both consumers read the single canonical source.
    expect(worker).toContain('getMarketplaceComplaintPeriodDays');
    expect(complaint).toContain('getMarketplaceComplaintPeriodDays');
    // The legacy per-table config is no longer read.
    expect(worker).not.toContain('marketplace_complaint_config');
    expect(complaint).not.toContain('marketplace_complaint_config');
    // The activation query is parameterized — never a hardcoded 7-day interval.
    expect(repo).toContain('INTERVAL ${safePeriod} DAY');
    expect(repo).not.toContain('INTERVAL 7 DAY');
  });
});