-- Migration 049: Add workflow_definition_version to workflow_instances
ALTER TABLE workflow_instances
  ADD COLUMN workflow_definition_version INT UNSIGNED NOT NULL DEFAULT 1
  AFTER workflow_type,
  ALGORITHM=INPLACE,
  LOCK=NONE;
