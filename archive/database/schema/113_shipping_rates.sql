CREATE TABLE IF NOT EXISTS seller_shipping_rates (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  seller_id   INT UNSIGNED NOT NULL,
  province_id INT UNSIGNED DEFAULT NULL,
  city_id     INT UNSIGNED DEFAULT NULL,
  price       DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_seller (seller_id),
  INDEX idx_province (province_id),
  INDEX idx_city (city_id),
  INDEX idx_seller_province (seller_id, province_id, city_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE user_addresses
  ADD COLUMN province_id INT UNSIGNED DEFAULT NULL AFTER state,
  ADD COLUMN city_id INT UNSIGNED DEFAULT NULL AFTER province_id,
  ADD INDEX idx_province (province_id),
  ADD INDEX idx_city (city_id);
