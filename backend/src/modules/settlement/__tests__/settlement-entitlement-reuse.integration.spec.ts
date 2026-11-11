/**
 * Regression suite — settlement ⇄ entitlement re-use (migration 207 / option B).
 *
 * Contract under test:
 *   * `settlement_entitlements` keeps the HISTORICAL composition of a settlement
 *     forever; the row is never deleted when a settlement is cancelled.
 *   * `financial_entitlements.settlement_id` is the ACTIVE reservation and is
 *     cleared on cancel, so the entitlement is eligible again.
 *   * Uniqueness is per (settlement_id, entitlement_id) — a released entitlement
 *     can be linked to a NEW settlement while its old link survives.
 *   * A settlement with no linked entitlements can be neither paid nor cancelled.
 *   * `linkEntitlements` never commits a partial composition.
 *
 * ⚠️ INTEGRATION suite: it needs a hydrated database at migration 207 and is
 * therefore intentionally NOT executed in the implementation phase (no migration
 * may be applied yet). It cleans up only the rows it creates (run-scoped org).
 */
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'courtzon2026';
  process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6379';
  process.env.PORT = '3003';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

type RowData = RowDataPacket[];

describe('Settlement entitlement re-use — CREATE → CANCEL → CREATE (option B)', () => {
  let pool: mysql.Pool;
  let ownerId: number;
  let orgId: number;
  let runKey: string;
  let sourceSeq: number;

  const nextSourceId = () => {
    sourceSeq += 1;
    return sourceSeq;
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    // Event dispatch (outbox + accounting listener) is out of scope here; the
    // GL side is asserted end-to-end in the D3 E2E scenario. We only assert the
    // dispatch COUNT for payment/cancel.
    const { eventBusV2 } = await import('../../../shared/event-bus/index.js');
    vi.spyOn(eventBusV2, 'emit').mockResolvedValue(undefined as any);
  });

  /** Creates N AVAILABLE marketplace earnings with unique source ids. */
  async function createAvailableEntitlements(count: number): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 0; i < count; i++) {
      const [r] = await pool.execute<RowData>(
        `INSERT INTO financial_entitlements
           (public_id, organisation_id, entitlement_type, source_type, source_id, collector,
            amount, currency, status, available_at, aggregate_version)
         VALUES (UUID(), ?, 'ORGANIZATION_EARNING', 'marketplace', ?, 'courtzon', 100.00, 'EGP',
                 'AVAILABLE', NOW(), 1)`,
        [orgId, nextSourceId()],
      );
      ids.push((r as any).insertId);
    }
    return ids;
  }

  async function createSettlement(selectedEntitlementIds: number[]) {
    const { unifiedSettlementService } = await import('../application/unified-settlement.service.js');
    return unifiedSettlementService.create({
      orgId,
      selectedEntitlementIds,
      requestedBy: ownerId,
      requestedByRole: 'admin',
      notes: `reuse-regression-${runKey}`,
    });
  }

  async function linkCount(settlementId: number): Promise<number> {
    const [rows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM settlement_entitlements WHERE settlement_id = ?`,
      [settlementId],
    );
    return Number((rows as any[])[0].cnt);
  }

  async function ledgerCount(settlementId: number): Promise<number> {
    const [rows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM ledger_entries WHERE source_type = 'settlement' AND source_id = ?`,
      [settlementId],
    );
    return Number((rows as any[])[0].cnt);
  }

  async function entitlementState(id: number): Promise<{ status: string; settlement_id: number | null }> {
    const [rows] = await pool.execute<RowData>(
      `SELECT status, settlement_id FROM financial_entitlements WHERE id = ?`,
      [id],
    );
    const row = (rows as any[])[0];
    return { status: row.status, settlement_id: row.settlement_id === null ? null : Number(row.settlement_id) };
  }

  /**
   * Creates a settlement row with NO entitlement links (the pre-207 failure
   * shape observed on settlement 3713) so the empty-composition guards can be
   * exercised without corrupting a real settlement.
   */
  async function insertEmptySettlement(): Promise<number> {
    const [r] = await pool.execute<RowData>(
      `INSERT INTO settlements
         (organisation_id, settlement_status, requested_by, requested_by_role, settlement_type,
          batch_code, organization_position, courtzon_position, net_amount, final_amount,
          commission_amount, requested_at, created_at)
       VALUES (?, 'requested', ?, 'admin', 'unified', ?, 0, 0, 0, 0, 0, NOW(), NOW())`,
      [orgId, ownerId, `EMPTY-${runKey}-${nextSourceId()}`],
    );
    return (r as any).insertId;
  }

  let reuseSettlement: number;
  let reuseEntitlements: number[];

  beforeAll(async () => {
    runKey = `se${Date.now()}${Math.floor(Math.random() * 10000)}`;
    sourceSeq = 300000000 + Math.floor(Math.random() * 1000000);
    pool = mysql.createPool({
      host: '127.0.0.1',
      port: 3307,
      user: 'root',
      password: process.env.DB_PASSWORD,
      database: 'courtzon_v3',
      connectionLimit: 10,
      charset: 'utf8mb4',
    });

    const [u] = await pool.execute<RowData>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, full_name,
                          password_hash, account_status, is_public)
       VALUES (UUID(), 1, ?, ?, ?, 'Settlement Reuse Owner', 'x', 'active', 1)`,
      [`0102${runKey.slice(-9)}`, `+20102${runKey.slice(-9)}`, `settlement-reuse-${runKey}@test.com`],
    );
    ownerId = (u as any).insertId;

    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active)
       VALUES (UUID(), ?, ?, 'Settlement Reuse Org', ?, 1)`,
      [(ot as any[])[0].id, ownerId, `settlement-reuse-${runKey}`],
    );
    orgId = (o as any).insertId;
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.execute(
      `DELETE FROM settlement_entitlements WHERE settlement_id IN (SELECT id FROM settlements WHERE organisation_id = ?)`,
      [orgId],
    );
    await pool.execute(`DELETE FROM settlements WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM financial_entitlements WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.execute(`DELETE FROM users WHERE id = ?`, [ownerId]);
    await pool.end();
  });

  // ── R1 ────────────────────────────────────────────────────────────────────
  it('R1: CREATE links every reserved entitlement and holds it', async () => {
    reuseEntitlements = await createAvailableEntitlements(2);
    const detail = await createSettlement(reuseEntitlements);
    reuseSettlement = detail.settlement.id;

    expect(await linkCount(reuseSettlement)).toBe(2);
    for (const id of reuseEntitlements) {
      expect(await entitlementState(id)).toEqual({ status: 'ON_HOLD', settlement_id: reuseSettlement });
    }
  });

  // ── R2 ────────────────────────────────────────────────────────────────────
  it('R2: detail returns the linked entitlements and canonical financials', async () => {
    const { unifiedSettlementService } = await import('../application/unified-settlement.service.js');
    const detail = await unifiedSettlementService.get(reuseSettlement);

    expect(detail.entitlements.map((e: any) => Number(e.id)).sort()).toEqual(
      [...reuseEntitlements].sort(),
    );
    expect(detail.financials.finalAmount).toBeGreaterThan(0);
    expect(detail.settlement.settlement_status).toBe('requested');
  });

  // ── R3 ────────────────────────────────────────────────────────────────────
  it('R3: CANCEL releases the reservation, keeps the history and posts no GL', async () => {
    const { unifiedSettlementService } = await import('../application/unified-settlement.service.js');
    const detail = await unifiedSettlementService.cancel(reuseSettlement, ownerId, 'reuse regression');

    expect(detail.settlement.settlement_status).toBe('cancelled');
    for (const id of reuseEntitlements) {
      expect(await entitlementState(id)).toEqual({ status: 'AVAILABLE', settlement_id: null });
    }
    // The historical composition is PRESERVED (option B).
    expect(await linkCount(reuseSettlement)).toBe(2);
    expect(await ledgerCount(reuseSettlement)).toBe(0);
  });

  // ── R12 (history/export) ──────────────────────────────────────────────────
  it('R12: a cancelled settlement still reports its entitlement history in detail and export', async () => {
    const { unifiedSettlementService } = await import('../application/unified-settlement.service.js');

    const detail = await unifiedSettlementService.get(reuseSettlement);
    expect(detail.entitlements).toHaveLength(2);
    // History shows the entitlements that were included, now released.
    expect(detail.entitlements.every((e: any) => e.status === 'AVAILABLE')).toBe(true);

    const exported = await unifiedSettlementService.listForExport({ orgId });
    const row = exported.find((entry: any) => Number(entry.settlement.id) === reuseSettlement);
    expect(row).toBeDefined();
    expect(row.entitlements).toHaveLength(2);
    expect(row.settlement.settlement_status).toBe('cancelled');
  });

  // ── R4 ────────────────────────────────────────────────────────────────────
  it('R4: the SAME entitlements can be linked to a new settlement (old history intact)', async () => {
    const detail = await createSettlement(reuseEntitlements);
    const secondSettlement = detail.settlement.id;

    expect(secondSettlement).not.toBe(reuseSettlement);
    expect(await linkCount(secondSettlement)).toBe(2);
    // The first (cancelled) settlement keeps its two historical links.
    expect(await linkCount(reuseSettlement)).toBe(2);
    for (const id of reuseEntitlements) {
      expect(await entitlementState(id)).toEqual({ status: 'ON_HOLD', settlement_id: secondSettlement });
    }

    reuseSettlement = secondSettlement;
  });

  // ── R5 ────────────────────────────────────────────────────────────────────
  it('R5: the re-used settlement can be paid (entitlements settle, history grows)', async () => {
    const { unifiedSettlementService } = await import('../application/unified-settlement.service.js');
    const detail = await unifiedSettlementService.recordPayment(reuseSettlement, { paidBy: ownerId });

    expect(detail.settlement.settlement_status).toBe('completed');
    for (const id of reuseEntitlements) {
      expect(await entitlementState(id)).toEqual({ status: 'SETTLED', settlement_id: reuseSettlement });
    }
    expect(await linkCount(reuseSettlement)).toBe(2);

    const { eventBusV2 } = await import('../../../shared/event-bus/index.js');
    const paidCalls = vi.mocked(eventBusV2.emit).mock.calls.filter((c: any) => c[0] === 'settlement:paid');
    expect(paidCalls).toHaveLength(1);
  });

  // ── R6 ────────────────────────────────────────────────────────────────────
  it('R6: a second CREATE → CANCEL cycle releases again and preserves every historical link', async () => {
    const ents = await createAvailableEntitlements(2);
    const first = await createSettlement(ents);
    const { unifiedSettlementService } = await import('../application/unified-settlement.service.js');
    await unifiedSettlementService.cancel(first.settlement.id, ownerId, 'cycle 1');

    const second = await createSettlement(ents);
    expect(second.settlement.id).not.toBe(first.settlement.id);
    expect(await linkCount(first.settlement.id)).toBe(2);
    expect(await linkCount(second.settlement.id)).toBe(2);

    const cancelled = await unifiedSettlementService.cancel(second.settlement.id, ownerId, 'cycle 2');
    expect(cancelled.settlement.settlement_status).toBe('cancelled');
    for (const id of ents) {
      expect(await entitlementState(id)).toEqual({ status: 'AVAILABLE', settlement_id: null });
    }
    expect(await linkCount(second.settlement.id)).toBe(2);
    expect(await ledgerCount(second.settlement.id)).toBe(0);
  });

  // ── R7 ────────────────────────────────────────────────────────────────────
  // LOW-2: the repository-level reservation check now rejects BEFORE the insert,
  // because the entitlement's active reservation (`financial_entitlements
  // .settlement_id`) still points at the first settlement. The active-link probe
  // remains as defence in depth (covered by unit tests).
  it('R7: linking an entitlement reserved by another settlement is refused', async () => {
    const ents = await createAvailableEntitlements(1);
    await createSettlement(ents); // entitlement is now ON_HOLD + linked + active
    const otherSettlement = await insertEmptySettlement();

    const { unifiedSettlementRepository } = await import(
      '../infrastructure/repositories/unified-settlement.repository.js'
    );

    await expect(
      unifiedSettlementRepository.linkEntitlements(otherSettlement, ents),
    ).rejects.toThrow(/not reserved for this settlement/);

    // Nothing was inserted for the second settlement.
    expect(await linkCount(otherSettlement)).toBe(0);
  });

  // ── R8 ────────────────────────────────────────────────────────────────────
  it('R8: paying a settlement with no linked entitlements is refused and changes nothing', async () => {
    const empty = await insertEmptySettlement();
    const { unifiedSettlementService } = await import('../application/unified-settlement.service.js');

    await expect(
      unifiedSettlementService.recordPayment(empty, { paidBy: ownerId }),
    ).rejects.toThrow(/no linked entitlements/);

    const [rows] = await pool.execute<RowData>(
      `SELECT settlement_status FROM settlements WHERE id = ?`,
      [empty],
    );
    expect((rows as any[])[0].settlement_status).toBe('requested');
    expect(await ledgerCount(empty)).toBe(0);

    const { eventBusV2 } = await import('../../../shared/event-bus/index.js');
    expect(
      vi.mocked(eventBusV2.emit).mock.calls.filter((c: any) => c[0] === 'settlement:paid'),
    ).toHaveLength(0);
  });

  // ── R9 ────────────────────────────────────────────────────────────────────
  it('R9: cancelling a settlement with no linked entitlements is refused and changes nothing', async () => {
    const empty = await insertEmptySettlement();
    const { unifiedSettlementService } = await import('../application/unified-settlement.service.js');

    await expect(unifiedSettlementService.cancel(empty, ownerId, 'empty')).rejects.toThrow(
      /no linked entitlements/,
    );

    const [rows] = await pool.execute<RowData>(
      `SELECT settlement_status FROM settlements WHERE id = ?`,
      [empty],
    );
    expect((rows as any[])[0].settlement_status).toBe('requested');

    const { eventBusV2 } = await import('../../../shared/event-bus/index.js');
    expect(
      vi.mocked(eventBusV2.emit).mock.calls.filter((c: any) => c[0] === 'settlement:cancelled'),
    ).toHaveLength(0);
  });

  // ── R10 ───────────────────────────────────────────────────────────────────
  it('R10: concurrent CREATE for the same entitlements yields exactly one settlement', async () => {
    const ents = await createAvailableEntitlements(2);
    const { unifiedSettlementService } = await import('../application/unified-settlement.service.js');

    const results = await Promise.allSettled([
      unifiedSettlementService.create({
        orgId, selectedEntitlementIds: ents, requestedBy: ownerId, requestedByRole: 'admin',
      }),
      unifiedSettlementService.create({
        orgId, selectedEntitlementIds: ents, requestedBy: ownerId, requestedByRole: 'admin',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    expect(fulfilled).toHaveLength(1);

    const winner = fulfilled[0].value.settlement.id as number;
    const [linkRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM settlement_entitlements WHERE entitlement_id IN (?, ?)`,
      ents,
    );
    expect(Number((linkRows as any[])[0].cnt)).toBe(2); // exactly one link set
    expect(await linkCount(winner)).toBe(2);
  });

  // ── R11 ───────────────────────────────────────────────────────────────────
  it('R11: invariant — links match active reservations for live settlements, cancelled ones keep history only', async () => {
    const [rows] = await pool.execute<RowData>(
      `SELECT s.id, s.settlement_status,
              (SELECT COUNT(*) FROM settlement_entitlements se WHERE se.settlement_id = s.id) AS links,
              (SELECT COUNT(*) FROM financial_entitlements fe WHERE fe.settlement_id = s.id) AS reserved
         FROM settlements s
        WHERE s.organisation_id = ?
        HAVING (s.settlement_status <> 'cancelled' AND links <> reserved)
            OR (s.settlement_status = 'cancelled' AND reserved <> 0)`,
      [orgId],
    );
    expect(rows as any[]).toEqual([]);
  });
});
