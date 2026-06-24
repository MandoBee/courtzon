-- 127: Add missing composite indexes for production performance
-- Based on the audit, these indexes are needed for settlement, ledger, and booking queries.
-- Uses stored procedure to guard against missing tables (migration 121 may have been skipped).

USE courtzon_v2;

DROP PROCEDURE IF EXISTS cz127_create_index_if_table_exists;

DELIMITER //

CREATE PROCEDURE cz127_create_index_if_table_exists(IN p_table VARCHAR(64), IN p_index_name VARCHAR(64), IN p_columns VARCHAR(255))
BEGIN
  DECLARE v INT DEFAULT 0;
  SELECT COUNT(*) INTO v FROM information_schema.TABLES
   WHERE table_schema = DATABASE() AND table_name = p_table;
  IF v > 0 THEN
    SELECT COUNT(*) INTO v FROM information_schema.STATISTICS
     WHERE table_schema = DATABASE() AND table_name = p_table AND INDEX_NAME = p_index_name;
    IF v = 0 THEN
      SET @ddl = CONCAT('CREATE INDEX ', p_index_name, ' ON ', p_table, ' (', p_columns, ')');
      PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
    END IF;
  END IF;
END//

DELIMITER ;

-- Settlement: find settlements filtered by org + status + date range
CALL cz127_create_index_if_table_exists('settlements', 'idx_settlements_org_status_requested', 'organisation_id, settlement_status, requested_at');

-- Orders: getUnsettledOrders query (always exists — core table from early migration)
CALL cz127_create_index_if_table_exists('orders', 'idx_orders_settlement_status', 'settlement_status, status, payment_status');

-- Marketplace ledger: getLedgerBalance GROUP BY query
CALL cz127_create_index_if_table_exists('marketplace_ledger_entries', 'idx_mle_org_type_amount', 'organisation_id, entry_type, amount');

-- Marketplace ledger: getLedgerEntries ORDER BY query
CALL cz127_create_index_if_table_exists('marketplace_ledger_entries', 'idx_mle_org_created', 'organisation_id, created_at');

-- Settlement orders: prevent double-inclusion
CALL cz127_create_index_if_table_exists('settlement_orders', 'idx_settlement_orders_unique', 'settlement_id, order_id');

-- Booking intents: lookup by user and resource
CALL cz127_create_index_if_table_exists('booking_intents', 'idx_booking_intents_user', 'user_id');
CALL cz127_create_index_if_table_exists('booking_intents', 'idx_booking_intents_resource_date', 'resource_id, booking_date');

-- Wallet transactions: filtered history
CALL cz127_create_index_if_table_exists('wallet_transactions', 'idx_wallet_txn_type_created', 'wallet_id, transaction_type, created_at');

-- Transaction entries: branch + created composite
CALL cz127_create_index_if_table_exists('transaction_entries', 'idx_txn_entries_branch_created', 'branch_id, created_at');

-- Audit logs: entity + action + created composite
CALL cz127_create_index_if_table_exists('audit_logs', 'idx_audit_logs_entity_action_created', 'entity_type, action, created_at');

DROP PROCEDURE IF EXISTS cz127_create_index_if_table_exists;
