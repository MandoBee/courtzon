-- ============================================================================
-- COURTZON-V2 : Settlement Accounting Redesign (121)
--
-- Business rules:
--   1. CourtZon fee = (Products Total + Shipping) * plan_marketplace_percentage
--   2. Shipping revenue belongs entirely to the organisation
--   3. COD / Online netting: one final payable amount wins
--   4. Manual request only (Super Admin / Org Admin / Shop Admin)
--   5. Status workflow: requested -> calculating -> pending_approval
--                       -> approved -> paid -> completed
--                       -> rejected / cancelled
--   6. Bank-account snapshot for historical accuracy
--   7. Orders included once, never re-included
-- ============================================================================

USE courtzon_v2;

-- ── Helpers ──
DROP PROCEDURE IF EXISTS cz121_rename_table;
DROP PROCEDURE IF EXISTS cz121_add_column;

DELIMITER //

CREATE PROCEDURE cz121_rename_table(IN p_old VARCHAR(64), IN p_new VARCHAR(64))
BEGIN
  DECLARE v INT DEFAULT 0;
  SELECT COUNT(*) INTO v FROM information_schema.TABLES
   WHERE table_schema = DATABASE() AND table_name = p_old;
  IF v = 1 THEN
    SELECT COUNT(*) INTO v FROM information_schema.TABLES
     WHERE table_schema = DATABASE() AND table_name = p_new;
    IF v = 0 THEN
      SET @ddl = CONCAT('RENAME TABLE ', p_old, ' TO ', p_new);
      PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
    END IF;
  END IF;
END//

CREATE PROCEDURE cz121_add_column(IN p_table VARCHAR(64), IN p_col VARCHAR(64), IN p_def VARCHAR(255))
BEGIN
  DECLARE v INT DEFAULT 0;
  SELECT COUNT(*) INTO v FROM information_schema.COLUMNS
   WHERE table_schema = DATABASE() AND table_name = p_table AND column_name = p_col;
  IF v = 0 THEN
    SET @ddl = CONCAT('ALTER TABLE ', p_table, ' ADD COLUMN ', p_col, ' ', p_def);
    PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END//

DELIMITER ;

-- ── Step 1: Preserve old tables ──
CALL cz121_rename_table('settlements', 'settlements_v1');
CALL cz121_rename_table('settlement_items', 'settlement_items_v1');

-- ── Step 2: New settlements table ──
CREATE TABLE IF NOT EXISTS settlements (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id       INT UNSIGNED NOT NULL,
  branch_id             INT UNSIGNED DEFAULT NULL COMMENT 'NULL = org-wide settlement',

  settlement_status     ENUM('requested','calculating','pending_approval','approved','paid','completed','rejected','cancelled') NOT NULL DEFAULT 'requested',

  requested_by          INT UNSIGNED DEFAULT NULL,
  requested_by_role     VARCHAR(50) DEFAULT NULL,

  settlement_period_start DATE DEFAULT NULL,
  settlement_period_end   DATE DEFAULT NULL,

  -- Financial totals
  gross_amount          DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Products + Shipping total across all included orders',
  shipping_amount       DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Total shipping cost of included orders',
  courtzon_fee          DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Total CourtZon fee = sum(fee on (products+shipping))',
  organization_net      DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'gross_amount - courtzon_fee = org keeps',

  -- COD / Online breakdown for netting
  cod_fee_total         DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'CourtZon fee total from COD orders',
  online_net_total      DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Organization net total from online orders',

  -- Netting result
  settlement_direction  ENUM('courtzon_to_org','org_to_courtzon') DEFAULT NULL COMMENT 'Who pays whom after netting',
  final_amount          DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Net transfer amount after netting',

  -- Bank account
  bank_account_id       INT UNSIGNED DEFAULT NULL,
  bank_account_snapshot JSON DEFAULT NULL,

  -- Status timestamps
  requested_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  calculating_started_at    TIMESTAMP NULL DEFAULT NULL,
  calculating_completed_at  TIMESTAMP NULL DEFAULT NULL,
  approved_at           TIMESTAMP NULL DEFAULT NULL,
  paid_at               TIMESTAMP NULL DEFAULT NULL,
  completed_at          TIMESTAMP NULL DEFAULT NULL,
  rejected_at           TIMESTAMP NULL DEFAULT NULL,
  rejected_reason       TEXT DEFAULT NULL,

  notes                 TEXT DEFAULT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_stl_org (organisation_id),
  INDEX idx_stl_branch (branch_id),
  INDEX idx_stl_status (settlement_status),
  INDEX idx_stl_requested_by (requested_by),
  CONSTRAINT fk_stl_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT fk_stl_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_stl_bank_account FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ── Step 3: settlement_orders (replaces settlement_items for marketplace) ──
CREATE TABLE IF NOT EXISTS settlement_orders (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  settlement_id     INT UNSIGNED NOT NULL,
  order_id          INT UNSIGNED NOT NULL,

  products_price    DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Products subtotal before shipping',
  shipping_price    DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Shipping cost for this order',
  gross_amount      DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'products_price + shipping_price',
  courtzon_fee      DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Fee on gross_amount',
  organization_net  DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'gross_amount - courtzon_fee',
  payment_method    VARCHAR(50) DEFAULT NULL COMMENT 'cash (COD), wallet, card, etc.',

  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_so_settlement (settlement_id),
  INDEX idx_so_order (order_id),
  CONSTRAINT fk_so_settlement FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE CASCADE,
  CONSTRAINT fk_so_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Step 4: settlement_transfers (payout tracking) ──
CREATE TABLE IF NOT EXISTS settlement_transfers (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  settlement_id       INT UNSIGNED NOT NULL,
  transfer_direction  ENUM('courtzon_to_org','org_to_courtzon') NOT NULL,
  amount              DECIMAL(12,2) NOT NULL,

  bank_account_id     INT UNSIGNED DEFAULT NULL,
  bank_account_snapshot JSON DEFAULT NULL,

  transfer_reference  VARCHAR(100) DEFAULT NULL,
  transfer_date       TIMESTAMP NULL DEFAULT NULL,
  transfer_status     ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending',
  failure_reason      TEXT DEFAULT NULL,

  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_tf_settlement (settlement_id),
  CONSTRAINT fk_tf_settlement FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Step 5: Add courtzon_fee column to orders (before data migration) ──
CALL cz121_add_column('orders', 'courtzon_fee', 'DECIMAL(12,2) NOT NULL DEFAULT 0.00');

-- Copy existing courtzon_commission values to courtzon_fee where empty
UPDATE orders SET courtzon_fee = courtzon_commission WHERE courtzon_fee = 0 AND courtzon_commission > 0;

-- ── Step 6: Migrate existing settlement data ──
-- NOTE: settlements_v1 may lack 037-specific columns (requested_at, updated_at, amount, fee)
-- so we use only columns guaranteed by migration 056 reconciliation.
INSERT IGNORE INTO settlements (
  id, organisation_id, settlement_status,
  gross_amount, courtzon_fee, organization_net,
  settlement_direction, final_amount,
  requested_at, notes, created_at
)
SELECT
  s.id,
  s.organisation_id,
  CASE s.settlement_status
    WHEN 'pending'    THEN 'requested'
    WHEN 'processing' THEN 'calculating'
    WHEN 'approved'   THEN 'pending_approval'
    WHEN 'paid'       THEN 'paid'
    WHEN 'completed'  THEN 'completed'
    WHEN 'failed'     THEN 'rejected'
    WHEN 'rejected'   THEN 'rejected'
    WHEN 'cancelled'  THEN 'cancelled'
    ELSE 'requested'
  END,
  COALESCE(s.gross_amount, 0),
  COALESCE(s.commission_amount, 0),
  COALESCE(s.net_amount, 0),
  CASE WHEN s.settlement_type = 'courtzon_to_org' THEN 'courtzon_to_org'
       WHEN s.settlement_type = 'org_to_courtzon' THEN 'org_to_courtzon'
       ELSE NULL END,
  COALESCE(s.net_amount, 0),
  s.created_at, -- settlements_v1 has no requested_at, use created_at
  s.notes,
  s.created_at
FROM settlements_v1 s
WHERE NOT EXISTS (SELECT 1 FROM settlements n WHERE n.id = s.id);

-- Migrate settlement_items to settlement_orders
INSERT IGNORE INTO settlement_orders (settlement_id, order_id, gross_amount, courtzon_fee, organization_net, payment_method)
SELECT
  si.settlement_id,
  si.order_id,
  COALESCE(si.gross_amount, 0),
  COALESCE(si.commission_amount, 0),
  COALESCE(si.net_amount, 0),
  o.payment_method
FROM settlement_items_v1 si
JOIN orders o ON o.id = si.order_id
WHERE si.order_id IS NOT NULL;

-- ── Cleanup helpers ──
DROP PROCEDURE IF EXISTS cz121_rename_table;
DROP PROCEDURE IF EXISTS cz121_add_column;
