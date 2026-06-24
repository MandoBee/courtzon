-- ============================================================================
-- COURTZON-V2 : MARKETPLACE — Multi-vendor, Cart, Orders, Commission
-- ============================================================================

USE courtzon_v2;

CREATE TABLE product_categories (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  parent_id         INT UNSIGNED DEFAULT NULL,
  sport_id          INT UNSIGNED DEFAULT NULL COMMENT 'NULL = general, non-null = sport-specific',
  name              VARCHAR(200) NOT NULL,
  slug              VARCHAR(200) NOT NULL,
  description       TEXT DEFAULT NULL,
  image_url         VARCHAR(500) DEFAULT NULL,
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_id),
  INDEX idx_sport (sport_id),
  CONSTRAINT fk_cat_parent FOREIGN KEY (parent_id) REFERENCES product_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_cat_sport FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE products (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  seller_id         INT UNSIGNED NOT NULL COMMENT 'FK to organisations(id)',
  category_id       INT UNSIGNED NOT NULL,
  name              VARCHAR(255) NOT NULL,
  description       TEXT DEFAULT NULL,
  price             DECIMAL(12,2) NOT NULL,
  discounted_price  DECIMAL(12,2) DEFAULT NULL COMMENT 'Discounted/sale price for discount display',
  currency_code     CHAR(3) NOT NULL,
  quantity          INT UNSIGNED NOT NULL DEFAULT 0,
  reserved_quantity INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Items in active carts',
  is_digital        BOOLEAN NOT NULL DEFAULT FALSE,
  digital_download_url VARCHAR(500) DEFAULT NULL,
  video_url         VARCHAR(500) DEFAULT NULL,
  status            ENUM('draft','active','archived','out_of_stock') NOT NULL DEFAULT 'draft',
  images            JSON DEFAULT NULL,
  metadata          JSON DEFAULT NULL COMMENT 'Brand, size, color, etc.',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at        TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_seller (seller_id),
  INDEX idx_category (category_id),
  INDEX idx_status (status),
  INDEX idx_price (price),
  CONSTRAINT fk_prod_org FOREIGN KEY (seller_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT fk_prod_category FOREIGN KEY (category_id) REFERENCES product_categories(id)
) ENGINE=InnoDB;

CREATE TABLE product_reviews (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id        INT UNSIGNED NOT NULL,
  user_id           INT UNSIGNED NOT NULL,
  rating            TINYINT UNSIGNED NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text       TEXT DEFAULT NULL,
  is_verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_product (product_id),
  UNIQUE KEY uk_user_product (user_id, product_id),
  CONSTRAINT fk_rev_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_rev_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE cart_items (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  product_id        INT UNSIGNED NOT NULL,
  variant_id        INT UNSIGNED DEFAULT NULL,
  quantity          INT UNSIGNED NOT NULL DEFAULT 1,
  reserved_until    TIMESTAMP NULL DEFAULT NULL COMMENT 'Inventory hold expiry',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_product_cart (user_id, product_id, variant_id),
  INDEX idx_reserved (reserved_until),
  CONSTRAINT fk_cart_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cart_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE orders (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id         CHAR(36) NOT NULL UNIQUE,
  buyer_id          INT UNSIGNED NOT NULL,
  status            ENUM('pending','confirmed','processing','shipped','delivered','cancelled','refunded') NOT NULL DEFAULT 'pending',
  payment_status    ENUM('unpaid','paid','refunded','partial_refund') NOT NULL DEFAULT 'unpaid',
  subtotal          DECIMAL(12,2) NOT NULL,
  shipping_cost     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Platform commission',
  coupon_id         INT UNSIGNED DEFAULT NULL,
  discount_amount   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  tax_amount        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total             DECIMAL(12,2) NOT NULL,
  currency_code     CHAR(3) NOT NULL,
  payment_method    VARCHAR(50) DEFAULT NULL,
  shipping_address  JSON DEFAULT NULL,
  shipping_carrier  VARCHAR(100) DEFAULT NULL,
  tracking_number   VARCHAR(255) DEFAULT NULL,
  notes             TEXT DEFAULT NULL,
  paid_at           TIMESTAMP NULL DEFAULT NULL,
  cancelled_at      TIMESTAMP NULL DEFAULT NULL,
  cancellation_reason VARCHAR(500) DEFAULT NULL,
  deleted_at        TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_buyer (buyer_id),
  INDEX idx_status (status, payment_status),
  CONSTRAINT fk_order_buyer FOREIGN KEY (buyer_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE order_items (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id          INT UNSIGNED NOT NULL,
  product_id        INT UNSIGNED NOT NULL,
  variant_id        INT UNSIGNED DEFAULT NULL,
  seller_id         INT UNSIGNED NOT NULL,
  quantity          INT UNSIGNED NOT NULL,
  unit_price        DECIMAL(12,2) NOT NULL,
  total_price       DECIMAL(12,2) NOT NULL,
  commission_rate   DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order (order_id),
  INDEX idx_seller (seller_id),
  CONSTRAINT fk_oi_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_oi_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_oi_org FOREIGN KEY (seller_id) REFERENCES organisations(id)
) ENGINE=InnoDB;

CREATE TABLE order_status_history (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id          INT UNSIGNED NOT NULL,
  from_status       VARCHAR(50) DEFAULT NULL,
  to_status         VARCHAR(50) NOT NULL,
  changed_by        INT UNSIGNED DEFAULT NULL,
  changed_by_role   VARCHAR(50) DEFAULT NULL,
  note              VARCHAR(500) DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order (order_id),
  CONSTRAINT fk_hist_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE seller_subscriptions (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  seller_id         INT UNSIGNED NOT NULL,
  started_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at        TIMESTAMP NOT NULL DEFAULT '2038-01-01 00:00:00',
  price             DECIMAL(12,2) NOT NULL,
  currency_code     CHAR(3) NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  cancelled_at      TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_seller (seller_id),
  INDEX idx_active (is_active, expires_at),
  CONSTRAINT fk_sub_seller FOREIGN KEY (seller_id) REFERENCES seller_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE product_variants (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id        INT UNSIGNED NOT NULL,
  sku               VARCHAR(100) DEFAULT NULL,
  variant_name      VARCHAR(200) NOT NULL,
  variant_type      VARCHAR(100) DEFAULT NULL COMMENT 'size, color, etc.',
  price_adjustment  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  quantity          INT UNSIGNED NOT NULL DEFAULT 0,
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_product (product_id),
  CONSTRAINT fk_var_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE wishlist_items (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  product_id        INT UNSIGNED NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_product_wish (user_id, product_id),
  INDEX idx_user (user_id),
  CONSTRAINT fk_wish_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_wish_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE coupons (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code              VARCHAR(100) NOT NULL UNIQUE,
  discount_type     ENUM('percentage','fixed') NOT NULL,
  discount_value    DECIMAL(12,2) NOT NULL,
  min_order_amount  DECIMAL(12,2) DEFAULT NULL,
  max_uses          INT UNSIGNED DEFAULT NULL,
  max_uses_per_user INT UNSIGNED DEFAULT 1,
  starts_at         TIMESTAMP NULL DEFAULT NULL,
  expires_at        TIMESTAMP NULL DEFAULT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_code (code),
  INDEX idx_active (is_active, expires_at)
) ENGINE=InnoDB;

CREATE TABLE coupon_usage (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  coupon_id         INT UNSIGNED NOT NULL,
  user_id           INT UNSIGNED NOT NULL,
  order_id          INT UNSIGNED DEFAULT NULL,
  used_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_coupon (coupon_id),
  INDEX idx_user (user_id),
  CONSTRAINT fk_cu_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
  CONSTRAINT fk_cu_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE user_addresses (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  label             VARCHAR(100) DEFAULT NULL,
  full_name         VARCHAR(200) NOT NULL,
  phone             VARCHAR(50) NOT NULL,
  street_address    TEXT NOT NULL,
  city              VARCHAR(200) NOT NULL,
  state             VARCHAR(200) DEFAULT NULL,
  postal_code       VARCHAR(20) DEFAULT NULL,
  country           VARCHAR(100) NOT NULL DEFAULT 'Egypt',
  address_type      ENUM('shipping','billing','both') NOT NULL DEFAULT 'both',
  is_default        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  CONSTRAINT fk_addr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- TRIGGERS: Order audit
-- ============================================================================

DELIMITER //

CREATE TRIGGER trg_order_after_insert
AFTER INSERT ON orders
FOR EACH ROW
BEGIN
  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_state)
  VALUES (NEW.buyer_id, 'order.create', 'order', NEW.id,
    JSON_OBJECT('order_id', NEW.id, 'total', NEW.total, 'status', NEW.status));
END //

CREATE TRIGGER trg_order_status_change
AFTER UPDATE ON orders
FOR EACH ROW
BEGIN
  IF OLD.status != NEW.status THEN
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before_state, after_state, reason)
    VALUES (NEW.buyer_id, CONCAT('order.status.', NEW.status), 'order', NEW.id,
      JSON_OBJECT('old', OLD.status), JSON_OBJECT('new', NEW.status),
      IFNULL(NEW.cancellation_reason, 'Status updated'));
  END IF;
END //

DELIMITER ;
