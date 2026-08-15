-- 127_subscription_status_suspended.sql
-- Add a distinct 'suspended' value to organisation_subscriptions.subscription_status.
--
-- Rationale: 'pending' was overloaded to mean BOTH "awaiting activation"
-- (a workflow state paired with a pending organisation_upgrade_requests row)
-- AND "suspended by admin" (set by toggleSubscriptionStatus). This made it
-- impossible to distinguish the two business dimensions, so the Subscription
-- Status dimension (Active / Suspended) could not be represented faithfully.
--
-- 'pending' remains exclusively the workflow state; admin suspension now uses
-- 'suspended'. No existing rows change meaning: any previously 'suspended'
-- (i.e. admin-toggled 'pending') rows remain 'pending' and will be re-suspended
-- as 'suspended' on the next admin toggle.

ALTER TABLE `organisation_subscriptions`
  MODIFY COLUMN `subscription_status`
    ENUM('active','expired','cancelled','pending','suspended')
    NOT NULL DEFAULT 'pending';

-- DOWN:
ALTER TABLE `organisation_subscriptions`
  MODIFY COLUMN `subscription_status`
    ENUM('active','expired','cancelled','pending')
    NOT NULL DEFAULT 'pending';
