USE courtzon_v2;

ALTER TABLE bookings
  MODIFY COLUMN payment_status ENUM('pending','paid','refunded','partially_refunded','failed','penalty') DEFAULT 'pending';

ALTER TABLE wallet_transactions
  MODIFY COLUMN transaction_type ENUM('deposit','withdrawal','payment','refund','commission','settlement','due','penalty') NOT NULL;

INSERT IGNORE INTO payment_methods (slug, name, icon, description, processing_fee_pct, processing_fee_fixed, requires_approval, is_active, sort_order)
VALUES ('penalty', 'Penalty', 'alert-triangle', 'No-show penalty charge', 0, 0, 0, 1, 10);
