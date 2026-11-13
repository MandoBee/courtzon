import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pure unit tests: repository + event bus are spied on; no DB/Redis connection
// is ever opened.
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

const { financialEntitlementService } = await import('../application/financial-entitlement.service.js');
const { financialEntitlementRepository, EntitlementVersionConflict } = await import(
  '../infrastructure/repositories/financial-entitlement.repository.js'
);
const { eventBusV2 } = await import('../../../shared/event-bus/index.js');

const ent = (overrides: Record<string, any> = {}) => ({
  id: 5,
  public_id: 'fe-5',
  organisation_id: 1,
  entitlement_type: 'ORGANIZATION_EARNING',
  source_type: 'booking',
  source_id: 50,
  status: 'ON_HOLD',
  settlement_id: null,
  aggregate_version: 3,
  amount: '100.00',
  ...overrides,
});

const cancelEvents = () =>
  vi.mocked(eventBusV2.emit).mock.calls.filter((c: any) => c[0] === 'entitlement:cancelled');

describe('LAYER A — cancelEntitlement settlement-reservation guard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(eventBusV2, 'emit').mockResolvedValue(undefined as any);
  });

  it('cancels an UNRESERVED ON_HOLD entitlement with the optimistic version guard', async () => {
    vi.spyOn(financialEntitlementRepository, 'findById').mockResolvedValue(ent() as any);
    const persist = vi.spyOn(financialEntitlementRepository, 'persistTransition').mockResolvedValue(undefined as any);

    await financialEntitlementService.cancelEntitlement(5, 'refund');

    expect(persist).toHaveBeenCalledTimes(1);
    const [id, status, version, extra] = persist.mock.calls[0] as any[];
    expect(id).toBe(5);
    expect(status).toBe('CANCELLED');
    expect(version).toBe(3);
    expect(extra).toEqual({ cancelled_reason: 'refund' });
    expect(cancelEvents()).toHaveLength(1);
  });

  it('cancels an UNRESERVED AVAILABLE entitlement (existing behavior preserved)', async () => {
    vi.spyOn(financialEntitlementRepository, 'findById').mockResolvedValue(ent({ status: 'AVAILABLE' }) as any);
    const persist = vi.spyOn(financialEntitlementRepository, 'persistTransition').mockResolvedValue(undefined as any);

    await financialEntitlementService.cancelEntitlement(5, 'refund');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('cancels an UNRESERVED PENDING entitlement (existing behavior preserved)', async () => {
    vi.spyOn(financialEntitlementRepository, 'findById').mockResolvedValue(ent({ status: 'PENDING' }) as any);
    const persist = vi.spyOn(financialEntitlementRepository, 'persistTransition').mockResolvedValue(undefined as any);

    await financialEntitlementService.cancelEntitlement(5, 'refund');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('REJECTS a settlement-reserved entitlement: no persistence, no event', async () => {
    vi.spyOn(financialEntitlementRepository, 'findById').mockResolvedValue(ent({ settlement_id: 77 }) as any);
    const persist = vi.spyOn(financialEntitlementRepository, 'persistTransition').mockResolvedValue(undefined as any);

    await expect(financialEntitlementService.cancelEntitlement(5, 'refund')).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'CONFLICT',
    });
    await expect(financialEntitlementService.cancelEntitlement(5, 'refund')).rejects.toThrow(
      /reserved by settlement 77; cancel the settlement through the settlement cancellation workflow/,
    );

    expect(persist).not.toHaveBeenCalled();
    expect(cancelEvents()).toHaveLength(0);
  });

  it('keeps the terminal-state contract (SETTLED/CANCELLED)', async () => {
    for (const status of ['SETTLED', 'CANCELLED']) {
      vi.restoreAllMocks();
      vi.spyOn(eventBusV2, 'emit').mockResolvedValue(undefined as any);
      vi.spyOn(financialEntitlementRepository, 'findById').mockResolvedValue(ent({ status }) as any);
      const persist = vi.spyOn(financialEntitlementRepository, 'persistTransition').mockResolvedValue(undefined as any);

      await expect(financialEntitlementService.cancelEntitlement(5, 'x')).rejects.toThrow(
        new RegExp(`Cannot cancel entitlement in ${status} status`),
      );
      expect(persist).not.toHaveBeenCalled();
    }
  });

  it('keeps the missing-entitlement 409 contract', async () => {
    vi.spyOn(financialEntitlementRepository, 'findById').mockResolvedValue(null as any);
    const persist = vi.spyOn(financialEntitlementRepository, 'persistTransition').mockResolvedValue(undefined as any);

    await expect(financialEntitlementService.cancelEntitlement(404, 'x')).rejects.toMatchObject({
      statusCode: 409,
      message: 'Entitlement not found',
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it('propagates optimistic-lock conflicts unchanged', async () => {
    vi.spyOn(financialEntitlementRepository, 'findById').mockResolvedValue(ent() as any);
    vi.spyOn(financialEntitlementRepository, 'persistTransition').mockRejectedValue(
      new EntitlementVersionConflict(5, 3, 4) as any,
    );

    await expect(financialEntitlementService.cancelEntitlement(5, 'x')).rejects.toThrow(/version conflict/);
  });
});

describe('LAYER A — cancelBySourceIds batch preflight', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(eventBusV2, 'emit').mockResolvedValue(undefined as any);
  });

  it('rejects a reserved-only batch BEFORE any mutation', async () => {
    vi.spyOn(financialEntitlementRepository, 'findBySourceIds').mockResolvedValue([
      ent({ id: 11, settlement_id: 88 }),
    ] as any);
    const persist = vi.spyOn(financialEntitlementRepository, 'persistTransition').mockResolvedValue(undefined as any);

    await expect(financialEntitlementService.cancelBySourceIds('booking', [50], 'refund')).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(persist).not.toHaveBeenCalled();
    expect(cancelEvents()).toHaveLength(0);
  });

  it('rejects a MIXED batch before mutating ANY row (no partial cancellation)', async () => {
    vi.spyOn(financialEntitlementRepository, 'findBySourceIds').mockResolvedValue([
      ent({ id: 11, status: 'AVAILABLE' }),
      ent({ id: 12, status: 'ON_HOLD', settlement_id: 91 }),
      ent({ id: 13, status: 'PENDING' }),
    ] as any);
    const persist = vi.spyOn(financialEntitlementRepository, 'persistTransition').mockResolvedValue(undefined as any);

    await expect(financialEntitlementService.cancelBySourceIds('marketplace', [40], 'refund')).rejects.toThrow(
      /entitlement\(s\) 12 .*reserved by settlement\(s\) 91/,
    );
    expect(persist).not.toHaveBeenCalled();
    expect(cancelEvents()).toHaveLength(0);
  });

  it('cancels every unreserved row and returns the existing count contract', async () => {
    vi.spyOn(financialEntitlementRepository, 'findBySourceIds').mockResolvedValue([
      ent({ id: 11, status: 'AVAILABLE' }),
      ent({ id: 12, status: 'ON_HOLD' }),
      ent({ id: 13, status: 'PENDING' }),
    ] as any);
    vi.spyOn(financialEntitlementRepository, 'findById').mockImplementation(async (id: number) => {
      const status = id === 11 ? 'AVAILABLE' : id === 12 ? 'ON_HOLD' : 'PENDING';
      return ent({ id, status }) as any;
    });
    const persist = vi.spyOn(financialEntitlementRepository, 'persistTransition').mockResolvedValue(undefined as any);

    const cancelled = await financialEntitlementService.cancelBySourceIds('booking', [50], 'refund');

    expect(cancelled).toBe(3);
    expect(persist).toHaveBeenCalledTimes(3);
    expect(cancelEvents()).toHaveLength(3);
  });

  it('skips terminal rows and does not treat their settlement_id as an active reservation', async () => {
    vi.spyOn(financialEntitlementRepository, 'findBySourceIds').mockResolvedValue([
      ent({ id: 11, status: 'SETTLED', settlement_id: 55 }),
      ent({ id: 12, status: 'CANCELLED', settlement_id: 56 }),
      ent({ id: 13, status: 'AVAILABLE' }),
    ] as any);
    vi.spyOn(financialEntitlementRepository, 'findById').mockResolvedValue(ent({ id: 13, status: 'AVAILABLE' }) as any);
    const persist = vi.spyOn(financialEntitlementRepository, 'persistTransition').mockResolvedValue(undefined as any);

    const cancelled = await financialEntitlementService.cancelBySourceIds('booking', [50], 'refund');
    expect(cancelled).toBe(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('preserves the empty-batch zero result', async () => {
    const read = vi.spyOn(financialEntitlementRepository, 'findBySourceIds').mockResolvedValue([] as any);
    const persist = vi.spyOn(financialEntitlementRepository, 'persistTransition').mockResolvedValue(undefined as any);

    await expect(financialEntitlementService.cancelBySourceIds('booking', [99], 'x')).resolves.toBe(0);
    expect(read).toHaveBeenCalledWith('booking', [99]);
    expect(persist).not.toHaveBeenCalled();
  });

  it('preserves version-conflict skip/continue behavior inside the batch', async () => {
    vi.spyOn(financialEntitlementRepository, 'findBySourceIds').mockResolvedValue([
      ent({ id: 11, status: 'AVAILABLE' }),
      ent({ id: 12, status: 'AVAILABLE' }),
    ] as any);
    vi.spyOn(financialEntitlementRepository, 'findById').mockImplementation(async (id: number) =>
      ent({ id, status: 'AVAILABLE' }) as any,
    );
    vi.spyOn(financialEntitlementRepository, 'persistTransition')
      .mockRejectedValueOnce(new EntitlementVersionConflict(11, 3, 4) as any)
      .mockResolvedValueOnce(undefined as any);

    const cancelled = await financialEntitlementService.cancelBySourceIds('booking', [50], 'refund');
    expect(cancelled).toBe(1);
  });
});

describe('SETTLEMENT INVARIANT regression — releaseFromSettlement', () => {
  const conn: any = { execute: vi.fn() };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(eventBusV2, 'emit').mockResolvedValue(undefined as any);
  });

  it('releases an ON_HOLD reservation of the SAME settlement back to AVAILABLE (settlement_id cleared)', async () => {
    vi.spyOn(financialEntitlementRepository, 'findById').mockResolvedValue(
      ent({ status: 'ON_HOLD', settlement_id: 77 }) as any,
    );
    const persist = vi.spyOn(financialEntitlementRepository, 'persistTransition').mockResolvedValue(undefined as any);

    await financialEntitlementService.releaseFromSettlement([5], 77, conn);

    const [id, status, version, extra, usedConn] = persist.mock.calls[0] as any[];
    expect(id).toBe(5);
    expect(status).toBe('AVAILABLE');
    expect(version).toBe(3);
    expect(extra).toMatchObject({ hold_reason: null, settlement_id: null });
    expect(usedConn).toBe(conn);
  });

  it('still refuses a reservation that belongs to a DIFFERENT settlement', async () => {
    vi.spyOn(financialEntitlementRepository, 'findById').mockResolvedValue(
      ent({ status: 'ON_HOLD', settlement_id: 78 }) as any,
    );
    const persist = vi.spyOn(financialEntitlementRepository, 'persistTransition').mockResolvedValue(undefined as any);

    await expect(financialEntitlementService.releaseFromSettlement([5], 77, conn)).rejects.toThrow(
      /not reserved for this settlement/,
    );
    expect(persist).not.toHaveBeenCalled();
  });
});
