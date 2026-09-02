-- 150_gateway_settlement_reversal.sql
-- Adds the ability to REVERSE (cancel) a completed gateway settlement with a
-- matching accounting reversal, while preserving the original journal as
-- immutable history. Also restores payment re-eligibility safely so a human
-- error can be corrected by re-settling the payments in a corrected batch.
--
-- Purpose:
--   1. gateway_settlements.settlement_status is extended from enum('completed')
--      to enum('completed','reversed') so a settlement carries an explicit,
--      queryable reversed state (immutable history — the original journal is
--      NEVER deleted or edited).
--   2. Reversal metadata columns (reversed_at / reversed_by / reversal_reason /
--      reversal_reference) capture the audit trail of the reversal itself.
--   3. The per-payment uniqueness guard uk_gst_payment (UNIQUE on
--      payment_transaction_id) is replaced with the classic MySQL partial-unique
--      pattern: gateway_settlement_transactions.active_payment_transaction_id is
--      populated at insert (== payment_transaction_id) and NULLed on reversal,
--      guaranteeing at most ONE ACTIVE gateway settlement per payment
--      transaction while allowing historical (reversed) rows to coexist and a
--      corrected, re-settled payment to be recorded WITHOUT losing its history.
--      Without this change, re-settling after a reversal would always violate
--      uk_gst_payment and the entire corrected batch would roll back.
--
-- Accounting:
--   The matching reversal journal (Dr Payment Clearing gross / Cr Cash-Bank net
--   + Cr Gateway Fees) is posted by the application in the SAME transaction as
--   the status/metadata update (atomic). No journal is written here.
--
-- Data note:
--   Existing 'completed' settlement lines are backfilled so
--   active_payment_transaction_id matches their payment (they remain ACTIVE).
--   Existing payment_transactions linkage is untouched.

START TRANSACTION;

-- 1. Extend gateway_settlements status to support 'reversed'.
ALTER TABLE `gateway_settlements`
  MODIFY COLUMN `settlement_status` enum('completed','reversed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'completed';

-- 2. Reversal metadata on the settlement batch (immutable audit trail).
ALTER TABLE `gateway_settlements`
  ADD COLUMN `reversed_at` timestamp NULL DEFAULT NULL COMMENT 'When the settlement was reversed' AFTER `settled_at`,
  ADD COLUMN `reversed_by` int unsigned DEFAULT NULL COMMENT 'Admin user who reversed the settlement' AFTER `reversed_at`,
  ADD COLUMN `reversal_reason` text COLLATE utf8mb4_unicode_ci COMMENT 'Required business reason captured at reversal time' AFTER `reversed_by`,
  ADD COLUMN `reversal_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Unique reference for the reversal record' AFTER `reversal_reason`,
  ADD KEY `idx_gs_reversed_at` (`reversed_at`);

-- 3. Replace the per-payment uniqueness with the partial-unique pattern.
ALTER TABLE `gateway_settlement_transactions`
  ADD COLUMN `active_payment_transaction_id` bigint unsigned DEFAULT NULL COMMENT 'Partial-unique: payment transaction while in an ACTIVE (non-reversed) settlement; NULL after reversal' AFTER `payment_transaction_id`;

-- 3b. Backfill: existing completed settlements remain ACTIVE (their lines keep
--     the payment transaction). No row shares a payment_transaction_id today
--     (the old uk_gst_payment enforced it), so the pending UNIQUE below is safe.
UPDATE `gateway_settlement_transactions` gst
JOIN `gateway_settlements` gs ON gs.id = gst.gateway_settlement_id
SET gst.active_payment_transaction_id = gst.payment_transaction_id
WHERE gs.settlement_status = 'completed';

ALTER TABLE `gateway_settlement_transactions`
  DROP INDEX `uk_gst_payment`,
  ADD UNIQUE KEY `uk_gst_active_payment` (`active_payment_transaction_id`),
  ADD KEY `idx_gst_payment_txn` (`payment_transaction_id`);

COMMIT;