import { settlementRepository as repo } from '../infrastructure/repositories/settlement.repository.js';
import { marketplaceRepository as marketRepo } from '../../marketplace/infrastructure/repositories/marketplace.repository.js';
import { transactionRepository } from '../../financial/infrastructure/transaction.repository.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../../shared/errors/app-error.js';

export const settlementService = {

  // ── Request + Calculate (combined: calculation is immediate) ──

  async requestSettlement(data: {
    organisationId: number;
    branchId?: number | null;
    requestedBy: number;
    requestedByRole: string;
  }) {
    const { organisationId, branchId, requestedBy, requestedByRole } = data;

    // 1. Get all unsettled delivered orders for this org
    const unsettledOrders = await marketRepo.getUnsettledOrders(organisationId);
    if (!unsettledOrders.length) {
      throw new ConflictError('No unsettled delivered orders for this organisation');
    }

    // 2. Calculate per-order financials
    const codOrders: any[] = [];
    const onlineOrders: any[] = [];
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

    for (const o of unsettledOrders as any) {
      const subtotal = Number(o.subtotal || 0);
      const shipping = Number(o.shipping_cost || 0);
      const gross = subtotal + shipping;
      const fee = Number(o.courtzon_fee || o.courtzon_commission || 0);
      const orgNet = gross - fee;
      const paymentMethod = o.payment_method || 'online';
      const isCOD = paymentMethod === 'cash';

      settlementOrders.push({
        orderId: o.order_id,
        productsPrice: subtotal,
        shippingPrice: shipping,
        grossAmount: gross,
        courtzonFee: fee,
        organizationNet: orgNet,
        paymentMethod,
      });

      totalGross += gross;
      totalShipping += shipping;
      totalFee += fee;
      totalOrgNet += orgNet;

      if (isCOD) {
        codOrders.push(o);
        codFeeTotal += fee;
      } else {
        onlineOrders.push(o);
        onlineNetTotal += orgNet;
      }
    }

    // 3. Netting
    //   COD: org collected cash → org owes CourtZon the fee
    //   Online: CourtZon collected cash → CourtZon owes org the net
    const settlementDirection = onlineNetTotal >= codFeeTotal ? 'courtzon_to_org' : 'org_to_courtzon';
    const finalAmount = Math.abs(onlineNetTotal - codFeeTotal);

    // 4. Create settlement record with notes
    const orderIds = unsettledOrders.map((o: any) => o.order_id).sort((a: number, b: number) => a - b);
    const notes = `Marketplace Orders: ${orderIds.map((id: number) => `#${id}`).join(', ')}`;
    const settlementId = await repo.requestSettlement({
      organisationId,
      branchId,
      requestedBy,
      requestedByRole,
      notes,
    });

    // 5. Update totals
    await repo.updateSettlementTotals(settlementId, {
      grossAmount: Math.round(totalGross * 100) / 100,
      shippingAmount: Math.round(totalShipping * 100) / 100,
      courtzonFee: Math.round(totalFee * 100) / 100,
      organizationNet: Math.round(totalOrgNet * 100) / 100,
      codFeeTotal: Math.round(codFeeTotal * 100) / 100,
      onlineNetTotal: Math.round(onlineNetTotal * 100) / 100,
      settlementDirection,
      finalAmount: Math.round(finalAmount * 100) / 100,
    });

    // 6. Move to calculating then immediately to pending_approval
    await repo.updateSettlementStatus(settlementId, 'calculating');
    await repo.updateSettlementStatus(settlementId, 'pending_approval', {
      calculating_started_at: new Date(),
      calculating_completed_at: new Date(),
    });

    // 7. Create settlement_orders entries
    await repo.createSettlementOrders(
      settlementOrders.map(so => ({ ...so, settlementId }))
    );

    // 8. Mark orders as settled
    await repo.markOrdersSettled(orderIds);

    // 9. Create double-entry pending transfer
    if (finalAmount > 0) {
      await repo.createSettlementTransfer({
        settlementId,
        direction: settlementDirection,
        amount: finalAmount,
      });
    }

    // 10. Return full detail
    return repo.getSettlementDetail(settlementId);
  },

  // ── Approve ──

  async approveSettlement(settlementId: number, approvedBy?: number, notes?: string) {
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

    // Snapshot bank account if provided
    if (bankAccountId) {
      const bankAccount = await repo.getBankAccount(bankAccountId);
      if (bankAccount) {
        await repo.updateSettlementBankAccount(settlementId, bankAccountId, bankAccount);
      }
    }

    await repo.updateSettlementStatus(settlementId, 'paid', { paid_at: new Date() });

    // Create double-entry transactions for the actual payout
    const finalAmount = Number(settlement.final_amount || 0);
    const direction = settlement.settlement_direction;

    if (finalAmount > 0 && direction) {
      const txnId = await transactionRepository.createTransaction({
        type: 'settlement_payout',
        sourceType: 'settlement',
        sourceId: settlementId,
        totalAmount: finalAmount,
        status: 'completed',
      });

      if (direction === 'courtzon_to_org') {
        // CourtZon pays org: Debit platform, Credit branch
        await transactionRepository.createEntries([
          {
            transactionId: txnId,
            side: 'debit',
            entityType: 'platform_account',
            entityId: 2,
            amount: finalAmount,
            description: `Settlement #${settlementId}: CourtZon pays org`,
          },
          {
            transactionId: txnId,
            side: 'credit',
            entityType: 'branch',
            entityId: 0,
            amount: finalAmount,
            organisationId: settlement.organisation_id,
            description: `Settlement #${settlementId}: Org receives from CourtZon`,
          },
        ]);
      } else {
        // Org pays CourtZon: Debit branch, Credit platform
        await transactionRepository.createEntries([
          {
            transactionId: txnId,
            side: 'debit',
            entityType: 'branch',
            entityId: 0,
            amount: finalAmount,
            organisationId: settlement.organisation_id,
            description: `Settlement #${settlementId}: Org pays CourtZon fee`,
          },
          {
            transactionId: txnId,
            side: 'credit',
            entityType: 'platform_account',
            entityId: 2,
            amount: finalAmount,
            description: `Settlement #${settlementId}: CourtZon receives from org`,
          },
        ]);
      }

      // Update transfer record if one exists
      if (transferReference) {
        const [transfers] = await repo.getSettlementDetail(settlementId).then(d => d?.transfers || []);
        if (transfers?.length) {
          await repo.updateTransferStatus((transfers[0] as any).id, 'completed');
        }
      }
    }

    return repo.getSettlementDetail(settlementId);
  },

  // ── Complete ──

  async completeSettlement(settlementId: number) {
    const settlement = await repo.findSettlementById(settlementId);
    if (!settlement) throw new NotFoundError('Settlement');
    if (settlement.settlement_status !== 'paid') {
      throw new ConflictError(`Cannot complete settlement in status "${settlement.settlement_status}"`);
    }

    await repo.updateSettlementStatus(settlementId, 'completed', { completed_at: new Date() });
    return repo.getSettlementDetail(settlementId);
  },

  // ── Reject ──

  async rejectSettlement(settlementId: number, reason: string) {
    const settlement = await repo.findSettlementById(settlementId);
    if (!settlement) throw new NotFoundError('Settlement');
    if (!['pending_approval', 'approved'].includes(settlement.settlement_status)) {
      throw new ConflictError(`Cannot reject settlement in status "${settlement.settlement_status}"`);
    }

    await repo.updateSettlementStatus(settlementId, 'rejected', {
      rejected_at: new Date(),
      rejected_reason: reason,
    });

    return repo.getSettlementDetail(settlementId);
  },

  // ── Cancel ──

  async cancelSettlement(settlementId: number, reason?: string) {
    const settlement = await repo.findSettlementById(settlementId);
    if (!settlement) throw new NotFoundError('Settlement');
    if (!['requested', 'calculating', 'pending_approval'].includes(settlement.settlement_status)) {
      throw new ConflictError(`Cannot cancel settlement in status "${settlement.settlement_status}"`);
    }

    await repo.updateSettlementStatus(settlementId, 'cancelled', {
      rejected_at: new Date(),
      rejected_reason: reason || 'Cancelled by user',
    });

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
