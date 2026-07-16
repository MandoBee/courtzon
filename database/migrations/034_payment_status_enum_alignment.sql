-- Migration 034: Align payment_status ENUMs with application code
-- Code defines 8 states (PaymentAggregate / payment-types.ts):
--   created, pending, processing, paid, failed, cancelled, expired, refunded
-- DB only had: pending, paid, failed, refunded
-- Idempotent: safe to re-run.

-- 1. Fix payment_transactions.payment_status
SET @current_enum = (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_transactions' AND COLUMN_NAME = 'payment_status'
);
SET @sql = IF(@current_enum IS NOT NULL AND @current_enum NOT LIKE '%processing%',
  'ALTER TABLE payment_transactions MODIFY COLUMN `payment_status` ENUM(''created'',''pending'',''processing'',''paid'',''failed'',''cancelled'',''expired'',''refunded'') NOT NULL DEFAULT ''created''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Fix booking_intents.payment_status
SET @intent_enum = (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_intents' AND COLUMN_NAME = 'payment_status'
);
SET @sql = IF(@intent_enum IS NOT NULL AND @intent_enum NOT LIKE '%processing%',
  'ALTER TABLE booking_intents MODIFY COLUMN `payment_status` ENUM(''created'',''pending'',''processing'',''paid'',''failed'',''cancelled'',''expired'',''refunded'') NOT NULL DEFAULT ''created''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Verify bookings.booking_status includes all states
SET @book_enum = (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'booking_status'
);
SET @sql = IF(@book_enum IS NOT NULL AND @book_enum NOT LIKE '%no_show%',
  'ALTER TABLE bookings MODIFY COLUMN `booking_status` ENUM(''pending'',''confirmed'',''completed'',''cancelled'',''cancelled_with_fee'',''no_show'',''checked_in'',''expired'') NOT NULL DEFAULT ''pending''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
