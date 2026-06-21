-- ============================================================================
-- COURTZON-V2 : SPORTS - ADD SHOW_IN_MARKETPLACE FLAG
-- Allows marketplace dropdowns to show sports based on a dedicated flag
-- rather than is_active, so inactive sports can still appear in marketplace.
-- ============================================================================

USE courtzon_v2;

ALTER TABLE sports
  ADD COLUMN show_in_marketplace BOOLEAN NOT NULL DEFAULT TRUE AFTER is_active;
