-- ============================================================================
-- COURTZON-V2 : Rename compare_price → discounted_price
--              : Update category names to exclude sport prefix
-- ============================================================================

USE courtzon_v2;

-- Rename compare_price to discounted_price
ALTER TABLE products CHANGE compare_price discounted_price DECIMAL(12,2) DEFAULT NULL COMMENT 'Discounted/sale price for discount display';

-- Update category names to exclude sport prefix (sport context is already in parent/sport_id)
UPDATE product_categories SET name = 'Rackets', slug = 'padel-rackets' WHERE name = 'Padel Rackets' AND slug = 'padel-rackets';
UPDATE product_categories SET name = 'Balls',    slug = 'padel-balls'    WHERE name = 'Padel Balls'    AND slug = 'padel-balls';
UPDATE product_categories SET name = 'Rackets',  slug = 'tennis-rackets' WHERE name = 'Tennis Rackets' AND slug = 'tennis-rackets';
UPDATE product_categories SET name = 'Balls',    slug = 'tennis-balls'   WHERE name = 'Tennis Balls'   AND slug = 'tennis-balls';
