-- Adds an optional per-agreement hourly rate override to coach_org_agreements.
-- When set, this rate is used instead of the coach's global hourly_rate
-- for sessions booked under this organisation.

ALTER TABLE `coach_org_agreements`
  ADD COLUMN `hourly_rate` decimal(12,2) DEFAULT NULL
  COMMENT 'Org-specific hourly rate override. NULL = use coach_profiles.hourly_rate'
  AFTER `org_split_pct`;
