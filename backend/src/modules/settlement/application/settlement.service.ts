import { settlementRepository as repo } from '../infrastructure/repositories/settlement.repository.js';
import { marketplaceRepository as marketRepo } from '../../marketplace/infrastructure/repositories/marketplace.repository.js';
import { transactionRepository } from '../../financial/infrastructure/transaction.repository.js';
import { withTransaction } from '../../../database/database.transaction.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../../shared/errors/app-error.js';
import { getPool } from '../../../database/mysql.js';
import { eventBus } from '../../../shared/event-bus/index.js';
import { commandPipeline } from '../../../shared/command/command-pipeline.js';
import { isFeatureEnabled } from '../../../shared/utils/feature-flags.js';
import { changeSettlementStatusHandler, type ChangeSettlementStatusPayload } from '../commands/change-settlement-status.command.js';
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
    const { organisationId, branchId, requestedBy, requestedByRole } = data;

    return withTransaction(async (conn) => {
      // 1. Lock and get unsettled orders for this seller (per-seller totals)
      const [unsettledRows] = await conn.execute<RowData>(
        `SELECT o.id as order_id,
                o.public_id as order_public_id,
                o.payment_method, o.payment_status,
                o.created_at as order_date,
                SUM(oi.total_price) as seller_subtotal,
                SUM(oi.commission_amount) as seller_fee,
                SUM(oi.total_price) - SUM(oi.commission_amount) as seller_product_net,
                CASE WHEN o.subtotal > 0
                  THEN ROUND(o.shipping_cost * (SUM(oi.total_price) / o.subtotal), 2)
                  ELSE 0
                END as seller_shipping
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE oi.seller_id = ?
           AND oi.settlement_status = 'pending'
           AND o.status = 'delivered'
           AND o.settlement_status = 'pending'
           AND (o.payment_method = 'cash' OR o.payment_status = 'paid')
         GROUP BY o.id
         ORDER BY o.id
         FOR UPDATE`,
        [organisationId],
      );

      if (!unsettledRows.length) {
        throw new ConflictError('No unsettled delivered orders for this organisation');
      }

      const unsettledOrders = unsettledRows as any[];

      // 2. Calculate per-order financials (per-seller slice)
      const settlementOrders: {
        orderId: number;
        productsPrice: number;
        shippingPrice: number;
        grossAmount: number;
        courtzonFee: number;
        organizationNet: number;
        paymentMethod: string | null;
      }[] = [];

      let totalGross = 0;
      let totalShipping = 0;
      let totalFee = 0;
      let totalOrgNet = 0;
      let codFeeTotal = 0;
      let onlineNetTotal = 0;

      for (const o of unsettledOrders) {
        const subtotal = Number(o.seller_subtotal || 0);
        const shipping = Number(o.seller_shipping || 0);
        const gross = subtotal + shipping;
        const fee = Number(o.seller_fee || 0);
        const orgNet = gross - fee;
        const paymentMethod = o.payment_method || 'online';
        const isCOD = paymentMethod === 'cash';

        settlementOrders.push({
          orderId: o.order_id,
          productsPrice: Math.round(subtotal * 100) / 100,
          shippingPrice: Math.round(shipping * 100) / 100,
          grossAmount: Math.round(gross * 100) / 100,
          courtzonFee: Math.round(fee * 100) / 100,
          organizationNet: Math.round(orgNet * 100) / 100,
          paymentMethod,
        });

        totalGross += gross;
        totalShipping += shipping;
        totalFee += fee;
        totalOrgNet += orgNet;

        if (isCOD) {
          codFeeTotal += fee;
        } else {
          onlineNetTotal += orgNet;
        }
      }

      // 3. Netting
      const settlementDirection = onlineNetTotal >= codFeeTotal ? 'courtzon_to_org' : 'org_to_courtzon';
      const finalAmount = Math.abs(onlineNetTotal - codFeeTotal);

      // 4. Create settlement record
      const orderIds = unsettledOrders.map((o: any) => o.order_id).sort((a: number, b: number) => a - b);
      const notes = `Marketplace Orders: ${orderIds.map((id: number) => `#${id}`).join(', ')}`;

      const [settlementResult] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO settlements (organisation_id, branch_id, settlement_status, requested_by, requested_by_role,
          settlement_period_start, settlement_period_end, notes)
         VALUES (?, ?, 'requested', ?, ?, ?, ?, ?)`,
        [organisationId, branchId ?? null, requestedBy ?? null, requestedByRole ?? null,
         null, null, notes],
      );
      const settlementId = settlementResult.insertId;

      // 5. Update totals
      await conn.execute(
        `UPDATE settlements SET
           gross_amount = ?, shipping_amount = ?, courtzon_fee = ?, organization_net = ?,
           cod_fee_total = ?, online_net_total = ?,
           settlement_direction = ?, final_amount = ?
         WHERE id = ?`,
        [Math.round(totalGross * 100) / 100, Math.round(totalShipping * 100) / 100,
         Math.round(totalFee * 100) / 100, Math.round(totalOrgNet * 100) / 100,
         Math.round(codFeeTotal * 100) / 100, Math.round(onlineNetTotal * 100) / 100,
         settlementDirection, Math.round(finalAmount * 100) / 100,
         settlementId],
      );

      // 6. Move to pending_approval
      await conn.execute(
        `UPDATE settlements SET settlement_status = 'pending_approval',
          calculating_started_at = NOW(), calculating_completed_at = NOW()
         WHERE id = ?`,
        [settlementId],
      );

      // 7. Create settlement_orders entries
      if (settlementOrders.length) {
        const placeholders = settlementOrders.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const params = settlementOrders.flatMap(so => [
          settlementId, so.orderId, so.productsPrice, so.shippingPrice,
          so.grossAmount, so.courtzonFee, so.organizationNet, so.paymentMethod ?? null,
        ]);
        await conn.execute(
          `INSERT INTO settlement_orders (settlement_id, order_id, products_price, shipping_price,
            gross_amount, courtzon_fee, organization_net, payment_method)
           VALUES ${placeholders}`,
          params,
        );
      }

      // 8. Mark only THIS seller's items as settled (not the whole order)
      const itemPlaceholders = orderIds.map(() => '?').join(',');
      await conn.execute(
        `UPDATE order_items SET settlement_status = 'settled'
         WHERE order_id IN (${itemPlaceholders}) AND seller_id = ?`,
        [...orderIds, organisationId],
      );

      // 9. Mark orders as settled ONLY if ALL their items are settled
      await conn.execute(
        `UPDATE orders o SET o.settlement_status = 'settled'
         WHERE o.id IN (${itemPlaceholders})
         AND NOT EXISTS (
           SELECT 1 FROM order_items oi
           WHERE oi.order_id = o.id AND oi.settlement_status = 'pending'
         )`,
        orderIds,
      );

      // 10. Create pending transfer record
      if (finalAmount > 0) {
        await conn.execute(
          `INSERT INTO settlement_transfers (settlement_id, transfer_direction, amount,
            transfer_status)
           VALUES (?, ?, ?, 'pending')`,
          [settlementId, settlementDirection, Math.round(finalAmount * 100) / 100],
        );
      }

      return settlementId;
    }).then(async (settlementId) => {
      return repo.getSettlementDetail(settlementId);
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
          type: 'settlement_payout',
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
      eventBus.emit('settlement:completed', {
        settlementId: data.settlementId,
        organisationId: 0,
        amount: 0,
      });
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
