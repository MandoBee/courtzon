-- Migration 039: processed_events table for EventBus idempotency tracking
-- Per P12-A §7.2: each (event_id, subscriber_id) pair is unique.
-- Subscribers check this table before processing; insert after processing.

CREATE TABLE IF NOT EXISTS processed_events (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id        VARCHAR(26) NOT NULL COMMENT 'ULID of the published event',
  subscriber_id   VARCHAR(128) NOT NULL COMMENT 'Subscriber identifier (e.g. notification-engine, search-indexer)',
  processed_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uk_event_subscriber (event_id, subscriber_id),
  INDEX idx_subscriber (subscriber_id),
  INDEX idx_processed_at (processed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
