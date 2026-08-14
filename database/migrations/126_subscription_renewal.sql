-- Subscription renewal: extend request_type enum to support RENEWAL
ALTER TABLE `organisation_upgrade_requests`
  MODIFY COLUMN `request_type` enum('NEW_SUBSCRIPTION','PLAN_CHANGE','RENEWAL') DEFAULT NULL;
