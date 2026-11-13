// ============================================================================
// Refund Engine — service-level invariants (unit only, all I/O mocked).
//
// Proves the rules that must never regress:
//   * payout cannot start before operational cancellation completes;
//   * payout cannot exceed the remaining approved amount;
//   * approval and payout confirmation require different users;
//   * a failed payout never produces a payout accounting event;
//   * request idempotency returns the existing case untouched.
// ============================================================================
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';

const mocks = vi.hoisted(() => ({
  findByIdempotencyKey: vi.fn(),
  findById: vi.fn(),
  findByPublicId: vi.fn(),
  lockById: vi.fn(),
  lockPayout: vi.fn(),
  listLines: vi.fn(),
  listPayouts: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  updateCase: vi.fn(),
  updateLine: vi.fn(),
  insertPayout: vi.fn(),
  updatePayout: vi.fn(),
  sumActiveApprovedForLine: vi.fn(),
  emit: vi.fn(),
  recordAudit: vi.fn(),
  cancelServiceLine: vi.fn(),
}));

vi.mock('../infrastructure/repositories/refund-case.repository.js', () => ({
  refundCaseRepository: {
    findByIdempotencyKey: mocks.findByIdempotencyKey,
    findById: mocks.findById,
    findByPublicId: mocks.findByPublicId,
    lockById: mocks.lockById,
    lockPayout: mocks.lockPayout,
    listLines: mocks.listLines,
    listPayouts: mocks.listPayouts,
    list: mocks.list,
    create: mocks.create,
    updateCase: mocks.updateCase,
    updateLine: mocks.updateLine,
    insertPayout: mocks.insertPayout,
    updatePayout: mocks.updatePayout,
    sumActiveApprovedForLine: mocks.sumActiveApprovedForLine,
  },
}));

vi.mock('../../../database/database.transaction.js', () => ({
  withTransaction: async (fn: any) => fn({}),
}));

vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBusV2: { emit: mocks.emit },
}));

vi.mock('../../audit-log/index.js', () => ({
  recordAudit: mocks.recordAudit,
}));

vi.mock('../application/refund-cancellation.contracts.js', () => ({
  cancelServiceLine: mocks.cancelServiceLine,
}));

const { refundCaseService } = await import('../application/refund-case.service.js');

const baseCase = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  public_id: 'b0b0b0b0-0000-4000-8000-000000000007',
  domain: 'booking',
  source_type: 'booking',
  source_id: 42,
  original_payment_id: 99,
  organisation_id: 3,
  requested_by: 11,
  reason: 'Player cancelled a week ahead',
  policy_snapshot: null,
  canceled_value_cents: 10_000,
  approved_refund_cents: 6_000,
  fee_cents: 0,
  discount_cents: 0,
  paid_cents: 0,
  currency: 'EGP',
  status: 'PAYOUT_PENDING',
  operational_status: 'COMPLETED',
  payout_status: 'PENDING',
  approved_by: 12,
  approved_at: '2026-01-01T00:00:00.000Z',
  rejected_reason: null,
  aggregate_version: 4,
  idempotency_key: 'req-12345678',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findById.mockResolvedValue(baseCase());
  mocks.lockById.mockResolvedValue(baseCase());
  mocks.listLines.mockResolvedValue([
    {
      id: 1,
      case_id: 7,
      line_no: 1,
      line_type: 'booking',
      source_id: 42,
      canceled_value_cents: 10_000,
      approved_cents: 6_000,
      operational_status: 'COMPLETED',
      cancellation_ref: 'booking:42',
      created_at: '',
      updated_at: '',
    },
  ]);
  mocks.listPayouts.mockResolvedValue([]);
  mocks.insertPayout.mockResolvedValue(55);
  mocks.sumActiveApprovedForLine.mockResolvedValue(0);
  mocks.cancelServiceLine.mockResolvedValue('booking:42');
});

describe('recordPayout — operational cancellation must finish first', () => {
  it('rejects a payout while operational cancellations are still running', async () => {
    mocks.lockById.mockResolvedValue(baseCase({ operational_status: 'PROCESSING', status: 'OPERATIONAL_PROCESSING' }));

    await expect(
      refundCaseService.recordPayout(7, 13, {
        method: 'bank_transfer',
        amountCents: 1_000,
        idempotencyKey: 'payout-12345678',
      }),
    ).rejects.toThrow(/before all operational cancellations are complete/);

    expect(mocks.insertPayout).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('rejects a payout above the remaining approved amount', async () => {
    mocks.lockById.mockResolvedValue(baseCase({ paid_cents: 5_000, payout_status: 'PARTIALLY_COMPLETED' }));

    await expect(
      refundCaseService.recordPayout(7, 13, {
        method: 'cash',
        amountCents: 1_001,
        idempotencyKey: 'payout-12345678',
      }),
    ).rejects.toThrow(/exceeds the remaining approved amount/);

    expect(mocks.insertPayout).not.toHaveBeenCalled();
  });

  it('records an independent cash/bank payout and emits payout-recorded only', async () => {
    await refundCaseService.recordPayout(7, 13, {
      method: 'bank_transfer',
      amountCents: 6_000,
      reference: 'TRX-99881',
      evidenceUrl: 'https://example.com/receipt.pdf',
      idempotencyKey: 'payout-12345678',
    });

    expect(mocks.insertPayout).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: 7,
        method: 'bank_transfer',
        amountCents: 6_000,
        reference: 'TRX-99881',
        executedBy: 13,
      }),
      expect.anything(),
    );
    const recorded = mocks.emit.mock.calls.find((call) => call[0] === 'refund:payout-recorded');
    expect(recorded?.[1]).toMatchObject({ caseId: 7, amountCents: 6_000, executedBy: 13 });
    expect(mocks.emit.mock.calls.some((call) => call[0] === 'refund:payout-confirmed')).toBe(false);
  });
});

describe('confirmPayout — separation of duties and full-amount completion', () => {
  it('forbids the approver from confirming the payout', async () => {
    mocks.lockById.mockResolvedValue(baseCase({ approved_by: 13 }));

    await expect(refundCaseService.confirmPayout(7, 55, 13)).rejects.toThrow(
      /must be performed by different users/,
    );

    expect(mocks.updatePayout).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('confirms a partial payout without completing the case', async () => {
    mocks.lockPayout.mockResolvedValue({
      id: 55,
      case_id: 7,
      method: 'bank_transfer',
      amount_cents: 2_000,
      status: 'PROCESSING',
      reference: null,
      evidence_url: null,
      executed_by: 13,
      executed_at: null,
      idempotency_key: 'payout-12345678',
      created_at: '',
      updated_at: '',
    });

    await refundCaseService.confirmPayout(7, 55, 13);

    expect(mocks.updateCase).toHaveBeenCalledWith(
      7,
      4,
      expect.objectContaining({
        paid_cents: 2_000,
        payout_status: 'PARTIALLY_COMPLETED',
        status: 'PARTIALLY_COMPLETED',
      }),
      expect.anything(),
    );
    const confirmed = mocks.emit.mock.calls.find((call) => call[0] === 'refund:payout-confirmed');
    expect(confirmed?.[1]).toMatchObject({ caseId: 7, payoutId: 55, amountCents: 2_000 });
  });
});

describe('failPayout — a failed payout never posts a payout entry', () => {
  it('marks the payout FAILED and emits no payout-confirmed event', async () => {
    mocks.lockPayout.mockResolvedValue({
      id: 55,
      case_id: 7,
      method: 'cash',
      amount_cents: 6_000,
      status: 'PROCESSING',
      reference: null,
      evidence_url: null,
      executed_by: 13,
      executed_at: null,
      idempotency_key: 'payout-12345678',
      created_at: '',
      updated_at: '',
    });

    await refundCaseService.failPayout(7, 55, 13, 'Bank rejected the transfer');

    expect(mocks.updatePayout).toHaveBeenCalledWith(
      55,
      { status: 'FAILED' },
      expect.anything(),
    );
    expect(mocks.updateCase).toHaveBeenCalledWith(
      7,
      4,
      { payout_status: 'FAILED' },
      expect.anything(),
    );
    expect(mocks.emit).not.toHaveBeenCalled();
    // Cancellation is never reversed by a payout failure.
    expect(mocks.cancelServiceLine).not.toHaveBeenCalled();
  });
});

describe('requestCase — idempotency', () => {
  it('returns the existing case and creates nothing for a repeated key', async () => {
    const existing = baseCase({ status: 'REQUESTED' });
    mocks.findByIdempotencyKey.mockResolvedValue(existing);

    const result = await refundCaseService.requestCase({
      domain: 'booking',
      sourceType: 'booking',
      sourceId: 42,
      organisationId: 3,
      requestedBy: 11,
      reason: 'duplicate request',
      idempotencyKey: 'req-12345678',
      lines: [{ lineType: 'booking', sourceId: 42, canceledValueCents: 10_000, approvedCents: 6_000 }],
    });

    expect(result).toBe(existing);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.sumActiveApprovedForLine).not.toHaveBeenCalled();
  });

  it('enforces the per-service-unit refund cap across cases', async () => {
    mocks.findByIdempotencyKey.mockResolvedValue(null);
    mocks.sumActiveApprovedForLine.mockResolvedValue(9_000);

    await expect(
      refundCaseService.requestCase({
        domain: 'booking',
        sourceType: 'booking',
        sourceId: 42,
        organisationId: 3,
        requestedBy: 11,
        reason: 'second partial',
        idempotencyKey: 'req-87654321',
        lines: [{ lineType: 'booking', sourceId: 42, canceledValueCents: 10_000, approvedCents: 2_000 }],
      }),
    ).rejects.toThrow(/Refund cap exceeded/);

    expect(mocks.create).not.toHaveBeenCalled();
  });
});
