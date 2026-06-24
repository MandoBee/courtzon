-- ============================================================================
-- COURTZON-V2 : FINANCIAL ARCHITECTURE, SELLERS, FILE UPLOADS
-- Agreed 2026-05-19:
--   - Double-entry ledger (transaction_entries) replaces wallet_transactions
--     and financial_journal_entries
--   - platform_accounts for CourtZon float/commission/refund per currency
--   - transactions as payment header (replaces payment_transactions)
--   - Branch is the accounting unit; organisation_id denormalized for speed
--   - Seller as organisation_type, separate subscription plans
--   - File uploads stored as paths, not base64 in DB
-- ============================================================================

USE courtzon_v2;

-- ============================================================================
-- SECTION 1: SELLER ORGANISATION TYPE
-- ============================================================================

INSERT IGNORE INTO organisation_types (id, slug, is_active, sort_order) VALUES
(10, 'seller', TRUE, 5);

-- ============================================================================
-- SECTION 2: SUBSCRIPTION PLANS — ADD ORG TYPE SCOPE
-- ============================================================================

ALTER TABLE subscription_plans
  ADD COLUMN applicable_org_types JSON DEFAULT NULL COMMENT 'e.g. ["club","gym"] or ["seller"]'
  AFTER features;

-- Set existing plans (1-4) to all non-seller org types
UPDATE subscription_plans
SET applicable_org_types = '["club","gym","clinic","spa","wellness_center"]'
WHERE applicable_org_types IS NULL
  AND id IN (1,2,3,4);

-- ============================================================================
-- SECTION 3: SELLER SUBSCRIPTION PLANS
-- ============================================================================

INSERT IGNORE INTO subscription_plans (id, plan_name, billing_cycle, price, features, applicable_org_types, is_active) VALUES
(5, 'Seller Starter', 'monthly', 499.00,
 '{"products":50,"commission":"medium","support":"standard"}',
 '["seller"]', 1),
(6, 'Seller Pro', 'monthly', 999.00,
 '{"products":"unlimited","commission":"lowest","support":"priority","analytics":true}',
 '["seller"]', 1);

-- Seller Starter rates (7% marketplace commission)
INSERT IGNORE INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES
  (5, 'marketplace', 'percentage', 7.00);

-- Seller Pro rates (3% marketplace commission)
INSERT IGNORE INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES
  (6, 'marketplace', 'percentage', 3.00);

-- ============================================================================
-- SECTION 4: PLATFORM ACCOUNTS (CourtZon float/commission)
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_accounts (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  account_type    ENUM('float','commission','refund_hold','payout') NOT NULL,
  currency_id     TINYINT UNSIGNED NOT NULL,
  description     VARCHAR(255) DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_account (account_type, currency_id),
  CONSTRAINT fk_platform_currency FOREIGN KEY (currency_id) REFERENCES currencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed EGP accounts (currency_id=2)
INSERT IGNORE INTO platform_accounts (id, account_type, currency_id, description) VALUES
(1, 'float',       2, 'CourtZon main float account (EGP)'),
(2, 'commission',  2, 'CourtZon commission revenue (EGP)'),
(3, 'refund_hold', 2, 'CourtZon refund reserve (EGP)'),
(4, 'payout',      2, 'CourtZon org payout staging (EGP)');

-- ============================================================================
-- SECTION 5: TRANSACTIONS (payment header)
-- ============================================================================

CREATE TABLE IF NOT EXISTS transactions (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id       CHAR(36) DEFAULT NULL,
  type            ENUM('booking_payment','wallet_topup','refund','payout','marketplace_order','withdrawal') NOT NULL,
  source_type     ENUM('booking','academy','marketplace','admin','wallet') DEFAULT NULL,
  source_id       BIGINT UNSIGNED DEFAULT NULL,
  currency_id     TINYINT UNSIGNED DEFAULT NULL,
  total_amount    DECIMAL(14,2) NOT NULL,
  status          ENUM('pending','completed','reversed') NOT NULL DEFAULT 'pending',
  metadata        JSON DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_type (type),
  INDEX idx_source (source_type, source_id),
  INDEX idx_status (status),
  CONSTRAINT fk_txn_currency FOREIGN KEY (currency_id) REFERENCES currencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- SECTION 6: TRANSACTION ENTRIES (double-entry ledger)
-- ============================================================================

CREATE TABLE IF NOT EXISTS transaction_entries (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  transaction_id  BIGINT UNSIGNED NOT NULL,
  side            ENUM('debit','credit') NOT NULL,
  entity_type     ENUM('user_wallet','platform_account','branch') NOT NULL,
  entity_id       BIGINT UNSIGNED NOT NULL,
  amount          DECIMAL(14,2) NOT NULL,
  currency_id     TINYINT UNSIGNED DEFAULT NULL,
  branch_id       INT UNSIGNED DEFAULT NULL COMMENT 'Branch when entity is a branch (accounting unit)',
  organisation_id INT UNSIGNED DEFAULT NULL COMMENT 'Denormalized from branch for dashboard speed',
  description     TEXT DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_transaction (transaction_id),
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_branch (branch_id),
  INDEX idx_organisation (organisation_id),
  INDEX idx_created (created_at),
  CONSTRAINT fk_entry_txn FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  CONSTRAINT fk_entry_currency FOREIGN KEY (currency_id) REFERENCES currencies(id),
  CONSTRAINT fk_entry_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_entry_organisation FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- SECTION 7: BOOKINGS — ADD branch_id + BACKFILL
-- ============================================================================

ALTER TABLE bookings
  ADD COLUMN branch_id INT UNSIGNED DEFAULT NULL COMMENT 'Denormalized from resource for branch-level accounting'
  AFTER resource_id;

ALTER TABLE bookings
  ADD INDEX idx_branch (branch_id),
  ADD CONSTRAINT fk_booking_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- Backfill branch_id from the resource's branch
UPDATE bookings b
INNER JOIN resources r ON b.resource_id = r.id
SET b.branch_id = r.branch_id
WHERE b.branch_id IS NULL;

-- ============================================================================
-- SECTION 8: SETTLEMENT ITEMS — ADD branch_id + BACKFILL
-- ============================================================================

ALTER TABLE settlement_items
  ADD COLUMN branch_id INT UNSIGNED DEFAULT NULL COMMENT 'Branch that earned this settlement item'
  AFTER settlement_id;

ALTER TABLE settlement_items
  ADD INDEX idx_branch (branch_id),
  ADD CONSTRAINT fk_si_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- Backfill from booking where available
UPDATE settlement_items si
INNER JOIN bookings b ON si.booking_id = b.id AND b.branch_id IS NOT NULL
SET si.branch_id = b.branch_id
WHERE si.branch_id IS NULL;

-- ============================================================================
-- SECTION 9: SETTLEMENTS — FIX ENUM VALUES
-- ============================================================================

UPDATE settlements SET settlement_type = 'org_to_courtzon' WHERE settlement_type = 'club_to_courtzon';
UPDATE settlements SET settlement_type = 'courtzon_to_org' WHERE settlement_type = 'courtzon_to_club';

ALTER TABLE settlements
  MODIFY COLUMN settlement_type ENUM('org_to_courtzon','courtzon_to_org') NOT NULL;

-- ============================================================================
-- SECTION 10: ORGANISATIONS — REVERT logo_url/cover_url TO FILE PATHS
-- ============================================================================

-- Clear base64 data stored by migration 016 (must be paths, not binary)
UPDATE organisations SET logo_url  = NULL WHERE logo_url  IS NOT NULL AND LENGTH(logo_url)  > 500;
UPDATE organisations SET cover_url = NULL WHERE cover_url IS NOT NULL AND LENGTH(cover_url) > 500;

ALTER TABLE organisations
  MODIFY COLUMN logo_url VARCHAR(500) DEFAULT NULL,
  MODIFY COLUMN cover_url VARCHAR(500) DEFAULT NULL;

-- ============================================================================
-- SECTION 11: UPLOADS TABLE (file storage metadata)
-- ============================================================================

CREATE TABLE IF NOT EXISTS uploads (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id         CHAR(36) DEFAULT NULL,
  entity_type       VARCHAR(100) NOT NULL COMMENT 'organisation, branch, resource, sport, user',
  entity_id         INT UNSIGNED NOT NULL,
  file_category     VARCHAR(50) DEFAULT NULL COMMENT 'logo, cover, gallery, document, icon',
  original_name     VARCHAR(500) NOT NULL,
  mime_type         VARCHAR(100) NOT NULL,
  file_path         VARCHAR(500) NOT NULL COMMENT 'Path relative to storage root',
  file_size         INT UNSIGNED DEFAULT NULL COMMENT 'Bytes',
  width             INT UNSIGNED DEFAULT NULL,
  height            INT UNSIGNED DEFAULT NULL,
  processing_status ENUM('pending','processing','ready','failed') NOT NULL DEFAULT 'pending',
  error_message     TEXT DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_status (processing_status),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
