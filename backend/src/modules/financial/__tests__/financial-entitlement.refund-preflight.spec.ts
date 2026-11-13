import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pure unit tests: the repository is mocked, so no DB/Redis connection opens.
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

const ent = (overrides: Record<string, any> = {}) => ({
  id: 10,
  status: 'ON_HOLD',
  settlement_id: null,
  aggregate_version: 2,
  ...overrides,
});

const findBySourceIds = () =>
  vi.spyOn(financialEntitlementRepository, 'findBySourceIds');

describe('LAYER B — assertNoActiveSettlementReservation (refund preflight)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing for an empty/blank source-id set (no repository read)', async () => {
    const read = findBySourceIds().mockResolvedValue([] as any);
    await financialEntitlementService.assertNoActiveSettlementReservation('booking', []);
    expect(read).not.toHaveBeenCalled();
  });

  it('sanitises invalid ids and still avoids a read when none remain', async () => {
    const read = findBySourceIds().mockResolvedValue([] as any);
    await financialEntitlementService.assertNoActiveSettlementReservation('booking', [0, -1, NaN as any]);
    expect(read).not.toHaveBeenCalled();
  });

  it('passes when the source has no entitlement at all', async () => {
    const read = findBySourceIds().mockResolvedValue([] as any);
    await expect(
      financialEntitlementService.assertNoActiveSettlementReservation('marketplace', [901]),
    ).resolves.toBeUndefined();
    expect(read).toHaveBeenCalledWith('marketplace', [901]);
  });

  it('passes when every entitlement is unreserved', async () => {
    findBySourceIds().mockResolvedValue([
      ent({ id: 10, status: 'AVAILABLE' }),
      ent({ id: 11, status: 'PENDING' }),
    ] as any);

    await expect(
      financialEntitlementService.assertNoActiveSettlementReservation('booking', [5]),
    ).resolves.toBeUndefined();
  });

  it('blocks with 409 when any entitlement is reserved by an active settlement', async () => {
    findBySourceIds().mockResolvedValue([
      ent({ id: 10, status: 'AVAILABLE' }),
      ent({ id: 11, status: 'ON_HOLD', settlement_id: 88 }),
    ] as any);

    await expect(
      financialEntitlementService.assertNoActiveSettlementReservation('booking', [5]),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'CONFLICT',
    });

    await expect(
      financialEntitlementService.assertNoActiveSettlementReservation('booking', [5]),
    ).rejects.toThrow(/reserved by settlement\(s\) 88/);
  });

  it('names every blocking settlement once, deterministically ordered', async () => {
    findBySourceIds().mockResolvedValue([
      ent({ id: 10, status: 'ON_HOLD', settlement_id: 91 }),
      ent({ id: 11, status: 'ON_HOLD', settlement_id: 90 }),
      ent({ id: 12, status: 'ON_HOLD', settlement_id: 91 }),
    ] as any);

    await expect(
      financialEntitlementService.assertNoActiveSettlementReservation('tournament', [77]),
    ).rejects.toThrow(/entitlement\(s\) 10, 11, 12 .* settlement\(s\) 90, 91/);
  });

  it('treats a SETTLED row with settlement_id as NOT an active reservation (post-settlement refunds stay allowed)', async () => {
    findBySourceIds().mockResolvedValue([
      ent({ id: 10, status: 'SETTLED', settlement_id: 55 }),
    ] as any);

    await expect(
      financialEntitlementService.assertNoActiveSettlementReservation('academy', [1]),
    ).resolves.toBeUndefined();
  });

  it('treats a terminal CANCELLED row as NOT an active reservation', async () => {
    findBySourceIds().mockResolvedValue([
      ent({ id: 10, status: 'CANCELLED', settlement_id: 55 }),
    ] as any);

    await expect(
      financialEntitlementService.assertNoActiveSettlementReservation('membership', [3]),
    ).resolves.toBeUndefined();
  });

  it('checks the reservation BEFORE any other work (single read, no writes)', async () => {
    const read = findBySourceIds().mockResolvedValue([
      ent({ id: 10, status: 'ON_HOLD', settlement_id: 12 }),
    ] as any);

    await expect(
      financialEntitlementService.assertNoActiveSettlementReservation('marketplace', [4, 4, 4]),
    ).rejects.toThrow(/reserved by settlement/);

    expect(read).toHaveBeenCalledTimes(1);
    // duplicate source ids are de-duplicated before the lookup
    expect(read).toHaveBeenCalledWith('marketplace', [4]);
  });
});
