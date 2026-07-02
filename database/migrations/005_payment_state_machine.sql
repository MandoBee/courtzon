-- Payment System Stabilization
-- Step 1: Add trace_id and expand payment_status ENUM

ALTER TABLE payment_transactions
  ADD COLUMN trace_id CHAR(36) NULL COMMENT 'UUID for end-to-end payment tracing',
  ADD COLUMN cancelled_at TIMESTAMP NULL COMMENT 'When payment was cancelled/expired';

ALTER TABLE payment_transactions
  MODIFY COLUMN payment_status ENUM(
    'created','pending','processing','paid','failed','cancelled','expired','refunded'
  ) NOT NULL DEFAULT 'created' COMMENT 'Payment lifecycle state';

-- Index for fetching pending payments (for sync/expiry jobs)
CREATE INDEX idx_pt_status_created ON payment_transactions (payment_status, created_at);
