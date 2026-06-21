-- ============================================================================
-- Migration 029: Security & Performance Indexes (CORRECTED + IDEMPOTENT)
-- ============================================================================
-- NOTE: The original 029 referenced columns/tables that do not exist
-- (products.organisation_id, orders.seller_organisation_id, wallets,
-- transactions.wallet_id). Because migrate.js runs each file as a single
-- batch, the very first bad statement failed the whole file and NONE of the
-- indexes were ever created in existing databases.
--
-- This version:
--   * references the real schema (post-011 rename: bookings use
--     organisation_id/resource_id; products use seller_id; orders use buyer_id;
--     wallet ledger is wallet_transactions; new ledger header is transactions).
--   * is idempotent and column-aware via a helper procedure, so it can be
--     re-run safely and silently skips indexes whose columns are absent.
-- ============================================================================

USE courtzon_v2;

DROP PROCEDURE IF EXISTS cz_add_index;

DELIMITER //
CREATE PROCEDURE cz_add_index(
  IN p_table    VARCHAR(64),
  IN p_index    VARCHAR(64),
  IN p_cols     VARCHAR(255),  -- comma list of plain column names (no spaces) used for verification
  IN p_expected INT,           -- number of columns that must exist
  IN p_ddl      VARCHAR(255)   -- column spec for CREATE INDEX, e.g. '(a, b, c)'
)
BEGIN
  DECLARE v_idx  INT DEFAULT 0;
  DECLARE v_cols INT DEFAULT 0;

  SELECT COUNT(*) INTO v_idx
    FROM information_schema.STATISTICS
   WHERE table_schema = DATABASE()
     AND table_name   = p_table
     AND index_name   = p_index;

  SELECT COUNT(*) INTO v_cols
    FROM information_schema.COLUMNS
   WHERE table_schema = DATABASE()
     AND table_name   = p_table
     AND FIND_IN_SET(column_name, p_cols);

  IF v_idx = 0 AND v_cols = p_expected THEN
    SET @ddl = CONCAT('CREATE INDEX ', p_index, ' ON ', p_table, ' ', p_ddl);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END//
DELIMITER ;

-- Bookings: tenant-scoped availability/listing queries
CALL cz_add_index('bookings','idx_bookings_org_resource','organisation_id,resource_id,booking_date,booking_status',4,'(organisation_id, resource_id, booking_date, booking_status)');

-- Products: seller storefront + filtering
CALL cz_add_index('products','idx_products_seller_active','seller_id,is_active,category_id',3,'(seller_id, is_active, category_id)');
CALL cz_add_index('products','idx_products_seller_price','seller_id,is_active,price',3,'(seller_id, is_active, price)');

-- Orders: buyer history
CALL cz_add_index('orders','idx_orders_buyer_created','buyer_id,created_at',2,'(buyer_id, created_at)');

-- Order items: seller sales view (orders are multi-seller; seller lives here)
CALL cz_add_index('order_items','idx_order_items_seller_created','seller_id,created_at',2,'(seller_id, created_at)');

-- Wallet ledger: per-wallet statement queries
CALL cz_add_index('wallet_transactions','idx_wallet_txn_wallet_created','wallet_id,created_at',2,'(wallet_id, created_at)');

-- Ledger header (017): admin financial filtering
CALL cz_add_index('transactions','idx_transactions_type_status','type,status,created_at',3,'(type, status, created_at)');

-- User sessions: cleanup/expiry scans
CALL cz_add_index('user_sessions','idx_sessions_cleanup','expires_at,is_revoked',2,'(expires_at, is_revoked)');

-- Organisations: owner + country lookups (country index skipped if column absent)
CALL cz_add_index('organisations','idx_organisations_owner','owner_id,is_active',2,'(owner_id, is_active)');
CALL cz_add_index('organisations','idx_organisations_country','country_id,is_active',2,'(country_id, is_active)');

-- Activity feed listing
CALL cz_add_index('activity_logs','idx_activities_feed','user_id,created_at',2,'(user_id, created_at DESC)');

DROP PROCEDURE IF EXISTS cz_add_index;
