-- Migration 006: Marketplace Amazon-model features
-- Adds: product variants, wishlist, coupons, address book, seller order management

-- 1. Product Variants (size, color, SKU with own inventory/pricing)
CREATE TABLE IF NOT EXISTS product_variants (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  sku VARCHAR(100) DEFAULT NULL,
  variant_name VARCHAR(200) NOT NULL COMMENT 'e.g. Size M, Color Red',
  variant_type VARCHAR(50) NOT NULL COMMENT 'e.g. size, color, material',
  price_adjustment DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'added to base product price',
  quantity INT NOT NULL DEFAULT 0,
  reserved_quantity INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_variant_product (product_id),
  INDEX idx_variant_sku (sku)
);

-- 2. Wishlist / Favorites
CREATE TABLE IF NOT EXISTS wishlist_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE KEY uq_wishlist_user_product (user_id, product_id),
  INDEX idx_wishlist_user (user_id)
);

-- 3. Address Book (saved shipping/billing addresses)
CREATE TABLE IF NOT EXISTS user_addresses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  label VARCHAR(50) DEFAULT NULL COMMENT 'e.g. Home, Work',
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  street_address TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) DEFAULT NULL,
  postal_code VARCHAR(20) DEFAULT NULL,
  country VARCHAR(100) NOT NULL DEFAULT 'Egypt',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  address_type ENUM('shipping','billing','both') NOT NULL DEFAULT 'both',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_address_user (user_id)
);

-- 4. Coupon / Discount Codes
CREATE TABLE IF NOT EXISTS coupons (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  description TEXT DEFAULT NULL,
  discount_type ENUM('percentage','fixed_amount') NOT NULL DEFAULT 'percentage',
  discount_value DECIMAL(10,2) NOT NULL,
  min_order_amount DECIMAL(10,2) DEFAULT NULL,
  max_uses INT DEFAULT NULL,
  max_uses_per_user INT DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  starts_at TIMESTAMP NULL DEFAULT NULL,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  seller_id INT UNSIGNED DEFAULT NULL COMMENT 'NULL = platform-wide coupon',
  created_by INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (seller_id) REFERENCES seller_profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_coupon_code (code),
  INDEX idx_coupon_active (is_active, expires_at)
);

-- 5. Coupon usage tracking
CREATE TABLE IF NOT EXISTS coupon_usage (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  coupon_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  order_id INT UNSIGNED DEFAULT NULL,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  INDEX idx_coupon_usage_coupon (coupon_id),
  INDEX idx_coupon_usage_user (user_id)
);

-- 6. Order status history table (if not exists)
CREATE TABLE IF NOT EXISTS order_status_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  from_status VARCHAR(50) DEFAULT NULL,
  to_status VARCHAR(50) NOT NULL,
  changed_by INT UNSIGNED DEFAULT NULL,
  changed_by_role ENUM('buyer','seller','admin','system') NOT NULL DEFAULT 'system',
  note TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_status_order (order_id)
);

-- 7. Add coupon_id and tax columns to orders
ALTER TABLE orders
  ADD COLUMN coupon_id INT UNSIGNED DEFAULT NULL AFTER commission_amount,
  ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER coupon_id,
  ADD COLUMN tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER discount_amount,
  ADD COLUMN tracking_number VARCHAR(100) DEFAULT NULL AFTER paid_at,
  ADD COLUMN shipping_carrier VARCHAR(100) DEFAULT NULL AFTER tracking_number,
  ADD FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL;

-- 8. Add variant_id to cart_items
ALTER TABLE cart_items
  ADD COLUMN variant_id INT UNSIGNED DEFAULT NULL AFTER product_id,
  ADD FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;

-- 9. Add seller_id index on order_items for seller order queries
ALTER TABLE order_items
  ADD INDEX idx_order_items_seller (seller_id, order_id);

-- 10. Add digital_download_url to products
ALTER TABLE products
  ADD COLUMN digital_download_url VARCHAR(500) DEFAULT NULL AFTER is_digital,
  ADD COLUMN video_url VARCHAR(500) DEFAULT NULL AFTER digital_download_url;
