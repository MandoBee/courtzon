-- Normalize subscription_plan_rates entity keys to canonical slugs.
-- Commission is plan-only; global commission_rules are no longer used at runtime.

UPDATE subscription_plan_rates SET applicable_entity = 'booking' WHERE applicable_entity IN ('bookings');
UPDATE subscription_plan_rates SET applicable_entity = 'tournament' WHERE applicable_entity IN ('tournaments');
UPDATE subscription_plan_rates SET applicable_entity = 'marketplace' WHERE applicable_entity IN ('products', 'seller_fees', 'product');
UPDATE subscription_plan_rates SET applicable_entity = 'coach_session' WHERE applicable_entity IN ('coaching', 'coaching_session');
UPDATE subscription_plan_rates SET applicable_entity = 'academy' WHERE applicable_entity IN ('academies');
UPDATE subscription_plan_rates SET applicable_entity = 'marketplace' WHERE applicable_entity = 'subscriptions';
