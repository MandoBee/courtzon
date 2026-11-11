import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pure unit tests: the repository and the event bus are mocked, so no DB/Redis
// connection is ever opened.
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

const { financialEntitlementService } = await import(
  '../application/financial-entitlement.service.js'
);
const { financialEntitlementRepository } = await import(
  '../infrastructure/repositories/financial-entitlement.repository.js'
);
const { eventBusV2 } = await import('../../../shared/event-bus/index.js');
const { getPool } = await import('../../../database/mysql.js');

const baseEntitlement = (overrides: Record<string, any> = {}) => ({
  id: 5,
  public_id: 'fe-5',
  organisation_id: 1,
  entitlement_type: 'ORGANIZATION_EARNING',
  status: 'ON_HOLD',
  // Generic (complaint/marketplace) holds carry NO settlement reservation.
  settlement_id: null,
  aggregate_version: 3,
  ...overrides,
});

describe('financialEntitlementService.releaseEntitlement — generic hold release', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(eventBusV2, 'emit').mockResolvedValue(undefined as any);
  });

  it('transitions a non-settlement ON_HOLD hold to AVAILABLE', async () => {
    vi.spyOn(financialEntitlementRepository, 'findById').mockResolvedValue(baseEntitlement() as any);
    const transition = vi
      .spyOn(financialEntitlementRepository, 'persistTransition')
      .mockResolvedValue(undefined as any);

    await financialEntitlementService.releaseEntitlement(5);

    expect(transition).toHaveBeenCalledTimes(1);
    const [id, status, version, extra] = transition.mock.calls[0] as any[];
    expect(id).toBe(5);
    expect(status).toBe('AVAILABLE');
    // Optimistic concurrency: the caller's version is passed through untouched.
    expect(version).toBe(3);
    expect(extra).toMatchObject({ hold_reason: null, settlement_id: null });
  });

  it('keeps the entitlement eligible for a future settlement (reservation stays NULL)', async () => {
    vi.spyOn(financialEntitlementRepository, 'findById').mockResolvedValue(baseEntitlement() as any);
    const transition = vi
      .spyOn(financialEntitlementRepository, 'persistTransition')
      .mockResolvedValue(undefined as any);

    await financialEntitlementService.releaseEntitlement(5);

    const extra = (transition.mock.calls[0] as any[])[3];
    // findAvailableForOrganisation() requires `settlement_id IS NULL`.
    expect(extra.settlement_id).toBeNull();
  });

  it('emits entitlement:released so realtime/notification consumers stay in sync', async () => {
    vi.spyOn(financialEntitlementRepository, 'findById').mockResolvedValue(baseEntitlement() as any);
    vi.spyOn(financialEntitlementRepository, 'persistTransition').mockResolvedValue(undefined as any);

    await financialEntitlementService.releaseEntitlement(5);

    const emitted = vi.mocked(eventBusV2.emit).mock.calls.filter((c: any) => c[0] === 'entitlement:released');
    expect(emitted).toHaveLength(1);
    expect((emitted[0][1] as any).entitlementId).toBe(5);
  });

  it('refuses to release an entitlement that is not ON_HOLD', async () => {
    vi.spyOn(financialEntitlementRepository, 'findById').mockResolvedValue(
      baseEntitlement({ status: 'SETTLED' }) as any,
    );
    const transition = vi
      .spyOn(financialEntitlementRepository, 'persistTransition')
      .mockResolvedValue(undefined as any);

    await expect(financialEntitlementService.releaseEntitlement(5)).rejects.toThrow(
      /Cannot release entitlement in SETTLED status/,
    );
    expect(transition).not.toHaveBeenCalled();
  });

  // LOW-1 — a settlement reservation must only be released by the settlement
  // cancellation workflow. A generic release would orphan the settlement: its
  // settlement_entitlements link would stay active while the reservation (the
  // authoritative ACTIVE marker) disappears.
  it('refuses to release an entitlement reserved by an active settlement', async () => {
    vi.spyOn(financialEntitlementRepository, 'findById').mockResolvedValue(
      baseEntitlement({ settlement_id: 3712 }) as any,
    );
    const transition = vi
      .spyOn(financialEntitlementRepository, 'persistTransition')
      .mockResolvedValue(undefined as any);

    await expect(financialEntitlementService.releaseEntitlement(5)).rejects.toThrow(
      /reserved by settlement 3712; release it through the settlement cancellation workflow/,
    );

    // Status and settlement_id are left untouched: no transition, no event.
    expect(transition).not.toHaveBeenCalled();
    const emitted = vi.mocked(eventBusV2.emit).mock.calls.filter((c: any) => c[0] === 'entitlement:released');
    expect(emitted).toHaveLength(0);
  });

  it('refuses any settlement reservation regardless of its id (no silent unlink)', async () => {
    vi.spyOn(financialEntitlementRepository, 'findById').mockResolvedValue(
      baseEntitlement({ settlement_id: 999999 }) as any,
    );
    const transition = vi
      .spyOn(financialEntitlementRepository, 'persistTransition')
      .mockResolvedValue(undefined as any);

    await expect(financialEntitlementService.releaseEntitlement(5)).rejects.toThrow(
      /not reserved|reserved by settlement 999999/,
    );
    expect(transition).not.toHaveBeenCalled();
  });
});

// ============================================================================
// INFO-1 — releaseBySourceIds must be atomic: all eligible releases commit, or
// none does. The whole target set is locked and validated before the first
// write, and release events are emitted only after COMMIT.
// ============================================================================
describe('financialEntitlementService.releaseBySourceIds — atomic bulk release', () => {
  const ent = (id: number, overrides: Record<string, any> = {}) => ({
    id,
    public_id: `fe-${id}`,
    organisation_id: 1,
    entitlement_type: 'ORGANIZATION_EARNING',
    status: 'ON_HOLD',
    settlement_id: null,
    aggregate_version: 1,
    ...overrides,
  });

  function fakeConn() {
    return {
      beginTransaction: vi.fn(async () => undefined),
      commit: vi.fn(async () => undefined),
      rollback: vi.fn(async () => undefined),
      release: vi.fn(),
    } as any;
  }

  function emittedCount(): number {
    return vi.mocked(eventBusV2.emit).mock.calls.filter((c: any) => c[0] === 'entitlement:released').length;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(eventBusV2, 'emit').mockResolvedValue(undefined as any);
  });

  it('releases every eligible entitlement in one transaction and emits after commit', async () => {
    const conn = fakeConn();
    vi.spyOn(getPool(), 'getConnection').mockResolvedValue(conn);
    const find = vi
      .spyOn(financialEntitlementRepository, 'findBySourceIds')
      .mockResolvedValue([ent(11), ent(12)] as any);
    const persist = vi
      .spyOn(financialEntitlementRepository, 'persistTransition')
      .mockResolvedValue(undefined as any);

    let emittedAtCommit = -1;
    (conn.commit as any).mockImplementation(async () => {
      emittedAtCommit = emittedCount();
    });

    const released = await financialEntitlementService.releaseBySourceIds('marketplace', [10]);

    expect(released).toBe(2);
    // Whole set locked on the caller's connection.
    expect(find).toHaveBeenCalledWith('marketplace', [10], conn, true);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[0][4]).toBe(conn);
    expect(persist.mock.calls[1][4]).toBe(conn);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    // No event before COMMIT, both after.
    expect(emittedAtCommit).toBe(0);
    expect(emittedCount()).toBe(2);
    expect(conn.release).toHaveBeenCalled();
  });

  it('rejects the WHOLE operation when a later entitlement is settlement-reserved', async () => {
    const conn = fakeConn();
    vi.spyOn(getPool(), 'getConnection').mockResolvedValue(conn);
    vi.spyOn(financialEntitlementRepository, 'findBySourceIds').mockResolvedValue([
      ent(11),
      ent(12, { settlement_id: 77 }),
    ] as any);
    const persist = vi
      .spyOn(financialEntitlementRepository, 'persistTransition')
      .mockResolvedValue(undefined as any);

    await expect(
      financialEntitlementService.releaseBySourceIds('marketplace', [10]),
    ).rejects.toThrow(/reserved by settlement 77/);

    // Validation runs before any write.
    expect(persist).not.toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(emittedCount()).toBe(0);
  });

  it('rejects without releasing when a MIDDLE entitlement fails validation', async () => {
    const conn = fakeConn();
    vi.spyOn(getPool(), 'getConnection').mockResolvedValue(conn);
    vi.spyOn(financialEntitlementRepository, 'findBySourceIds').mockResolvedValue([
      ent(11),
      ent(12, { settlement_id: 88 }),
      ent(13),
    ] as any);
    const persist = vi
      .spyOn(financialEntitlementRepository, 'persistTransition')
      .mockResolvedValue(undefined as any);

    await expect(
      financialEntitlementService.releaseBySourceIds('marketplace', [10, 11]),
    ).rejects.toThrow(/reserved by settlement 88/);

    expect(persist).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(emittedCount()).toBe(0);
  });

  it('rolls back the whole batch when a write fails (no partial release)', async () => {
    const conn = fakeConn();
    vi.spyOn(getPool(), 'getConnection').mockResolvedValue(conn);
    vi.spyOn(financialEntitlementRepository, 'findBySourceIds').mockResolvedValue([
      ent(11),
      ent(12),
    ] as any);
    const persist = vi
      .spyOn(financialEntitlementRepository, 'persistTransition')
      .mockResolvedValueOnce(undefined as any)
      .mockRejectedValueOnce(new Error('version conflict: concurrent update') as any);

    await expect(
      financialEntitlementService.releaseBySourceIds('marketplace', [10]),
    ).rejects.toThrow(/version conflict/);

    expect(persist).toHaveBeenCalledTimes(2);
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(emittedCount()).toBe(0);
  });

  it('rolls back and emits nothing when COMMIT itself fails', async () => {
    const conn = fakeConn();
    vi.spyOn(getPool(), 'getConnection').mockResolvedValue(conn);
    vi.spyOn(financialEntitlementRepository, 'findBySourceIds').mockResolvedValue([ent(11)] as any);
    vi.spyOn(financialEntitlementRepository, 'persistTransition').mockResolvedValue(undefined as any);
    (conn.commit as any).mockRejectedValueOnce(new Error('commit failed'));

    await expect(
      financialEntitlementService.releaseBySourceIds('marketplace', [10]),
    ).rejects.toThrow(/commit failed/);

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(emittedCount()).toBe(0);
  });

  it('returns 0 without opening a transaction for empty input', async () => {
    const getConn = vi.spyOn(getPool(), 'getConnection');
    const find = vi.spyOn(financialEntitlementRepository, 'findBySourceIds');

    await expect(
      financialEntitlementService.releaseBySourceIds('marketplace', []),
    ).resolves.toBe(0);

    expect(getConn).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
    expect(emittedCount()).toBe(0);
  });

  it('passes duplicate source ids through unchanged (DB IN() dedupes rows)', async () => {
    const conn = fakeConn();
    vi.spyOn(getPool(), 'getConnection').mockResolvedValue(conn);
    const find = vi
      .spyOn(financialEntitlementRepository, 'findBySourceIds')
      .mockResolvedValue([ent(11), ent(12)] as any);
    vi.spyOn(financialEntitlementRepository, 'persistTransition').mockResolvedValue(undefined as any);

    const released = await financialEntitlementService.releaseBySourceIds('marketplace', [10, 10]);

    expect(find).toHaveBeenCalledWith('marketplace', [10, 10], conn, true);
    expect(released).toBe(2);
    expect(emittedCount()).toBe(2);
  });

  it('skips non-ON_HOLD rows and still commits the eligible ones', async () => {
    const conn = fakeConn();
    vi.spyOn(getPool(), 'getConnection').mockResolvedValue(conn);
    vi.spyOn(financialEntitlementRepository, 'findBySourceIds').mockResolvedValue([
      ent(11, { status: 'AVAILABLE' }),
      ent(12),
    ] as any);
    const persist = vi
      .spyOn(financialEntitlementRepository, 'persistTransition')
      .mockResolvedValue(undefined as any);

    const released = await financialEntitlementService.releaseBySourceIds('marketplace', [10]);

    expect(released).toBe(1);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0][0]).toBe(12);
    expect(emittedCount()).toBe(1);
  });

  it('emits the documented release payload after commit', async () => {
    const conn = fakeConn();
    vi.spyOn(getPool(), 'getConnection').mockResolvedValue(conn);
    vi.spyOn(financialEntitlementRepository, 'findBySourceIds').mockResolvedValue([
      ent(11, { public_id: 'fe-public-11', organisation_id: 42 }),
    ] as any);
    vi.spyOn(financialEntitlementRepository, 'persistTransition').mockResolvedValue(undefined as any);

    await financialEntitlementService.releaseBySourceIds('marketplace', [10]);

    const emitted = vi.mocked(eventBusV2.emit).mock.calls.filter(
      (c: any) => c[0] === 'entitlement:released',
    );
    expect(emitted).toHaveLength(1);
    expect(emitted[0][1]).toMatchObject({
      entitlementId: 11,
      publicId: 'fe-public-11',
      organisationId: 42,
    });
  });
});
