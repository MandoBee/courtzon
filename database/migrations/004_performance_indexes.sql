-- Phase 3: Performance Indexes

-- Payment history pagination: avoids filesort on user_id + created_at ORDER BY
ALTER TABLE payment_transactions
  ADD INDEX IF NOT EXISTS idx_user_created (user_id, created_at);

