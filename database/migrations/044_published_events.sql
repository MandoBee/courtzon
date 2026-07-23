-- Migration 044: published_events table — durable event store for EventBus v2
-- Per P12-A §7.1: every published event is recorded here for replay, audit, observability.

CREATE TABLE IF NOT EXISTS published_events (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id          VARCHAR(26) NOT NULL COMMENT 'ULID — globally unique event identifier',
  event_name        VARCHAR(128) NOT NULL COMMENT 'Canonical dot-separated event name (e.g. booking.created)',
  aggregate_type    VARCHAR(64) NOT NULL COMMENT 'Aggregate root type (e.g. booking, payment, wallet)',
  aggregate_id      VARCHAR(64) NOT NULL COMMENT 'Aggregate root identifier',
  aggregate_version INT UNSIGNED NOT NULL COMMENT 'Monotonic sequence number within the aggregate',
  correlation_id    VARCHAR(64) DEFAULT NULL COMMENT 'Trace across services',
  causation_id      VARCHAR(64) DEFAULT NULL COMMENT 'ID of the event/command that caused this event',
  payload           JSON DEFAULT NULL COMMENT 'Event-specific data',
  metadata          JSON DEFAULT NULL COMMENT 'Envelope metadata (actor_id, tenant_id, etc.)',
  occurred_at       TIMESTAMP NOT NULL COMMENT 'When the event occurred in the domain',
  published_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the bus published the event',
  schema_version    INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Event schema version (non-breaking=0, breaking=+1)',

  UNIQUE KEY uk_event_id (event_id),
  KEY idx_aggregate (aggregate_type, aggregate_id, aggregate_version) COMMENT 'Aggregate event history in order',
  KEY idx_correlation_id (correlation_id) COMMENT 'Cross-service tracing',
  KEY idx_event_name_occurred (event_name, occurred_at) COMMENT 'Replay by event type',
  KEY idx_occurred_at (occurred_at) COMMENT 'Cleanup and time-range queries'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
