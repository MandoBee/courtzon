-- Migration 041: Add version column for optimistic locking on workflow_instances
ALTER TABLE workflow_instances
  ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1 AFTER updated_at,
  COMMENT 'Optimistic lock version — incremented on every write';
