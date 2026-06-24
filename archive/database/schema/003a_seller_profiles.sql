-- ============================================================================
-- Legacy seller_profiles (required by 004_marketplace seller_subscriptions FK).
-- Removed in 027_player_seller_overhaul.sql after data migration.
-- ============================================================================

USE courtzon_v2;

CREATE TABLE IF NOT EXISTS seller_profiles (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id                 INT UNSIGNED NOT NULL,
  shop_name               VARCHAR(200) DEFAULT NULL,
  shop_description        TEXT DEFAULT NULL,
  shop_logo_url           VARCHAR(500) DEFAULT NULL,
  is_subscribed           BOOLEAN NOT NULL DEFAULT FALSE,
  subscription_expires_at TIMESTAMP NULL DEFAULT NULL,
  max_free_listings       INT UNSIGNED NOT NULL DEFAULT 5,
  total_listings          INT UNSIGNED NOT NULL DEFAULT 0,
  rating_avg              DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  rating_count            INT UNSIGNED NOT NULL DEFAULT 0,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at              TIMESTAMP NULL DEFAULT NULL,
  created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_seller_user (user_id),
  CONSTRAINT fk_seller_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
