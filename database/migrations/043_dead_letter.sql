-- Migration 043: dead_letter table for permanently failed events/commands
-- Per P12-A §7.5: events that exhaust retry attempts land here.
-- Per P14: commands that exhaust retry attempts land here.

CREATE TABLE IF NOT EXISTS dead_letter_entries (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  message_id        VARCHAR(26) NOT NULL COMMENT 'ULID of the original event/command',
  message_type      VARCHAR(64) NOT NULL COMMENT 'e.g. booking.created, CreateBookingCommand',
  message_category  ENUM('event','command') NOT NULL COMMENT 'Event or Command',
  source            VARCHAR(64) NOT NULL COMMENT 'Module that produced the message',
  subscriber_id     VARCHAR(128) DEFAULT NULL COMMENT 'Subscriber that failed processing',
  workflow_id       BIGINT UNSIGNED DEFAULT NULL COMMENT 'FK to workflow_instances — nullable',
  correlation_id    VARCHAR(64) DEFAULT NULL COMMENT 'Trace across services',
  causation_id      VARCHAR(64) DEFAULT NULL COMMENT 'Parent event/command',
  payload           JSON DEFAULT NULL COMMENT 'Original message payload',
  error_message     TEXT NOT NULL COMMENT 'Error description',
  error_stack       TEXT DEFAULT NULL COMMENT 'Full stack trace',
  retry_count       INT UNSIGNED NOT NULL DEFAULT 0,
  failed_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  next_retry_at     TIMESTAMP NULL DEFAULT NULL COMMENT 'When the retry scheduler should retry',
  resolved_at       TIMESTAMP NULL DEFAULT NULL,
  resolution_status ENUM('pending','retrying','resolved','ignored') NOT NULL DEFAULT 'pending',

  KEY idx_dl_replay (resolution_status, failed_at) COMMENT 'Replay worker: pending entries ordered by age',
  KEY idx_dl_retry (resolution_status, next_retry_at) COMMENT 'Retry scheduler: retrying entries due for retry',
  KEY idx_dl_cleanup (resolution_status, failed_at) COMMENT 'Cleanup: resolved/ignored entries by age'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
