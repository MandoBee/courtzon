-- Subscription lifecycle management: reminders, plan snapshots

ALTER TABLE organisation_subscriptions
  ADD COLUMN `last_reminder_sent` VARCHAR(50) DEFAULT NULL
    COMMENT 'Comma-separated intervals already notified (30,14,7,3,1)',
  ADD COLUMN `plan_snapshot` JSON DEFAULT NULL
    COMMENT 'Complete plan config at subscription time (name, price, features, rates)';
