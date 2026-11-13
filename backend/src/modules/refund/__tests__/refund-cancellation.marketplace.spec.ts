// ============================================================================
// Refund Engine — Marketplace operational contract result handling.
// Unit-only: the marketplace service is mocked; no DB or network.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  cancelOrderForRefund: vi.fn(),
}));

vi.mock('../../marketplace/application/marketplace.service.js', () => ({
  marketplaceService: { cancelOrderForRefund: mocks.cancelOrderForRefund },
}));

const { cancelServiceLine } = await import('../application/refund-cancellation.contracts.js');

const CASE = {
  id: 7,
  public_id: 'case-7',
  domain: 'marketplace',
  source_type: 'order',
  source_id: 101,
  organisation_id: 7,
  requested_by: 12,
  approved_by: 13,
  reason: 'institution refund',
  currency: 'EGP',
} as any;

const LINE = {
  id: 1,
  case_id: 7,
  line_no: 1,
  line_type: 'order',
  source_id: 101,
  canceled_value_cents: 10_000,
  approved_cents: 6_000,
  operational_status: 'PENDING',
} as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cancelServiceLine — marketplace partial/retry outcome', () => {
  it('returns the reference when the whole checkout group is handled', async () => {
    mocks.cancelOrderForRefund.mockResolvedValue({
      mainCancelled: true,
      cancelledSiblingIds: [102],
      skippedSiblingIds: [],
      complete: true,
    });

    await expect(cancelServiceLine(CASE, LINE)).resolves.toBe('marketplace_order:101');
    expect(mocks.cancelOrderForRefund).toHaveBeenCalledWith(101, 13, 'institution refund');
  });

  it('throws when a required sibling was skipped, so the line is not completed', async () => {
    mocks.cancelOrderForRefund.mockResolvedValue({
      mainCancelled: true,
      cancelledSiblingIds: [],
      skippedSiblingIds: [102],
      complete: false,
    });

    await expect(cancelServiceLine(CASE, LINE)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('completes on retry when the main order was already cancelled and the sibling is now authorized', async () => {
    mocks.cancelOrderForRefund.mockResolvedValue({
      mainCancelled: false,
      cancelledSiblingIds: [102],
      skippedSiblingIds: [],
      complete: true,
    });

    await expect(cancelServiceLine(CASE, LINE)).resolves.toBe('marketplace_order:101');
  });
});
