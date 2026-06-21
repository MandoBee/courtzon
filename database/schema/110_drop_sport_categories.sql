-- 040_drop_sport_categories.sql
-- Remove sport-category mapping table — categories are now independent of sports.

DROP TABLE IF EXISTS sport_categories;
