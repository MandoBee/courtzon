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
  findPayoutByIdempotencyKey: vi.fn(),
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
    findPayoutByIdempotencyKey: mocks.findPayoutByIdempotencyKey,
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
  mocks.findPayoutByIdempotencyKey.mockResolvedValue(null);
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

  it('rejects a payout recorded by the approver (maker-checker 1/3)', async () => {
    mocks.lockById.mockResolvedValue(baseCase({ approved_by: 13 }));

    await expect(
      refundCaseService.recordPayout(7, 13, {
        method: 'bank_transfer',
        amountCents: 6_000,
        idempotencyKey: 'payout-approver-1234',
      }),
    ).rejects.toThrow(/Approval and payout execution must be performed by different users/);

    expect(mocks.insertPayout).not.toHaveBeenCalled();
    expect(mocks.updateCase).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
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

describe('recordPayout — idempotency, concurrency and audit', () => {
  const existingPayout = (overrides: Record<string, unknown> = {}) => ({
    id: 55,
    case_id: 7,
    method: 'bank_transfer',
    amount_cents: 6_000,
    status: 'PROCESSING',
    reference: 'TRX-99881',
    evidence_url: null,
    executed_by: 13,
    executed_at: null,
    idempotency_key: 'payout-12345678',
    created_at: '',
    updated_at: '',
    ...overrides,
  });

  const payoutInput = {
    method: 'bank_transfer' as const,
    amountCents: 6_000,
    reference: 'TRX-99881',
    idempotencyKey: 'payout-12345678',
  };

  it('returns the original payout for a legitimate same-case replay', async () => {
    mocks.findPayoutByIdempotencyKey.mockResolvedValueOnce(existingPayout());

    const result = await refundCaseService.recordPayout(7, 13, payoutInput);

    expect(result).toMatchObject({ payoutId: 55, replayed: true });
    expect(mocks.insertPayout).not.toHaveBeenCalled();
    expect(mocks.updateCase).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('rejects a key already used by a payout on another refund case', async () => {
    mocks.findPayoutByIdempotencyKey.mockResolvedValueOnce(existingPayout({ case_id: 999 }));

    await expect(refundCaseService.recordPayout(7, 13, payoutInput)).rejects.toThrow(
      /already used by a payout on another refund case/,
    );

    expect(mocks.insertPayout).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('handles a concurrent duplicate (unique-key race) as a same-case replay', async () => {
    mocks.findPayoutByIdempotencyKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingPayout());
    mocks.insertPayout.mockRejectedValueOnce({ code: 'ER_DUP_ENTRY', errno: 1062 });

    const result = await refundCaseService.recordPayout(7, 13, payoutInput);

    expect(result).toMatchObject({ payoutId: 55, replayed: true });
    expect(mocks.insertPayout).toHaveBeenCalledTimes(1);
    expect(mocks.emit).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('re-throws a duplicate error when no matching payout can be found', async () => {
    mocks.findPayoutByIdempotencyKey.mockResolvedValue(null);
    mocks.insertPayout.mockRejectedValueOnce({ code: 'ER_DUP_ENTRY', errno: 1062 });

    await expect(refundCaseService.recordPayout(7, 13, payoutInput)).rejects.toMatchObject({
      code: 'ER_DUP_ENTRY',
    });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('re-throws unrelated database errors unchanged', async () => {
    mocks.insertPayout.mockRejectedValueOnce({ code: 'ER_NO_REFERENCED_ROW_2', errno: 1452 });

    await expect(refundCaseService.recordPayout(7, 13, payoutInput)).rejects.toMatchObject({
      code: 'ER_NO_REFERENCED_ROW_2',
    });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('creates exactly one audit record for a successful first registration', async () => {
    await refundCaseService.recordPayout(7, 13, payoutInput);

    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 13,
        action: 'REFUND.PAYOUT_RECORDED',
        entityType: 'refund_case',
        entityId: 7,
        afterState: expect.objectContaining({
          payoutId: 55,
          caseId: 7,
          amountCents: 6_000,
          currency: 'EGP',
          method: 'bank_transfer',
          reference: 'TRX-99881',
          executedBy: 13,
          status: 'PROCESSING',
        }),
      }),
    );
    expect(mocks.emit).toHaveBeenCalledTimes(1);
  });

  it('does not audit or emit when the insert fails', async () => {
    mocks.insertPayout.mockRejectedValueOnce(new Error('insert failed'));

    await expect(refundCaseService.recordPayout(7, 13, payoutInput)).rejects.toThrow('insert failed');
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
    expect(mocks.updateCase).not.toHaveBeenCalled();
  });

  it('creates independent payouts for different idempotency keys', async () => {
    mocks.insertPayout.mockResolvedValueOnce(56);

    const result = await refundCaseService.recordPayout(7, 13, {
      ...payoutInput,
      idempotencyKey: 'payout-independent-1',
    });

    expect(result).toMatchObject({ payoutId: 56, replayed: false });
    expect(mocks.insertPayout).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
  });
});

describe('confirmPayout — three-person separation of duties', () => {
  const processingPayout = (overrides: Record<string, unknown> = {}) => ({
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
    ...overrides,
  });

  it('forbids the approver from confirming the payout (2/3)', async () => {
    mocks.lockPayout.mockResolvedValue(processingPayout({ executed_by: 14 }));

    await expect(refundCaseService.confirmPayout(7, 55, 12)).rejects.toThrow(
      /Approval and payout confirmation must be performed by different users/,
    );

    expect(mocks.updatePayout).not.toHaveBeenCalled();
    expect(mocks.updateCase).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('forbids the payout executor from confirming the same payout (3/3)', async () => {
    mocks.lockPayout.mockResolvedValue(processingPayout({ executed_by: 13 }));

    await expect(refundCaseService.confirmPayout(7, 55, 13)).rejects.toThrow(
      /Payout execution and confirmation must be performed by different users/,
    );

    expect(mocks.updatePayout).not.toHaveBeenCalled();
    expect(mocks.updateCase).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('confirms a partial payout by a distinct third actor without overwriting the executor', async () => {
    mocks.lockPayout.mockResolvedValue(processingPayout({ executed_by: 13 }));
    mocks.lockById
      .mockResolvedValueOnce(baseCase())
      .mockResolvedValueOnce(baseCase({ paid_cents: 2_000, status: 'PARTIALLY_COMPLETED', payout_status: 'PARTIALLY_COMPLETED' }));

    await refundCaseService.confirmPayout(7, 55, 14);

    expect(mocks.updatePayout).toHaveBeenCalledWith(
      55,
      { status: 'COMPLETED', executed_at: expect.any(Date) },
      expect.anything(),
    );    expect(mocks.updateCase).toHaveBeenCalledWith(
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
    expect(confirmed?.[1]).toMatchObject({ caseId: 7, payoutId: 55, amountCents: 2_000, executedBy: 14 });
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REFUND.PAYOUT_CONFIRMED',
        entityId: 7,
        afterState: expect.objectContaining({ payoutId: 55, status: 'PARTIALLY_COMPLETED' }),
      }),
    );
  });

  it('completes the case when the distinct third actor confirms the full payout', async () => {
    mocks.lockPayout.mockResolvedValue(processingPayout({ amount_cents: 6_000, executed_by: 13 }));

    await refundCaseService.confirmPayout(7, 55, 14);

    expect(mocks.updateCase).toHaveBeenCalledWith(
      7,
      4,
      expect.objectContaining({
        paid_cents: 6_000,
        payout_status: 'COMPLETED',
        status: 'COMPLETED',
      }),
      expect.anything(),
    );
  });

  it('returns the current case idempotently when the payout is already COMPLETED', async () => {
    mocks.lockPayout.mockResolvedValue(processingPayout({ status: 'COMPLETED', executed_by: 13 }));

    const result = await refundCaseService.confirmPayout(7, 55, 12);

    expect(result).toMatchObject({ id: 7 });
    expect(mocks.updatePayout).not.toHaveBeenCalled();
    expect(mocks.updateCase).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
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

describe('processOperational — partial marketplace cancellation never completes the line', () => {
  it('marks the line FAILED when the cancellation contract rejects skipped siblings', async () => {
    const { ConflictError } = await import('../../../shared/errors/app-error.js');
    const line = {
      id: 1,
      case_id: 7,
      line_no: 1,
      line_type: 'order',
      source_id: 101,
      canceled_value_cents: 10_000,
      approved_cents: 6_000,
      operational_status: 'PENDING',
      cancellation_ref: null,
      created_at: '',
      updated_at: '',
    };
    mocks.findById.mockResolvedValue(
      baseCase({ domain: 'marketplace', status: 'OPERATIONAL_PROCESSING', operational_status: 'PROCESSING' }),
    );
    mocks.listLines
      .mockResolvedValueOnce([line])
      .mockResolvedValueOnce([{ ...line, operational_status: 'FAILED' }]);
    mocks.cancelServiceLine.mockRejectedValueOnce(
      new ConflictError('Marketplace operational cancellation incomplete; skipped sibling 102'),
    );

    await refundCaseService.processOperational(7);

    expect(mocks.updateLine).toHaveBeenCalledWith(
      1,
      { operational_status: 'FAILED' },
      expect.anything(),
    );
    expect(mocks.updateCase).toHaveBeenCalledWith(
      7,
      expect.anything(),
      expect.objectContaining({ operational_status: 'FAILED', status: 'FAILED' }),
      expect.anything(),
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REFUND.OPERATIONAL_CANCELLATION_FAILED' }),
    );
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
