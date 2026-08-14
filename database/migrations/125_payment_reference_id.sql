-- Migration 125: Add generic reference_id to payment_transactions
-- Enables mapping a payment to any business entity (e.g. seller registration
-- subscription payments -> organisation_upgrade_requests.id) without reusing
-- order_id (which would collide with marketplace order refund lookups).
ALTER TABLE payment_transactions
  ADD COLUMN reference_id bigint(20) unsigned DEFAULT NULL AFTER order_id,
  ADD KEY idx_reference (reference_type, reference_id),
  ALGORITHM=INPLACE,
  LOCK=NONE;
