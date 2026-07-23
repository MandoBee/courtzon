-- Migration 047: workflow_definitions
-- Versioned workflow definitions stored as JSON.
CREATE TABLE IF NOT EXISTS workflow_definitions (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  workflow_type   VARCHAR(64) NOT NULL COMMENT 'e.g. booking.checkout',
  version         INT UNSIGNED NOT NULL COMMENT 'Monotonically increasing per workflow_type',
  definition      JSON NOT NULL COMMENT 'Serialized WorkflowDefinition',
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_workflow_version (workflow_type, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
