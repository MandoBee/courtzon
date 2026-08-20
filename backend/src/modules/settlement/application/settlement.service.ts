import { settlementRepository as repo } from '../infrastructure/repositories/settlement.repository.js';
import { marketplaceRepository as marketRepo } from '../../marketplace/infrastructure/repositories/marketplace.repository.js';
import { transactionRepository } from '../../financial/infrastructure/transaction.repository.js';
import { withTransaction } from '../../../database/database.transaction.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../../shared/errors/app-error.js';
import { getPool } from '../../../database/mysql.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { commandPipeline } from '../../../shared/command/command-pipeline.js';
import { isFeatureEnabled } from '../../../shared/utils/feature-flags.js';
import { changeSettlementStatusHandler, type ChangeSettlementStatusPayload } from '../commands/change-settlement-status.command.js';
import { markSettlementPaidHandler, type MarkSettlementPaidPayload } from '../commands/mark-settlement-paid.command.js';
import type { SettlementStatus } from '../domain/settlement-aggregate.js';
import type { Command } from '../../../shared/command/command-base.js';
import type mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];

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
    // settlement_orders / settlement_transfers. This keeps both legacy entry
    // points (POST /settlements/request and POST /marketplace/seller/settlements)
    // functional while routing them through the authoritative engine.
    const { unifiedSettlementService } = await import('./unified-settlement.service.js');
    return unifiedSettlementService.create({
      orgId: data.organisationId,
      requestedBy: data.requestedBy,
      requestedByRole: data.requestedByRole,
      notes: undefined,
    });
  },

  // ── Approve ──

  async approveSettlement(settlementId: number, approvedBy?: number, notes?: string) {
    if (isFeatureEnabled('SETTLEMENT_V2_APPROVE')) {
      return this.changeStatusV2(settlementId, 'approved', { notes, approved_at: new Date() });
    }

    const settlement = await repo.findSettlementById(settlementId);
    if (!settlement) throw new NotFoundError('Settlement');
    if (settlement.settlement_status !== 'pending_approval') {
      throw new ConflictError(`Cannot approve settlement in status "${settlement.settlement_status}"`);
    }

    await repo.updateSettlementStatus(settlementId, 'approved', {
      approved_at: new Date(),
      notes: notes || settlement.notes,
    });

    return repo.getSettlementDetail(settlementId);
  },

  // ── Mark as Paid ──

  async markPaid(settlementId: number, bankAccountId?: number, transferReference?: string) {
    if (isFeatureEnabled('SETTLEMENT_V2_PAY')) {
      return this.markPaidV2(settlementId, bankAccountId, transferReference);
    }

    const settlement = await repo.findSettlementById(settlementId);
    if (!settlement) throw new NotFoundError('Settlement');
    if (settlement.settlement_status !== 'approved') {
      throw new ConflictError(`Cannot mark paid in status "${settlement.settlement_status}"`);
    }

    return withTransaction(async (conn) => {
      if (bankAccountId) {
        const bankAccount = await repo.getBankAccount(bankAccountId);
        if (bankAccount) {
          await conn.execute(
            'UPDATE settlements SET bank_account_id = ?, bank_account_snapshot = ? WHERE id = ?',
            [bankAccountId, JSON.stringify(bankAccount), settlementId],
          );
        }
      }

      await conn.execute(
        'UPDATE settlements SET settlement_status = ?, paid_at = NOW() WHERE id = ?',
        ['paid', settlementId],
      );

      const finalAmount = Number(settlement.final_amount || 0);
      const direction = settlement.settlement_direction;

      if (finalAmount > 0 && direction) {
        const txnId = await transactionRepository.createTransaction({
          type: 'payout',
          sourceType: 'settlement',
          sourceId: settlementId,
          totalAmount: finalAmount,
          status: 'completed',
        }, conn);

        if (direction === 'courtzon_to_org') {
          await transactionRepository.createEntries([
            { transactionId: txnId, side: 'debit', entityType: 'platform_account', entityId: 2, amount: finalAmount, description: `Settlement #${settlementId}: CourtZon pays org` },
            { transactionId: txnId, side: 'credit', entityType: 'branch', entityId: settlement.branch_id || 0, amount: finalAmount, organisationId: settlement.organisation_id, description: `Settlement #${settlementId}: Org receives from CourtZon` },
          ], conn);
        } else {
          await transactionRepository.createEntries([
            { transactionId: txnId, side: 'debit', entityType: 'branch', entityId: settlement.branch_id || 0, amount: finalAmount, organisationId: settlement.organisation_id, description: `Settlement #${settlementId}: Org pays CourtZon fee` },
            { transactionId: txnId, side: 'credit', entityType: 'platform_account', entityId: 2, amount: finalAmount, description: `Settlement #${settlementId}: CourtZon receives from org` },
          ], conn);
        }

        // Emit accounting event at markPaid — this is when money actually moves.
        // Carry the FULL component amounts so the accounting listener can post
        // an explicit offset entry (never silently net down).
        eventBusV2.emit('settlement:paid', {
          settlementId,
          amount: finalAmount,
          direction,
          organisationId: settlement.organisation_id,
          currency: 'EGP',
          onlineNet: Number(settlement.online_net_total || 0),
          codFee: Number(settlement.cod_fee_total || 0),
        } as Record<string, unknown>, {
          aggregateType: 'settlement',
          aggregateId: String(settlementId),
          aggregateVersion: 1,
        });
      }

      return repo.getSettlementDetail(settlementId);
    });
  },

  // ── Complete ──

  async completeSettlement(settlementId: number) {
    if (isFeatureEnabled('SETTLEMENT_V2_COMPLETE')) {
      return this.changeStatusV2(settlementId, 'completed', { completed_at: new Date() });
    }

    const settlement = await repo.findSettlementById(settlementId);
    if (!settlement) throw new NotFoundError('Settlement');
    if (settlement.settlement_status !== 'paid') {
      throw new ConflictError(`Cannot complete settlement in status "${settlement.settlement_status}"`);
    }

    await repo.updateSettlementStatus(settlementId, 'completed', { completed_at: new Date() });
    return repo.getSettlementDetail(settlementId);
  },

  // ── Reject (with rollback of order settlement status) ──

  async rejectSettlement(settlementId: number, reason: string) {
    if (isFeatureEnabled('SETTLEMENT_V2_REJECT')) {
      return this.changeStatusV2(settlementId, 'rejected', { rejected_at: new Date(), rejected_reason: reason });
    }

    const settlement = await repo.findSettlementById(settlementId);
    if (!settlement) throw new NotFoundError('Settlement');
    if (!['pending_approval', 'approved'].includes(settlement.settlement_status)) {
      throw new ConflictError(`Cannot reject settlement in status "${settlement.settlement_status}"`);
    }

    await withTransaction(async (conn) => {
      const [soRows] = await conn.execute<RowData>(
        'SELECT order_id FROM settlement_orders WHERE settlement_id = ?',
        [settlementId],
      );
      const orderIds = soRows.map((r: any) => r.order_id);
      if (orderIds.length) {
        const placeholders = orderIds.map(() => '?').join(',');
        await conn.execute(
          `UPDATE order_items SET settlement_status = 'pending'
           WHERE order_id IN (${placeholders}) AND settlement_status = 'settled'
             AND seller_id = ?`,
          [...orderIds, settlement.organisation_id],
        );
        await conn.execute(
          `UPDATE orders SET settlement_status = 'pending'
           WHERE id IN (${placeholders})`,
          orderIds,
        );
      }

      await conn.execute(
        `UPDATE settlements SET settlement_status = 'rejected',
          rejected_at = NOW(), rejected_reason = ?
         WHERE id = ?`,
        [reason, settlementId],
      );
    });

    return repo.getSettlementDetail(settlementId);
  },

  // ── Cancel (with rollback of order settlement status) ──

  async cancelSettlement(settlementId: number, reason?: string) {
    if (isFeatureEnabled('SETTLEMENT_V2_CANCEL')) {
      return this.changeStatusV2(settlementId, 'cancelled', { rejected_at: new Date(), rejected_reason: reason || 'Cancelled by user' });
    }

    const settlement = await repo.findSettlementById(settlementId);
    if (!settlement) throw new NotFoundError('Settlement');
    if (!['requested', 'calculating', 'pending_approval'].includes(settlement.settlement_status)) {
      throw new ConflictError(`Cannot cancel settlement in status "${settlement.settlement_status}"`);
    }

    await withTransaction(async (conn) => {
      const [soRows] = await conn.execute<RowData>(
        'SELECT order_id FROM settlement_orders WHERE settlement_id = ?',
        [settlementId],
      );
      const orderIds = soRows.map((r: any) => r.order_id);
      if (orderIds.length) {
        const placeholders = orderIds.map(() => '?').join(',');
        await conn.execute(
          `UPDATE order_items SET settlement_status = 'pending'
           WHERE order_id IN (${placeholders}) AND settlement_status = 'settled'
             AND seller_id = ?`,
          [...orderIds, settlement.organisation_id],
        );
        await conn.execute(
          `UPDATE orders SET settlement_status = 'pending'
           WHERE id IN (${placeholders})`,
          orderIds,
        );
      }

      await conn.execute(
        `UPDATE settlements SET settlement_status = 'cancelled',
          rejected_at = NOW(), rejected_reason = ?
         WHERE id = ?`,
        [reason || 'Cancelled by user', settlementId],
      );
    });

    return repo.getSettlementDetail(settlementId);
  },

  // ── V2 Command Pipeline ──

  async changeStatusV2(settlementId: number, toStatus: string, extra?: Record<string, unknown>) {
    const command: Command = {
      commandId: `change-settlement-status-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      commandType: `ChangeSettlementStatus`,
      aggregateType: 'settlement',
      aggregateId: String(settlementId),
      payload: { settlementId, toStatus: toStatus as SettlementStatus, extra } satisfies ChangeSettlementStatusPayload,
      correlationId: `stl_${Date.now()}`,
    };

    const result = await commandPipeline.execute(command, {
      validate: async () => changeSettlementStatusHandler.validate(command),
      execute: async (cmd, conn) => changeSettlementStatusHandler.execute(cmd, conn),
      events: (cmd, res) => changeSettlementStatusHandler.events!(cmd, res),
    });

    if (result.status === 'error') {
      throw new Error(`ChangeSettlementStatus failed: ${result.message}`);
    }

    const data = result.data!;
    if (data.status === 'completed' || data.status === 'rejected') {
      eventBusV2.emit('settlement:completed', {
        settlementId: data.settlementId,
        organisationId: 0,
        amount: 0,
      });
    }

    return repo.getSettlementDetail(settlementId);
  },

  async markPaidV2(settlementId: number, bankAccountId?: number, transferReference?: string) {
    const command: Command = {
      commandId: `mark-settlement-paid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      commandType: 'MarkSettlementPaid',
      aggregateType: 'settlement',
      aggregateId: String(settlementId),
      payload: { settlementId, bankAccountId: bankAccountId ?? null, transferReference: transferReference ?? null } satisfies MarkSettlementPaidPayload,
      correlationId: `stl_pay_${Date.now()}`,
    };

    const result = await commandPipeline.execute(command, {
      validate: async () => markSettlementPaidHandler.validate(command),
      execute: async (cmd, conn) => markSettlementPaidHandler.execute(cmd, conn),
      events: (cmd, res) => markSettlementPaidHandler.events!(cmd, res),
    });

    if (result.status === 'error') {
      // Surface version conflicts / invalid states as a clean 409.
      throw new ConflictError(result.message || 'Failed to mark settlement as paid');
    }

    return repo.getSettlementDetail(settlementId);
  },

  // ── Read ──

  async getSettlementDetail(settlementId: number) {
    const detail = await repo.getSettlementDetail(settlementId);
    if (!detail) throw new NotFoundError('Settlement');
    return detail;
  },

  async getSettlements(filters: { status?: string; orgId?: number; branchId?: number; from?: string; to?: string; page: number; limit: number }) {
    return repo.findSettlements(filters);
  },

  async getOrganisationSettlements(orgId: number, page: number, limit: number) {
    return repo.findOrgSettlements(orgId, page, limit);
  },
};
