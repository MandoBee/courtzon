import { getPool } from '../../../database/mysql.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../../shared/errors/app-error.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { financialEntitlementService } from '../../financial/application/financial-entitlement.service.js';
import { unifiedSettlementRepository } from '../infrastructure/repositories/unified-settlement.repository.js';
import { computeSettlementFinancials, type SettlementDirectionType } from './unified-settlement-calc.js';

const log = createModuleLogger('unified-settlement');

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface SettlementDetail {
  settlement: any;
  entitlements: any[];
  financials: ReturnType<typeof computeSettlementFinancials>;
}

export const unifiedSettlementService = {
  /**
   * Read-only preview of a settlement for an organization. Loads all eligible
   * AVAILABLE entitlements, optionally excludes specific ones, and computes the
   * two parties' positions + net direction. Does NOT mutate anything.
   */
  async preview(orgId: number, excludeEntitlementIds: number[] = []): Promise<{
    entitlements: any[];
    selectedIds: number[];
    excludedIds: number[];
    financials: ReturnType<typeof computeSettlementFinancials>;
  }> {
    const eligible = await financialEntitlementService.getAvailableForOrganisation(orgId);
    const excludedSet = new Set(excludeEntitlementIds.map(Number));
    const selected = eligible.filter((e) => !excludedSet.has(e.id));
    const selectedIds = selected.map((e) => e.id);
    const financials = computeSettlementFinancials(selected.map((e) => ({
      id: e.id,
      organisationId: e.organisation_id,
      entitlementType: e.entitlement_type,
      amount: Number(e.amount),
      collector: e.collector,
    })));
    return { entitlements: eligible, selectedIds, excludedIds: [...excludedSet], financials };
  },

  /**
   * Atomically create a settlement: validate + reserve the selected AVAILABLE
   * entitlements (ON_HOLD + settlement_id) and link them. Runs in one DB
   * transaction. The uk_se_entitlement unique constraint + row reservation
   * guarantee an entitlement never enters two settlements.
   */
  async create(data: {
    orgId: number;
    excludeEntitlementIds?: number[];
    selectedEntitlementIds?: number[];
    batchCode?: string;
    requestedBy: number;
    requestedByRole: string;
    notes?: string;
  }): Promise<SettlementDetail> {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const eligible = await financialEntitlementService.getAvailableForOrganisation(data.orgId);

      let selectedIds: number[];
      if (data.selectedEntitlementIds && data.selectedEntitlementIds.length > 0) {
        // Explicit selection: verify each belongs to org + is AVAILABLE.
        const idSet = new Set(data.selectedEntitlementIds.map(Number));
        const selected = eligible.filter((e) => idSet.has(e.id));
        if (selected.length !== idSet.size) {
          throw new ConflictError('One or more selected entitlements are not eligible for settlement');
        }
        selectedIds = selected.map((e) => e.id);
      } else {
        // Default: all eligible, minus exclusions.
        const excludedSet = new Set((data.excludeEntitlementIds || []).map(Number));
        selectedIds = eligible.filter((e) => !excludedSet.has(e.id)).map((e) => e.id);
      }

      if (selectedIds.length === 0) {
        throw new ConflictError('No eligible AVAILABLE entitlements selected for settlement');
      }

      const selectedEnts = eligible.filter((e) => selectedIds.includes(e.id));
      const financials = computeSettlementFinancials(selectedEnts.map((e) => ({
        id: e.id,
        organisationId: e.organisation_id,
        entitlementType: e.entitlement_type,
        amount: Number(e.amount),
        collector: e.collector,
      })));

      const batchCode = data.batchCode || generateBatchCode(new Date());

      const settlementId = await unifiedSettlementRepository.create({
        organisationId: data.orgId,
        branchId: null,
        requestedBy: data.requestedBy,
        requestedByRole: data.requestedByRole,
        batchCode,
        settlementType: 'unified',
        organizationPosition: financials.orgOwedToCourtZon,
        courtzonPosition: financials.courtzonOwedToOrg,
        net: financials.net,
        direction: financials.direction,
        finalAmount: financials.finalAmount,
        commissionAmount: financials.totalCommission,
        notes: data.notes,
      }, conn);

      // Reserve selected entitlements (ON_HOLD + settlement_id) and link them.
      await financialEntitlementService.reserveForSettlement(selectedIds, settlementId, conn);
      await unifiedSettlementRepository.linkEntitlements(settlementId, selectedIds, conn);

      await conn.commit();
      conn.release();

      eventBusV2.emit('settlement:created', {
        settlementId,
        organisationId: data.orgId,
        requestedBy: data.requestedBy,
        batchCode,
        entitlementCount: selectedIds.length,
        courtzonOwedToOrg: financials.courtzonOwedToOrg,
        orgOwedToCourtZon: financials.orgOwedToCourtZon,
        net: financials.net,
        direction: financials.direction,
        finalAmount: financials.finalAmount,
      });

      log.info({ settlementId, orgId: data.orgId, selected: selectedIds.length, batchCode }, 'Unified settlement created');
      return this.get(settlementId);
    } catch (err) {
      await conn.rollback();
      conn.release();
      throw err;
    }
  },

  async get(settlementId: number): Promise<SettlementDetail> {
    const settlement = await unifiedSettlementRepository.findBySettlementId(settlementId);
    if (!settlement) throw new NotFoundError('Settlement not found');
    const entitlementIds = await unifiedSettlementRepository.findEntitlementIds(settlementId);
    const ents = await fetchEntitlementsByIds(entitlementIds);
    const financials = computeSettlementFinancials(ents.map((e) => ({
      id: e.id,
      organisationId: e.organisation_id,
      entitlementType: e.entitlement_type,
      amount: Number(e.amount),
      collector: e.collector,
    })));
    return { settlement, entitlements: ents, financials };
  },

  /**
   * Record the final payment for a settlement and finalize the selected
   * entitlements as SETTLED (immutable). For ZERO_BALANCE, no payment is
   * required but the entitlements are still finalized. Idempotent against
   * duplicate payment calls.
   */
  async recordPayment(settlementId: number, data: {
    paymentMethod?: string;
    paymentReference?: string;
    paidAmount?: number;
    paidBy: number;
  }): Promise<SettlementDetail> {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const settlement = await unifiedSettlementRepository.findBySettlementId(settlementId);
      if (!settlement) throw new NotFoundError('Settlement not found');
      if (settlement.settlement_status === 'completed' || settlement.settlement_status === 'paid') {
        // Idempotent: already finalized.
        await conn.rollback();
        conn.release();
        return this.get(settlementId);
      }
      if (!['requested', 'pending_approval', 'approved'].includes(settlement.settlement_status)) {
        throw new ConflictError(`Cannot record payment for settlement in status ${settlement.settlement_status}`);
      }

      const direction = settlement.settlement_direction
        ? (settlement.settlement_direction === 'courtzon_to_org' ? 'COURTZON_TO_ORGANIZATION' : 'ORGANIZATION_TO_COURTZON')
        : 'ZERO_BALANCE';
      const paidAmount = direction === 'ZERO_BALANCE' ? 0 : (data.paidAmount != null ? round2(data.paidAmount) : Number(settlement.final_amount));

      const entitlementIds = await unifiedSettlementRepository.findEntitlementIds(settlementId, conn);

      // Finalize entitlements as SETTLED (atomic).
      await financialEntitlementService.finalizeSettled(entitlementIds, settlementId, data.paidBy, conn);

      await unifiedSettlementRepository.persistTransition(settlementId, 'completed', settlement.aggregate_version, {
        payment_method: data.paymentMethod ?? null,
        payment_reference: data.paymentReference ?? null,
        paid_amount: paidAmount,
        paid_by: data.paidBy,
        paid_at: new Date(),
        completed_at: new Date(),
      }, conn);

      await conn.commit();
      conn.release();

      eventBusV2.emit('settlement:paid', {
        settlementId,
        organisationId: settlement.organisation_id,
        paidBy: data.paidBy,
        paidAmount,
        direction,
        paymentMethod: data.paymentMethod ?? null,
        paymentReference: data.paymentReference ?? null,
      });

      log.info({ settlementId, paidAmount, direction }, 'Unified settlement finalized as paid');
      return this.get(settlementId);
    } catch (err) {
      await conn.rollback();
      conn.release();
      throw err;
    }
  },

  /**
   * Cancel a settlement before payment, releasing the reserved entitlements back
   * to AVAILABLE. Only allowed before final payment.
   */
  async cancel(settlementId: number, cancelledBy: number, reason?: string): Promise<SettlementDetail> {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const settlement = await unifiedSettlementRepository.findBySettlementId(settlementId);
      if (!settlement) throw new NotFoundError('Settlement not found');
      if (['completed', 'paid', 'cancelled'].includes(settlement.settlement_status)) {
        throw new ConflictError(`Cannot cancel settlement in status ${settlement.settlement_status}`);
      }

      const entitlementIds = await unifiedSettlementRepository.findEntitlementIds(settlementId, conn);
      await financialEntitlementService.releaseFromSettlement(entitlementIds, settlementId, conn);

      await unifiedSettlementRepository.persistTransition(settlementId, 'cancelled', settlement.aggregate_version, {
        rejected_reason: reason ?? null,
      }, conn);

      await conn.commit();
      conn.release();

      eventBusV2.emit('settlement:cancelled', {
        settlementId,
        organisationId: settlement.organisation_id,
        cancelledBy,
        reason: reason ?? null,
      });

      log.info({ settlementId, cancelledBy }, 'Unified settlement cancelled');
      return this.get(settlementId);
    } catch (err) {
      await conn.rollback();
      conn.release();
      throw err;
    }
  },

  async list(filters: { status?: string; orgId?: number; batchCode?: string; page: number; limit: number }) {
    return unifiedSettlementRepository.findSettlements(filters);
  },

  /**
   * Read-only export payload: every settlement matching the filters (all pages,
   * not just the current page) with its canonical financials recomputed from
   * the linked financial_entitlements via computeSettlementFinancials — the SAME
   * authority the detail endpoint uses. Nothing is recalculated independently.
   */
  async listForExport(filters: { status?: string; orgId?: number; batchCode?: string }): Promise<any[]> {
    const settlements: any[] = [];
    let page = 1;
    const limit = 100;
    // Loop pages until we have fetched every matching settlement.
    for (;;) {
      const result = await unifiedSettlementRepository.findSettlements({ ...filters, page, limit });
      settlements.push(...result.data);
      if (page * limit >= result.total || result.data.length === 0) break;
      page += 1;
    }
    if (!settlements.length) return [];

    // Batch-fetch the settlement → entitlement links + entitlement rows.
    const pool = getPool();
    const ids = settlements.map((s: any) => s.id);
    const linkPlaceholders = ids.map(() => '?').join(',');
    const [linkRows] = await pool.execute<any[]>(
      `SELECT se.settlement_id, se.entitlement_id
       FROM settlement_entitlements se
       WHERE se.settlement_id IN (${linkPlaceholders})`,
      ids,
    );
    const entitlementIds = linkRows.map((r: any) => r.entitlement_id);
    const entitlements = entitlementIds.length ? await fetchEntitlementsByIds(entitlementIds) : [];
    const entById = new Map<number, any>(entitlements.map((e: any) => [e.id, e]));
    const linksBySettlement = new Map<number, number[]>();
    for (const link of linkRows) {
      const list = linksBySettlement.get(Number(link.settlement_id)) || [];
      list.push(Number(link.entitlement_id));
      linksBySettlement.set(Number(link.settlement_id), list);
    }

    return settlements.map((s: any) => {
      const idsForSettlement = linksBySettlement.get(Number(s.id)) || [];
      const ents = idsForSettlement.map((id) => entById.get(id)).filter(Boolean);
      const financials = computeSettlementFinancials(ents.map((e: any) => ({
        id: e.id,
        organisationId: e.organisation_id,
        entitlementType: e.entitlement_type,
        amount: Number(e.amount),
        collector: e.collector,
      })));
      return { settlement: s, entitlements: ents, financials };
    });
  },
};

function generateBatchCode(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const seq = Math.floor(Math.random() * 999) + 1;
  return `SET-${y}-${m}-${day}-${String(seq).padStart(3, '0')}`;
}

async function fetchEntitlementsByIds(ids: number[]) {
  if (!ids.length) return [];
  const { getPool } = await import('../../../database/mysql.js');
  const pool = getPool();
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.execute<any[]>(
    `SELECT * FROM financial_entitlements WHERE id IN (${placeholders}) ORDER BY id`,
    ids,
  );
  return rows.map((row: any) => ({
    ...row,
    amount: Number(row.amount),
    collector: row.collector ?? null,
    metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
  }));
}