-- Migration 146: Multi-seller order split
-- Adds checkout_group_id to orders so a single checkout with products from
-- multiple sellers creates independent per-seller orders that remain linked
-- for the buyer's grouped view.

ALTER TABLE `orders`
  ADD COLUMN `checkout_group_id` char(36) DEFAULT NULL COMMENT 'UUID linking all seller-orders from one checkout' AFTER `public_id`;

CREATE INDEX `idx_orders_checkout_group` ON `orders` (`checkout_group_id`);

-- Back-fill existing single-seller orders with their own unique group ID
UPDATE `orders` o
  SET o.checkout_group_id = (SELECT UUID())
  WHERE o.checkout_group_id IS NULL;
