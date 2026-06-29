-- Phase 1: Transaction & Financial Integrity
-- Add UNIQUE constraints to prevent duplicate journal entries and webhook callbacks.

-- 1. Prevent duplicate webhook processing
-- If a gateway reference already exists, INSERT will fail with duplicate key error.
ALTER TABLE payment_transactions
  ADD UNIQUE INDEX uq_gateway_reference (gateway_reference);

-- 2. Prevent duplicate wallet transaction entries for the same reference
-- Each (reference_type, reference_id) pair can only appear once in wallet_transactions.
ALTER TABLE wallet_transactions
  ADD UNIQUE INDEX uq_wallet_txn_ref (reference_type, reference_id);
