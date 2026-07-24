-- Migration 058: Widen dead_letter_entries.message_id from VARCHAR(26) to VARCHAR(128)
-- The column stores eventId (ULID=26) or commandId (up to 39 chars from template literals,
-- or ~67 chars from workflow dispatcher).

ALTER TABLE dead_letter_entries
  MODIFY COLUMN message_id VARCHAR(128) NOT NULL COMMENT 'ID of the original event/command';
