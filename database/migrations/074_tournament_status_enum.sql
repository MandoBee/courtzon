-- ============================================================================
-- Migration 074: Extend tournament status ENUM to support domain lifecycle
-- ============================================================================
-- The domain model defines an 8-state lifecycle (draft → published →
-- registration_open → registration_closed → running → completed/cancelled →
-- archived), but the production ENUM only had 5 values.
--
-- This migration adds the 5 missing domain states while preserving existing
-- values for backward compatibility.
-- ============================================================================

ALTER TABLE tournaments
  MODIFY COLUMN status ENUM(
    'draft',
    'open',
    'in_progress',
    'published',
    'registration_open',
    'registration_closed',
    'running',
    'completed',
    'cancelled',
    'archived'
  ) NOT NULL DEFAULT 'draft';
