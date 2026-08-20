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