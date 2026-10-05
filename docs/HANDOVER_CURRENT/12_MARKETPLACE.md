# 12 — MARKETPLACE AUDIT

**Audit:** 2026-10-04 · Sources: `modules/marketplace/*`, product/order schema, live counts (58 products, **0 orders**).

Legend: ✅ IMPLEMENTED · 🟡 PARTIAL · ⏳ NOT RUN · ❌ ISSUE · ❓ UNVERIFIED

---

## 1. Product lifecycle

- ✅ Product CRUD: `createProduct/updateProduct/deleteProduct` (+ player product variants via `createPlayerProduct`), visibility toggle, variants CRUD, admin approve/status (`adminUpdateProductStatus`), soft-delete (`products.deleted_at`).
- ✅ Statuses: `products.status` ENUM `draft|pending|active|sold|archived|out_of_stock`.
- ✅ Images: `product_images` (+ variant images); upload via `upload` module.

## 2. Inventory / stock

- ✅ Stock on product + variant (`quantity`, `reserved_quantity`); `min_stock_level`, `max_stock_level`.
- ✅ Cart reservation: `cart_items.reserved_until` + `reserved_quantity`; `addToCart`/`updateCartItem`.
- ✅ Warehouse inventory: `warehouses`/`inventory_logs`/`stock_transfers`/`purchase_orders`/`suppliers` (admin inventory UI).
- ❓ Overselling prevention: stock decrement on order insert depends on the checkout transaction (see $3). **FOR UPDATE not verified** → potential oversell under concurrency. (Risk; test required.)

## 3. Checkout / Orders

- ✅ `checkout(userId, data)` — splits per seller via `checkout_group_id` into multiple `orders`; coupon validation; `getCartSellerInfo`; address handling (`user_addresses`).
- ✅ Order statuses: `pending|confirmed|processing|shipped|delivered|cancelled|refunded` (+ `payment_status` unpaid/paid/refunded/partial_refund; `settlement_status` pending/settled).
- ✅ `order_status_history` audit; triggers write `audit_logs` on insert/status change.
- ✅ Abandoned carts/orders: `cancel_abandoned_orders` worker (5 min, 30-min timeout).
- ✅ Admin flows: adminListOrders, adminGetOrderDetail, admin sellers/reviews/upgrade requests.
- ❌ **Not exercised live:** `orders`=0 — checkout→payment→fulfillment→settlement chain never ran end-to-end.

## 4. Payment

- ✅ `marketplace-payment.listener.ts` on `payment:succeeded`/`payment:failed` → `handlePaymentSucceeded`/`handlePaymentFailed` (order status updates, inventory finalization).
- ✅ COD/online via `payment_method` + `cash_holder` (org/courtzon) custody.
- ✅ Partial refund calc (`marketplace-refund-calc.ts`) + settlement status updates.

## 5. Shipping / Fulfillment

- ✅ `seller_shipping_rates` (province/city dashboards), `checkShipping`, carrier/tracking fields.
- ✅ Order status screens (shipped/delivered) + complaint lifecycle (return requests, receipt confirmation, escalation).

## 6. Commission & seller payable

- ✅ `products.commission_rate` snapshot; `orders.commission_amount`/`courtzon_fee`; `marketplace-entitlement-calc.ts` (ORGANIZATION_EARNING formula: itemTotal − discount − commission + shipping).
- ✅ Settlements via `requestSettlement`, `getSettlementsByUser`/`getSettlementBalanceByUser` → unified settlement engine (🟡 never run, see 11).
- ✅ `marketplace_ledger_entries` postings (entry_type ENUM inventory_deduction/due_to_collect/due_to_transfer/due_to_courtzon/reversal/refund).
- ✅ Gateway fee: computed in order economics (gateway fees evaluated at confirmation).

## 7. Complaints & recovery

- ✅ `marketplace_complaint` module: submit, staff approval, admin decision, return-required, refund-executed, collection escalation; complaint period config (7 days default).
- ✅ Workers: `complaint_period_activation`, `complaint_receipt_timeout` (10 min), `complaint_collection_escalation` (15 min).
- ⏳ **0 complaints live** — complaint economics & recovery untested.

## 8. Known issues / gaps

- ❌ Orders/settlement never executed (data gap).
- ❓ Concurrent stock purchase race (no verified FOR UPDATE).
- ❓ Partial-refund flows beyond calc (amounts) — full UI journey untested.
- 🟡 `cash_holder` default `org` for cash/COD: business rule confirmed? (⚖️ owner).
- 🟡 Commission override per product vs seller plan (`seller_profiles.is_subscribed`, `max_free_listings=5`) — free-listing enforcement ❓.
- ❌ No trial/grace for seller plan (org subscription only).

## 9. Business questions
1. Shipment responsibility for org vs player sellers (carrier/track mandatory?).
2. Commission policy: fixed % per category? Overflows for org-owned seller.
3. COD custody: org always holds cash? Gateway-fee allocation on refunds?