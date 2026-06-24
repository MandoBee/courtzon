-- Consolidate subscription plans: monthly + yearly prices on one row; billing cycle on org subscription.

USE courtzon_v2;

-- 1. New plan columns
ALTER TABLE subscription_plans
  ADD COLUMN price_monthly DECIMAL(12,2) NULL AFTER plan_name,
  ADD COLUMN price_yearly DECIMAL(12,2) NULL AFTER price_monthly,
  ADD COLUMN is_unlimited TINYINT(1) NOT NULL DEFAULT 0 AFTER price_yearly;

-- 2. Billing cycle on organisation subscription (chosen interval)
ALTER TABLE organisation_subscriptions
  ADD COLUMN billing_cycle ENUM('monthly','yearly') NOT NULL DEFAULT 'monthly' AFTER plan_id;

-- 3. Seed new price columns from legacy rows
UPDATE subscription_plans SET price_monthly = price WHERE billing_cycle = 'monthly';
UPDATE subscription_plans SET price_yearly = price WHERE billing_cycle = 'yearly';

-- 4. Merge yearly rows into monthly row (same plan_name)
UPDATE subscription_plans m
INNER JOIN subscription_plans y
  ON y.billing_cycle = 'yearly'
  AND m.billing_cycle = 'monthly'
  AND (
    y.plan_name = m.plan_name
    OR y.plan_name = CONCAT(m.plan_name, ' Yearly')
    OR y.plan_name = CONCAT(m.plan_name, ' yearly')
  )
SET m.price_yearly = COALESCE(m.price_yearly, y.price);

-- 5. Unlimited plans
UPDATE subscription_plans
SET is_unlimited = 1,
    price_monthly = COALESCE(price_monthly, 0),
    price_yearly = NULL
WHERE billing_cycle = 'unlimited';

-- 6. Copy billing cycle onto org subscriptions from legacy plan row
UPDATE organisation_subscriptions os
INNER JOIN subscription_plans sp ON sp.id = os.plan_id
SET os.billing_cycle = CASE
  WHEN sp.billing_cycle = 'yearly' THEN 'yearly'
  ELSE 'monthly'
END;

-- 7. Remap subscriptions from yearly plan rows to canonical monthly row
UPDATE organisation_subscriptions os
INNER JOIN subscription_plans y ON y.id = os.plan_id AND y.billing_cycle = 'yearly'
INNER JOIN subscription_plans m
  ON m.billing_cycle = 'monthly'
  AND (
    m.plan_name = y.plan_name
    OR y.plan_name = CONCAT(m.plan_name, ' Yearly')
    OR y.plan_name = CONCAT(m.plan_name, ' yearly')
  )
SET os.plan_id = m.id,
    os.billing_cycle = 'yearly';

-- 8. Remap upgrade requests (if table exists)
UPDATE organisation_upgrade_requests our
INNER JOIN subscription_plans y ON y.id = our.requested_plan_id AND y.billing_cycle = 'yearly'
INNER JOIN subscription_plans m
  ON m.billing_cycle = 'monthly'
  AND (
    m.plan_name = y.plan_name
    OR y.plan_name = CONCAT(m.plan_name, ' Yearly')
    OR y.plan_name = CONCAT(m.plan_name, ' yearly')
  )
SET our.requested_plan_id = m.id;

-- 9. Remove duplicate yearly catalog rows (rates cascade)
DELETE FROM subscription_plans WHERE billing_cycle = 'yearly';

-- 10. Drop legacy plan columns
ALTER TABLE subscription_plans
  DROP COLUMN billing_cycle,
  DROP COLUMN price;
