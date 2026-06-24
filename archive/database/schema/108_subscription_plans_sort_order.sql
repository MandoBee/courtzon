-- Migration 108: Add sort_order to subscription_plans for manual reordering
USE `courtzon_v2`;

ALTER TABLE subscription_plans ADD COLUMN `sort_order` INT UNSIGNED NOT NULL DEFAULT 0 AFTER is_internal;

-- Assign sequential sort_order based on current display order
SET @rn = 0;
UPDATE subscription_plans SET sort_order = (@rn := @rn + 1) - 1
ORDER BY is_active DESC, COALESCE(price_monthly, price_yearly, 0) ASC;
