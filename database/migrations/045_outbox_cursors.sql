-- Migration 045: Outbox cursor table for EventBus v2
-- Each subscriber has an independent cursor tracking delivery progress.
-- Cursor advances only after successful BullMQ enqueue.

CREATE TABLE IF NOT EXISTS outbox_cursors (
  subscriber_id  VARCHAR(64) NOT NULL PRIMARY KEY,
  last_event_id  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
