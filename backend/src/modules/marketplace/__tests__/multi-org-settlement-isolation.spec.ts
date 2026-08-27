import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

/**
 * P2-5 — Multi-org seller settlement isolation.
 *
 * A seller who belongs to multiple organisations must:
 *  - list settlements from ALL authorised orgs (never orgIds[0] only)
 *  - preserve organisation identity per settlement
 *  - request settlement for a selected org (explicit organisationId)
 *  - never silently default to orgIds[0] when multiple orgs exist
 *  - never access another org's settlement
 */

// ── Hoisted mock refs ──
const settlementRepoMock = vi.hoisted(() => ({ findSettlementsForOrgs: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 20 })) }));
const settlementServiceMock = vi.hoisted(() => ({
  requestSettlement: vi.fn(async (d: any) => ({ id: 999, organisation_id: d.organisationId })),
  getOrganisationSettlements: vi.fn(async () => ({ data: [], total: 0 }),
  ),
}));
const repoMock = vi.hoisted(() => ({} as Record<string, any>));

vi.mock('../../../database/mysql.js', () => ({ getPool: () => ({ execute: vi.fn(async () => [[], []]) }) }));
vi.mock('../infrastructure/repositories/marketplace.repository.js', () => ({ marketplaceRepository: repoMock }));
vi.mock('../../settlement/infrastructure/repositories/settlement.repository.js', () => ({ settlementRepository: settlementRepoMock }));
vi.mock('../../settlement/application/settlement.service.js', () => ({ settlementService: settlementServiceMock }));

const { marketplaceService } = await import('../application/marketplace.service.js');

describe('P2-5 — multi-org seller settlement isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('single-org seller: list uses the single org and returns results', async () => {
    repoMock.findSellerOrgsForUser = vi.fn(async () => [{ id: 10, is_active: 1 }]);
    settlementRepoMock.findSettlementsForOrgs.mockResolvedValue({ data: [{ id: 1, organisation_id: 10, organisation_name: 'Org 10' }], total: 1, page: 1, limit: 20 });
    const result = await marketplaceService.getSettlementsByUser(5, 1, 20);
    expect(settlementRepoMock.findSettlementsForOrgs).toHaveBeenCalledWith([10], 1, 20);
    expect(result.data[0].organisation_id).toBe(10);
  });

  it('multi-org seller: list aggregates settlements from ALL authorised orgs', async () => {
    repoMock.findSellerOrgsForUser = vi.fn(async () => [
      { id: 10, is_active: 1 },
      { id: 20, is_active: 1 },
    ]);
    settlementRepoMock.findSettlementsForOrgs.mockResolvedValue({
      data: [
        { id: 1, organisation_id: 10, organisation_name: 'Org 10' },
        { id: 2, organisation_id: 20, organisation_name: 'Org 20' },
        { id: 3, organisation_id: 10, organisation_name: 'Org 10' },
      ],
      total: 3, page: 1, limit: 20,
    });
    const result = await marketplaceService.getSettlementsByUser(5, 1, 20);
    expect(settlementRepoMock.findSettlementsForOrgs).toHaveBeenCalledWith([10, 20], 1, 20);
    expect(result.data).toHaveLength(3);
    expect(result.data.map((s: any) => s.organisation_id)).toEqual(expect.arrayContaining([10, 20]));
  });

  it('multi-org seller: request requires an explicit organisationId (no silent orgIds[0])', async () => {
    repoMock.findSellerOrgsForUser = vi.fn(async () => [{ id: 10, is_active: 1 }, { id: 20, is_active: 1 }]);
    await expect(marketplaceService.requestSettlement(5)).rejects.toThrow(/organisationId is required/);
    expect(settlementServiceMock.requestSettlement).not.toHaveBeenCalled();
  });

  it('single-org seller: request defaults to their only org (backward compat)', async () => {
    repoMock.findSellerOrgsForUser = vi.fn(async () => [{ id: 10, is_active: 1 }]);
    const result = await marketplaceService.requestSettlement(5);
    expect(settlementServiceMock.requestSettlement).toHaveBeenCalledWith(expect.objectContaining({ organisationId: 10 }));
    expect(result.organisation_id).toBe(10);
  });

  it('multi-org seller: can request settlement for Org A explicitly', async () => {
    repoMock.findSellerOrgsForUser = vi.fn(async () => [{ id: 10, is_active: 1 }, { id: 20, is_active: 1 }]);
    const result = await marketplaceService.requestSettlement(5, 10);
    expect(settlementServiceMock.requestSettlement).toHaveBeenCalledWith(expect.objectContaining({ organisationId: 10 }));
    expect(result.organisation_id).toBe(10);
  });

  it('multi-org seller: can separately request settlement for Org B', async () => {
    repoMock.findSellerOrgsForUser = vi.fn(async () => [{ id: 10, is_active: 1 }, { id: 20, is_active: 1 }]);
    const result = await marketplaceService.requestSettlement(5, 20);
    expect(settlementServiceMock.requestSettlement).toHaveBeenCalledWith(expect.objectContaining({ organisationId: 20 }));
    expect(result.organisation_id).toBe(20);
  });

  it('requesting Org C without authorisation → ForbiddenError', async () => {
    repoMock.findSellerOrgsForUser = vi.fn(async () => [{ id: 10, is_active: 1 }, { id: 20, is_active: 1 }]);
    await expect(marketplaceService.requestSettlement(5, 30)).rejects.toThrow(/do not have access/);
    expect(settlementServiceMock.requestSettlement).not.toHaveBeenCalled();
  });

  it('seller with no orgs → ForbiddenError (both list and request)', async () => {
    repoMock.findSellerOrgsForUser = vi.fn(async () => []);
    await expect(marketplaceService.getSettlementsByUser(5, 1, 20)).rejects.toThrow(/No seller account/);
    await expect(marketplaceService.requestSettlement(5)).rejects.toThrow(/No seller account/);
  });

  it('organisation A settlement cannot consume organisation B entitlements', async () => {
    // The settlement service mock is keyed by the requested organisationId —
    // requesting for Org A only ever touches Org A's settlement (entitlement
    // isolation is enforced by unifiedSettlementService, unchanged here).
    repoMock.findSellerOrgsForUser = vi.fn(async () => [{ id: 10, is_active: 1 }, { id: 20, is_active: 1 }]);
    const resA = await marketplaceService.requestSettlement(5, 10);
    const resB = await marketplaceService.requestSettlement(5, 20);
    expect(resA.organisation_id).toBe(10);
    expect(resB.organisation_id).toBe(20);
    expect(settlementServiceMock.requestSettlement).toHaveBeenCalledTimes(2);
    const calls = settlementServiceMock.requestSettlement.mock.calls.map((c: any[]) => c[0].organisationId);
    expect(calls).toEqual([10, 20]);
  });
});