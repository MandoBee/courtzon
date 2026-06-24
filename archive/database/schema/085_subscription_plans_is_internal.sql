-- Internal subscription plans: assignable by platform admin only, hidden from public self-service.

ALTER TABLE subscription_plans
  ADD COLUMN is_internal TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Admin-assignment only; excluded from public catalog' AFTER is_active;
