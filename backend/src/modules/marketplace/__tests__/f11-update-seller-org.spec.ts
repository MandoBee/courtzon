import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

/**
 * F-11 — updateSellerOrg multi-org org resolution.
 *
 * A seller who belongs to multiple organisations must:
 *  - update an EXPLICIT target organisation (never silently orgIds[0])
 *  - fail with ValidationError when a multi-org seller omits organisationId
 *  - fail with ForbiddenError for an unauthorised organisation
 *  - keep single-org sellers fully backward compatible
 *  - never expose or modify another organisation's data
 */

const repoMock = vi.hoisted(() => ({} as Record<string, any>));
const orgServiceMock = vi.hoisted(() => ({
  upsertMainBranchFinancialDetails: vi.fn(async () => ({})),
}));

vi.mock('../../../database/mysql.js', () => ({ getPool: () => ({ execute: vi.fn(async () => [[], []]) }) }));
vi.mock('../infrastructure/repositories/marketplace.repository.js', () => ({ marketplaceRepository: repoMock }));
vi.mock('../../organisations/application/organisation.service.js', () => ({ organisationService: orgServiceMock }));

const { marketplaceService } = await import('../application/marketplace.service.js');

describe('F-11 — updateSellerOrg multi-org org resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoMock.updateOrganisation = vi.fn(async () => ({ affectedRows: 1 }));
    repoMock.findOrgById = vi.fn(async (id: number) => ({ id, name: `Org ${id}` }));
  });

  it('single-org seller: updates their only org (backward compatible, no organisationId required)', async () => {
    repoMock.findSellerOrgsForUser = vi.fn(async () => [{ id: 10, is_active: 1 }]);
    const result = await marketplaceService.updateSellerOrg(5, { description: 'Updated' });
    expect(repoMock.updateOrganisation).toHaveBeenCalledWith(10, expect.objectContaining({ description: 'Updated' }));
    expect(result.id).toBe(10);
  });

  it('multi-org seller: updates Org A explicitly', async () => {
    repoMock.findSellerOrgsForUser = vi.fn(async () => [{ id: 10, is_active: 1 }, { id: 20, is_active: 1 }]);
    const result = await marketplaceService.updateSellerOrg(5, { organisationId: 10, description: 'Org A desc' });
    expect(repoMock.updateOrganisation).toHaveBeenCalledWith(10, expect.objectContaining({ description: 'Org A desc' }));
    expect(result.id).toBe(10);
  });

  it('multi-org seller: updates Org B explicitly', async () => {
    repoMock.findSellerOrgsForUser = vi.fn(async () => [{ id: 10, is_active: 1 }, { id: 20, is_active: 1 }]);
    const result = await marketplaceService.updateSellerOrg(5, { organisationId: 20, website: 'b.example.com' });
    expect(repoMock.updateOrganisation).toHaveBeenCalledWith(20, expect.objectContaining({ website: 'b.example.com' }));
    expect(result.id).toBe(20);
  });

  it('multi-org seller WITHOUT organisationId → ValidationError (never silent orgIds[0])', async () => {
    repoMock.findSellerOrgsForUser = vi.fn(async () => [{ id: 10, is_active: 1 }, { id: 20, is_active: 1 }]);
    await expect(marketplaceService.updateSellerOrg(5, { description: 'Ambiguous' }))
      .rejects.toThrow(/organisationId is required when a seller manages multiple organisations/);
    expect(repoMock.updateOrganisation).not.toHaveBeenCalled();
  });

  it('multi-org seller requesting unauthorised Org C → ForbiddenError', async () => {
    repoMock.findSellerOrgsForUser = vi.fn(async () => [{ id: 10, is_active: 1 }, { id: 20, is_active: 1 }]);
    await expect(marketplaceService.updateSellerOrg(5, { organisationId: 30, description: 'Org C' }))
      .rejects.toThrow(/do not have access to this organisation/);
    expect(repoMock.updateOrganisation).not.toHaveBeenCalled();
  });

  it('seller with no orgs → NotFoundError', async () => {
    repoMock.findSellerOrgsForUser = vi.fn(async () => []);
    await expect(marketplaceService.updateSellerOrg(5, { description: 'None' }))
      .rejects.toThrow(/Seller account/);
    expect(repoMock.updateOrganisation).not.toHaveBeenCalled();
  });

  it('seller cannot update another organisation (Org A user targets Org C)', async () => {
    repoMock.findSellerOrgsForUser = vi.fn(async () => [{ id: 10, is_active: 1 }]);
    await expect(marketplaceService.updateSellerOrg(5, { organisationId: 30, description: 'Cross' }))
      .rejects.toThrow(/do not have access to this organisation/);
    expect(repoMock.updateOrganisation).not.toHaveBeenCalled();
  });

  it('organisationId is never persisted as org metadata', async () => {
    repoMock.findSellerOrgsForUser = vi.fn(async () => [{ id: 10, is_active: 1 }, { id: 20, is_active: 1 }]);
    await marketplaceService.updateSellerOrg(5, { organisationId: 20, description: 'Clean' });
    const updateArg = repoMock.updateOrganisation.mock.calls[0][1];
    expect(updateArg).not.toHaveProperty('organisationId');
  });

  it('financial details are upserted against the EXPLICIT org', async () => {
    repoMock.findSellerOrgsForUser = vi.fn(async () => [{ id: 10, is_active: 1 }, { id: 20, is_active: 1 }]);
    await marketplaceService.updateSellerOrg(5, { organisationId: 20, financialDetails: { bankName: 'X' } });
    expect(orgServiceMock.upsertMainBranchFinancialDetails).toHaveBeenCalledWith(20, { bankName: 'X' });
    expect(repoMock.updateOrganisation).not.toHaveBeenCalled();
  });

  it('single-org seller financial details remain backward compatible', async () => {
    repoMock.findSellerOrgsForUser = vi.fn(async () => [{ id: 10, is_active: 1 }]);
    await marketplaceService.updateSellerOrg(5, { financialDetails: { bankName: 'Y' } });
    expect(orgServiceMock.upsertMainBranchFinancialDetails).toHaveBeenCalledWith(10, { bankName: 'Y' });
  });
});