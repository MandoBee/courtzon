/**
 * Pure per-item marketplace refund/dispute value calculation. No DB/event-bus
 * imports — unit-testable in isolation.
 *
 * Uses only immutable checkout snapshots (never live catalog prices):
 *   - item value     = order_items.total_price (or unit_price × disputed_quantity)
 *   - discount share = order.discount_amount × (item_total / order.subtotal)
 *   - shipping share = order.shipping_cost × (disputed_items_total / order.subtotal)
 *   - tax share      = order.tax_amount × (disputed_items_total / order.subtotal)
 *
 * Total disputed value = Σ item values + shipping share + tax share
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface RefundItemInput {
  itemId: number;
  itemTotal: number;      // order_items.total_price snapshot (unit_price × qty)
  unitPrice: number;      // order_items.unit_price snapshot
  commissionAmount: number; // order_items.commission_amount snapshot
  quantity: number;       // order_items.quantity snapshot
  disputedQuantity?: number; // 0/undefined = full item dispute
}

export interface RefundItemDetail {
  itemId: number;
  itemValue: number;          // disputed value of the item itself
  allocatedDiscount: number;  // discount share allocated to this item
  allocatedShipping: number;  // shipping share allocated to this item
  allocatedTax: number;       // tax share allocated to this item
  itemOrgEarning: number;     // org net share being refunded (product − discount − commission + shipping + tax)
  itemCommission: number;     // commission being reversed for this item
  isFullDispute: boolean;
  disputedQuantity: number;
}

export interface RefundCalcResult {
  disputedValue: number;          // total refundable amount to the buyer
  refundableOrgEarning: number;   // total org net being reversed across items
  refundableCommission: number;   // total commission being reversed across items
  refundRatio: number;            // disputedValue / (orgEarning + commission) — basis for the 125% approval threshold
  itemDetails: RefundItemDetail[];
}

/**
 * Computes the split of a manual refund between the organisation and CourtZon
 * based on the HISTORICAL financial snapshot (original commission + disputed
 * value). CourtZon's commission is reversed proportionally to the refunded
 * portion of the original disputed value and NEVER exceeds the original
 * commission. The organisation absorbs the full refund minus the reversed
 * commission (including any additional compensation above the disputed value).
 *
 *   refundPortion      = min(1, refundAmount / disputedValue)
 *   commissionReversal = min(originalCommission, originalCommission × refundPortion)
 *   orgAdjustment      = refundAmount − commissionReversal
 *
 * Examples (original: org earning 900, commission 100, disputed 1000):
 *   full refund 1000 → org −900, courtzon −100
 *   partial 500     → org −450, courtzon −50
 *   above original 1200 → org −1100, courtzon −100 (extra 200 is org-only)
 */
export interface RefundFinancials {
  refundPortion: number;        // 0..1 portion of disputed value refunded
  commissionReversal: number;   // CourtZon commission reversal (never > originalCommission)
  orgAdjustment: number;        // organisation adjustment magnitude (refund − commissionReversal)
  isFullRefund: boolean;        // refundAmount >= disputedValue
  extraCompensation: number;    // max(0, refundAmount − disputedValue)
}

export function computeRefundFinancials(
  refundAmount: number,
  disputedValue: number,
  originalCommission: number,
): RefundFinancials {
  if (refundAmount < 0) throw new Error('Refund amount cannot be negative');
  if (disputedValue <= 0) throw new Error('Disputed value must be positive');
  if (originalCommission < 0) throw new Error('Original commission cannot be negative');

  const refundPortion = Math.min(1, refundAmount / disputedValue);
  const commissionReversal = round2(Math.min(originalCommission, originalCommission * refundPortion));
  const orgAdjustment = round2(refundAmount - commissionReversal);
  const isFullRefund = refundAmount >= disputedValue;
  const extraCompensation = round2(Math.max(0, refundAmount - disputedValue));

  return { refundPortion, commissionReversal, orgAdjustment, isFullRefund, extraCompensation };
}

/**
 * Cumulative-aware refund split for multi-refund support on a single order item.
 *
 * When a refund is executed, the available "original disputed value" and
 * "original commission" are reduced by every prior refund that touched the same
 * order item. This function splits the current refund into:
 *
 *   - originalValuePortion   = the part attributable to the remaining original
 *                              disputed value (never exceeds the remaining value)
 *   - additionalCompensation = the part above the remaining original value
 *                              (org-only, never reverses CourtZon commission)
 *
 * The original-value portion is split proportionally per the HISTORICAL split:
 *   orgOriginalReversal = originalValuePortion × (orgEarning / (orgEarning+commission))
 *   commissionReversal  = originalValuePortion × (commission / (orgEarning+commission))
 *
 * Both reversals are additionally capped by the REMAINING capacity (original
 * minus the absolute sum of all prior adjustments of that type for this item),
 * so multiple refunds can never reverse more than the original amounts.
 *
 * Conceptually (per requirements):
 *   remainingOriginalDisputedValue = originalValue − priorOriginalValueReversed
 *   originalValuePortion           = min(currentRefund, remainingOriginalDisputedValue)
 *   additionalCompensation         = max(0, currentRefund − remainingOriginalDisputedValue)
 *   commissionReversal             = min(originalCommission − priorCommission,
 *                                       originalValuePortion × commissionRatio)
 *   orgOriginalReversal            = min(originalOrgEarning − priorOrgOriginalReversal,
 *                                       originalValuePortion × orgRatio)
 *   orgAdjustment                  = orgOriginalReversal + additionalCompensation
 */
export interface CumulativeRefundFinancials {
  originalValuePortion: number;      // portion of refund attributable to remaining original value
  additionalCompensation: number;    // portion above remaining original value (org-only)
  commissionReversal: number;        // CourtZon commission reversal for THIS refund (never exceeds remaining)
  orgOriginalReversal: number;       // org reversal of original value for THIS refund
  orgAdjustment: number;             // total org adjustment magnitude (orgOriginalReversal + additionalCompensation)
}

export function computeCumulativeRefundFinancials(
  refundAmount: number,
  originalOrgEarning: number,
  originalCommission: number,
  originalDisputedValue: number,
  priorOrgOriginalReversal: number,
  priorCommissionReversal: number,
): CumulativeRefundFinancials {
  if (refundAmount < 0) throw new Error('Refund amount cannot be negative');
  if (originalOrgEarning < 0 || originalCommission < 0 || originalDisputedValue <= 0) {
    throw new Error('Original financial values must be positive');
  }

  const orgRatio = originalOrgEarning + originalCommission > 0
    ? originalOrgEarning / (originalOrgEarning + originalCommission)
    : 0;
  const commissionRatio = 1 - orgRatio;

  const remainingCommission = Math.max(0, originalCommission - priorCommissionReversal);
  const remainingOrg = Math.max(0, originalOrgEarning - priorOrgOriginalReversal);

  // Remaining original disputed value = what hasn't been reversed as original value yet.
  const priorOriginalValueReversed = priorOrgOriginalReversal + priorCommissionReversal;
  const remainingOriginalValue = Math.max(0, originalDisputedValue - priorOriginalValueReversed);

  const originalValuePortion = round2(Math.min(refundAmount, remainingOriginalValue));
  const additionalCompensation = round2(Math.max(0, refundAmount - remainingOriginalValue));

  // Split the original-value portion per the historical ratio, then cap by remaining capacity.
  const commissionReversal = round2(Math.min(
    remainingCommission,
    originalValuePortion * commissionRatio,
  ));
  const orgOriginalReversal = round2(Math.min(
    remainingOrg,
    originalValuePortion * orgRatio,
  ));

  const orgAdjustment = round2(orgOriginalReversal + additionalCompensation);

  return { originalValuePortion, additionalCompensation, commissionReversal, orgOriginalReversal, orgAdjustment };
}

/**
 * Computes the system-determined disputed/refundable value for a set of disputed
 * order items. Pass the disputed items; non-disputed items should be excluded by
 * the caller.
 */
export function calculateDisputedValue(
  order: { id: number; subtotal: number; discount_amount: number; shipping_cost: number; tax_amount: number; total: number },
  items: RefundItemInput[],
): RefundCalcResult {
  const subtotal = Number(order.subtotal || 0);
  const discount = Number(order.discount_amount || 0);
  const shipping = Number(order.shipping_cost || 0);
  const tax = Number(order.tax_amount || 0);

  const details: RefundItemDetail[] = [];
  let disputedItemsTotal = 0;

  for (const item of items) {
    const itemTotal = Number(item.itemTotal || 0);
    const disputedQty = Math.max(0, Number(item.disputedQuantity ?? 0));
    const isFull = disputedQty <= 0 || disputedQty >= Number(item.quantity || 1);
    const itemValue = isFull
      ? itemTotal
      : round2((Number(item.unitPrice || 0) * Math.min(disputedQty, Number(item.quantity || 0))));

    disputedItemsTotal += itemValue;

    const share = subtotal > 0 ? itemValue / subtotal : 0;
    const allocatedDiscount = round2(discount * share);
    const allocatedShipping = round2(shipping * share);
    const allocatedTax = round2(tax * share);
    const itemCommission = isFull ? Number(item.commissionAmount || 0) : 0;
    const itemOrgEarning = round2((itemValue - allocatedDiscount - itemCommission) + allocatedShipping + allocatedTax);

    details.push({
      itemId: item.itemId,
      itemValue,
      allocatedDiscount,
      allocatedShipping,
      allocatedTax,
      itemOrgEarning,
      itemCommission,
      isFullDispute: isFull,
      disputedQuantity: disputedQty,
    });
  }

  const refundableOrgEarning = round2(details.reduce((sum, d) => sum + d.itemOrgEarning, 0));
  const refundableCommission = round2(details.reduce((sum, d) => sum + d.itemCommission, 0));
  const disputedValue = round2(details.reduce((sum, d) => sum + d.itemValue + d.allocatedShipping + d.allocatedTax, 0));

  const refundableTotal = refundableOrgEarning + refundableCommission;
  const refundRatio = refundableTotal > 0 ? disputedValue / refundableTotal : 0;

  return {
    disputedValue,
    refundableOrgEarning,
    refundableCommission,
    refundRatio,
    itemDetails: details,
  };
}