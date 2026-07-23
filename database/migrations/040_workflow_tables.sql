-- Migration 040: Workflow persistence tables
-- Per P13 — Workflow & Saga Orchestration Specification
-- Persistence for: workflow_instances, workflow_steps, workflow_events

-- workflow_instances: Each row represents one workflow execution (saga).
-- Status drives all state transitions. Crash recovery reads persisted state.
CREATE TABLE IF NOT EXISTS workflow_instances (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  public_id       VARCHAR(26) NOT NULL COMMENT 'ULID — external reference for this workflow execution',
  workflow_type   VARCHAR(64) NOT NULL COMMENT 'e.g. booking.checkout, marketplace.fulfillment, settlement.payout',
  status          ENUM('pending','active','completed','failed','compensating','compensated','cancelled') NOT NULL DEFAULT 'pending',
  correlation_id  VARCHAR(64) DEFAULT NULL COMMENT 'Trace across services — inherited from EventEnvelope',
  causation_id    VARCHAR(64) DEFAULT NULL COMMENT 'Parent event that triggered this workflow',
  actor_id        INT UNSIGNED DEFAULT NULL COMMENT 'User who initiated the workflow',
  payload         JSON DEFAULT NULL COMMENT 'Workflow-level input data (booking details, order info)',
  context         JSON DEFAULT NULL COMMENT 'Runtime state shared across workflow steps',
  started_at      TIMESTAMP NULL DEFAULT NULL,
  completed_at    TIMESTAMP NULL DEFAULT NULL,
  failed_at       TIMESTAMP NULL DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version         INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Optimistic lock — incremented on every write',

  UNIQUE KEY uk_public_id (public_id),
  KEY idx_workflow_type_status (workflow_type, status),
  KEY idx_correlation_id (correlation_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- workflow_steps: Each row represents one step within a workflow execution.
-- Steps are ordered by id. The workflow engine executes steps sequentially.
CREATE TABLE IF NOT EXISTS workflow_steps (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  workflow_instance_id  BIGINT UNSIGNED NOT NULL COMMENT 'FK to workflow_instances',
  step_name             VARCHAR(128) NOT NULL COMMENT 'e.g. validate_booking, process_payment, release_slot',
  step_type             ENUM('activity','compensation') NOT NULL DEFAULT 'activity',
  status                ENUM('pending','active','completed','failed','skipped','compensated') NOT NULL DEFAULT 'pending',
  retry_count           INT UNSIGNED NOT NULL DEFAULT 0,
  max_retries           INT UNSIGNED NOT NULL DEFAULT 3,
  timeout_at            TIMESTAMP NULL DEFAULT NULL COMMENT 'If exceeded, step is considered failed',
  compensation_status   ENUM('none','pending','completed','failed') NOT NULL DEFAULT 'none',
  input                 JSON DEFAULT NULL COMMENT 'Step input — copied from workflow payload or previous step output',
  output                JSON DEFAULT NULL COMMENT 'Step output — used as input for the next step',
  error                 TEXT DEFAULT NULL COMMENT 'Error details if the step failed',
  started_at            TIMESTAMP NULL DEFAULT NULL,
  completed_at          TIMESTAMP NULL DEFAULT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_workflow_instance (workflow_instance_id),
  KEY idx_step_status (workflow_instance_id, status),
  KEY idx_timeout_query (status, timeout_at) COMMENT 'Find timed-out steps — status=active AND timeout_at < NOW()',
  CONSTRAINT fk_ws_workflow FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- workflow_events: Journal of all events that a workflow produces or consumes.
-- Used for replay, observability, and crash recovery.
CREATE TABLE IF NOT EXISTS workflow_events (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  workflow_instance_id  BIGINT UNSIGNED NOT NULL COMMENT 'FK to workflow_instances',
  event_name            VARCHAR(128) NOT NULL COMMENT 'Canonical event name e.g. booking.payment.received',
  event_body            JSON DEFAULT NULL COMMENT 'Full event payload',
  correlation_id        VARCHAR(64) DEFAULT NULL,
  causation_id          VARCHAR(64) DEFAULT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_we_workflow_instance (workflow_instance_id),
  KEY idx_we_correlation (correlation_id),
  KEY idx_we_created (created_at),
  CONSTRAINT fk_we_workflow FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
