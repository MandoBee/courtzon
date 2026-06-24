-- ============================================================================
-- COURTZON-V2 : PAYMENT METHODS + PLAN ORG TYPE LINK + CLEANUP
-- ============================================================================

USE courtzon_v2;

-- ============================================================================
-- SECTION 1: PAYMENT METHODS TABLE
-- ============================================================================

CREATE TABLE payment_methods (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug                VARCHAR(50) NOT NULL UNIQUE,
  name                VARCHAR(100) NOT NULL,
  icon                VARCHAR(50) DEFAULT NULL COMMENT 'emoji or icon class',
  description         TEXT DEFAULT NULL,
  processing_fee_pct  DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT 'percentage fee',
  processing_fee_fixed DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'fixed fee amount',
  requires_approval   TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'admin must approve org before use',
  is_active           TINYINT(1) NOT NULL DEFAULT 1,
  sort_order          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Seed payment methods
INSERT INTO payment_methods (slug, name, icon, description, processing_fee_pct, processing_fee_fixed, requires_approval, is_active, sort_order) VALUES
('wallet',       'CourtZon Wallet',   'wallet',  'Pay using your CourtZon wallet balance',                    0.00, 0.00, 0, 1, 1),
('cash',         'Cash on Delivery',  'cash',    'Pay with cash when you receive the product. Requires admin approval for sellers.', 0.00, 0.00, 1, 1, 2),
('card',         'Credit/Debit Card', 'card',    'Pay securely using Visa, Mastercard, or Mada',              2.50, 1.00, 0, 1, 3),
('bank_transfer','Bank Transfer',     'bank',    'Direct bank transfer. Manual verification required.',        0.00, 0.00, 0, 1, 4);

-- ============================================================================
-- SECTION 2: LINK PAYMENT GATEWAY CONFIG TO PAYMENT METHODS
-- ============================================================================

ALTER TABLE payment_gateway_config ADD COLUMN payment_method_id INT UNSIGNED DEFAULT NULL AFTER organisation_id,
  ADD CONSTRAINT fk_gateway_payment_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE;

-- ============================================================================
-- SECTION 3: LINK SUBSCRIPTION PLANS TO ORGANISATION TYPES
-- ============================================================================

ALTER TABLE subscription_plans ADD COLUMN org_type_id INT UNSIGNED DEFAULT NULL AFTER billing_cycle,
  ADD CONSTRAINT fk_plan_org_type FOREIGN KEY (org_type_id) REFERENCES organisation_types(id) ON DELETE SET NULL;

-- ============================================================================
-- SECTION 4: DROP DUPLICATE SELLER SUBSCRIPTIONS TABLE
-- ============================================================================

DROP TABLE IF EXISTS seller_subscriptions;
