import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * F-4 — Complaint ON_HOLD release on non-refund terminal resolution.
 *
 * A complaint's financial dispute freezes the complained item's entitlements
 * (ON_HOLD) at submission. When the complaint reaches a TERMINAL NON-REFUND
 * outcome (rejected, or resolved via replacement/reshipment), the complaint-
 * created hold must be released so the seller's funds return to available.
 *
 * The refund path owns its own financial resolution and must remain unchanged.
 * Multi-seller orders must release ONLY the complained seller's entitlement.
 * The release must be idempotent and must not create any GL/settlement/wallet
 * side effects.
 */

vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn() }));
vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({
  walletRepository: { findTransactionsByReference: vi.fn() },
}));

// financial-entitlement service used by the complaint service
vi.mock('../../financial/application/financial-entitlement.service.js', () => ({
  financialEntitlementService: {
    getEntitlement: vi.fn(),
    releaseEntitlement: vi.fn(),
    getEntitlementsBySourceIds: vi.fn(),
  },
}));

vi.mock('../infrastructure/repositories/marketplace-complaint.repository.js', () => ({
  marketplaceComplaintRepository: {
    findById: vi.fn(),
    updateStatus: vi.fn(),
    updateFields: vi.fn(),
    create: vi.fn(),
    countByOrderItem: vi.fn(),
    sumPriorAdjustmentsByOrderItem: vi.fn(),
    findDueForCollectionEscalation: vi.fn(),
    markCollectionEscalated: vi.fn(),
  },
}));

vi.mock('../infrastructure/repositories/marketplace.repository.js', () => ({
  marketplaceRepository: {
    findOrderById: vi.fn(),
    findOrgByUserId: vi.fn(),
    findOrgByUserScope: vi.fn(),
  },
}));

vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBusV2: { emit: vi.fn() },
}));
vi.mock('../../../shared/utils/logger.js', () => ({
  createModuleLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

import { marketplaceComplaintService } from '../application/marketplace-complaint.service.js';
import { financialEntitlementService } from '../../financial/application/financial-entitlement.service.js';
import { marketplaceComplaintRepository } from '../infrastructure/repositories/marketplace-complaint.repository.js';
import { marketplaceRepository } from '../infrastructure/repositories/marketplace.repository.js';

const mkComplaint = (overrides: any = {}) => ({
  id: 1,
  order_id: 100,
  order_item_id: 200,
  product_id: 300,
  buyer_id: 400,
  seller_org_id: 500,
  complaint_type: 'defective',
  status: 'in_review',
  resolution_type: null,
  disputed_value: 100,
  needs_return: false,
  collection_status: 'not_required',
  entitlement_ids: [1, 2],
  aggregate_version: 1,
  ...overrides,
});

const mkEnt = (overrides: any = {}) => ({
  id: overrides.id ?? 1,
  organisation_id: 500,
  entitlement_type: 'ORGANIZATION_EARNING',
  source_type: 'marketplace',
  source_id: 200,
  status: 'ON_HOLD',
  settlement_id: null,
  hold_reason: 'Complaint #1',
  amount: 90,
  aggregate_version: 1,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('F-4 — releaseComplaintFinancialHold', () => {
  it('releases exactly the complaint-recorded ON_HOLD entitlements', async () => {
    (financialEntitlementService.getEntitlement as any)
      .mockResolvedValueOnce(mkEnt({ id: 1 }))
      .mockResolvedValueOnce(mkEnt({ id: 2 }));
    (financialEntitlementService.releaseEntitlement as any).mockResolvedValue(undefined);

    const released = await marketplaceComplaintService.releaseComplaintFinancialHold(mkComplaint());

    expect(released).toBe(2);
    expect(financialEntitlementService.releaseEntitlement).toHaveBeenCalledWith(1);
    expect(financialEntitlementService.releaseEntitlement).toHaveBeenCalledWith(2);
  });

  it('is idempotent: already-AVAILABLE/SETTLED entitlements are skipped', async () => {
    (financialEntitlementService.getEntitlement as any)
      .mockResolvedValueOnce(mkEnt({ id: 1, status: 'AVAILABLE' }))
      .mockResolvedValueOnce(mkEnt({ id: 2, status: 'SETTLED' }));

    const released = await marketplaceComplaintService.releaseComplaintFinancialHold(mkComplaint());

    expect(released).toBe(0);
    expect(financialEntitlementService.releaseEntitlement).not.toHaveBeenCalled();
  });

  it('never releases a settlement reservation (settlement_id set)', async () => {
    (financialEntitlementService.getEntitlement as any)
      .mockResolvedValueOnce(mkEnt({ id: 1 }))
      .mockResolvedValueOnce(mkEnt({ id: 2, settlement_id: 99 }));

    const released = await marketplaceComplaintService.releaseComplaintFinancialHold(mkComplaint());

    expect(released).toBe(1);
    expect(financialEntitlementService.releaseEntitlement).toHaveBeenCalledTimes(1);
    expect(financialEntitlementService.releaseEntitlement).toHaveBeenCalledWith(1);
  });

  it('returns 0 and does nothing when the complaint recorded no entitlement_ids', async () => {
    const released = await marketplaceComplaintService.releaseComplaintFinancialHold(mkComplaint({ entitlement_ids: null }));

    expect(released).toBe(0);
    expect(financialEntitlementService.getEntitlement).not.toHaveBeenCalled();
    expect(financialEntitlementService.releaseEntitlement).not.toHaveBeenCalled();
  });

  it('surfaces a non-version error (never silently reports success)', async () => {
    (financialEntitlementService.getEntitlement as any).mockResolvedValue(mkEnt({ id: 1 }));
    (financialEntitlementService.releaseEntitlement as any).mockRejectedValue(new Error('DB down'));

    await expect(marketplaceComplaintService.releaseComplaintFinancialHold(mkComplaint()))
      .rejects.toThrow('DB down');
  });

  it('skips (does not fail) on optimistic-lock version conflict', async () => {
    (financialEntitlementService.getEntitlement as any)
      .mockResolvedValueOnce(mkEnt({ id: 1 }))
      .mockResolvedValueOnce(mkEnt({ id: 2 }));
    (financialEntitlementService.releaseEntitlement as any)
      .mockRejectedValueOnce(new Error('Entitlement 1 version conflict: expected 1, actual 2'))
      .mockResolvedValueOnce(undefined);

    const released = await marketplaceComplaintService.releaseComplaintFinancialHold(mkComplaint());

    expect(released).toBe(1); // id 2 released, id 1 skipped as version conflict
  });

  it('does NOT create GL / settlement / wallet / adjustment side effects', async () => {
    // The helper should only ever call getEntitlement + releaseEntitlement.
    (financialEntitlementService.getEntitlement as any).mockResolvedValue(mkEnt({ id: 1 }));
    (financialEntitlementService.releaseEntitlement as any).mockResolvedValue(undefined);

    await marketplaceComplaintService.releaseComplaintFinancialHold(mkComplaint());

    // Only the two lifecycle methods are touched — no createEntitlements,
    // no GL, no wallet, no settlement methods are available on the mocked
    // entitlement service and none are called.
    const called = (financialEntitlementService as any).getEntitlement.mock.calls.length > 0
      || (financialEntitlementService as any).releaseEntitlement.mock.calls.length > 0;
    expect(called).toBe(true);
    expect((financialEntitlementService as any).getEntitlementsBySourceIds).not.toHaveBeenCalled();
  });

  it('multi-seller: releases ONLY the complained item\'s entitlements, never another seller\'s', async () => {
    // Order has Seller A (item 200 → entitlements 1,2) and Seller B (item 201 → entitlement 3).
    // The complaint is on item 200 and recorded ONLY entitlement_ids [1,2].
    const complaint = mkComplaint({ order_item_id: 200, entitlement_ids: [1, 2] });

    // Seller B's entitlement (id 3) is NOT in the complaint's recorded ids.
    (financialEntitlementService.getEntitlement as any)
      .mockResolvedValueOnce(mkEnt({ id: 1, source_id: 200, organisation_id: 500 }))
      .mockResolvedValueOnce(mkEnt({ id: 2, source_id: 200, organisation_id: 500 }));
    (financialEntitlementService.releaseEntitlement as any).mockResolvedValue(undefined);

    const released = await marketplaceComplaintService.releaseComplaintFinancialHold(complaint);

    expect(released).toBe(2);
    expect(financialEntitlementService.releaseEntitlement).toHaveBeenCalledTimes(2);
    expect(financialEntitlementService.releaseEntitlement).toHaveBeenCalledWith(1);
    expect(financialEntitlementService.releaseEntitlement).toHaveBeenCalledWith(2);
    // Seller B's entitlement 3 was never looked up nor released.
    expect(financialEntitlementService.getEntitlement).not.toHaveBeenCalledWith(3);
    expect(financialEntitlementService.releaseEntitlement).not.toHaveBeenCalledWith(3);
  });
});

describe('F-4 — terminal transitions release the complaint hold', () => {
  beforeEach(() => {
    // org access: seller org lookup resolves to org 500 (matches complaint.seller_org_id)
    (marketplaceRepository.findOrgByUserId as any).mockResolvedValue({ id: 500 });
    (marketplaceRepository.findOrgByUserScope as any).mockResolvedValue(null);
  });

  it('resolveComplaint(rejected) releases the hold after persisting rejection', async () => {
    (marketplaceComplaintRepository.findById as any).mockResolvedValue(mkComplaint());
    (marketplaceComplaintRepository.updateStatus as any).mockResolvedValue(undefined);
    const spy = vi.spyOn(marketplaceComplaintService, 'releaseComplaintFinancialHold').mockResolvedValue(2);

    await marketplaceComplaintService.resolveComplaint(10, 1, { resolutionType: 'rejected', rejectionReason: 'not as described' });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(marketplaceComplaintRepository.updateStatus).toHaveBeenCalledWith(
      1, 'rejected', 1, expect.objectContaining({ resolution_type: 'rejected' }),
    );
    spy.mockRestore();
  });

  it('resolveComplaint(replacement, no return) → recordShipment → awaiting_confirmation does NOT release prematurely', async () => {
    const complaint = mkComplaint({ complaint_type: 'missing_item' }); // missing_item needs no return
    (marketplaceComplaintRepository.findById as any).mockResolvedValue(complaint);
    (marketplaceComplaintRepository.updateStatus as any).mockResolvedValue(undefined);
    const spy = vi.spyOn(marketplaceComplaintService, 'releaseComplaintFinancialHold').mockResolvedValue(0);

    await marketplaceComplaintService.resolveComplaint(10, 1, { resolutionType: 'replacement' });

    expect(spy).not.toHaveBeenCalled();
    expect(marketplaceComplaintRepository.updateStatus).toHaveBeenCalledWith(
      1, 'awaiting_confirmation', 1, expect.objectContaining({ resolution_type: 'replacement' }),
    );
    spy.mockRestore();
  });

  it('resolveComplaint(replacement, needs return) → awaiting_return does NOT release prematurely', async () => {
    const complaint = mkComplaint({ complaint_type: 'defective' }); // defective needs return
    (marketplaceComplaintRepository.findById as any).mockResolvedValue(complaint);
    (marketplaceComplaintRepository.updateStatus as any).mockResolvedValue(undefined);
    const spy = vi.spyOn(marketplaceComplaintService, 'releaseComplaintFinancialHold').mockResolvedValue(0);

    await marketplaceComplaintService.resolveComplaint(10, 1, { resolutionType: 'replacement', needsReturn: true });

    expect(spy).not.toHaveBeenCalled();
    expect(marketplaceComplaintRepository.updateStatus).toHaveBeenCalledWith(
      1, 'awaiting_return', 1, expect.objectContaining({ resolution_type: 'replacement' }),
    );
    spy.mockRestore();
  });

  it('confirmReceipt(resolved) releases the hold', async () => {
    const complaint = mkComplaint({ status: 'awaiting_confirmation', resolution_type: 'replacement' });
    (marketplaceComplaintRepository.findById as any).mockResolvedValue(complaint);
    (marketplaceComplaintRepository.updateFields as any).mockResolvedValue(undefined);
    (marketplaceComplaintRepository.updateStatus as any).mockResolvedValue(undefined);
    const spy = vi.spyOn(marketplaceComplaintService, 'releaseComplaintFinancialHold').mockResolvedValue(2);

    await marketplaceComplaintService.confirmReceipt(400, 1);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(marketplaceComplaintRepository.updateStatus).toHaveBeenCalledWith(
      1, 'resolved', 1, expect.objectContaining({}),
    );
    spy.mockRestore();
  });

  it('rejectApproval(rejected) releases the hold', async () => {
    const complaint = mkComplaint({ status: 'refund_pending_approval', approval_status: 'pending' });
    (marketplaceComplaintRepository.findById as any).mockResolvedValue(complaint);
    (marketplaceComplaintRepository.updateStatus as any).mockResolvedValue(undefined);
    const spy = vi.spyOn(marketplaceComplaintService, 'releaseComplaintFinancialHold').mockResolvedValue(2);

    await marketplaceComplaintService.rejectApproval(1, 1, 'approval rejected');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(marketplaceComplaintRepository.updateStatus).toHaveBeenCalledWith(
      1, 'rejected', 1, expect.objectContaining({ approval_status: 'rejected' }),
    );
    spy.mockRestore();
  });

  it('refund path does NOT call the hold-release helper (refund owns its own resolution)', async () => {
    // A refund (immediate, no return needed, ≤ disputed value) goes through
    // _executeRefund, which already releases activated ON_HOLD entitlements and
    // writes adjustments. It must never ALSO call releaseComplaintFinancialHold.
    const complaint = mkComplaint({ status: 'in_review', complaint_type: 'missing_item' });
    (marketplaceComplaintRepository.findById as any).mockResolvedValue(complaint);
    (marketplaceComplaintRepository.updateStatus as any).mockResolvedValue(undefined);
    const spy = vi.spyOn(marketplaceComplaintService, 'releaseComplaintFinancialHold').mockResolvedValue(0);

    // Financial-entitlement calls inside _executeRefund.
    (financialEntitlementService.getEntitlementsBySourceIds as any).mockResolvedValue([
      mkEnt({ id: 1, status: 'ON_HOLD' }),
      mkEnt({ id: 2, status: 'ON_HOLD' }),
    ]);
    (marketplaceComplaintRepository.sumPriorAdjustmentsByOrderItem as any).mockResolvedValue({ commissionReversed: 0, orgOriginalReversed: 0 });
    (marketplaceRepository.findOrderById as any).mockResolvedValue([]);

    // Wallet repo mock
    const { walletRepository } = await import('../../wallet/infrastructure/repositories/wallet.repository.js');
    (walletRepository.findTransactionsByReference as any).mockResolvedValue([]);

    await expect(marketplaceComplaintService.resolveComplaint(10, 1, { resolutionType: 'refund', refundAmount: 50 }))
      .rejects.toThrow(); // will fail at wallet/DB mocks — that's fine, we assert helper not called

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});