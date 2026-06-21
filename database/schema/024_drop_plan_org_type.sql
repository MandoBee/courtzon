-- ============================================================================
-- COURTZON-V2 : DROP org_type_id FROM subscription_plans
-- ============================================================================

USE courtzon_v2;

ALTER TABLE subscription_plans DROP FOREIGN KEY fk_plan_org_type;
ALTER TABLE subscription_plans DROP COLUMN org_type_id;
