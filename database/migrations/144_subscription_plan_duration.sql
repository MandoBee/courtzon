-- 144_subscription_plan_duration.sql
-- Explicit plan duration in months (business rule: finite plans must declare 1-12 months).
--
-- Why this migration is unavoidable: subscription_plans previously expressed duration only
-- through billing_cycle pricing (monthly=1 month, yearly=12 months at activation time), so a
-- plan could never declare e.g. a 3-month period. The renewal lifecycle now chains periods
-- from the plan's explicit duration.
--
-- Semantics:
--   is_unlimited = 1 -> duration_months stays NULL (plan never expires; end_date NULL)
--   is_unlimited = 0 -> duration_months SHOULD be set 1..12 (enforced by admin API/UI).
--                       NULL is allowed for legacy rows and means "derive from billing_cycle"
--                       (monthly=1, yearly=12) so existing plans keep their exact behavior.

ALTER TABLE `subscription_plans`
  ADD COLUMN `duration_months` TINYINT UNSIGNED NULL DEFAULT NULL
    COMMENT 'Explicit plan length in months (1-12) when not unlimited; NULL = derive from billing_cycle'
    AFTER `is_unlimited`,
  ADD CONSTRAINT `chk_plan_duration_months`
    CHECK (`duration_months` IS NULL OR (`duration_months` BETWEEN 1 AND 12));
