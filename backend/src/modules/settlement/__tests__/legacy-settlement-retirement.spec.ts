import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

// Phase 4B regression: legacy marketplace settlement write path is retired.
// settlementService.requestSettlement must delegate to Unified Settlement and
// must NOT write settlement_orders / settlement_transfers.

const { settlementService } = await import('../application/settlement.service.js');
const { unifiedSettlementService } = await import('../application/unified-settlement.service.js');
const { eventBusV2 } = await import('../../../shared/event-bus/index.js');

vi.spyOn(eventBusV2, 'emit').mockResolvedValue(undefined as any);

describe('Phase 4B — Legacy Marketplace Settlement Retirement', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(eventBusV2, 'emit').mockResolvedValue(undefined as any);
  });

  it('requestSettlement delegates to Unified Settlement (single authoritative write path)', async () => {
    const createSpy = vi.spyOn(unifiedSettlementService, 'create').mockResolvedValue({
      settlement: { id: 1, organisation_id: 5, settlement_status: 'requested', final_amount: 600, settlement_direction: 'courtzon_to_org' },
      entitlements: [],
      financials: {},
    } as any);

    const result = await settlementService.requestSettlement({
      organisationId: 5,
      requestedBy: 9,
      requestedByRole: 'seller',
    });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 5, requestedBy: 9, requestedByRole: 'seller' }),
    );
    expect(result.settlement.id).toBe(1);
  });

  it('no legacy settlement_orders / settlement_transfers write methods remain on the repository', async () => {
    const { settlementRepository } = await import('../infrastructure/repositories/settlement.repository.js');
    expect((settlementRepository as any).createSettlementOrders).toBeUndefined();
    expect((settlementRepository as any).createSettlementTransfer).toBeUndefined();
    expect((settlementRepository as any).markOrdersSettled).toBeUndefined();
    expect((settlementRepository as any).updateSettlementTotals).toBeUndefined();
    expect((settlementRepository as any).updateTransferStatus).toBeUndefined();
  });

  it('the legacy settlement write SQL (settlement_orders/settlement_transfers INSERT) no longer exists in the service', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const sourcePath = path.resolve(process.cwd(), 'src/modules/settlement/application/settlement.service.ts');
    const serviceSource = fs.readFileSync(sourcePath, 'utf8');
    expect(serviceSource.includes('INSERT INTO settlement_orders')).toBe(false);
    expect(serviceSource.includes('INSERT INTO settlement_transfers')).toBe(false);
  });

  it('marketplace requestSettlement resolves the seller organization and delegates (org-scoped)', async () => {
    // marketplace.service.requestSettlement resolves the seller org then calls
    // settlementService.requestSettlement (which delegates to unified).
    const { marketplaceService } = await import('../../marketplace/application/marketplace.service.js');
    const { marketplaceRepository } = await import('../../marketplace/infrastructure/repositories/marketplace.repository.js');

    vi.spyOn(marketplaceRepository, 'findOrgByUserId').mockResolvedValue({ id: 5 } as any);
    vi.spyOn(marketplaceRepository, 'findOrgByUserScope').mockResolvedValue(null as any);
    const createSpy = vi.spyOn(unifiedSettlementService, 'create').mockResolvedValue({
      settlement: { id: 2, organisation_id: 5 },
      entitlements: [],
      financials: {},
    } as any);

    const result = await marketplaceService.requestSettlement(9);
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ orgId: 5 }));
    expect(result.settlement.id).toBe(2);
  });
});