-- Migration 010: Remove duplicate UNIQUE index on gateway_reference
-- uk_gateway_reference (baseline, 255-char prefix) is redundant with
-- uq_gateway_reference (migration 002, full column). Both enforce the
-- same uniqueness constraint. Keeping uq_gateway_reference as it covers
-- the full column without a prefix.

ALTER TABLE payment_transactions
  DROP INDEX uk_gateway_reference;
