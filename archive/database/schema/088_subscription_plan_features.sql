-- Migration 088: Add features JSON column to subscription_plans
-- Restores the features column that was dropped during schema evolution.
-- This stores plan benefits as key-value pairs (e.g. {"products": 100, "analytics": true}).
USE `courtzon_v2`;

ALTER TABLE subscription_plans
  ADD COLUMN `features` JSON DEFAULT NULL AFTER `applicable_org_types`;

-- Seed features for seller plans
UPDATE subscription_plans SET features = '{"products": 10, "support": "basic"}' WHERE id = 5;
UPDATE subscription_plans SET features = '{"products": 100, "support": "standard", "analytics": true}' WHERE id = 6;
UPDATE subscription_plans SET features = '{"products": "unlimited", "support": "priority", "analytics": true, "custom_branding": true}' WHERE id = 9;
