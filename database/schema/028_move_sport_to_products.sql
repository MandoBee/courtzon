-- 028: Move sport_id from product_categories to products
-- Sport belongs on the product, not the category.
-- Categories are sport-agnostic (e.g. "Rackets" works for both Padel and Tennis).

ALTER TABLE products ADD COLUMN sport_id INT UNSIGNED NULL AFTER category_id;

UPDATE products p
JOIN product_categories pc ON p.category_id = pc.id
SET p.sport_id = pc.sport_id
WHERE pc.sport_id IS NOT NULL;

ALTER TABLE products ADD INDEX idx_prod_sport (sport_id);
ALTER TABLE products ADD CONSTRAINT fk_prod_sport FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE SET NULL;

ALTER TABLE product_categories DROP FOREIGN KEY fk_cat_sport;
ALTER TABLE product_categories DROP INDEX idx_sport;
ALTER TABLE product_categories DROP COLUMN sport_id;
