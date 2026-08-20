import { getPool } from '../../../database/mysql.js';
import { withTransaction } from '../../../database/database.transaction.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../../shared/errors/app-error.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { marketplaceRepository } from '../infrastructure/repositories/marketplace.repository.js';
import { marketplaceComplaintRepository, type ComplaintRecord } from '../infrastructure/repositories/marketplace-complaint.repository.js';
import { financialEntitlementService } from '../../financial/application/financial-entitlement.service.js';
import { walletRepository } from '../../wallet/infrastructure/repositories/wallet.repository.js';
import { calculateDisputedValue, computeRefundFinancials } from '../../financial/application/marketplace-refund-calc.js';
import {
  assertComplaintTransition,
  classifyRefund,
  complaintTypeRequiresReturn,
  isTerminalComplaint,
  MAX_COMPLAINT_ATTEMPTS,
  RECEIPT_CONFIRMATION_DAYS,
  validateComplaintInput,
  type ComplaintStatus,
  type ComplaintType,
  type ResolutionType,
} from '../domain/complaint-aggregate.js';

const log = createModuleLogger('marketplace-complaint');

type RowData = import('mysql2/promise').RowDataPacket[];

const round2 = (n: number) => Math.round(n * 100) / 100;

interface ComplaintDetail extends ComplaintRecord {
  order?: any;
  item?: any;
}

export const marketplaceComplaintService = {
  // ── Eligibility helper ──

  async getComplaintWindowDays(): Promise<number> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT complaint_period_days, is_active FROM marketplace_complaint_config WHERE id = 1',
    );
    if (!rows.length) return 0;
    const cfg = rows[0] as any;
    return cfg.is_active ? Number(cfg.complaint_period_days || 0) : 0;
  },

  /**
   * A complaint is eligible only for a delivered order whose complaint window
   * (delivered_at + complaint_period_days) has not yet passed.
   */
  async assertComplaintEligible(orderId: number, orderItemId: number, buyerId: number): Promise<{ order: any; item: any }> {
    const rows = await marketplaceRepository.findOrderById(orderId);
    if (!rows?.length) throw new NotFoundError('Order not found');

    const order = rows[0] as any;
    if (order.buyer_id !== buyerId) throw new ForbiddenError('This order does not belong to you');

    if (order.status !== 'delivered') {
      throw new ConflictError('Complaints are only allowed for delivered orders');
    }

    const windowDays = await this.getComplaintWindowDays();
    if (windowDays > 0) {
      const deliveredAt = order.delivered_at ? new Date(order.delivered_at).getTime() : null;
      if (!deliveredAt) throw new ConflictError('Delivery timestamp missing — complaint not allowed');
      const windowEnd = deliveredAt + windowDays * 24 * 60 * 60 * 1000;
      if (Date.now() > windowEnd) {
        throw new ConflictError('The complaint window for this order has passed');
      }
    }

    const item = (rows as any[]).find((r: any) => r.item_id === orderItemId);
    if (!item) throw new NotFoundError('Order item not found');
    if (!item.item_seller_id) throw new ConflictError('Order item has no seller organisation');

    return { order, item };
  },

  // ── Player: submit ──

  async submitComplaint(userId: number, data: {
    orderId: number; orderItemId: number; complaintType: ComplaintType; reason: string; images?: string[];
  }): Promise<ComplaintDetail> {
    const { order, item } = await this.assertComplaintEligible(data.orderId, data.orderItemId, userId);

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Lock the order item row to safely enforce the max-attempts rule.
      await conn.execute('SELECT id FROM order_items WHERE id = ? FOR UPDATE', [data.orderItemId]);
      const priorAttempts = await marketplaceComplaintRepository.countByOrderItem(data.orderItemId, conn);
      const attemptNumber = priorAttempts + 1;
      if (attemptNumber > MAX_COMPLAINT_ATTEMPTS) {
        throw new ConflictError(`You have reached the maximum of ${MAX_COMPLAINT_ATTEMPTS} complaint attempts for this item`);
      }

      const input = {
        orderId: order.id,
        orderItemId: data.orderItemId,
        productId: item.product_id,
        buyerId: userId,
        sellerOrgId: item.item_seller_id,
        complaintType: data.complaintType,
        reason: data.reason,
        images: data.images?.slice(0, 3),
        attemptNumber,
        createdBy: userId,
        disputedValue: 0,
      };

      // System-calculated original disputed value from the order snapshot.
      const calc = calculateDisputedValue(order, [{
        itemId: item.item_id,
        itemTotal: Number(item.item_total || 0),
        unitPrice: Number(item.unit_price || 0),
        commissionAmount: Number(item.commission_amount || 0),
        quantity: Number(item.quantity || 0),
      }]);
      input.disputedValue = calc.disputedValue;

      validateComplaintInput(input);

      const id = await marketplaceComplaintRepository.create(input, conn);

      // Hold the disputed item's entitlements (ON_HOLD) so funds are frozen.
      let heldIds: number[] = [];
      try {
        await financialEntitlementService.holdBySourceIds('marketplace', [data.orderItemId], `Complaint #${id}`);
        const held = await financialEntitlementService.getEntitlementsBySourceIds('marketplace', [data.orderItemId]);
        heldIds = held.filter((e) => e.status === 'ON_HOLD').map((e) => e.id);
      } catch (err: any) {
        log.warn({ err, complaintId: id, itemId: data.orderItemId }, 'Complaint entitlement hold skipped (none found)');
      }
      if (heldIds.length) {
        await conn.execute(
          'UPDATE marketplace_complaints SET entitlement_ids = ? WHERE id = ?',
          [JSON.stringify(heldIds), id],
        );
      }

      await conn.commit();
      conn.release();

      eventBusV2.emit('marketplace:complaint-submitted', {
        complaintId: id,
        orderId: order.id,
        orderItemId: data.orderItemId,
        buyerId: userId,
        sellerId: item.item_seller_id,
        productId: item.product_id,
        complaintType: data.complaintType,
        attemptNumber,
      });

      return this.getComplaintDetail(id);
    } catch (err) {
      await conn.rollback();
      conn.release();
      throw err;
    }
  },

  // ── Reads ──

  async getComplaintDetail(complaintId: number): Promise<ComplaintDetail> {
    const complaint = await marketplaceComplaintRepository.findById(complaintId);
    if (!complaint) throw new NotFoundError('Complaint not found');
    const rows = await marketplaceRepository.findOrderById(complaint.order_id);
    const order = rows?.[0] as any;
    const item = (rows as any[] || []).find((r: any) => r.item_id === complaint.order_item_id);
    return { ...complaint, order, item };
  },

  async getMyComplaints(userId: number, filters: { status?: ComplaintStatus; page: number; limit: number }) {
    const result = await marketplaceComplaintRepository.findByBuyer(userId, filters);
    const enriched: ComplaintDetail[] = [];
    for (const c of result.data) enriched.push(await this.getComplaintDetail(c.id));
    return { ...result, data: enriched };
  },

  async getOrgComplaints(orgUserId: number, filters: { status?: ComplaintStatus; page: number; limit: number }) {
    const org = await marketplaceRepository.findOrgByUserId(orgUserId, 'seller')
      || await marketplaceRepository.findOrgByUserId(orgUserId, 'player')
      || await marketplaceRepository.findOrgByUserScope(orgUserId);
    if (!org) throw new ForbiddenError('Not a seller');
    const result = await marketplaceComplaintRepository.findBySeller(org.id, filters);
    const enriched: ComplaintDetail[] = [];
    for (const c of result.data) enriched.push(await this.getComplaintDetail(c.id));
    return { ...result, org, data: enriched };
  },

  async getAdminApprovals(filters: { status?: ComplaintStatus; page: number; limit: number }) {
    const result = await marketplaceComplaintRepository.findPendingApprovals(filters);
    const enriched: ComplaintDetail[] = [];
    for (const c of result.data) enriched.push(await this.getComplaintDetail(c.id));
    return { ...result, data: enriched };
  },

  async assertOrgAccess(complaint: ComplaintRecord, orgUserId: number): Promise<void> {
    const org = await marketplaceRepository.findOrgByUserId(orgUserId, 'seller')
      || await marketplaceRepository.findOrgByUserId(orgUserId, 'player')
      || await marketplaceRepository.findOrgByUserScope(orgUserId);
    if (!org || org.id !== complaint.seller_org_id) {
      throw new ForbiddenError('This complaint does not belong to your organisation');
    }
  },

  // ── Org: review ──

  async reviewComplaint(orgUserId: number, complaintId: number): Promise<ComplaintDetail> {
    const complaint = await marketplaceComplaintRepository.findById(complaintId);
    if (!complaint) throw new NotFoundError('Complaint not found');
    await this.assertOrgAccess(complaint, orgUserId);
    assertComplaintTransition(complaint.status, 'in_review');
    await marketplaceComplaintRepository.updateStatus(complaintId, 'in_review', complaint.aggregate_version, {
      resolved_by: orgUserId,
    });
    return this.getComplaintDetail(complaintId);
  },

  // ── Org: resolve ──

  async resolveComplaint(orgUserId: number, complaintId: number, resolution: {
    resolutionType: ResolutionType;
    needsReturn?: boolean;
    refundAmount?: number;
    refundReason?: string;
    rejectionReason?: string;
  }): Promise<ComplaintDetail> {
    const complaint = await marketplaceComplaintRepository.findById(complaintId);
    if (!complaint) throw new NotFoundError('Complaint not found');
    await this.assertOrgAccess(complaint, orgUserId);

    if (['pending', 'in_review', 'awaiting_return'].includes(complaint.status) === false) {
      throw new ConflictError(`Cannot resolve complaint in status ${complaint.status}`);
    }

    const { resolutionType } = resolution;

    if (resolutionType === 'rejected') {
      if (!resolution.rejectionReason || resolution.rejectionReason.trim().length < 3) {
        throw new ConflictError('A written rejection reason of at least 3 characters is required');
      }
      await this._transition(complaint, 'rejected', {
        resolution_type: 'rejected',
        rejected_reason: resolution.rejectionReason,
        resolved_by: orgUserId,
        resolved_at: new Date(),
      });
      eventBusV2.emit('marketplace:complaint-decision', {
        complaintId, orderId: complaint.order_id, buyerId: complaint.buyer_id, sellerId: complaint.seller_org_id,
        decision: 'rejected', reason: resolution.rejectionReason,
      });
      return this.getComplaintDetail(complaintId);
    }

    if (resolutionType === 'refund') {
      return this._handleRefundResolution(complaint, orgUserId, resolution);
    }

    // REPLACEMENT / RESHIPMENT
    const needsReturn = resolution.needsReturn ?? complaintTypeRequiresReturn(complaint.complaint_type);
    if (needsReturn) {
      await this._transition(complaint, 'awaiting_return', {
        resolution_type: resolutionType,
        needs_return: true,
        collection_status: 'pending',
        collection_due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        resolved_by: orgUserId,
      });
      eventBusV2.emit('marketplace:complaint-return-required', {
        complaintId, orderId: complaint.order_id, buyerId: complaint.buyer_id, sellerId: complaint.seller_org_id,
        resolutionType, dueAt: complaint.collection_due_at,
      });
      return this.getComplaintDetail(complaintId);
    }

    // No return needed → record shipment immediately.
    await this.recordShipment(orgUserId, complaintId, resolutionType as 'replacement' | 'reshipment', complaint);
    return this.getComplaintDetail(complaintId);
  },

  async _handleRefundResolution(complaint: ComplaintRecord, orgUserId: number, resolution: {
    refundAmount?: number; refundReason?: string; needsReturn?: boolean;
  }): Promise<ComplaintDetail> {
    const refundAmount = round2(Number(resolution.refundAmount || 0));
    if (refundAmount <= 0) throw new ConflictError('Refund amount must be greater than zero');

    const needsReturn = resolution.needsReturn ?? complaintTypeRequiresReturn(complaint.complaint_type);
    if (needsReturn) {
      await this._transition(complaint, 'awaiting_return', {
        resolution_type: 'refund',
        needs_return: true,
        collection_status: 'pending',
        collection_due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        resolved_by: orgUserId,
      });
      eventBusV2.emit('marketplace:complaint-return-required', {
        complaintId: complaint.id, orderId: complaint.order_id, buyerId: complaint.buyer_id,
        sellerId: complaint.seller_org_id, resolutionType: 'refund',
      });
      return this.getComplaintDetail(complaint.id);
    }

    const decision = classifyRefund(refundAmount, complaint.disputed_value);

    if (decision.status === 'needs_approval') {
      await this._transition(complaint, 'refund_pending_approval', {
        resolution_type: 'refund',
        refund_amount: refundAmount,
        refund_ratio: decision.ratio,
        admin_approval_required: true,
        approval_status: 'pending',
        needs_return: false,
        resolved_by: orgUserId,
      });
      eventBusV2.emit('marketplace:complaint-admin-approval-required', {
        complaintId: complaint.id,
        orderId: complaint.order_id,
        buyerId: complaint.buyer_id,
        sellerId: complaint.seller_org_id,
        refundAmount,
        disputedValue: complaint.disputed_value,
        ratio: decision.ratio,
      });
      return this.getComplaintDetail(complaint.id);
    }

    if (decision.reasonRequired && (!resolution.refundReason || resolution.refundReason.trim().length < 3)) {
      throw new ConflictError('A written refund reason of at least 3 characters is required when the refund exceeds the original value');
    }

    await this._transition(complaint, 'refunded', {
      resolution_type: 'refund',
      refund_amount: refundAmount,
      refund_ratio: decision.ratio,
      refund_reason: decision.reasonRequired ? resolution.refundReason : null,
      needs_return: false,
      resolved_by: orgUserId,
      resolved_at: new Date(),
    });

    await this._executeRefund(complaint.id, refundAmount, complaint.disputed_value);

    eventBusV2.emit('marketplace:complaint-refund-executed', {
      complaintId: complaint.id,
      orderId: complaint.order_id,
      orderItemId: complaint.order_item_id,
      buyerId: complaint.buyer_id,
      sellerId: complaint.seller_org_id,
      refundAmount,
      disputedValue: complaint.disputed_value,
    });

    return this.getComplaintDetail(complaint.id);
  },

  // ── Org: collection (return before refund/replacement) ──

  async markCollected(orgUserId: number, complaintId: number, status: 'collected' | 'inspected'): Promise<ComplaintDetail> {
    const complaint = await marketplaceComplaintRepository.findById(complaintId);
    if (!complaint) throw new NotFoundError('Complaint not found');
    await this.assertOrgAccess(complaint, orgUserId);
    if (complaint.status !== 'awaiting_return') {
      throw new ConflictError(`Cannot collect return in status ${complaint.status}`);
    }
    await marketplaceComplaintRepository.updateFields(complaintId, {
      collection_status: status,
      collection_completed_at: status === 'collected' ? new Date() : complaint.collection_completed_at,
      resolved_by: orgUserId,
    });
    eventBusV2.emit('marketplace:complaint-return-status', {
      complaintId, orderId: complaint.order_id, buyerId: complaint.buyer_id,
      sellerId: complaint.seller_org_id, status,
    });
    return this.getComplaintDetail(complaintId);
  },

  // ── Org: record replacement/reshipment sent ──

  async recordShipment(
    orgUserId: number,
    complaintId: number,
    kind: 'replacement' | 'reshipment',
    existing?: ComplaintRecord,
  ): Promise<ComplaintDetail> {
    const complaint = existing ?? await marketplaceComplaintRepository.findById(complaintId);
    if (!complaint) throw new NotFoundError('Complaint not found');
    if (!existing) await this.assertOrgAccess(complaint, orgUserId);

    if (!['in_review', 'awaiting_return'].includes(complaint.status)) {
      throw new ConflictError(`Cannot record shipment in status ${complaint.status}`);
    }
    if (complaint.collection_status === 'pending') {
      throw new ConflictError('Return/collection must be completed before shipping a replacement');
    }

    const sentAt = new Date();
    const receiptDue = new Date(Date.now() + RECEIPT_CONFIRMATION_DAYS * 24 * 60 * 60 * 1000);
    const extra: Record<string, any> = {
      resolution_type: kind,
      receipt_awaited: true,
      receipt_due_at: receiptDue,
      resolved_by: orgUserId,
    };
    if (kind === 'replacement') extra.replacement_sent_at = sentAt;
    if (kind === 'reshipment') extra.reshipment_sent_at = sentAt;

    await this._transition(complaint, 'awaiting_confirmation', extra);

    eventBusV2.emit('marketplace:complaint-shipped', {
      complaintId,
      orderId: complaint.order_id,
      orderItemId: complaint.order_item_id,
      buyerId: complaint.buyer_id,
      sellerId: complaint.seller_org_id,
      kind,
      receiptDueAt: receiptDue,
    });
    eventBusV2.emit('marketplace:complaint-receipt-confirmation-required', {
      complaintId,
      orderId: complaint.order_id,
      buyerId: complaint.buyer_id,
      sellerId: complaint.seller_org_id,
      kind,
      receiptDueAt: receiptDue,
    });

    return this.getComplaintDetail(complaintId);
  },

  // ── Player: confirm receipt of replacement/reshipment ──

  async confirmReceipt(userId: number, complaintId: number): Promise<ComplaintDetail> {
    const complaint = await marketplaceComplaintRepository.findById(complaintId);
    if (!complaint) throw new NotFoundError('Complaint not found');
    if (complaint.buyer_id !== userId) throw new ForbiddenError('This complaint does not belong to you');
    if (complaint.status !== 'awaiting_confirmation') {
      throw new ConflictError(`Cannot confirm receipt in status ${complaint.status}`);
    }
    await marketplaceComplaintRepository.updateFields(complaintId, {
      receipt_confirmed_at: new Date(),
    });
    await this._transition(complaint, 'resolved', {
      resolved_at: new Date(),
      resolved_by: userId,
    });
    eventBusV2.emit('marketplace:complaint-receipt-confirmed', {
      complaintId,
      orderId: complaint.order_id,
      buyerId: userId,
      sellerId: complaint.seller_org_id,
      resolutionType: complaint.resolution_type,
    });
    return this.getComplaintDetail(complaintId);
  },

  // ── Admin: approve/reject >125% refund ──

  async approveRefund(adminUserId: number, complaintId: number, reason?: string): Promise<ComplaintDetail> {
    const complaint = await marketplaceComplaintRepository.findById(complaintId);
    if (!complaint) throw new NotFoundError('Complaint not found');
    if (complaint.status !== 'refund_pending_approval' || complaint.approval_status !== 'pending') {
      throw new ConflictError('Complaint is not awaiting admin approval');
    }
    const refundAmount = complaint.refund_amount != null ? Number(complaint.refund_amount) : 0;
    if (refundAmount <= 0) throw new ConflictError('No refund amount to approve');

    await this._transition(complaint, 'refunded', {
      approval_status: 'approved',
      approved_by: adminUserId,
      approved_at: new Date(),
      approval_reason: reason ?? null,
      resolved_by: adminUserId,
      resolved_at: new Date(),
    });

    await this._executeRefund(complaintId, refundAmount, complaint.disputed_value);

    eventBusV2.emit('marketplace:complaint-admin-decision', {
      complaintId,
      orderId: complaint.order_id,
      buyerId: complaint.buyer_id,
      sellerId: complaint.seller_org_id,
      decision: 'approved',
      refundAmount,
    });
    eventBusV2.emit('marketplace:complaint-refund-executed', {
      complaintId,
      orderId: complaint.order_id,
      orderItemId: complaint.order_item_id,
      buyerId: complaint.buyer_id,
      sellerId: complaint.seller_org_id,
      refundAmount,
      disputedValue: complaint.disputed_value,
    });

    return this.getComplaintDetail(complaintId);
  },

  async rejectApproval(adminUserId: number, complaintId: number, reason: string): Promise<ComplaintDetail> {
    const complaint = await marketplaceComplaintRepository.findById(complaintId);
    if (!complaint) throw new NotFoundError('Complaint not found');
    if (complaint.status !== 'refund_pending_approval' || complaint.approval_status !== 'pending') {
      throw new ConflictError('Complaint is not awaiting admin approval');
    }
    if (!reason || reason.trim().length < 3) {
      throw new ConflictError('A written rejection reason of at least 3 characters is required');
    }
    await this._transition(complaint, 'rejected', {
      approval_status: 'rejected',
      approved_by: adminUserId,
      approved_at: new Date(),
      approval_reason: reason,
      rejected_reason: reason,
      resolved_by: adminUserId,
      resolved_at: new Date(),
    });
    eventBusV2.emit('marketplace:complaint-admin-decision', {
      complaintId,
      orderId: complaint.order_id,
      buyerId: complaint.buyer_id,
      sellerId: complaint.seller_org_id,
      decision: 'rejected',
      reason,
    });
    return this.getComplaintDetail(complaintId);
  },

  // ── Internal: transition + refund execution ──

  /**
   * Scheduled escalation: when a complaint's collection deadline has passed and
   * the organisation has not completed collection, alert CourtZon staff for
   * manual intervention. The complaint stays OPEN and the disputed Financial
   * Entitlement stays ON_HOLD. Idempotent — each complaint escalates at most once.
   */
  async escalateOverdueCollections(batchSize: number = 100): Promise<number> {
    const due = await marketplaceComplaintRepository.findDueForCollectionEscalation(batchSize);
    let escalated = 0;
    for (const complaint of due) {
      const marked = await marketplaceComplaintRepository.markCollectionEscalated(complaint.id);
      if (!marked) continue; // another worker instance already escalated it
      escalated++;
      eventBusV2.emit('marketplace:complaint-collection-escalated', {
        complaintId: complaint.id,
        orderId: complaint.order_id,
        orderItemId: complaint.order_item_id,
        buyerId: complaint.buyer_id,
        sellerId: complaint.seller_org_id,
        collectionDueAt: complaint.collection_due_at,
      });
    }
    if (escalated > 0) {
      log.warn({ escalated }, 'Collection-deadline complaints escalated to CourtZon staff');
    }
    return escalated;
  },

  async _transition(complaint: ComplaintRecord, to: ComplaintStatus, extra?: Record<string, any>): Promise<void> {
    if (isTerminalComplaint(complaint.status)) {
      throw new ConflictError(`Complaint is already ${complaint.status}`);
    }
    assertComplaintTransition(complaint.status, to);
    await marketplaceComplaintRepository.updateStatus(complaint.id, to, complaint.aggregate_version, extra);
  },

  /**
   * Executes the refund once (idempotent): credits the buyer's wallet, records a
   * wallet transaction, and applies the proportional CourtZon commission reversal
   * + organisation adjustment without mutating the original entitlement amounts.
   */
  async _executeRefund(complaintId: number, refundAmount: number, disputedValue: number): Promise<void> {
    const complaint = await marketplaceComplaintRepository.findById(complaintId);
    if (!complaint) throw new NotFoundError('Complaint not found');

    const itemId = complaint.order_item_id;
    const buyerId = complaint.buyer_id;
    const orgId = complaint.seller_org_id;

    // Idempotency: never credit the wallet twice for the same complaint.
    const alreadyRefunded = await walletRepository.findTransactionsByReference('complaint', complaintId);
    if (alreadyRefunded.length > 0) {
      log.warn({ complaintId }, 'Complaint refund already executed — idempotent skip');
      return;
    }

    // Load the disputed item's entitlements (the historical financial source of truth).
    const entitlements = await financialEntitlementService.getEntitlementsBySourceIds('marketplace', [itemId]);
    const orgEarningEnt = entitlements.find((e) => e.entitlement_type === 'ORGANIZATION_EARNING');
    const commissionEnt = entitlements.find((e) => e.entitlement_type === 'COURTZON_COMMISSION');
    const currency = commissionEnt?.currency || orgEarningEnt?.currency || 'EGP';
    const branchId = orgEarningEnt?.branch_id ?? commissionEnt?.branch_id ?? null;

    // Historical original commission — NEVER recomputed from current config.
    const originalCommission = commissionEnt ? Number(commissionEnt.amount) : 0;
    // Historical original org earning (positive magnitude).
    const originalOrgEarning = orgEarningEnt ? Number(orgEarningEnt.amount) : 0;

    // Split the refund between org and CourtZon based on the historical snapshot.
    const fin = computeRefundFinancials(refundAmount, disputedValue, originalCommission);

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Credit the buyer's wallet.
      const wallet = await walletRepository.findByUserId(buyerId);
      if (!wallet) throw new ConflictError('Buyer wallet not found');
      const state = await walletRepository.lockAndGetBalance(wallet.id, conn);
      if (!state) throw new ConflictError('Buyer wallet is locked');
      const newBalance = state.balance + refundAmount;
      await walletRepository.updateBalance(wallet.id, newBalance, state.version, conn);
      await walletRepository.createTransaction({
        walletId: wallet.id,
        type: 'refund',
        amount: refundAmount,
        direction: 'credit',
        referenceType: 'complaint',
        referenceId: complaintId,
        description: `Refund for complaint #${complaintId}`,
      }, conn);

      // 2. Adjust/cancel the disputed entitlements + apply immutable financial adjustments.
      const adjustments: any[] = [];

      for (const ent of entitlements) {
        if (ent.status === 'SETTLED') {
          throw new ConflictError(`Cannot refund a settled entitlement (id ${ent.id}) — contact support`);
        }
        if (ent.status === 'CANCELLED') continue;
        // AVAILABLE/ON_HOLD(was-available): keep the original intact, add an adjustment later.
        if (ent.available_at != null) {
          if (ent.status === 'ON_HOLD') {
            await financialEntitlementService.releaseEntitlement(ent.id).catch(() => undefined);
          }
          continue;
        }
        // PENDING/ON_HOLD(never activated): a FULL refund cancels the PENDING
        // entitlement (consistent with Phase 1 booking behavior); partial refunds
        // leave it intact and are captured as adjustments below.
        if (fin.isFullRefund) {
          await financialEntitlementService.cancelEntitlement(ent.id, `Refund for complaint #${complaintId}`).catch((err: any) => {
            if (!String(err?.message || '').includes('version conflict')) throw err;
          });
        }
      }

      // Organisation adjustment: the org absorbs refund minus the reversed commission.
      if (fin.orgAdjustment > 0) {
        adjustments.push({
          organisationId: orgId,
          branchId,
          entitlementType: 'ORGANIZATION_ADJUSTMENT',
          sourceType: 'marketplace',
          sourceId: itemId,
          amount: -fin.orgAdjustment,
          currency,
          description: `Refund for complaint #${complaintId}`,
          metadata: {
            complaintId, direction: 'debit', disputedValue, itemId,
            refundAmount, commissionReversal: fin.commissionReversal,
            refundPortion: fin.refundPortion, extraCompensation: fin.extraCompensation,
          },
          createdBy: complaint.resolved_by ?? undefined,
        });
      }

      // CourtZon commission reversal: proportional to the refunded disputed value,
      // capped at the original commission. Additional compensation never reverses
      // CourtZon commission.
      if (fin.commissionReversal > 0) {
        adjustments.push({
          organisationId: orgId,
          branchId,
          entitlementType: 'COURTZON_ADJUSTMENT',
          sourceType: 'marketplace',
          sourceId: itemId,
          amount: -fin.commissionReversal,
          currency,
          description: `Commission reversal for complaint #${complaintId}`,
          metadata: {
            complaintId, direction: 'debit', disputedValue, itemId,
            refundAmount, originalCommission, refundPortion: fin.refundPortion,
            extraCompensation: fin.extraCompensation,
          },
          createdBy: complaint.resolved_by ?? undefined,
        });
      }

      if (adjustments.length) {
        await financialEntitlementService.createEntitlements(adjustments, conn);
      }

      // 3. Persist refund amounts on the complaint row (immutable snapshot of the executed refund).
      await conn.execute(
        `UPDATE marketplace_complaints
         SET refund_amount = ?, refund_ratio = ?
         WHERE id = ? AND (refund_amount IS NULL OR refund_amount = ?)`,
        [refundAmount, round2(refundAmount / (disputedValue || 1)), complaintId, refundAmount],
      );

      // 4. Emit payment refunded event (accounting engine listens for this).
      await eventBusV2.emit('payment:refunded', {
        paymentId: null,
        userId: buyerId,
        amount: refundAmount,
        reason: `Refund for complaint #${complaintId}`,
        referenceType: 'complaint',
        referenceId: complaintId,
        metadata: { complaintId, paymentMethod: 'wallet', commissionReversal: fin.commissionReversal, orgAdjustment: fin.orgAdjustment },
      }, undefined, conn);

      await conn.commit();
      conn.release();
    } catch (err) {
      await conn.rollback();
      conn.release();
      throw err;
    }

    eventBusV2.emit('wallet:transaction', {
      userId: buyerId,
      amount: refundAmount,
      type: 'refund',
      description: `Refund for complaint #${complaintId}`,
    });

    log.info({ complaintId, refundAmount, itemId, orgId, commissionReversal: fin.commissionReversal, orgAdjustment: fin.orgAdjustment }, 'Complaint refund executed');
  },
};