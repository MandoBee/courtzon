import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3003';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

// These invariants were formerly protected by the retired legacy markPaid
// command. The unified settlement flow implements the same optimistic
// concurrency protection (aggregate_version in persistTransition); these tests
// prove it on the authoritative UnifiedSettlementService path.
describe('Unified Settlement — financial invariants (authoritative flow)', () => {
  let pool: mysql.Pool;
  let ownerId: number;
  let orgId: number;
  let runKey: string;
  let baseSourceId: number;

  beforeEach(async () => {
    vi.restoreAllMocks();
    // Isolate event dispatch (the outbox DB write is exercised elsewhere and is
    // not the subject of these concurrency/invariant assertions). We assert the
    // dispatch COUNT to prove no duplicate settlement:paid event is emitted.
    const { eventBusV2 } = await import('../../../shared/event-bus/index.js');
    vi.spyOn(eventBusV2, 'emit').mockResolvedValue(undefined as any);
  });

  async function createAvailableEntitlements(count: number): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 0; i < count; i++) {
      const [r] = await pool.execute<RowData>(
        `INSERT INTO financial_entitlements
          (public_id, organisation_id, entitlement_type, source_type, source_id, collector, amount, currency, status, available_at, aggregate_version)
         VALUES (UUID(), ?, 'ORGANIZATION_EARNING', 'marketplace', ?, 'courtzon', 100.00, 'EGP', 'AVAILABLE', NOW(), 1)`,
        [orgId, baseSourceId + i],
      );
      ids.push((r as any).insertId);
    }
    return ids;
  }

  async function createSettlement(): Promise<number> {
    const { unifiedSettlementService } = await import('../application/unified-settlement.service.js');
    const detail = await unifiedSettlementService.create({ orgId, requestedBy: ownerId, requestedByRole: 'admin' });
    return detail.settlement.id;
  }

  async function cleanupSettlement(sid: number, entIdsToClean: number[] = []): Promise<void> {
    await pool.execute(`DELETE FROM published_events WHERE event_name='settlement:paid' AND JSON_EXTRACT(payload, '$.settlementId') = ?`, [sid]);
    await pool.execute(`DELETE FROM settlement_entitlements WHERE settlement_id = ?`, [sid]);
    await pool.execute(`DELETE FROM settlements WHERE id = ?`, [sid]);
    if (entIdsToClean.length) {
      await pool.execute(`DELETE FROM financial_entitlements WHERE id IN (${entIdsToClean.map(() => '?').join(',')})`, entIdsToClean);
    }
  }

  beforeAll(async () => {
    runKey = `ui${Date.now()}${Math.floor(Math.random() * 10000)}`;
    baseSourceId = 200000000 + Math.floor(Math.random() * 1000000);
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 10, charset: 'utf8mb4' });
    const [u] = await pool.execute<RowData>(`INSERT INTO users (public_id, country_id, phone_number, full_phone, email, full_name, password_hash, account_status, is_public) VALUES (UUID(), 1, ?, ?, ?, 'Unified Invariant Owner', 'x', 'active', 1)`, [`0101${runKey.slice(-10)}`, `+20101${runKey.slice(-10)}`, `unified-invariant-${runKey}@test.com`]);
    ownerId = (u as any).insertId;
    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const otId = (ot as any[])[0].id;
    const [o] = await pool.execute<RowData>(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, ?, 'Unified Invariant Org', ?, 1)`, [otId, ownerId, `unified-invariant-${runKey}`]);
    orgId = (o as any).insertId;
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM published_events WHERE event_name='settlement:paid' AND JSON_EXTRACT(payload, '$.organisationId') = ?`, [orgId]);
    await pool.execute(`DELETE FROM settlement_entitlements WHERE settlement_id IN (SELECT id FROM settlements WHERE organisation_id = ?)`, [orgId]);
    await pool.execute(`DELETE FROM settlements WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM financial_entitlements WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.execute(`DELETE FROM users WHERE id = ?`, [ownerId]);
    await pool.end();
  });

  it('concurrent recordPayment: exactly one succeeds, one is rejected, no double finalization', async () => {
    const entIds = await createAvailableEntitlements(2);
    const sid = await createSettlement();
    const { unifiedSettlementService } = await import('../application/unified-settlement.service.js');

    const results = await Promise.allSettled([
      unifiedSettlementService.recordPayment(sid, { paidBy: ownerId }),
      unifiedSettlementService.recordPayment(sid, { paidBy: ownerId }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const [sRows] = await pool.execute<RowData>(
      `SELECT settlement_status, aggregate_version FROM settlements WHERE id = ?`, [sid],
    );
    expect((sRows as any[])[0].settlement_status).toBe('completed');
    expect(Number((sRows as any[])[0].aggregate_version)).toBe(2);

    const [entRows] = await pool.execute<RowData>(
      `SELECT status, COUNT(*) AS cnt FROM financial_entitlements WHERE id IN (?, ?) GROUP BY status`, [entIds[0], entIds[1]],
    );
    const byStatus: Record<string, number> = {};
    for (const r of entRows as any[]) byStatus[r.status] = r.cnt;
    expect(byStatus['SETTLED']).toBe(2);

    const [linkRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM settlement_entitlements WHERE settlement_id = ?`, [sid],
    );
    expect(Number((linkRows as any[])[0].cnt)).toBe(2);

    // Exactly one settlement:paid event dispatched (no duplicate event).
    const { eventBusV2 } = await import('../../../shared/event-bus/index.js');
    const paidCalls = vi.mocked(eventBusV2.emit).mock.calls.filter((c: any) => c[0] === 'settlement:paid');
    expect(paidCalls).toHaveLength(1);

    await cleanupSettlement(sid, entIds);
  });

  it('recordPayment rejects a cancelled settlement (invalid transition)', async () => {
    const entIds = await createAvailableEntitlements(1);
    const sid = await createSettlement();
    const { unifiedSettlementService } = await import('../application/unified-settlement.service.js');

    await unifiedSettlementService.cancel(sid, ownerId, 'test cancel');
    await expect(unifiedSettlementService.recordPayment(sid, { paidBy: ownerId }))
      .rejects.toThrow(/cannot record payment/i);

    const [entRows] = await pool.execute<RowData>(
      `SELECT status FROM financial_entitlements WHERE id = ?`, [entIds[0]],
    );
    expect((entRows as any[])[0].status).toBe('AVAILABLE');

    // A rejected payment must not dispatch settlement:paid.
    const { eventBusV2 } = await import('../../../shared/event-bus/index.js');
    const paidCalls = vi.mocked(eventBusV2.emit).mock.calls.filter((c: any) => c[0] === 'settlement:paid');
    expect(paidCalls).toHaveLength(0);

    await cleanupSettlement(sid, entIds);
  });

  it('recordPayment on a completed settlement is idempotent (no double finalize)', async () => {
    const entIds = await createAvailableEntitlements(1);
    const sid = await createSettlement();
    const { unifiedSettlementService } = await import('../application/unified-settlement.service.js');

    await unifiedSettlementService.recordPayment(sid, { paidBy: ownerId });
    const detail = await unifiedSettlementService.recordPayment(sid, { paidBy: ownerId });

    expect(detail.settlement.settlement_status).toBe('completed');
    const [entRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM financial_entitlements WHERE id = ? AND status = 'SETTLED'`, [entIds[0]],
    );
    expect(Number((entRows as any[])[0].cnt)).toBe(1);

    // Idempotent re-payment: still exactly one settlement:paid dispatch.
    const { eventBusV2 } = await import('../../../shared/event-bus/index.js');
    const paidCalls = vi.mocked(eventBusV2.emit).mock.calls.filter((c: any) => c[0] === 'settlement:paid');
    expect(paidCalls).toHaveLength(1);

    await cleanupSettlement(sid, entIds);
  });

  it('duplicate entitlement linking does not create duplicate rows or double consumption', async () => {
    const entIds = await createAvailableEntitlements(2);
    const sid = await createSettlement();
    const { unifiedSettlementRepository } = await import('../infrastructure/repositories/unified-settlement.repository.js');

    await unifiedSettlementRepository.linkEntitlements(sid, entIds);
    await unifiedSettlementRepository.linkEntitlements(sid, entIds);

    const [linkRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt, COUNT(DISTINCT entitlement_id) AS distinct_ids
       FROM settlement_entitlements WHERE settlement_id = ?`, [sid],
    );
    expect(Number((linkRows as any[])[0].cnt)).toBe(2);
    expect(Number((linkRows as any[])[0].distinct_ids)).toBe(2);

    await cleanupSettlement(sid, entIds);
  });
});