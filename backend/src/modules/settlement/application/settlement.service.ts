import { settlementRepository as repo } from '../infrastructure/repositories/settlement.repository.js';

export const settlementService = {

  async requestSettlement(data: {
    organisationId: number;
    branchId?: number | null;
    requestedBy: number;
    requestedByRole: string;
  }) {
    // Phase 4B: legacy marketplace settlement write path retired. All new
    // marketplace financial settlement is handled by Unified Settlement, which
    // operates on AVAILABLE financial entitlements and does NOT write
    // settlement_orders / settlement_transfers. This keeps the legacy entry
    // point (POST /marketplace/seller/settlements) functional while routing it
    // through the authoritative engine.
    const { unifiedSettlementService } = await import('./unified-settlement.service.js');
    return unifiedSettlementService.create({
      orgId: data.organisationId,
      requestedBy: data.requestedBy,
      requestedByRole: data.requestedByRole,
      notes: undefined,
    });
  },

  // ── Read ──

  async getSettlements(filters: { status?: string; orgId?: number; branchId?: number; from?: string; to?: string; page: number; limit: number }) {
    return repo.findSettlements(filters);
  },

  async getOrganisationSettlements(orgId: number, page: number, limit: number) {
    return repo.findOrgSettlements(orgId, page, limit);
  },
};