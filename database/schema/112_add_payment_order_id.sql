ALTER TABLE payment_transactions
  ADD COLUMN order_id BIGINT UNSIGNED DEFAULT NULL AFTER booking_id,
  ADD COLUMN reference_type VARCHAR(50) DEFAULT NULL AFTER order_id,
  ADD INDEX idx_order (order_id);
