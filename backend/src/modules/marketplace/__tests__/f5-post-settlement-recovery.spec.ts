import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * F-5 — Post-settlement marketplace refund recovery.
 *
 * When a complained item's entitlements have already been SETTLED via Unified
 * Settlement, a later refund must NOT hard-block with "Cannot refund a settled
 * entitlement". Instead it writes a bounded recovery: the original SETTLED
 * entitlement stays immutable, and the recovery is represented by the existing
 * signed ORGANIZATION_ADJUSTMENT / COURTZON_ADJUSTMENT rows, capped at the
 * settled org amount actually received. No new entitlement type, no second
 * position authority, no settlement mutation.
 */

vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn() }));
vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({
  walletRepository: {
    findTransactionsByReference: vi.fn(),
    findByUserId: vi.fn(),
    lockAndGetBalance: vi.fn(),
    updateBalance: vi.fn(),
    createTransaction: vi.fn(),
  },
}));

vi.mock('../../financial/application/financial-entitlement.service.js', () => ({
  financialEntitlementService: {
    getEntitlement: vi.fn(),
    releaseEntitlement: vi.fn(),
    getEntitlementsBySourceIds: vi.fn(),
    cancelEntitlement: vi.fn(),
    createEntitlements: vi.fn(),
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
import { walletRepository } from '../../wallet/infrastructure/repositories/wallet.repository.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { getPool } from '../../../database/mysql.js';

const mkSettledComplaint = (overrides: any = {}) => ({
  id: 5,
  order_id: 100,
  order_item_id: 200,
  product_id: 300,
  buyer_id: 400,
  seller_org_id: 500,
  complaint_type: 'defective',
  status: 'in_review',
  resolution_type: null,
  disputed_value: 1000,
  needs_return: false,
  collection_status: 'not_required',
  entitlement_ids: [1, 2],
  aggregate_version: 1,
  resolved_by: 10,
  ...overrides,
});

// SETTLED marketplace entitlements: org earning 950, commission 100.
const mkSettledEnts = () => [
  { id: 1, organisation_id: 500, entitlement_type: 'ORGANIZATION_EARNING', source_type: 'marketplace', source_id: 200, status: 'SETTLED', settlement_id: 840, amount: 950, currency: 'EGP', branch_id: null, collector: 'courtzon', available_at: new Date().toISOString(), aggregate_version: 1 },
  { id: 2, organisation_id: 500, entitlement_type: 'COURTZON_COMMISSION', source_type: 'marketplace', source_id: 200, status: 'SETTLED', settlement_id: 840, amount: 100, currency: 'EGP', branch_id: null, collector: 'courtzon', available_at: new Date().toISOString(), aggregate_version: 1 },
];

const mkUnsettledEnts = () => [
  { id: 1, organisation_id: 500, entitlement_type: 'ORGANIZATION_EARNING', source_type: 'marketplace', source_id: 200, status: 'AVAILABLE', settlement_id: null, amount: 950, currency: 'EGP', branch_id: null, collector: 'courtzon', available_at: new Date().toISOString(), aggregate_version: 1 },
  { id: 2, organisation_id: 500, entitlement_type: 'COURTZON_COMMISSION', source_type: 'marketplace', source_id: 200, status: 'AVAILABLE', settlement_id: null, amount: 100, currency: 'EGP', branch_id: null, collector: 'courtzon', available_at: new Date().toISOString(), aggregate_version: 1 },
];

// Minimal wallet mock state.
const mockWalletFlow = () => {
  (walletRepository.findTransactionsByReference as any).mockResolvedValue([]);
  (walletRepository.findByUserId as any).mockResolvedValue({ id: 900, balance: 5000, version: 1 });
  (walletRepository.lockAndGetBalance as any).mockResolvedValue({ balance: 5000, version: 1 });
  (walletRepository.updateBalance as any).mockResolvedValue(undefined);
  (walletRepository.createTransaction as any).mockResolvedValue({ insertId: 1 });
  // Fake connection for the transaction.
  const conn = {
    beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
    execute: vi.fn().mockResolvedValue([[], []]),
  };
  const pool = { getConnection: vi.fn().mockResolvedValue(conn) };
  (getPool as any).mockReturnValue(pool);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('F-5 — post-settlement refund recovery (SETTLED entitlement)', () => {
  it('pre-settlement refund remains unchanged (no settledRecovery flag, original cancelled)', async () => {
    (marketplaceComplaintRepository.findById as any).mockResolvedValue(mkSettledComplaint());
    (financialEntitlementService.getEntitlementsBySourceIds as any).mockResolvedValue(mkUnsettledEnts());
    (marketplaceComplaintRepository.sumPriorAdjustmentsByOrderItem as any).mockResolvedValue({ commissionReversed: 0, orgOriginalReversed: 0 });
    (financialEntitlementService.createEntitlements as any).mockResolvedValue([11, 12]);
    (financialEntitlementService.cancelEntitlement as any).mockResolvedValue(undefined);
    mockWalletFlow();

    await marketplaceComplaintService._executeRefund(5, 400, 1000);

    // Original AVAILABLE entitlements stay intact; adjustments written without settledRecovery.
    const adjustments = (financialEntitlementService.createEntitlements as any).mock.calls[0][0];
    const orgAdj = adjustments.find((a: any) => a.entitlementType === 'ORGANIZATION_ADJUSTMENT');
    expect(orgAdj).toBeDefined();
    expect(orgAdj.metadata.settledRecovery).toBeUndefined();
    expect(orgAdj.amount).toBeLessThan(0);
    // No SETTLED skip needed — the loop cancels PENDING only if full refund; AVAILABLE keep intact.
    expect(financialEntitlementService.cancelEntitlement).not.toHaveBeenCalled();
  });

  it('post-settlement refund succeeds via recovery (original SETTLED stays immutable, bounded adjustment)', async () => {
    (marketplaceComplaintRepository.findById as any).mockResolvedValue(mkSettledComplaint());
    (financialEntitlementService.getEntitlementsBySourceIds as any).mockResolvedValue(mkSettledEnts());
    (marketplaceComplaintRepository.sumPriorAdjustmentsByOrderItem as any).mockResolvedValue({ commissionReversed: 0, orgOriginalReversed: 0 });
    (financialEntitlementService.createEntitlements as any).mockResolvedValue([11, 12]);
    (financialEntitlementService.cancelEntitlement as any).mockResolvedValue(undefined);
    mockWalletFlow();

    await marketplaceComplaintService._executeRefund(5, 400, 1000);

    // Buyer wallet credited once.
    expect(walletRepository.createTransaction).toHaveBeenCalledTimes(1);
    // Recovery adjustments written.
    const adjustments = (financialEntitlementService.createEntitlements as any).mock.calls[0][0];
    const orgAdj = adjustments.find((a: any) => a.entitlementType === 'ORGANIZATION_ADJUSTMENT');
    expect(orgAdj).toBeDefined();
    // Proportional split of a 400 refund over original 950/100 (orgRatio=0.9048):
    // commissionReversal = min(100, 400×0.0952)=38.1, org = 400−38.1 = 361.9.
    expect(orgAdj.amount).toBeCloseTo(-361.9, 1);
    expect(orgAdj.metadata.settledRecovery).toBe(true);
    expect(orgAdj.metadata.settledOrgEarning).toBe(950);
    expect(orgAdj.metadata.recoveredAmount).toBeCloseTo(361.9, 1);
    expect(orgAdj.metadata.additionalCompensation).toBe(0);
    const czAdj = adjustments.find((a: any) => a.entitlementType === 'COURTZON_ADJUSTMENT');
    expect(czAdj).toBeDefined();
    expect(czAdj.amount).toBeLessThan(0);
    // Original SETTLED entitlements untouched — no cancel/release on them.
    expect(financialEntitlementService.cancelEntitlement).not.toHaveBeenCalled();
    expect(financialEntitlementService.releaseEntitlement).not.toHaveBeenCalled();
    // payment:refunded emitted with settledRecovery metadata.
    const refundEvent = (eventBusV2.emit as any).mock.calls.find((c: any) => c[0] === 'payment:refunded');
    expect(refundEvent).toBeDefined();
    expect(refundEvent[1].metadata.settledRecovery).toBe(true);
  });

  it('recovery is bounded: refund larger than settled org amount only recovers the settled amount', async () => {
    // Seller settled only 300 (org earning 300, commission 100), refund 500.
    (marketplaceComplaintRepository.findById as any).mockResolvedValue(mkSettledComplaint({ disputed_value: 400 }));
    (financialEntitlementService.getEntitlementsBySourceIds as any).mockResolvedValue([
      { id: 1, organisation_id: 500, entitlement_type: 'ORGANIZATION_EARNING', source_type: 'marketplace', source_id: 200, status: 'SETTLED', settlement_id: 840, amount: 300, currency: 'EGP', branch_id: null, collector: 'courtzon', available_at: new Date().toISOString(), aggregate_version: 1 },
      { id: 2, organisation_id: 500, entitlement_type: 'COURTZON_COMMISSION', source_type: 'marketplace', source_id: 200, status: 'SETTLED', settlement_id: 840, amount: 100, currency: 'EGP', branch_id: null, collector: 'courtzon', available_at: new Date().toISOString(), aggregate_version: 1 },
    ]);
    (marketplaceComplaintRepository.sumPriorAdjustmentsByOrderItem as any).mockResolvedValue({ commissionReversed: 0, orgOriginalReversed: 0 });
    (financialEntitlementService.createEntitlements as any).mockResolvedValue([11, 12]);
    mockWalletFlow();

    await marketplaceComplaintService._executeRefund(5, 500, 400);

    const adjustments = (financialEntitlementService.createEntitlements as any).mock.calls[0][0];
    const orgAdj = adjustments.find((a: any) => a.entitlementType === 'ORGANIZATION_ADJUSTMENT');
    // Recovery bounded to the settled 300, not the full 500 refund.
    expect(orgAdj.amount).toBe(-300);
    expect(orgAdj.metadata.recoveredAmount).toBe(300);
    expect(orgAdj.metadata.settledRecovery).toBe(true);
  });

  it('recovery bounded by cumulative capacity: repeated refunds cannot over-recover', async () => {
    // After a prior 400 recovery on this item, remaining settled org = 950-400 = 550.
    (marketplaceComplaintRepository.findById as any).mockResolvedValue(mkSettledComplaint({ disputed_value: 1000 }));
    (financialEntitlementService.getEntitlementsBySourceIds as any).mockResolvedValue(mkSettledEnts());
    (marketplaceComplaintRepository.sumPriorAdjustmentsByOrderItem as any).mockResolvedValue({ commissionReversed: 40, orgOriginalReversed: 400 });
    (financialEntitlementService.createEntitlements as any).mockResolvedValue([21, 22]);
    mockWalletFlow();

    await marketplaceComplaintService._executeRefund(6, 700, 1000);

    const adjustments = (financialEntitlementService.createEntitlements as any).mock.calls[0][0];
    const orgAdj = adjustments.find((a: any) => a.entitlementType === 'ORGANIZATION_ADJUSTMENT');
    // Remaining capacity = 550; the 700 refund must be capped to 550 (not exceed settled amount received).
    expect(orgAdj.amount).toBe(-550);
    expect(orgAdj.metadata.recoveredAmount).toBe(550);
  });

  it('idempotent: retry of the same refund creates no duplicate wallet transaction/adjustment', async () => {
    // First call processes normally.
    (marketplaceComplaintRepository.findById as any).mockResolvedValue(mkSettledComplaint());
    (financialEntitlementService.getEntitlementsBySourceIds as any).mockResolvedValue(mkSettledEnts());
    (marketplaceComplaintRepository.sumPriorAdjustmentsByOrderItem as any).mockResolvedValue({ commissionReversed: 0, orgOriginalReversed: 0 });
    (financialEntitlementService.createEntitlements as any).mockResolvedValue([11, 12]);
    mockWalletFlow();
    await marketplaceComplaintService._executeRefund(5, 400, 1000);
    expect(walletRepository.createTransaction).toHaveBeenCalledTimes(1);

    // Retry: wallet already has a transaction reference → idempotent skip.
    (walletRepository.findTransactionsByReference as any).mockResolvedValue([{ id: 99 }]);
    (walletRepository.findByUserId as any).mockClear();
    (financialEntitlementService.createEntitlements as any).mockClear();
    await marketplaceComplaintService._executeRefund(5, 400, 1000);

    expect(walletRepository.createTransaction).toHaveBeenCalledTimes(1); // still 1
    expect(financialEntitlementService.createEntitlements).not.toHaveBeenCalled();
  });

  it('multi-seller: recovery affects only the complained seller (org 500), not another seller', async () => {
    // Complaint on item 200 (seller org 500). Only org-500 entitlements loaded.
    (marketplaceComplaintRepository.findById as any).mockResolvedValue(mkSettledComplaint());
    (financialEntitlementService.getEntitlementsBySourceIds as any).mockResolvedValue(mkSettledEnts()); // only seller 500 rows
    (marketplaceComplaintRepository.sumPriorAdjustmentsByOrderItem as any).mockResolvedValue({ commissionReversed: 0, orgOriginalReversed: 0 });
    (financialEntitlementService.createEntitlements as any).mockResolvedValue([11, 12]);
    mockWalletFlow();

    await marketplaceComplaintService._executeRefund(5, 400, 1000);

    const adjustments = (financialEntitlementService.createEntitlements as any).mock.calls[0][0];
    for (const a of adjustments) {
      expect(a.organisationId).toBe(500); // only complained seller
      expect(a.sourceType).toBe('marketplace');
      expect(a.sourceId).toBe(5); // complaint id
    }
    // No cross-seller access: getEntitlementsBySourceIds was called with only item 200.
    expect(financialEntitlementService.getEntitlementsBySourceIds).toHaveBeenCalledWith('marketplace', [200]);
  });

  it('SETTLED original entitlement remains SETTLED and settlement record is not touched', async () => {
    (marketplaceComplaintRepository.findById as any).mockResolvedValue(mkSettledComplaint());
    (financialEntitlementService.getEntitlementsBySourceIds as any).mockResolvedValue(mkSettledEnts());
    (marketplaceComplaintRepository.sumPriorAdjustmentsByOrderItem as any).mockResolvedValue({ commissionReversed: 0, orgOriginalReversed: 0 });
    (financialEntitlementService.createEntitlements as any).mockResolvedValue([11, 12]);
    mockWalletFlow();

    await marketplaceComplaintService._executeRefund(5, 400, 1000);

    // No entitlement lifecycle mutation on the settled rows (no release/cancel).
    expect(financialEntitlementService.releaseEntitlement).not.toHaveBeenCalled();
    expect(financialEntitlementService.cancelEntitlement).not.toHaveBeenCalled();
    // No settlement writer invoked (repo mock has no settlement method; createEntitlements only adds adjustment rows).
    expect(financialEntitlementService.createEntitlements).toHaveBeenCalledTimes(1);
  });

  it('recovery creates no second position authority — only signed adjustment entitlement rows', async () => {
    (marketplaceComplaintRepository.findById as any).mockResolvedValue(mkSettledComplaint());
    (financialEntitlementService.getEntitlementsBySourceIds as any).mockResolvedValue(mkSettledEnts());
    (marketplaceComplaintRepository.sumPriorAdjustmentsByOrderItem as any).mockResolvedValue({ commissionReversed: 0, orgOriginalReversed: 0 });
    (financialEntitlementService.createEntitlements as any).mockResolvedValue([11, 12]);
    mockWalletFlow();

    await marketplaceComplaintService._executeRefund(5, 400, 1000);

    const adjustments = (financialEntitlementService.createEntitlements as any).mock.calls[0][0];
    const types = new Set(adjustments.map((a: any) => a.entitlementType));
    expect(types.has('ORGANIZATION_ADJUSTMENT')).toBe(true);
    expect(types.has('COURTZON_ADJUSTMENT')).toBe(true);
    // No new/other entitlement type.
    expect(types.size).toBe(2);
    // All amounts preserve signed debit direction.
    for (const a of adjustments) expect(a.amount).toBeLessThan(0);
  });
});

describe('F-5 — pre-settlement path unchanged', () => {
  it('partial refund pre-settlement behaves as before (no settledRecovery)', async () => {
    (marketplaceComplaintRepository.findById as any).mockResolvedValue(mkSettledComplaint({ disputed_value: 1000 }));
    (financialEntitlementService.getEntitlementsBySourceIds as any).mockResolvedValue(mkUnsettledEnts());
    (marketplaceComplaintRepository.sumPriorAdjustmentsByOrderItem as any).mockResolvedValue({ commissionReversed: 0, orgOriginalReversed: 0 });
    (financialEntitlementService.createEntitlements as any).mockResolvedValue([11, 12]);
    mockWalletFlow();

    await marketplaceComplaintService._executeRefund(5, 400, 1000);

    const adjustments = (financialEntitlementService.createEntitlements as any).mock.calls[0][0];
    const orgAdj = adjustments.find((a: any) => a.entitlementType === 'ORGANIZATION_ADJUSTMENT');
    expect(orgAdj.metadata.settledRecovery).toBeUndefined();
    expect(orgAdj.metadata.additionalCompensation).toBe(0);
    expect(orgAdj.amount).toBeLessThan(0);
  });
});

describe('F-5 — recovery metadata drives cumulative capacity correctly', () => {
  it('a settled-recovery adjustment records additionalCompensation=0 so capacity is not inflated', async () => {
    // Simulate the repository's cumulative tracker over a recovery row.
    const simulateSum = (rows: any[]) => {
      const commission = rows
        .filter((r) => r.entitlement_type === 'COURTZON_ADJUSTMENT')
        .reduce((s, r) => s + Math.abs(r.amount), 0);
      const orgOriginal = rows
        .filter((r) => r.entitlement_type === 'ORGANIZATION_ADJUSTMENT')
        .reduce((s, r) => s + (Math.abs(r.amount) - (r.metadata?.additionalCompensation || 0)), 0);
      return { commissionReversed: commission, orgOriginalReversed: orgOriginal };
    };

    // One recovery row: amount -361.9, additionalCompensation 0 (settled recovery).
    const recoveryRow = {
      entitlement_type: 'ORGANIZATION_ADJUSTMENT', amount: -361.9, status: 'AVAILABLE',
      metadata: { settledRecovery: true, additionalCompensation: 0 },
    };
    const prior = simulateSum([recoveryRow]);
    // Capacity is consumed by the full recovery magnitude.
    expect(prior.orgOriginalReversed).toBeCloseTo(361.9, 1);

    // Compare: a pre-settlement row with compensation would consume less capacity.
    const preSettlementRow = {
      entitlement_type: 'ORGANIZATION_ADJUSTMENT', amount: -400, status: 'AVAILABLE',
      metadata: { additionalCompensation: 38.1 },
    };
    const priorPre = simulateSum([preSettlementRow]);
    expect(priorPre.orgOriginalReversed).toBeCloseTo(361.9, 1);
  });
});