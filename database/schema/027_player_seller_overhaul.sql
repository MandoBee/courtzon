-- ============================================================================
-- COURTZON-V2 : Player → Seller migration
--  - Add player org type + player free sell subscription
--  - Migrate seller_profiles → organisations
--  - Drop seller_profiles table
-- ============================================================================

USE courtzon_v2;

-- 1. Add 'player' org type — REMOVED (org type 'player' is deprecated, player selling uses has_activated_selling flag)
-- INSERT IGNORE INTO organisation_types (slug, name, is_active, sort_order) VALUES
-- ('player', 'Player', TRUE, 20);

-- 2. Add 'seller' role if missing
INSERT IGNORE INTO roles (organisation_id, name, slug, description, is_system) VALUES
(NULL, 'Seller', 'seller', 'User who sells products on marketplace', FALSE);

-- 3. Extend billing_cycle enum to allow 'unlimited'
ALTER TABLE subscription_plans MODIFY COLUMN billing_cycle
  ENUM('monthly','yearly','unlimited') NOT NULL DEFAULT 'monthly';

-- 4. Insert Player Free Sell plan (id=7) — no features column, limit enforced by code
INSERT IGNORE INTO subscription_plans (id, plan_name, billing_cycle, price, applicable_org_types, is_active) VALUES
(7, 'Player Free Sell', 'unlimited', 0.00,
 '["player"]',
 1);

-- 5. Insert default commission rate for player plan
INSERT IGNORE INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES
(7, 'marketplace', 'percentage', 15.00);

-- 6. For each seller_profile, ensure an organisation exists
--    seller_profiles already has organisation_id column (from 018_seller_org_link)
--    For any seller without an org, create one using shop_name or user's full_name
INSERT IGNORE INTO organisations (public_id, org_type_id, owner_id, name, slug, description, is_verified, is_active)
  SELECT
    UUID(),
    10,
    u.id,
    COALESCE(NULLIF(sp.shop_name, ''), u.full_name, CONCAT('Shop #', sp.id)),
    LOWER(REPLACE(COALESCE(NULLIF(sp.shop_name, ''), CONCAT('shop-', sp.id)), ' ', '-')),
    sp.shop_description,
    TRUE,
    TRUE
  FROM seller_profiles sp
  JOIN users u ON sp.user_id = u.id
  WHERE sp.organisation_id IS NULL;

-- 7. Link seller_profiles to the newly created orgs
UPDATE seller_profiles sp
  JOIN organisations o ON o.owner_id = sp.user_id AND o.org_type_id = 10
  SET sp.organisation_id = o.id
  WHERE sp.organisation_id IS NULL;

-- 8. Remove old FKs that reference seller_profiles.id (legacy installs only)
SET @db = DATABASE();
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'products' AND CONSTRAINT_NAME = 'fk_prod_seller') > 0,
  'ALTER TABLE products DROP FOREIGN KEY fk_prod_seller',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'order_items' AND CONSTRAINT_NAME = 'fk_oi_seller') > 0,
  'ALTER TABLE order_items DROP FOREIGN KEY fk_oi_seller',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'coupons' AND CONSTRAINT_NAME = 'coupons_ibfk_1') > 0,
  'ALTER TABLE coupons DROP FOREIGN KEY coupons_ibfk_1',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 9. Change products.seller_id to reference organisations.id
--    First, update seller_id values to the mapped organisation_id
UPDATE products p
  JOIN seller_profiles sp ON p.seller_id = sp.id
  SET p.seller_id = sp.organisation_id
  WHERE sp.organisation_id IS NOT NULL;

-- 10. Change order_items.seller_id to reference organisations.id
UPDATE order_items oi
  JOIN seller_profiles sp ON oi.seller_id = sp.id
  SET oi.seller_id = sp.organisation_id
  WHERE sp.organisation_id IS NOT NULL;

-- 11. Change coupons.seller_id to reference organisations.id
UPDATE coupons c
  JOIN seller_profiles sp ON c.seller_id = sp.id
  SET c.seller_id = sp.organisation_id
  WHERE sp.organisation_id IS NOT NULL;

-- 12. Re-add FKs now pointing to organisations (skip if already migrated in 004/006)
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'products' AND CONSTRAINT_NAME = 'fk_prod_org') = 0,
  'ALTER TABLE products ADD CONSTRAINT fk_prod_org FOREIGN KEY (seller_id) REFERENCES organisations(id) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'order_items' AND CONSTRAINT_NAME = 'fk_oi_org') = 0,
  'ALTER TABLE order_items ADD CONSTRAINT fk_oi_org FOREIGN KEY (seller_id) REFERENCES organisations(id)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'coupons' AND CONSTRAINT_NAME = 'fk_coupon_org') = 0,
  'ALTER TABLE coupons ADD CONSTRAINT fk_coupon_org FOREIGN KEY (seller_id) REFERENCES organisations(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 13. Drop seller_profiles table
DROP TABLE IF EXISTS seller_profiles;

-- 14. Create organisation_upgrade_requests table for player→seller upgrades
CREATE TABLE IF NOT EXISTS organisation_upgrade_requests (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id       INT UNSIGNED NOT NULL,
  requested_by          INT UNSIGNED NOT NULL,
  requested_plan_id     BIGINT UNSIGNED DEFAULT NULL,
  status                ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  notes                 TEXT DEFAULT NULL,
  approved_by           INT UNSIGNED DEFAULT NULL,
  approved_at           TIMESTAMP NULL DEFAULT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_org (organisation_id),
  INDEX idx_status (status),
  CONSTRAINT fk_upr_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT fk_upr_user FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_upr_plan FOREIGN KEY (requested_plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL,
  CONSTRAINT fk_upr_admin FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 15. Update column comments
ALTER TABLE products MODIFY COLUMN seller_id INT UNSIGNED NOT NULL COMMENT 'FK to organisations(id)';
ALTER TABLE order_items MODIFY COLUMN seller_id INT UNSIGNED NOT NULL COMMENT 'FK to organisations(id)';
ALTER TABLE coupons MODIFY COLUMN seller_id INT UNSIGNED DEFAULT NULL COMMENT 'NULL = platform-wide, FK to organisations(id)';
