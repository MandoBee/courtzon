-- Migration 046: workflow_event_subscriptions
-- Event correlation for WAIT_EVENT steps.
-- Multiple workflows may wait for the same event+correlation (non-unique index).
CREATE TABLE IF NOT EXISTS workflow_event_subscriptions (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  workflow_instance_id  BIGINT UNSIGNED NOT NULL COMMENT 'FK to workflow_instances',
  step_name             VARCHAR(128) NOT NULL COMMENT 'WAIT_EVENT step that is waiting',
  event_name            VARCHAR(128) NOT NULL COMMENT 'Canonical event name to match',
  correlation_value     VARCHAR(128) NOT NULL COMMENT 'Value extracted from event for correlation (e.g. aggregateId)',
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_lookup (event_name, correlation_value),
  KEY idx_workflow (workflow_instance_id),
  CONSTRAINT fk_sub_workflow FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
