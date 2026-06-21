-- ============================================================================
-- COURTZON-V2 : Order Financials — proper accounting model
-- Tracks CourtZon commission, org product share, org shipping share,
-- cash holder, collection status, and settlement status per order.
-- See docs/accounting-model.md for the full specification.
-- ============================================================================

USE courtzon_v2;

ALTER TABLE orders
  ADD COLUMN courtzon_commission   DECIMAL(12,2) NOT NULL DEFAULT 0.00
    COMMENT 'CourtZon commission due on this order (same as commission_amount)'
    AFTER commission_amount,

  ADD COLUMN org_product_share     DECIMAL(12,2) NOT NULL DEFAULT 0.00
    COMMENT 'Org revenue from products = subtotal - discount - commission'
    AFTER courtzon_commission,

  ADD COLUMN org_shipping_share    DECIMAL(12,2) NOT NULL DEFAULT 0.00
    COMMENT 'Org revenue from shipping = shipping_cost'
    AFTER org_product_share,

  ADD COLUMN cash_holder           ENUM('org','courtzon') DEFAULT NULL
    COMMENT 'Who collects/collected the cash: org (COD) or courtzon (online/wallet)'
    AFTER payment_method,

  ADD COLUMN cash_collection_status ENUM(
    'expected_from_customer',
    'under_collection',
    'held_by_org',
    'held_by_courtzon'
  ) DEFAULT NULL
    COMMENT 'Current status of the cash collection lifecycle'
    AFTER cash_holder,

  ADD COLUMN settlement_status     ENUM('pending','settled') NOT NULL DEFAULT 'pending'
    COMMENT 'Settlement status between CourtZon and the organisation'
    AFTER cash_collection_status;
