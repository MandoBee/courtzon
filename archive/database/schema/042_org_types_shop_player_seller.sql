-- ============================================================================
-- COURTZON-V2 : Rename seller→shop, add player-seller org type
-- ============================================================================

USE courtzon_v2;

-- 1. Rename seller slug to shop, update name
UPDATE organisation_types
SET slug = 'shop', name = 'Shop'
WHERE slug = 'seller' AND deleted_at IS NULL;

-- 2. Add name to player org type if null
UPDATE organisation_types
SET name = 'Player'
WHERE slug = 'player' AND name IS NULL AND deleted_at IS NULL;

-- 3. Player-seller org type removed — players now use has_activated_selling flag (see 099, 101)
-- INSERT IGNORE INTO organisation_types (slug, name, is_active, sort_order) VALUES
-- ('player-seller', 'Player Seller', TRUE, 7);

-- 4. Update applicable_org_types in subscription plans to use 'shop' instead of 'seller'
UPDATE subscription_plans
SET applicable_org_types = JSON_SET(
  applicable_org_types,
  '$[0]', 'shop'
)
WHERE applicable_org_types IS NOT NULL
  AND JSON_CONTAINS(applicable_org_types, '"seller"');

-- 5. Update org_type references in existing subscriptions
--    (seller orgs should now be shop)
UPDATE organisations o
JOIN organisation_types ot ON o.org_type_id = ot.id
SET o.org_type_id = (SELECT id FROM organisation_types WHERE slug = 'shop' LIMIT 1)
WHERE ot.slug = 'seller';
