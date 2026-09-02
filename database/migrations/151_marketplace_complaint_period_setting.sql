-- 151_marketplace_complaint_period_setting.sql
-- Makes the marketplace complaint period an admin-controllable platform setting.
--
-- Background:
--   Marketplace entitlements are created in PENDING status with available_at = NULL.
--   They become AVAILABLE (and therefore settlement-eligible) only after the order
--   is delivered AND the buyer complaint window has elapsed. Previously the window
--   lived in the single-row marketplace_complaint_config table and was not
--   admin-controllable from the platform settings UI.
--
-- This migration registers the complaint period in the canonical `system_settings`
-- table (admin-editable via System Admin → Settings, RBAC app-settings.edit),
-- defaulting to 7 days. All business logic now reads the value from here via
-- getMarketplaceComplaintPeriodDays() — the single canonical source.
--
-- The legacy marketplace_complaint_config table is left untouched (no schema
-- change); it is no longer read by application logic.

INSERT IGNORE INTO `system_settings`
  (`category`, `key`, `value`, `value_type`, `description`, `display_name`, `unit`,
   `min_value`, `help_text`, `sort_order`, `is_visible`, `is_editable`, `scope`)
VALUES
  ('marketplace',
   'marketplace.complaint_period_days',
   '7',
   'number',
   'Number of days after marketplace delivery during which the buyer can submit a complaint before the entitlement becomes available for settlement.',
   'Complaint Period',
   'days',
   '0',
   'Entitlements become settlement-eligible only after delivery + this many days. Set to 0 to disable the complaint window (immediate eligibility).',
   10,
   1,
   1,
   'global');