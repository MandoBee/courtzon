-- ============================================================================
-- Migration 058: Status tint tokens (Appearance Studio)
-- ============================================================================
-- Seeds the light-tint badge token pairs used by status pills / badges
-- (e.g. "Approved", "Pending", "Failed"). Each semantic state gets a soft
-- background + a readable foreground, so badge classes like
-- `bg-green-100 text-green-700` can be replaced by theme vars:
--   --color-success-bg / --color-success-text
--   --color-warning-bg / --color-warning-text
--   --color-error-bg   / --color-error-text
--   --color-info-bg    / --color-info-text
--
-- Idempotent + column-aware: INSERT IGNORE keys off the unique token_key, so
-- existing admin overrides are preserved and the migration is safe to re-run.
-- The target columns (token_key/token_type/default_value/category/description)
-- exist since 000_core_foundation.sql; draft_value/is_published since 057.
-- ============================================================================

USE courtzon_v2;

INSERT IGNORE INTO design_tokens (token_key, token_type, default_value, category, description) VALUES
  ('color-success-bg',   'color', '#DCFCE7', 'tint', 'Success badge background (soft tint)'),
  ('color-success-text', 'color', '#15803D', 'tint', 'Success badge text'),
  ('color-warning-bg',   'color', '#FEF3C7', 'tint', 'Warning badge background (soft tint)'),
  ('color-warning-text', 'color', '#B45309', 'tint', 'Warning badge text'),
  ('color-error-bg',     'color', '#FEE2E2', 'tint', 'Error badge background (soft tint)'),
  ('color-error-text',   'color', '#B91C1C', 'tint', 'Error badge text'),
  ('color-info-bg',      'color', '#DBEAFE', 'tint', 'Info badge background (soft tint)'),
  ('color-info-text',    'color', '#1D4ED8', 'tint', 'Info badge text');
