import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { financialEntitlementRepository } from '../infrastructure/repositories/financial-entitlement.repository.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { ConflictError } from '../../../shared/errors/app-error.js';
import {
  validateEntitlementAmount,
  isTerminal,
  planTransition,
  type CreateEntitlementInput,
  type EntitlementStatus,
} from '../domain/financial-entitlement-aggregate.js';

const log = createModuleLogger('financial-entitlement');
type RowData = mysql.RowDataPacket[];

export class FinancialEntitlementService {

  // ── Create entitlements (called by domain listeners) ──

  async createEntitlement(input: CreateEntitlementInput): Promise<number> {
    validateEntitlementAmount(input.entitlementType, input.amount);
    const id = await financialEntitlementRepository.create(input);
    log.info({ id, orgId: input.organisationId, type: input.entitlementType, source: input.sourceType, amount: input.amount }, 'Entitlement created');
    return id;
  }

  async createEntitlements(inputs: CreateEntitlementInput[], conn?: mysql.PoolConnection): Promise<number[]> {
    const ids: number[] = [];
    for (const input of inputs) {
      validateEntitlementAmount(input.entitlementType, input.amount);
      const id = await financialEntitlementRepository.create(input, conn);
      ids.push(id);
    }
    return ids;
  }

  // ── Activation (called by BullMQ worker or directly) ──

  async activateEntitlements(batchSize: number = 200): Promise<number> {
    const pending = await financialEntitlementRepository.findPendingForActivation(batchSize);
    if (!pending.length) return 0;

    const ids = pending.map(e => e.id);
    const activated = await financialEntitlementRepository.batchActivate(ids);

    for (const e of pending) {
      eventBusV2.emit('entitlement:activated', {
        entitlementId: e.id,
        publicId: e.public_id,
        organisationId: e.organisation_id,
        entitlementType: e.entitlement_type,
        sourceType: e.source_type,
        sourceId: e.source_id,
        amount: e.amount,
        currency: e.currency,
      } as any);
    }

    log.info({ activated }, 'Batch activated entitlements');
    return activated;
  }

  // ── Hold / Release ──

  async holdEntitlement(id: number, reason: string): Promise<void> {
    const entitlement = await financialEntitlementRepository.findById(id);
    if (!entitlement) throw new ConflictError('Entitlement not found');
    if (isTerminal(entitlement.status)) throw new ConflictError(`Cannot hold entitlement in ${entitlement.status} status`);

    const { newVersion } = planTransition({
      fromStatus: entitlement.status,
      toStatus: 'ON_HOLD',
      currentVersion: entitlement.aggregate_version,
    });

    await financialEntitlementRepository.persistTransition(id, 'ON_HOLD', entitlement.aggregate_version, {
      hold_reason: reason,
    });

    eventBusV2.emit('entitlement:on-hold', {
      entitlementId: id,
      publicId: entitlement.public_id,
      organisationId: entitlement.organisation_id,
      reason,
    } as any);

    log.info({ id, reason }, 'Entitlement held');
  }

  async releaseEntitlement(id: number): Promise<void> {
    const entitlement = await financialEntitlementRepository.findById(id);
    if (!entitlement) throw new ConflictError('Entitlement not found');
    if (entitlement.status !== 'ON_HOLD') throw new ConflictError(`Cannot release entitlement in ${entitlement.status} status`);

    const { newVersion } = planTransition({
      fromStatus: 'ON_HOLD',
      toStatus: 'AVAILABLE',
      currentVersion: entitlement.aggregate_version,
    });

    await financialEntitlementRepository.persistTransition(id, 'AVAILABLE', entitlement.aggregate_version, {
      hold_reason: null,
    });

    eventBusV2.emit('entitlement:released', {
      entitlementId: id,
      publicId: entitlement.public_id,
      organisationId: entitlement.organisation_id,
    } as any);

    log.info({ id }, 'Entitlement released');
  }

  // ── Cancel ──

  async cancelEntitlement(id: number, reason: string): Promise<void> {
    const entitlement = await financialEntitlementRepository.findById(id);
    if (!entitlement) throw new ConflictError('Entitlement not found');
    if (isTerminal(entitlement.status)) throw new ConflictError(`Cannot cancel entitlement in ${entitlement.status} status`);

    const { newVersion } = planTransition({
      fromStatus: entitlement.status,
      toStatus: 'CANCELLED',
      currentVersion: entitlement.aggregate_version,
    });

    await financialEntitlementRepository.persistTransition(id, 'CANCELLED', entitlement.aggregate_version, {
      cancelled_reason: reason,
    });

    eventBusV2.emit('entitlement:cancelled', {
      entitlementId: id,
      publicId: entitlement.public_id,
      organisationId: entitlement.organisation_id,
      sourceType: entitlement.source_type,
      sourceId: entitlement.source_id,
      amount: entitlement.amount,
      reason,
    } as any);

    log.info({ id, reason }, 'Entitlement cancelled');
  }

  // ── Cancel by source (used for booking refunds) ──

  async cancelBySource(sourceType: string, sourceId: number, reason: string): Promise<number> {
    return this.cancelBySourceIds(sourceType, [sourceId], reason);
  }

  /**
   * Cancel all non-terminal entitlements for a set of source IDs (e.g. all
   * order_items of a cancelled/refunded marketplace order). Skips SETTLED and
   * already-CANCELLED records; optimistic-lock conflicts are logged and skipped.
   */
  async cancelBySourceIds(sourceType: string, sourceIds: number[], reason: string): Promise<number> {
    const entitlements = await financialEntitlementRepository.findBySourceIds(sourceType as any, sourceIds);
    let cancelled = 0;
    for (const e of entitlements) {
      if (isTerminal(e.status)) continue;
      try {
        await this.cancelEntitlement(e.id, reason);
        cancelled++;
      } catch (err: any) {
        if (err?.message?.includes('version conflict')) {
          log.warn({ entitlementId: e.id, err: err.message }, 'Optimistic lock conflict during cancelBySourceIds — skipping');
          continue;
        }
        throw err;
      }
    }
    return cancelled;
  }

  /**
   * Hold all non-terminal entitlements for a set of source IDs (e.g. disputed
   * order_items). Used by the complaint system to freeze disputed funds.
   */
  async holdBySourceIds(sourceType: string, sourceIds: number[], reason: string): Promise<number> {
    const entitlements = await financialEntitlementRepository.findBySourceIds(sourceType as any, sourceIds);
    let held = 0;
    for (const e of entitlements) {
      if (isTerminal(e.status) || e.status === 'ON_HOLD') continue;
      try {
        await this.holdEntitlement(e.id, reason);
        held++;
      } catch (err: any) {
        if (err?.message?.includes('version conflict')) {
          log.warn({ entitlementId: e.id, err: err.message }, 'Optimistic lock conflict during holdBySourceIds — skipping');
          continue;
        }
        throw err;
      }
    }
    return held;
  }

  /**
   * Release all ON_HOLD entitlements for a set of source IDs back to AVAILABLE.
   */
  async releaseBySourceIds(sourceType: string, sourceIds: number[]): Promise<number> {
    const entitlements = await financialEntitlementRepository.findBySourceIds(sourceType as any, sourceIds);
    let released = 0;
    for (const e of entitlements) {
      if (e.status !== 'ON_HOLD') continue;
      try {
        await this.releaseEntitlement(e.id);
        released++;
      } catch (err: any) {
        if (err?.message?.includes('version conflict')) {
          log.warn({ entitlementId: e.id, err: err.message }, 'Optimistic lock conflict during releaseBySourceIds — skipping');
          continue;
        }
        throw err;
      }
    }
    return released;
  }

  /**
   * Activate marketplace entitlements whose delivery complaint window has passed.
   * Called by the scheduled complaint-period worker. Idempotent (only PENDING rows
   * are activated). Returns the number activated.
   */
  async activateMarketplaceEligible(periodDays: number, batchSize: number = 200): Promise<number> {
    const pending = await financialEntitlementRepository.findPendingMarketplaceDueForActivation(periodDays, batchSize);
    if (!pending.length) return 0;

    const ids = pending.map(e => e.id);
    const activated = await financialEntitlementRepository.batchActivate(ids);

    for (const e of pending) {
      eventBusV2.emit('entitlement:activated', {
        entitlementId: e.id,
        publicId: e.public_id,
        organisationId: e.organisation_id,
        entitlementType: e.entitlement_type,
        sourceType: e.source_type,
        sourceId: e.source_id,
        amount: e.amount,
        currency: e.currency,
      } as any);
    }

    log.info({ activated, periodDays }, 'Activated marketplace entitlements past complaint window');
    return activated;
  }

  // ── Read ──

  async getEntitlement(id: number) {
    return financialEntitlementRepository.findById(id);
  }

  async getEntitlementByPublicId(publicId: string) {
    return financialEntitlementRepository.findByPublicId(publicId);
  }

  async getOrganisationEntitlements(orgId: number, filters: {
    status?: EntitlementStatus;
    entitlementType?: string;
    page: number;
    limit: number;
  }) {
    return financialEntitlementRepository.findByOrganisation({
      orgId,
      status: filters.status,
      entitlementType: filters.entitlementType as any,
      page: filters.page,
      limit: filters.limit,
    });
  }

  async getOrganisationBalance(orgId: number, status: EntitlementStatus): Promise<number> {
    return financialEntitlementRepository.sumByOrganisation(orgId, status);
  }

  async getEntitlementsBySource(sourceType: string, sourceId: number) {
    return financialEntitlementRepository.findBySource(sourceType as any, sourceId);
  }

  async getEntitlementsBySourceIds(sourceType: string, sourceIds: number[]) {
    return financialEntitlementRepository.findBySourceIds(sourceType as any, sourceIds);
  }

  // ── Settlement linkage ──

  async getSettlementEntitlements(settlementId: number) {
    return financialEntitlementRepository.findBySettlement(settlementId);
  }
}

export const financialEntitlementService = new FinancialEntitlementService();
