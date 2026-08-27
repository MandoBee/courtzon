import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * F-4 — receipt-timeout worker auto-resolution must release the complaint hold.
 *
 * When a replacement/reshipment receipt confirmation window expires without the
 * player confirming, the worker auto-resolves the complaint to 'resolved'
 * (a terminal non-refund outcome). The complaint-created ON_HOLD financial
 * hold must be released so the seller's funds are not left permanently frozen.
 */

vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn() }));
vi.mock('../infrastructure/repositories/marketplace-complaint.repository.js', () => ({
  marketplaceComplaintRepository: {
    findById: vi.fn(),
    updateFields: vi.fn(),
    updateStatus: vi.fn(),
  },
}));
vi.mock('../application/marketplace-complaint.service.js', () => ({
  marketplaceComplaintService: {
    releaseComplaintFinancialHold: vi.fn(),
    escalateOverdueCollections: vi.fn(),
  },
}));
vi.mock('../../../shared/utils/logger.js', () => ({
  createModuleLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

import { handleComplaintReceiptTimeout } from '../infrastructure/marketplace-complaint.worker.js';
import { marketplaceComplaintRepository } from '../infrastructure/repositories/marketplace-complaint.repository.js';
import { marketplaceComplaintService } from '../application/marketplace-complaint.service.js';

const mkComplaint = (overrides: any = {}) => ({
  id: 5,
  order_id: 100,
  order_item_id: 200,
  buyer_id: 400,
  seller_org_id: 500,
  status: 'awaiting_confirmation',
  resolution_type: 'replacement',
  entitlement_ids: [1, 2],
  aggregate_version: 1,
  resolved_by: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('F-4 — handleComplaintReceiptTimeout releases the hold', () => {
  it('auto-resolves awaiting_confirmation complaints and releases the complaint hold', async () => {
    const pool = {
      execute: vi.fn().mockResolvedValue([[{ id: 5 }]]),
    };
    const { getPool } = await import('../../../database/mysql.js');
    (getPool as any).mockReturnValue(pool);

    (marketplaceComplaintRepository.findById as any).mockResolvedValue(mkComplaint());
    (marketplaceComplaintRepository.updateFields as any).mockResolvedValue(undefined);
    (marketplaceComplaintRepository.updateStatus as any).mockResolvedValue(undefined);
    (marketplaceComplaintService.releaseComplaintFinancialHold as any).mockResolvedValue(2);

    await handleComplaintReceiptTimeout();

    expect(marketplaceComplaintRepository.updateStatus).toHaveBeenCalledWith(5, 'resolved', 1, expect.any(Object));
    expect(marketplaceComplaintService.releaseComplaintFinancialHold).toHaveBeenCalledTimes(1);
    expect(marketplaceComplaintService.releaseComplaintFinancialHold).toHaveBeenCalledWith(mkComplaint());
  });

  it('skips complaints that are no longer awaiting_confirmation (race)', async () => {
    const pool = {
      execute: vi.fn().mockResolvedValue([[{ id: 5 }]]),
    };
    const { getPool } = await import('../../../database/mysql.js');
    (getPool as any).mockReturnValue(pool);

    // Re-fetch reveals the complaint already moved (e.g. player confirmed).
    (marketplaceComplaintRepository.findById as any).mockResolvedValue(mkComplaint({ status: 'resolved' }));

    await handleComplaintReceiptTimeout();

    expect(marketplaceComplaintRepository.updateStatus).not.toHaveBeenCalled();
    expect(marketplaceComplaintService.releaseComplaintFinancialHold).not.toHaveBeenCalled();
  });
});