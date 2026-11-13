import { randomUUID } from 'node:crypto';
import { withTransaction } from '../../../database/database.transaction.js';
import { getPool } from '../../../database/mysql.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { recordAudit } from '../../audit-log/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import {
  assertAmounts,
  deriveOperationalStatus,
  derivePayoutStatus,
  isTerminalCaseStatus,
  type RefundCaseRecord,
  type RefundCaseStatus,
  type RefundDomain,
  type RefundPayoutMethod,
} from '../domain/refund-case.aggregate.js';
import { refundCaseRepository } from '../infrastructure/repositories/refund-case.repository.js';
import { cancelServiceLine } from './refund-cancellation.contracts.js';

export interface RefundLineInput {
  lineType: string;
  sourceId: number;
  canceledValueCents: number;
  approvedCents: number;
}

export interface CreateRefundCaseInput {
  domain: RefundDomain;
  sourceType: string;
  sourceId: number;
  originalPaymentId?: number | null;
  organisationId: number;
  requestedBy: number;
  reason: string;
  currency?: string;
  policySnapshot?: Record<string, unknown> | null;
  feeCents?: number;
  discountCents?: number;
  idempotencyKey: string;
  lines: RefundLineInput[];
}

const toPublic = (record: RefundCaseRecord | null) => record;

export const refundCaseService = {
  async requestCase(input: CreateRefundCaseInput): Promise<RefundCaseRecord> {
    if (!input.reason || !input.reason.trim()) throw new ValidationError('A refund reason is required');
    if (!input.lines?.length) throw new ValidationError('At least one refund service line is required');
    if (!input.idempotencyKey) throw new ValidationError('idempotencyKey is required');

    const existing = await refundCaseRepository.findByIdempotencyKey(input.idempotencyKey);
    if (existing) return existing;

    const canceledValueCents = input.lines.reduce((s, l) => s + Number(l.canceledValueCents), 0);
    const approvedRefundCents = input.lines.reduce((s, l) => s + Number(l.approvedCents), 0);
    assertAmounts({
      canceledValueCents,
      approvedCents: approvedRefundCents,
      feeCents: Number(input.feeCents ?? 0),
      discountCents: Number(input.discountCents ?? 0),
      paidCents: 0,
    });
    if (approvedRefundCents <= 0) throw new ValidationError('Approved refund must be positive');

    const id = await withTransaction(async (conn) => {
      for (const line of input.lines) {
        if (!line.lineType || !Number.isInteger(line.sourceId) || line.sourceId <= 0) {
          throw new ValidationError('Each refund line requires lineType and a positive sourceId');
        }
        if (line.approvedCents < 0 || line.approvedCents > line.canceledValueCents) {
          throw new ValidationError('Line approved amount must be between 0 and the canceled value');
        }
        const prior = await refundCaseRepository.sumActiveApprovedForLine(
          line.lineType,
          Number(line.sourceId),
          conn,
        );
        if (prior + line.approvedCents > line.canceledValueCents) {
          throw new ConflictError(
            `Refund cap exceeded for ${line.lineType} #${line.sourceId}: already approved ${prior}¢ of ${line.canceledValueCents}¢`,
          );
        }
      }

      return refundCaseRepository.create(
        {
          publicId: randomUUID(),
          domain: input.domain,
          sourceType: input.sourceType,
          sourceId: Number(input.sourceId),
          originalPaymentId: input.originalPaymentId ?? null,
          organisationId: Number(input.organisationId),
          requestedBy: Number(input.requestedBy),
          reason: input.reason.trim(),
          policySnapshot: input.policySnapshot ?? null,
          canceledValueCents,
          approvedRefundCents,
          feeCents: Number(input.feeCents ?? 0),
          discountCents: Number(input.discountCents ?? 0),
          currency: (input.currency || 'EGP').toUpperCase(),
          idempotencyKey: input.idempotencyKey,
          lines: input.lines.map((line, index) => ({
            lineNo: index + 1,
            lineType: line.lineType,
            sourceId: Number(line.sourceId),
            canceledValueCents: Number(line.canceledValueCents),
            approvedCents: Number(line.approvedCents),
          })),
        },
        conn,
      );
    });

    recordAudit({
      actorId: input.requestedBy,
      action: 'REFUND.CASE_REQUESTED',
      entityType: 'refund_case',
      entityId: id,
      afterState: {
        domain: input.domain,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        approvedRefundCents,
        canceledValueCents,
      },
    });

    return (await refundCaseRepository.findById(id)) as RefundCaseRecord;
  },

  async approve(caseId: number, actorId: number): Promise<RefundCaseRecord> {
    const approved = await withTransaction(async (conn) => {
      const record = await refundCaseRepository.lockById(caseId, conn);
      if (!record) throw new NotFoundError('Refund case');
      if (record.status === 'APPROVED' || record.status === 'OPERATIONAL_PROCESSING' || record.status === 'PAYOUT_PENDING' || record.status === 'COMPLETED') {
        return record;
      }
      if (record.status === 'REJECTED') throw new ConflictError('This refund case was rejected');
      if (record.status !== 'REQUESTED' && record.status !== 'UNDER_REVIEW') {
        throw new ConflictError(`Cannot approve a refund case in status ${record.status}`);
      }

      const lines = await refundCaseRepository.listLines(caseId, conn);
      const sum = lines.reduce((s, l) => s + l.approved_cents, 0);
      if (sum <= 0) throw new ConflictError('Refund case has no approved lines');

      await refundCaseRepository.updateCase(
        caseId,
        record.aggregate_version,
        {
          status: 'APPROVED',
          operational_status: 'PROCESSING',
          approved_refund_cents: sum,
          approved_by: actorId,
          approved_at: new Date(),
        },
        conn,
      );

      await eventBusV2.emit(
        'refund:case-approved',
        {
          caseId,
          publicId: record.public_id,
          organisationId: record.organisation_id,
          domain: record.domain,
          amountCents: sum,
          currency: record.currency,
          approvedBy: actorId,
        },
        { aggregateType: 'refund_case', aggregateId: String(caseId), aggregateVersion: record.aggregate_version + 1 },
        conn,
      );

      return (await refundCaseRepository.lockById(caseId, conn)) as RefundCaseRecord;
    });

    recordAudit({
      actorId,
      action: 'REFUND.CASE_APPROVED',
      entityType: 'refund_case',
      entityId: caseId,
      afterState: { approvedRefundCents: approved.approved_refund_cents, organisationId: approved.organisation_id },
    });

    await this.processOperational(caseId);
    return (await refundCaseRepository.findById(caseId)) as RefundCaseRecord;
  },

  async reject(caseId: number, actorId: number, reason: string): Promise<RefundCaseRecord> {
    if (!reason || reason.trim().length < 3) throw new ValidationError('A rejection reason is required');
    return withTransaction(async (conn) => {
      const record = await refundCaseRepository.lockById(caseId, conn);
      if (!record) throw new NotFoundError('Refund case');
      if (record.status === 'REJECTED') return record;
      if (isTerminalCaseStatus(record.status) || record.status === 'APPROVED') {
        throw new ConflictError(`Cannot reject a refund case in status ${record.status}`);
      }
      await refundCaseRepository.updateCase(
        caseId,
        record.aggregate_version,
        { status: 'REJECTED', rejected_reason: reason.trim() },
        conn,
      );
      recordAudit({
        actorId,
        action: 'REFUND.CASE_REJECTED',
        entityType: 'refund_case',
        entityId: caseId,
        afterState: { reason: reason.trim() },
      });
      return (await refundCaseRepository.lockById(caseId, conn)) as RefundCaseRecord;
    });
  },

  async processOperational(caseId: number): Promise<void> {
    const record = await refundCaseRepository.findById(caseId);
    if (!record) throw new NotFoundError('Refund case');
    if (record.operational_status === 'COMPLETED') return;

    const lines = await refundCaseRepository.listLines(caseId);
    for (const line of lines) {
      if (line.operational_status === 'COMPLETED') continue;
      try {
        const ref = await cancelServiceLine(record, line);
        await withTransaction(async (conn) => {
          await refundCaseRepository.updateLine(line.id, { operational_status: 'COMPLETED', cancellation_ref: ref }, conn);
        });
      } catch (err: any) {
        await withTransaction(async (conn) => {
          await refundCaseRepository.updateLine(line.id, { operational_status: 'FAILED' }, conn);
        });
        recordAudit({
          actorId: Number(record.approved_by ?? record.requested_by),
          action: 'REFUND.OPERATIONAL_CANCELLATION_FAILED',
          entityType: 'refund_case',
          entityId: caseId,
          afterState: { lineId: line.id, lineType: line.line_type, sourceId: line.source_id, error: err?.message ?? String(err) },
        });
      }
    }

    const updated = await withTransaction(async (conn) => {
      const current = await refundCaseRepository.lockById(caseId, conn);
      if (!current) throw new NotFoundError('Refund case');
      const refreshed = await refundCaseRepository.listLines(caseId, conn);
      const operational = deriveOperationalStatus(refreshed.map((l) => l.operational_status));
      const payoutStatus = current.payout_status;
      const status: RefundCaseStatus =
        operational === 'FAILED'
          ? 'FAILED'
          : operational === 'COMPLETED'
            ? current.paid_cents > 0
              ? current.paid_cents >= current.approved_refund_cents
                ? 'COMPLETED'
                : 'PARTIALLY_COMPLETED'
              : 'PAYOUT_PENDING'
            : 'OPERATIONAL_PROCESSING';

      await refundCaseRepository.updateCase(
        caseId,
        current.aggregate_version,
        { operational_status: operational, status, payout_status: payoutStatus },
        conn,
      );

      await eventBusV2.emit(
        operational === 'COMPLETED' ? 'refund:operational-completed' : 'refund:operational-failed',
        {
          caseId,
          publicId: current.public_id,
          organisationId: current.organisation_id,
          domain: current.domain,
          operationalStatus: operational,
        },
        { aggregateType: 'refund_case', aggregateId: String(caseId), aggregateVersion: current.aggregate_version + 1 },
        conn,
      );

      return refundCaseRepository.lockById(caseId, conn);
    });

    if (updated && updated.operational_status === 'COMPLETED') {
      recordAudit({
        actorId: Number(updated.approved_by ?? updated.requested_by),
        action: 'REFUND.OPERATIONAL_CANCELLED',
        entityType: 'refund_case',
        entityId: caseId,
        afterState: { operationalStatus: 'COMPLETED', status: updated.status },
      });
    }
  },

  async retryOperational(caseId: number, actorId: number): Promise<RefundCaseRecord> {
    const record = await refundCaseRepository.findById(caseId);
    if (!record) throw new NotFoundError('Refund case');
    if (record.operational_status === 'COMPLETED') return record;
    if (record.status === 'REJECTED' || record.status === 'COMPLETED') {
      throw new ConflictError(`Cannot retry operational cancellation in status ${record.status}`);
    }
    await withTransaction(async (conn) => {
      const current = await refundCaseRepository.lockById(caseId, conn);
      if (!current) throw new NotFoundError('Refund case');
      await refundCaseRepository.updateCase(
        caseId,
        current.aggregate_version,
        { status: 'OPERATIONAL_PROCESSING', operational_status: 'PROCESSING' },
        conn,
      );
    });
    await this.processOperational(caseId);
    recordAudit({
      actorId,
      action: 'REFUND.OPERATIONAL_RETRIED',
      entityType: 'refund_case',
      entityId: caseId,
      afterState: { status: (await refundCaseRepository.findById(caseId))?.status },
    });
    return (await refundCaseRepository.findById(caseId)) as RefundCaseRecord;
  },

  async recordPayout(
    caseId: number,
    actorId: number,
    input: {
      method: RefundPayoutMethod;
      amountCents: number;
      reference?: string | null;
      evidenceUrl?: string | null;
      idempotencyKey: string;
    },
  ): Promise<{ case: RefundCaseRecord; payoutId: number }> {
    if (!['cash', 'bank_transfer'].includes(input.method)) throw new ValidationError('Payout method must be cash or bank_transfer');
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new ValidationError('Payout amount must be positive cents');
    if (!input.idempotencyKey) throw new ValidationError('idempotencyKey is required');

    return withTransaction(async (conn) => {
      const record = await refundCaseRepository.lockById(caseId, conn);
      if (!record) throw new NotFoundError('Refund case');
      if (record.operational_status !== 'COMPLETED') {
        throw new ConflictError('Payout cannot start before all operational cancellations are complete');
      }
      if (record.status === 'REJECTED') throw new ConflictError('Rejected refund cases cannot be paid');
      const remaining = record.approved_refund_cents - record.paid_cents;
      if (remaining <= 0) throw new ConflictError('Refund case is already fully paid');
      if (input.amountCents > remaining) {
        throw new ValidationError(`Payout exceeds the remaining approved amount (${remaining}¢)`);
      }

      const payoutId = await refundCaseRepository.insertPayout(
        {
          caseId,
          method: input.method,
          amountCents: input.amountCents,
          reference: input.reference ?? null,
          evidenceUrl: input.evidenceUrl ?? null,
          executedBy: actorId,
          idempotencyKey: input.idempotencyKey,
        },
        conn,
      );

      const payoutStatus = 'PROCESSING' as const;
      await refundCaseRepository.updateCase(
        caseId,
        record.aggregate_version,
        { payout_status: payoutStatus, status: 'PAYOUT_PENDING' },
        conn,
      );

      await eventBusV2.emit(
        'refund:payout-recorded',
        {
          caseId,
          payoutId,
          publicId: record.public_id,
          organisationId: record.organisation_id,
          method: input.method,
          amountCents: input.amountCents,
          currency: record.currency,
          executedBy: actorId,
        },
        { aggregateType: 'refund_case', aggregateId: String(caseId), aggregateVersion: record.aggregate_version + 1 },
        conn,
      );

      return {
        case: (await refundCaseRepository.lockById(caseId, conn)) as RefundCaseRecord,
        payoutId,
      };
    });
  },

  async confirmPayout(
    caseId: number,
    payoutId: number,
    actorId: number,
  ): Promise<RefundCaseRecord> {
    const result = await withTransaction(async (conn) => {
      const record = await refundCaseRepository.lockById(caseId, conn);
      if (!record) throw new NotFoundError('Refund case');
      if (record.approved_by != null && Number(record.approved_by) === Number(actorId)) {
        throw new ConflictError('Approval and payout confirmation must be performed by different users');
      }
      const payout = await refundCaseRepository.lockPayout(payoutId, conn);
      if (!payout || payout.case_id !== caseId) throw new NotFoundError('Refund payout');
      if (payout.status === 'COMPLETED') return record;
      if (payout.status !== 'PROCESSING') throw new ConflictError(`Cannot confirm a payout in status ${payout.status}`);

      await refundCaseRepository.updatePayout(
        payoutId,
        { status: 'COMPLETED', executed_by: actorId, executed_at: new Date() },
        conn,
      );

      const paidCents = record.paid_cents + payout.amount_cents;
      if (paidCents > record.approved_refund_cents) {
        throw new ConflictError('Payout confirmation exceeds the approved refund amount');
      }
      const payoutStatus = derivePayoutStatus(record.approved_refund_cents, paidCents);
      const status: RefundCaseStatus =
        record.operational_status === 'COMPLETED' && payoutStatus === 'COMPLETED'
          ? 'COMPLETED'
          : 'PARTIALLY_COMPLETED';

      await refundCaseRepository.updateCase(
        caseId,
        record.aggregate_version,
        { paid_cents: paidCents, payout_status: payoutStatus, status },
        conn,
      );

      await eventBusV2.emit(
        'refund:payout-confirmed',
        {
          caseId,
          payoutId,
          publicId: record.public_id,
          organisationId: record.organisation_id,
          method: payout.method,
          amountCents: payout.amount_cents,
          currency: record.currency,
          executedBy: actorId,
        },
        { aggregateType: 'refund_case', aggregateId: String(caseId), aggregateVersion: record.aggregate_version + 1 },
        conn,
      );

      return (await refundCaseRepository.lockById(caseId, conn)) as RefundCaseRecord;
    });

    recordAudit({
      actorId,
      action: 'REFUND.PAYOUT_CONFIRMED',
      entityType: 'refund_case',
      entityId: caseId,
      afterState: { payoutId, paidCents: result.paid_cents, status: result.status },
    });
    return result;
  },

  async failPayout(caseId: number, payoutId: number, actorId: number, reason: string): Promise<RefundCaseRecord> {
    const result = await withTransaction(async (conn) => {
      const record = await refundCaseRepository.lockById(caseId, conn);
      if (!record) throw new NotFoundError('Refund case');
      const payout = await refundCaseRepository.lockPayout(payoutId, conn);
      if (!payout || payout.case_id !== caseId) throw new NotFoundError('Refund payout');
      if (payout.status === 'FAILED') return record;
      if (payout.status !== 'PROCESSING' && payout.status !== 'PENDING') {
        throw new ConflictError(`Cannot fail a payout in status ${payout.status}`);
      }
      await refundCaseRepository.updatePayout(payoutId, { status: 'FAILED' }, conn);
      await refundCaseRepository.updateCase(
        caseId,
        record.aggregate_version,
        { payout_status: 'FAILED' },
        conn,
      );
      return (await refundCaseRepository.lockById(caseId, conn)) as RefundCaseRecord;
    });

    recordAudit({
      actorId,
      action: 'REFUND.PAYOUT_FAILED',
      entityType: 'refund_case',
      entityId: caseId,
      afterState: { payoutId, reason },
    });
    return result;
  },

  async get(ref: string | number): Promise<{
    case: RefundCaseRecord;
    lines: Awaited<ReturnType<typeof refundCaseRepository.listLines>>;
    payouts: Awaited<ReturnType<typeof refundCaseRepository.listPayouts>>;
  }> {
    const record = typeof ref === 'number'
      ? await refundCaseRepository.findById(ref)
      : await refundCaseRepository.findByPublicId(ref);
    if (!record) throw new NotFoundError('Refund case');
    return {
      case: record,
      lines: await refundCaseRepository.listLines(record.id),
      payouts: await refundCaseRepository.listPayouts(record.id),
    };
  },

  async list(filter: { organisationId?: number; status?: string; domain?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(filter.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(filter.limit ?? 25)));
    return refundCaseRepository.list({
      organisationId: filter.organisationId,
      status: filter.status,
      domain: filter.domain,
      page,
      limit,
    });
  },
};

export { toPublic };
