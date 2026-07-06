ALTER TABLE payment_transactions
  ADD COLUMN idempotency_key VARCHAR(64) DEFAULT NULL AFTER order_id,
  ADD UNIQUE KEY uk_idempotency_key (idempotency_key);
