-- Migration 099: Player direct selling - has_activated_selling flag, player-owned products support
USE `courtzon_v2`;

ALTER TABLE users
  ADD COLUMN has_activated_selling TINYINT(1) NOT NULL DEFAULT 0 AFTER has_seen_welcome;

ALTER TABLE products
  MODIFY COLUMN seller_id INT UNSIGNED NULL,
  ADD COLUMN seller_user_id INT UNSIGNED NULL AFTER seller_id,
  ADD COLUMN seller_type ENUM('org','player') NOT NULL DEFAULT 'org' AFTER seller_user_id,
  ADD COLUMN condition_status ENUM('new','like_new','good','fair','used') NULL AFTER status,
  MODIFY COLUMN status ENUM('draft','active','sold','archived','out_of_stock') NOT NULL DEFAULT 'draft',
  ADD INDEX idx_seller_user (seller_user_id),
  ADD CONSTRAINT fk_prod_user FOREIGN KEY (seller_user_id) REFERENCES users(id) ON DELETE CASCADE;
