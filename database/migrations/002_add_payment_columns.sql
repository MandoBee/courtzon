-- Migration 002: Add currency, updated_at, and gateway_response to payment_transactions
-- This completes the payment recording for production card payment flow

ALTER TABLE `payment_transactions`
  ADD COLUMN `currency` char(3) NOT NULL DEFAULT 'EGP' AFTER `amount`,
  ADD COLUMN `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() AFTER `created_at`,
  ADD COLUMN `gateway_response` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`gateway_response`)) AFTER `payment_status`;

-- Add unique index on gateway_reference for webhook deduplication
ALTER TABLE `payment_transactions`
  ADD UNIQUE KEY `uk_gateway_reference` (`gateway_reference`(255));

-- Allow bank_transfer as payment_method for payment_transactions
ALTER TABLE `payment_transactions`
  MODIFY `payment_method` enum('wallet','cash','card','bank_transfer','online') NOT NULL;
