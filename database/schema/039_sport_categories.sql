-- 039_sport_categories.sql
-- Creates sport-category junction table and adds variant_color to product_variants

CREATE TABLE IF NOT EXISTS sport_categories (
  sport_id     INT UNSIGNED NOT NULL,
  category_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (sport_id, category_id),
  FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE product_variants
  ADD COLUMN variant_color VARCHAR(7) DEFAULT NULL COMMENT 'Hex color code for color variant type';

-- Seed sport-category mappings (using subqueries by slug for idempotency)
INSERT IGNORE INTO sport_categories (sport_id, category_id)
SELECT s.id, c.id FROM sports s, product_categories c WHERE s.slug = 'football' AND c.slug IN ('shoes','balls','clothing','accessories','equipment','football-shoes','football-jerseys','football-balls');

INSERT IGNORE INTO sport_categories (sport_id, category_id)
SELECT s.id, c.id FROM sports s, product_categories c WHERE s.slug = 'padel' AND c.slug IN ('shoes','balls','clothing','accessories','equipment','padel-rackets','padel-balls');

INSERT IGNORE INTO sport_categories (sport_id, category_id)
SELECT s.id, c.id FROM sports s, product_categories c WHERE s.slug = 'tennis' AND c.slug IN ('shoes','balls','clothing','accessories','equipment','tennis-rackets','tennis-balls','tennis-shoes');

INSERT IGNORE INTO sport_categories (sport_id, category_id)
SELECT s.id, c.id FROM sports s, product_categories c WHERE s.slug = 'basketball' AND c.slug IN ('shoes','balls','clothing','accessories','equipment');

INSERT IGNORE INTO sport_categories (sport_id, category_id)
SELECT s.id, c.id FROM sports s, product_categories c WHERE s.slug = 'volleyball' AND c.slug IN ('shoes','balls','clothing','accessories','equipment');

INSERT IGNORE INTO sport_categories (sport_id, category_id)
SELECT s.id, c.id FROM sports s, product_categories c WHERE s.slug = 'squash' AND c.slug IN ('shoes','balls','clothing','accessories','equipment');

INSERT IGNORE INTO sport_categories (sport_id, category_id)
SELECT s.id, c.id FROM sports s, product_categories c WHERE s.slug = 'swimming' AND c.slug IN ('clothing','accessories','equipment');

INSERT IGNORE INTO sport_categories (sport_id, category_id)
SELECT s.id, c.id FROM sports s, product_categories c WHERE s.slug = 'boxing' AND c.slug IN ('clothing','accessories','equipment');

INSERT IGNORE INTO sport_categories (sport_id, category_id)
SELECT s.id, c.id FROM sports s, product_categories c WHERE s.slug = 'martial-arts' AND c.slug IN ('clothing','accessories','equipment');
