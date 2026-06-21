-- ============================================================================
-- COURTZON-V2 : Add order_id to settlement_items for marketplace settlements
-- ============================================================================

USE courtzon_v2;

ALTER TABLE settlement_items
  ADD COLUMN order_id INT UNSIGNED DEFAULT NULL
    COMMENT 'Marketplace order reference for settlement items'
    AFTER booking_id,
  ADD INDEX idx_si_order (order_id);
