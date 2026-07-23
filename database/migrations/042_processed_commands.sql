-- Migration 042: processed_commands table for Command Pipeline idempotency
-- Per P14 — Command Model: each (command_id, subscriber_id) pair is unique.
-- Subscribers check this table before processing; insert after processing.

CREATE TABLE IF NOT EXISTS processed_commands (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  command_id      VARCHAR(26) NOT NULL COMMENT 'ULID of the published command',
  command_type    VARCHAR(64) NOT NULL COMMENT 'e.g. CreateBookingCommand, ProcessPaymentCommand',
  subscriber_id   VARCHAR(128) NOT NULL COMMENT 'Subscriber that processed the command',
  correlation_id  VARCHAR(64) DEFAULT NULL COMMENT 'Trace across services',
  causation_id    VARCHAR(64) DEFAULT NULL COMMENT 'Parent event/command that triggered this',
  metadata        JSON DEFAULT NULL COMMENT 'Arbitrary metadata for audit/debugging',
  processed_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uk_command_subscriber (command_id, subscriber_id),
  INDEX idx_subscriber (subscriber_id),
  INDEX idx_command_type (command_type),
  INDEX idx_processed_at (processed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
