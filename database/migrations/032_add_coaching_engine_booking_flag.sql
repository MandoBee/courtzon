-- Migration 032: Enable coaching.engine_booking_enabled feature flag
-- Gating the Scheduling Engine booking flow for Slice 1.
-- Idempotent: safe to re-run.

SET @existing = (
  SELECT COUNT(*) FROM feature_flags
  WHERE flag_key = 'coaching.engine_booking_enabled'
);

SET @sql = IF(@existing = 0,
  'INSERT INTO feature_flags (flag_key, label, description, module, is_enabled, is_system, created_at)
   VALUES (''coaching.engine_booking_enabled'', ''Engine Booking'', ''Enable coaching session booking via scheduling engine'', ''coaching'', 1, 0, NOW())',
  'UPDATE feature_flags SET is_enabled = 1 WHERE flag_key = ''coaching.engine_booking_enabled'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
