-- 129_transactions_subscription_source_type.sql
-- Extend the `transactions` table ENUMs to support subscription activations.
--
-- Background:
--   subscription-activation.service.ts records a financial audit transaction when a
--   paid subscription request is activated (type = 'subscription',
--   source_type = 'organisation_upgrade_request'). Those values were not present in
--   the `transactions.type` / `transactions.source_type` ENUMs, so approving a paid
--   subscription request failed with:
--
--     Data truncated for column 'type' at row 1
--
--   This made the admin "Approve" action for paid subscription requests return 500,
--   breaking the actionable path for Pending subscription assignments.
--
--   This migration adds the two missing values. Existing rows are unaffected.

ALTER TABLE `transactions`
  MODIFY COLUMN `type`
    ENUM('booking_payment','wallet_topup','refund','payout','marketplace_order',
         'withdrawal','wallet_payment','subscription')
    NOT NULL;

ALTER TABLE `transactions`
  MODIFY COLUMN `source_type`
    ENUM('booking','academy','marketplace','admin','wallet','order','settlement',
         'organisation_upgrade_request')
    DEFAULT NULL;

-- DOWN: revert to the previous ENUM definitions.
-- ALTER TABLE `transactions`
--   MODIFY COLUMN `type`
--     ENUM('booking_payment','wallet_topup','refund','payout','marketplace_order',
--          'withdrawal','wallet_payment')
--     NOT NULL;
-- ALTER TABLE `transactions`
--   MODIFY COLUMN `source_type`
--     ENUM('booking','academy','marketplace','admin','wallet','order','settlement')
--     DEFAULT NULL;
