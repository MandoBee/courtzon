/**
 * Pure per-item marketplace entitlement calculation. No DB/event-bus imports —
 * unit-testable in isolation.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Computes per-item ORGANIZATION_EARNING and COURTZON_COMMISSION amounts from the
 * immutable checkout snapshots. Order-level discount/shipping/tax are allocated
 * proportionally per item (same convention as settlement shipping allocation).
 *
 *   orgEarning = (itemTotal − itemDiscount − itemCommission) + itemShipping + itemTax
 *
 * Summed across items this equals `order.total − courtzon_fee` (within rounding).
 */
export function buildEntitlementInputs(order: any, items: any[], collector?: 'courtzon' | 'org'): any[] {
  const currency = order.currency_code || 'EGP';
  const subtotal = Number(order.subtotal || 0);
  const discount = Number(order.discount_amount || 0);
  const shipping = Number(order.shipping_cost || 0);
  const tax = Number(order.tax_amount || 0);

  const inputs: any[] = [];
  const shares = items.map((item) => {
    const itemTotal = Number(item.item_total || 0);
    return subtotal > 0 ? itemTotal / subtotal : 0;
  });
  const shareSum = shares.reduce((a, b) => a + b, 0);

  items.forEach((item, idx) => {
    const itemTotal = Number(item.item_total || 0);
    const itemCommission = Number(item.commission_amount || 0);
    const share = shareSum > 0 ? shares[idx] / shareSum : 0;

    const itemDiscount = round2(discount * share);
    const itemShipping = round2(shipping * share);
    const itemTax = round2(tax * share);

    const orgEarning = round2((itemTotal - itemDiscount - itemCommission) + itemShipping + itemTax);

    const metadata = {
      orderId: order.id,
      itemId: item.item_id,
      productId: item.product_id,
      sellerId: item.item_seller_id,
      unitPrice: Number(item.unit_price || 0),
      quantity: Number(item.quantity || 0),
      itemTotal,
      commissionAmount: itemCommission,
      allocatedDiscount: itemDiscount,
      allocatedShipping: itemShipping,
      allocatedTax: itemTax,
      orderTotal: Number(order.total || 0),
      courtzonFee: Number(order.courtzon_fee || 0),
    };

    if (orgEarning > 0) {
      inputs.push({
        organisationId: item.item_seller_id,
        branchId: item.branch_id ?? null,
        entitlementType: 'ORGANIZATION_EARNING',
        sourceType: 'marketplace',
        sourceId: item.item_id,
        collector,
        amount: orgEarning,
        currency,
        availableAt: null,
        description: `Order #${order.id} item #${item.item_id} — org earning`,
        metadata,
      });
    }

    if (itemCommission > 0) {
      inputs.push({
        organisationId: item.item_seller_id,
        branchId: item.branch_id ?? null,
        entitlementType: 'COURTZON_COMMISSION',
        sourceType: 'marketplace',
        sourceId: item.item_id,
        collector,
        amount: itemCommission,
        currency,
        availableAt: null,
        description: `Order #${order.id} item #${item.item_id} — CourtZon commission`,
        metadata,
      });
    }
  });

  return inputs;
}